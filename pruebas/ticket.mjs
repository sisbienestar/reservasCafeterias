/**
 * El ticket de confirmación.
 *
 * Dos cosas se vigilan por encima del resto: que ninguna línea se pase del
 * ancho —una sola descuadra el recibo entero— y que el ticket diga lo mismo
 * que la reserva. Un comprobante que no coincide con lo reservado es peor que
 * no mandar comprobante.
 */
import { HOY_FIJADO } from './fechaFija.mjs';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { JSDOM, VirtualConsole } = require('jsdom');

let fallos = 0;
const ok = (c, e) => { console.log(`${c ? '  OK  ' : ' FALLO'} · ${e}`); if (!c) fallos++; };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const hasta = async (cond, limite = 3000) => {
  const fin = performance.now() + limite;
  while (performance.now() < fin) { if (cond()) return true; await esperar(5); }
  return false;
};

const { construirTicket, mensajeWhatsApp, enlaceWhatsApp, ANCHO } =
  await import('./banco/js/utils/ticket.js');

const cafeteria = { nombre: 'Autoservicio Bienestar Pro', ubicacion: 'Campus central' };
const base = {
  id: '01-260825-004', nombre: 'Laura Ardila', telefono: '3001234567',
  fecha: '2026-08-25', menuNombre: 'Bandeja paisa', medio: 'presencial', pago: 'pagado',
};

console.log('── Es exactamente el formato acordado ──');
const ESPERADO = [
  '================================',
  '      RESERVA DE ALMUERZO',
  '   AUTOSERVICIO BIENESTAR PRO',
  '================================',
  '',
  '          RESERVA N.º',
  '         01-260825-002',
  '',
  '  Martes, 25 de agosto de 2026',
  '',
  '--------------------------------',
  'NOMBRE              Daniel Durán',
  'MÓVIL               313 204 7407',
  '--------------------------------',
  'MENÚ DEL DÍA',
  'BROCHETAS DE CARNE',
  '--------------------------------',
  'MEDIO                 PRESENCIAL',
  'PAGO                      PAGADO',
  '--------------------------------',
  '',
  '    PRESENTA ESTE TICKET AL',
  '      RECLAMAR TU ALMUERZO',
  '',
  '     GRACIAS POR TU VISITA',
  '',
  '================================',
].join('\n');
const obtenido = construirTicket({
  id: '01-260825-002', nombre: 'Daniel Durán', telefono: '3132047407',
  fecha: '2026-08-25', menuNombre: 'Brochetas de carne',
  medio: 'presencial', pago: 'pagado',
}, { nombre: 'Autoservicio Bienestar Pro' });
ok(obtenido === ESPERADO, 'coincide carácter a carácter con el formato pedido');
if (obtenido !== ESPERADO) {
  const a = ESPERADO.split('\n');
  const b = obtenido.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) console.log(`   línea ${i + 1}\n     esperado: ${JSON.stringify(a[i])}\n     obtenido: ${JSON.stringify(b[i])}`);
  }
}

console.log('\n── El ancho, que es lo que sostiene el formato ──');
const casos = [
  ['normal', base],
  ['nombre larguísimo', { ...base, nombre: 'María Fernanda Villamizar Jaimes de la Rosa' }],
  ['plato larguísimo', { ...base, menuNombre: 'Cerdo con verduras salteadas al wok y arroz blanco' }],
  ['sede de nombre largo', { ...base }],
  ['debe', { ...base, pago: 'debe' }],
  ['sin medio ni pago (reserva antigua)', { ...base, medio: '', pago: '' }],
];
for (const [titulo, reserva] of casos) {
  const sede = titulo.includes('sede')
    ? { nombre: 'Bienestar Universitario', ubicacion: 'Edificio de Bienestar Universitario' }
    : cafeteria;
  const largas = construirTicket(reserva, sede).split('\n').filter((l) => l.length > ANCHO);
  ok(largas.length === 0, `${titulo}: ninguna línea pasa de ${ANCHO} (${largas.length})`);
}

console.log('\n── Que diga lo que dice la reserva ──');
const t = construirTicket(base, cafeteria);
ok(t.includes('01-260825-004'), 'lleva el número de reserva completo');
ok(t.includes('Laura Ardila'), 'el nombre');
ok(t.includes('300 123 4567'), 'el móvil, con separadores');
ok(t.includes('BANDEJA PAISA'), 'el plato');
ok(/PAGO\s+PAGADO/.test(t), 'el estado del cobro');
ok(t.includes('AUTOSERVICIO BIENESTAR PRO'), 'la sede, con «AUTOSERVICIO» delante');
ok(!t.includes('Campus central'), 'y sin la ubicación, que ya no va en el ticket');
ok(/25 de agosto de 2026/.test(t), 'la fecha en palabras');

// El número es lo que se dicta para reclamar el almuerzo: va arriba, antes
// que ningún otro dato, y no perdido al final del comprobante.
ok(t.indexOf('01-260825-004') < t.indexOf('25 de agosto'),
   'el número de reserva aparece antes que la fecha');
ok(t.indexOf('RESERVA N.º') < t.indexOf('NOMBRE'),
   'y antes que los datos de quien reserva');
ok(!t.includes('PENDIENTE DE PAGO'), 'y no avisa de deuda cuando está pagada');

