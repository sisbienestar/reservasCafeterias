/**
 * Cuánto espera el mostrador en cada gesto.
 *
 * Contra Google, un viaje son más de mil milisegundos aunque el servidor no
 * lea nada: es el peaje de Apps Script y no se negocia. Lo único que se puede
 * bajar es cuántos viajes se hacen y cuántos van en fila, así que eso es lo
 * que se mide, con el reloj y no con la impresión de que «va rápido».
 *
 * Cada viaje simulado tarda RETARDO_MS. La cuenta que importa: si dos
 * peticiones salen a la vez, el reloj marca un retardo; si van encadenadas,
 * marca dos.
 */
import { HOY_FIJADO } from './fechaFija.mjs';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require('jsdom');

const RETARDO = Number(process.env.RETARDO_MS || 100);
let fallos = 0;
const ok = (c, e) => { console.log(`${c ? '  OK  ' : ' FALLO'} · ${e}`); if (!c) fallos++; };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
// fechaFija.mjs congela Date para que las pruebas no dependan del día real,
// así que Date.now() siempre devuelve lo mismo y no sirve de cronómetro.
const reloj = () => Math.round(performance.now());
/** Espera a que algo sea cierto, sin dormir una cantidad fija: dormir de más
 *  falsearía la medida y dormir de menos la haría frágil. */
async function hasta(condicion, limite = 4000) {
  const fin = reloj() + limite;
  while (reloj() < fin) {
    if (condicion()) return true;
    await esperar(5);
  }
  return false;
}
/** Cuántos viajes de espera representa un tiempo medido. */
const enViajes = (ms) => Math.round(ms / RETARDO);

const consola = new VirtualConsole();
consola.on('jsdomError', (e) => console.error(e.message));
const dom = new JSDOM(readFileSync('banco/reserva.html', 'utf8'),
  { url: 'http://localhost/reserva.html?cafeteria=bienestar-pro', virtualConsole: consola });
const { window } = dom;
const proto = window.HTMLDialogElement.prototype;
proto.showModal = function () { this.open = true; };
proto.close = function () { this.open = false; this.dispatchEvent(new window.Event('close')); };

globalThis.window = window;
globalThis.document = window.document;
globalThis.Event = window.Event;
globalThis.HTMLElement = window.HTMLElement;
globalThis.navigator = window.navigator;
globalThis.sessionStorage = window.sessionStorage;

const clic = (n) => n.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

// La carta se publica para el día que la página va a pedir: «hoy» lo fija
// fechaFija.mjs y la página lo lee de ahí.
const { viajes, enviar } = await import('./banco/js-api/services/transporteSimulado.js');
await enviar('menu.guardarSemana', {
  lunes: '2026-08-17',
  dias: [{ fecha: HOY_FIJADO, platos: ['Bandeja paisa', 'Pollo asado'] }],
});
viajes.length = 0;

console.log(`(cada viaje simulado tarda ${RETARDO} ms)\n`);

console.log('── Cargar la página ──');
let inicio = reloj();
await import('./banco/js-api/paginaReserva.js');
const pintada = await hasta(() => /reservas para hoy|N.º/.test(document.querySelector('#contenedor-tabla').textContent));
const tCarga = reloj() - inicio;
console.log('   ' + viajes.join(' · '));
ok(viajes.length === 3, `${viajes.length} consultas al arrancar`);
// El umbral es «menos de dos viajes», no «exactamente uno»: montar jsdom
// e importar los módulos añade unas decenas de milisegundos fijos que no
// son espera de red. Lo que se afirma es que no van encadenadas.
ok(tCarga < RETARDO * 2, `salen las tres a la vez: ${tCarga} ms, menos de dos viajes (${RETARDO * 2} ms)`);
ok(pintada, 'la tabla quedó pintada sin una consulta más');

console.log('\n── Abrir el formulario ──');
viajes.length = 0;
inicio = reloj();
clic(document.querySelector('#boton-reservar'));
const tAbrir = reloj() - inicio;
ok(viajes.length === 0, `abrir el modal no consulta nada (${viajes.length} viajes)`);
ok(tAbrir < RETARDO, `y es inmediato: ${tAbrir} ms`);
ok(document.querySelector('#dialogo-reserva').open, 'el formulario quedó abierto');
const platos = [...document.querySelectorAll('#campo-menu option')].map((o) => o.value).filter(Boolean);
ok(platos.includes('bandeja-paisa'), `con la carta de hoy y los fijos de la sede: ${platos.length} platos`);

console.log('\n── Registrar una reserva ──');
document.querySelector('#campo-nombre').value = 'Laura Ardila';
document.querySelector('#campo-telefono').value = '3001234567';
document.querySelector('#campo-menu').value = 'bandeja-paisa';
document.querySelector('#campo-medio-presencial').checked = true;
document.querySelector('#campo-pago-pagado').checked = true;

// Se cronometra hasta que el modal se cierra: eso es lo que espera la
// persona que atiende. Lo que ocurra después no la hace esperar.
const cerrado = new Promise((r) => {
  document.querySelector('#dialogo-reserva').addEventListener('close', () => r(reloj()), { once: true });
});
viajes.length = 0;
inicio = reloj();
document.querySelector('#dialogo-reserva form')
  .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const tGuardar = (await cerrado) - inicio;

ok(enViajes(tGuardar) <= 1, `se cierra tras un solo viaje: ${tGuardar} ms, ≈${enViajes(tGuardar)} viaje(s)`);
const filas = [...document.querySelectorAll('#contenedor-tabla tbody tr')];
ok(filas.some((f) => /Laura Ardila/.test(f.textContent)), 'y la reserva ya está en la tabla');

await esperar(RETARDO * 3 + 60);
console.log(`   (por detrás se refrescó con ${viajes.length - 1} consultas más, sin hacer esperar a nadie)`);
const trasRefresco = [...document.querySelectorAll('#contenedor-tabla tbody tr')];
ok(trasRefresco.some((f) => /Laura Ardila/.test(f.textContent)),
   'y sigue ahí después del refresco de fondo');

console.log(fallos === 0 ? '\n✔ Todo en verde\n' : `\n✘ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
