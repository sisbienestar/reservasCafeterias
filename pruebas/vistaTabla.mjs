/** Vista previa de la tabla del mostrador con los anchos nuevos. */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><body><div id="h"></div>');
globalThis.document = dom.window.document;

const { mostrarReservas } = await import('./banco/js/ui/tablaReservas.js');
const hueco = document.querySelector('#h');

const reservas = [
  ['001', 'Diego Fernando Prada Celis', 'Mini Lunch', '3132047407', 'telefono', 'pagado'],
  ['002', 'Ana Ruiz', 'Cerdo con verduras salteadas', '3001112233', 'presencial', 'debe'],
  ['003', 'María Fernanda Villamizar Jaimes', 'Especial pollo', '3157654321', 'presencial', 'pagado'],
  ['004', 'Luis Peña', 'Bandeja paisa', '3204445566', 'telefono', 'pagado'],
].map(([numero, nombre, menuNombre, telefono, medio, pago], i) => ({
  id: `01-260825-00${i + 1}`, numero, nombre, menuNombre, telefono, medio, pago,
}));

mostrarReservas(hueco, reservas, { alEditar: () => {}, alVerTicket: () => {} });

writeFileSync('./vistaTabla.html', `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tabla del mostrador</title>
<link rel="stylesheet" href="banco/css/base.css">
<link rel="stylesheet" href="banco/css/componentes.css">
<style>body { padding: 2rem; background: var(--c-fondo); } table { width: 100%; border-collapse: collapse; }</style>
</head><body>
<p class="encabezado-reserva__ubicacion">Vista previa · anchos nuevos (Nombre 22% · Menú 28%)</p>
${hueco.innerHTML}
</body></html>`);
console.log('✔ vistaTabla.html generada');
