/** Genera una vista previa estática del consolidado, con el CSS real. */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><body><div id="h"></div>');
globalThis.document = dom.window.document;

const { mostrarResumen } = await import('./banco/js/ui/resumenDelDia.js');
const hueco = document.querySelector('#h');

const casos = [
  ['Un servicio normal', [
    ...Array(12).fill({ menuNombre: 'Bandeja paisa', pago: 'pagado' }),
    ...Array(3).fill({ menuNombre: 'Bandeja paisa', pago: 'debe' }),
    ...Array(8).fill({ menuNombre: 'Pollo asado', pago: 'pagado' }),
    ...Array(4).fill({ menuNombre: 'Especial carne', pago: 'pagado' }),
    ...Array(2).fill({ menuNombre: 'Especial pollo', pago: 'debe' }),
    { menuNombre: 'Especial cerdo', pago: 'pagado' },
  ]],
  ['Todo cobrado', [
    ...Array(6).fill({ menuNombre: 'Sancocho', pago: 'pagado' }),
    ...Array(2).fill({ menuNombre: 'Mini Lunch', pago: 'pagado' }),
  ]],
  ['Con reservas antiguas sin cobro registrado', [
    ...Array(5).fill({ menuNombre: 'Bandeja paisa', pago: 'pagado' }),
    ...Array(2).fill({ menuNombre: 'Bandeja paisa', pago: 'debe' }),
    ...Array(3).fill({ menuNombre: 'Pollo asado', pago: '' }),
  ]],
];

const bloques = casos.map(([titulo, reservas]) => {
  mostrarResumen(hueco, reservas);
  return `<h2 class="seccion__titulo">${titulo}</h2>\n${hueco.innerHTML}`;
}).join('\n<hr>\n');

writeFileSync('./vistaPrevia.html', `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Consolidado del mostrador</title>
<link rel="stylesheet" href="banco/css/base.css">
<link rel="stylesheet" href="banco/css/componentes.css">
<style>
  body { padding: 2rem; max-width: 60rem; margin: 0 auto; background: var(--c-fondo); }
  hr { border: 0; border-top: 1px solid var(--c-borde); margin: 2.5rem 0; }
  h2 { margin-bottom: 1rem; }
</style>
</head><body>
<p class="encabezado-reserva__ubicacion">Vista previa · tarjetas del consolidado</p>
${bloques}
</body></html>`);
console.log('✔ vistaPrevia.html generada');
