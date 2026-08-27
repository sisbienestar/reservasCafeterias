/**
 * Regla de negocio: sábado y domingo no hay servicio.
 *
 * Se ejecuta con FECHA_PRUEBA situada en domingo, para comprobar también qué
 * ve el personal de mostrador ese día.
 */

import './fechaFija.mjs';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

let fallos = 0;
const ok = (c, e) => { console.log(`${c ? '  OK  ' : ' FALLO'} · ${e}`); if (!c) fallos++; };
async function esperaError(codigo, etiqueta, fn) {
  try { await fn(); ok(false, `${etiqueta} (no lanzó ${codigo})`); }
  catch (e) { ok(e.codigo === codigo, `${etiqueta} → ${e.codigo}`); }
}

const { hoyISO, sumarDias, lunesDeEstaSemana, esDiaDeServicio, nombreDiaCorto } =
  await import('./banco/js/utils/fechas.js');
const { getMenuDelDia, getMenuSemana, guardarMenuSemana } =
  await import('./banco/js/services/menuService.js');
const { crearReserva, getReservasDelDia } = await import('./banco/js/services/reservasService.js');

const hoy = hoyISO();
const lunes = lunesDeEstaSemana();
const sabado = sumarDias(lunes, 5);
const domingo = sumarDias(lunes, 6);

console.log('── La regla ──');
ok(hoy === '2026-08-23' && !esDiaDeServicio(hoy),
   `la prueba se sitúa en ${hoy} (${nombreDiaCorto(hoy)}), sin servicio`);
ok(!esDiaDeServicio(sabado) && !esDiaDeServicio(domingo), 'sábado y domingo, sin servicio');
ok([0, 1, 2, 3, 4].every((i) => esDiaDeServicio(sumarDias(lunes, i))),
   'de lunes a viernes, sí');

console.log('\n── Carta ──');
ok((await getMenuDelDia('', sabado)).length === 0, 'el sábado no tiene carta publicada');
ok((await getMenuDelDia('', domingo)).length === 0, 'el domingo tampoco');
ok((await getMenuDelDia('', lunes)).length > 0, 'el lunes sí');

await esperaError('SIN_SERVICIO', 'publicar carta un sábado', () =>
  guardarMenuSemana(lunes, [{ fecha: sabado, platos: ['Lo que sea'] }]));
// Un fin de semana vacío es lo que manda el editor: no debe fallar.
const guardada = await guardarMenuSemana(lunes, [
  { fecha: sabado, platos: [] },
  { fecha: domingo, platos: [] },
]);
ok(guardada.length === 2, 'un fin de semana vacío se acepta sin ruido');

console.log('\n── Reservas ──');
ok((await getReservasDelDia('bienestar-pro', sabado)).length === 0,
   'no hay reservas históricas en sábado');
ok((await getReservasDelDia('bienestar-pro', hoy)).length === 0,
   'ni hoy, que es domingo');

await esperaError('SIN_SERVICIO', 'reservar en sábado', () =>
  crearReserva({
    nombre: 'Alguien Con Hambre',
    telefono: '3001234567',
    cafeteriaId: 'bienestar-pro',
    menuId: 'lo-que-sea',
    medio: 'presencial', pago: 'pagado',
    fecha: sabado,
  }));

// El servicio pone la fecha de hoy, que en esta prueba es domingo.
await esperaError('SIN_SERVICIO', 'reservar hoy (domingo)', () =>
  crearReserva({
    nombre: 'Alguien Con Hambre',
    telefono: '3001234567',
    cafeteriaId: 'bienestar-pro',
    menuId: 'lo-que-sea',
    medio: 'presencial', pago: 'pagado',
  }));

console.log('\n── La pantalla de mostrador un domingo ──');
const dom = new JSDOM(readFileSync('banco/reserva.html', 'utf8'),
  { url: 'http://localhost/reserva.html?cafeteria=bienestar-pro' });
const p = dom.window.HTMLDialogElement.prototype;
p.showModal = function () { this.open = true; };
p.close = function () { this.open = false; };
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;

await import('./banco/js/paginaReserva.js');
await esperar(900);

const doc = document;
ok(doc.querySelector('#nombre-cafeteria').textContent === 'Bienestar Pro',
   'la cabecera se carga igual');
ok(doc.querySelector('#boton-reservar').disabled === true,
   '«Registrar reserva» queda deshabilitado');
ok(doc.querySelector('#aviso').hidden === false &&
   doc.querySelector('#aviso').textContent.includes('sábados y domingos'),
   `y se explica por qué → «${doc.querySelector('#aviso').textContent}»`);
ok(doc.querySelector('#contenedor-tabla').textContent.includes('no hay servicio'),
   'la tabla se sustituye por el aviso de día sin servicio');
ok(!doc.querySelector('#contenedor-tabla').textContent.includes('anotar la primera'),
   'y no invita a registrar una reserva que la API rechazaría');

console.log(fallos === 0 ? '\n✔ Todo en verde\n' : `\n✘ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
