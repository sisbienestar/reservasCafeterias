/**
 * El consolidado del mostrador.
 *
 * Lo que se comprueba, sobre todo, es que las partes sumen el total: un
 * consolidado que no cuadra con la tabla que tiene debajo es peor que no
 * tener consolidado, porque se sigue mirando y ya no dice la verdad.
 */
import { HOY_FIJADO } from './fechaFija.mjs';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require('jsdom');

let fallos = 0;
const ok = (c, e) => { console.log(`${c ? '  OK  ' : ' FALLO'} · ${e}`); if (!c) fallos++; };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

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
const hasta = async (cond, limite = 3000) => {
  const fin = performance.now() + limite;
  while (performance.now() < fin) { if (cond()) return true; await esperar(5); }
  return false;
};

/** Las tarjetas de un grupo, como pares rótulo → cifra. */
function cifrasDe(titulo) {
  const grupo = [...document.querySelectorAll('.resumen__grupo')]
    .find((g) => new RegExp(titulo, 'i').test(g.querySelector('.resumen__titulo').textContent));
  if (!grupo) return null;
  return Object.fromEntries([...grupo.querySelectorAll('.cifra')].map((c) => [
    c.querySelector('.cifra__rotulo').textContent,
    Number(c.querySelector('.cifra__valor').textContent),
  ]));
}

const { viajes, enviar } = await import('./banco/js-api/services/transporteSimulado.js');
await enviar('menu.guardarSemana', {
  lunes: '2026-08-17',
  dias: [{ fecha: HOY_FIJADO, platos: ['Bandeja paisa', 'Pollo asado'] }],
});

// Un día con reservas de varios platos y los dos estados de cobro, más una
// cancelada: la cancelada NO debe contar en ningún sitio.
const gente = [
  ['Ana Ruiz', '3001110001', 'bandeja-paisa', 'pagado'],
  ['Luis Peña', '3001110002', 'bandeja-paisa', 'pagado'],
  ['Sara Gil', '3001110003', 'bandeja-paisa', 'debe'],
  ['Iván Mora', '3001110004', 'pollo-asado', 'pagado'],
  ['Eva Cruz', '3001110005', 'especial-carne', 'debe'],
];
for (const [nombre, telefono, menu_id, pago] of gente) {
  await enviar('reservas.crear', { cafeteria_id: 'bienestar-pro', fecha: HOY_FIJADO,
    nombre, telefono, menu_id, medio: 'presencial', pago });
}
const cancelada = await enviar('reservas.crear', { cafeteria_id: 'bienestar-pro', fecha: HOY_FIJADO,
  nombre: 'No Viene', telefono: '3001110006', menu_id: 'pollo-asado', medio: 'telefono', pago: 'debe' });
await enviar('reservas.cancelar', { id: cancelada.data.id });

console.log('── Al cargar la página ──');
await import('./banco/js-api/paginaReserva.js');
await hasta(() => document.querySelectorAll('.cifra').length > 0);

const platos = cifrasDe('Platos');
const cobro = cifrasDe('Cobro');
console.log('   platos:', JSON.stringify(platos));
console.log('   cobro: ', JSON.stringify(cobro));

ok(platos['BANDEJA PAISA'] === 3 || platos['Bandeja paisa'] === 3,
   'tres bandejas paisa');
ok(Object.values(platos).reduce((a, b) => a + b, 0) === 5,
   'los platos suman 5, que son las reservas activas (la cancelada no cuenta)');
ok(cobro.Pagado === 3 && cobro.Debe === 2, 'cobro: 3 pagadas y 2 a deber');
ok(Object.values(cobro).reduce((a, b) => a + b, 0) === 5, 'el cobro también suma 5');

const filas = document.querySelectorAll('#contenedor-tabla tbody tr').length;
ok(filas === 5, `y coincide con las ${filas} filas de la tabla`);

const orden = [...document.querySelectorAll('.resumen__grupo')][0]
  .querySelectorAll('.cifra__valor');
ok(Number(orden[0].textContent) >= Number(orden[1].textContent),
   'los platos salen del más pedido al menos pedido');

console.log('\n── El consolidado se actualiza sin ir al servidor ──');
viajes.length = 0;
clic(document.querySelector('#boton-reservar'));
const d = document.querySelector('#dialogo-reserva');
d.querySelector('#campo-nombre').value = 'Nueva Persona';
d.querySelector('#campo-telefono').value = '3001119999';
d.querySelector('#campo-menu').value = 'bandeja-paisa';
d.querySelector('#campo-medio-presencial').checked = true;
d.querySelector('#campo-pago-debe').checked = true;
d.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await hasta(() => !d.open);

const platos2 = cifrasDe('Platos');
const cobro2 = cifrasDe('Cobro');
ok((platos2['Bandeja paisa'] ?? platos2['BANDEJA PAISA']) === 4, 'la bandeja paisa pasó a 4');
ok(cobro2.Debe === 3, 'y las que deben, a 3');
ok(viajes.filter((v) => v.startsWith('reservas.crear')).length === 1,
   'todo ello con una sola escritura y ninguna consulta extra de totales');

console.log('\n── Sin reservas no se dibuja nada ──');
const { mostrarResumen } = await import('./banco/js-api/ui/resumenDelDia.js');
const hueco = document.querySelector('#contenedor-resumen');
mostrarResumen(hueco, []);
ok(hueco.children.length === 0, 'un día vacío no enseña cuatro tarjetas a cero');

console.log('\n── Reservas antiguas sin cobro registrado ──');
mostrarResumen(hueco, [
  { menuNombre: 'Bandeja paisa', pago: 'pagado' },
  { menuNombre: 'Bandeja paisa', pago: '' },
  { menuNombre: 'Pollo asado', pago: undefined },
]);
const cobro3 = cifrasDe('Cobro');
ok(cobro3['Sin registrar'] === 2, 'las que no tienen cobro se cuentan aparte');
ok(Object.values(cobro3).reduce((a, b) => a + b, 0) === 3,
   'y así las partes siguen sumando el total');

console.log(fallos === 0 ? '\n✔ Todo en verde\n' : `\n✘ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
