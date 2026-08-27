/** Vista previa estática del ticket, con el CSS real. */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
globalThis.document = new JSDOM('<!doctype html><body>').window.document;

const { construirTicket } = await import('./banco/js/utils/ticket.js');
const escapar = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const casos = [
  ['Pagada', { nombre: 'Bienestar Pro', ubicacion: 'Campus central' }, {
    id: '01-260825-004', nombre: 'Laura Camila Ardila', telefono: '3001234567',
    fecha: '2026-08-25', menuNombre: 'Bandeja paisa', medio: 'presencial', pago: 'pagado' }],
  ['Debe, con nombre y plato largos', { nombre: 'Bienestar Universitario', ubicacion: 'Edificio de Bienestar Universitario' }, {
    id: '03-260825-012', nombre: 'María Fernanda Villamizar Jaimes', telefono: '3157654321',
    fecha: '2026-08-25', menuNombre: 'Cerdo con verduras salteadas y arroz', medio: 'telefono', pago: 'debe' }],
];

const bloques = casos.map(([t, sede, r]) =>
  `<div><h2 class="seccion__titulo">${t}</h2><pre class="ticket">${escapar(construirTicket(r, sede))}</pre></div>`).join('\n');

writeFileSync('./vistaTicket.html', `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ticket de confirmación</title>
<link rel="stylesheet" href="banco/css/base.css">
<link rel="stylesheet" href="banco/css/componentes.css">
<style>
  body { padding: 2rem; background: var(--c-fondo); }
  .fila { display: flex; flex-wrap: wrap; gap: 2rem; align-items: flex-start; }
  .fila > div { max-width: 24rem; }
  h2 { margin-bottom: .75rem; }
</style>
</head><body>
<p class="encabezado-reserva__ubicacion">Vista previa · ticket de confirmación</p>
<div class="fila">${bloques}</div>
</body></html>`);
console.log('✔ vistaTicket.html generada');
