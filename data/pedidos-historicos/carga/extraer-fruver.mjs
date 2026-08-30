/** El catálogo de la hoja «FRUVER DF», que está en blanco pero lo trae entero. */
import fs from 'node:fs';
import * as C from './comun.mjs';
const m = C.leer('pedidos_matriz_mensual.csv');
const vistos = new Map();
for (const r of m) {
  if (r.hoja !== 'FRUVER DF') continue;
  const p = r.producto.trim();
  if (!p || /NOMBRE DEL PRODUCTO|Unidad de Servicio/i.test(p)) continue;
  if (!vistos.has(p)) vistos.set(p, r.unidad_medida.trim() || 'UNIDAD');
}
const lista = [...vistos].map(([nombre, unidad]) => ({ nombre, unidad }));
fs.writeFileSync('data/pedidos-historicos/carga/fruver.json', JSON.stringify(lista, null, 1));
console.log('productos de FRUVER DF:', lista.length);