const tDebe = construirTicket({ ...base, pago: 'debe' }, cafeteria);
ok(tDebe.includes('PENDIENTE DE PAGO'), 'cuando debe, lo dice bien claro');

console.log('\n── Sin espacios sobrantes ──');
ok(!/[ \t]+\n/.test(t) && !/[ \t]+$/.test(t),
   'ninguna línea termina en espacios, que se copian sin verse');

console.log('\n── El enlace de WhatsApp ──');
const enlace = enlaceWhatsApp(base, cafeteria);
ok(enlace.startsWith('https://wa.me/573001234567?text='), `apunta al móvil con indicativo: ${enlace.slice(0, 40)}…`);
const textoDelEnlace = decodeURIComponent(enlace.split('?text=')[1]);
ok(textoDelEnlace === mensajeWhatsApp(base, cafeteria),
   'y lleva exactamente el mensaje, sin perder nada al codificar');
ok(textoDelEnlace.startsWith('```') && textoDelEnlace.endsWith('```'),
   'envuelto en monoespaciado, que es lo que hace que WhatsApp lo alinee');
ok(textoDelEnlace.includes('01-260825-004'), 'con el número dentro');
ok(enlaceWhatsApp({ ...base, telefono: '123' }, cafeteria) === null,
   'un móvil que no sirve devuelve null en vez de un enlace roto');

console.log('\n── En la pantalla: se ofrece, no se impone ──');
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

const { enviar } = await import('./banco/js-api/services/transporteSimulado.js');
await enviar('menu.guardarSemana', {
  lunes: '2026-08-17', dias: [{ fecha: HOY_FIJADO, platos: ['Bandeja paisa'] }],
});
await import('./banco/js-api/paginaReserva.js');
await hasta(() => !document.querySelector('#boton-reservar').disabled);

clic(document.querySelector('#boton-reservar'));
const d = document.querySelector('#dialogo-reserva');
d.querySelector('#campo-nombre').value = 'Laura Ardila';
d.querySelector('#campo-telefono').value = '3001234567';
d.querySelector('#campo-menu').value = 'bandeja-paisa';
d.querySelector('#campo-medio-presencial').checked = true;
d.querySelector('#campo-pago-debe').checked = true;
d.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await hasta(() => !d.open);

const dTicket = document.querySelector('.modal--ticket');
ok(dTicket && !dTicket.open, 'tras registrar, el ticket NO se abre solo');
const accion = document.querySelector('#aviso .aviso__accion');
ok(!!accion && accion.textContent === 'Ver ticket', 'pero el aviso lo ofrece');

clic(accion);
ok(dTicket.open, 'y al pulsarlo se abre');
const papel = dTicket.querySelector('.ticket');
ok(/Laura Ardila/.test(papel.textContent), 'con los datos de la reserva recién hecha');
ok(/PENDIENTE DE PAGO/.test(papel.textContent), 'y la marca de que debe');
ok(!papel.textContent.includes('```'), 'sin enseñar las comillas de WhatsApp en pantalla');
ok(papel.dataset.paraEnviar.includes('```'), 'aunque lo que se copia sí las lleva');
const botonWa = dTicket.querySelector('a.boton');
ok(!botonWa.hidden && botonWa.href.startsWith('https://wa.me/573001234567'),
   'el enlace de WhatsApp apunta al móvil de esa reserva');
ok(botonWa.target === '_blank' && /noopener/.test(botonWa.rel), 'se abre aparte y con noopener');


console.log('\n── Volver al ticket después de cerrarlo ──');
// El aviso lo ofrece UNA vez y desaparece con la siguiente acción. Si esa
// fuera la única puerta, cerrar el ticket sería perderlo, y no habría forma
// de reenviárselo a quien lo perdió.
dTicket.close();
ok(!dTicket.open, 'se cierra el ticket');

// La puerta de vuelta está en la fila, que es donde se busca una reserva
// concreta: no hay que abrir el formulario de edición para pedir un ticket.
const fila = [...document.querySelectorAll('#contenedor-tabla tbody tr')]
  .find((f) => /Laura Ardila/.test(f.textContent));
const botonTicket = [...fila.querySelectorAll('button')]
  .find((b) => b.textContent === 'Ticket');
ok(!!botonTicket, 'la fila de esa reserva tiene un botón «Ticket»');

clic(botonTicket);
ok(dTicket.open, 'y al pulsarlo vuelve a salir el ticket');
ok(/Laura Ardila/.test(dTicket.querySelector('.ticket').textContent),
   'con los datos de esa reserva');
ok(!document.querySelector('#dialogo-reserva').open,
   'sin pasar por el formulario de edición');

console.log('\n── El formulario ya no lleva el ticket ──');
dTicket.close();
clic([...fila.querySelectorAll('button')].find((b) => b.textContent === 'Editar'));
await esperar(0);
const dReserva = document.querySelector('#dialogo-reserva');
ok(dReserva.open, 'se abre la reserva desde la tabla');
ok(dReserva.querySelector('[data-ver-ticket]') === null,
   'y su pie no tiene «Ver ticket»: el ticket vive en la fila');
ok([...dReserva.querySelectorAll('.modal__pie button')]
     .filter((b) => !b.hidden).map((b) => b.textContent).join('|') === 'Guardar cambios',
   'el pie se queda solo con «Guardar cambios»');
dReserva.close();

console.log(fallos === 0 ? '\n✔ Todo en verde\n' : `\n✘ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
