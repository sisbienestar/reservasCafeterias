/** Cuadre: cada fila de los archivos de entrada, o entra, o consta por qué no. */
import fs from 'node:fs';
import * as C from './comun.mjs';

const bloques = C.leer('pedidos_bloques_diarios.csv');
const ctx = C.leer('contextos_encabezado_por_hoja.csv');
const matriz = C.leer('pedidos_matriz_mensual.csv');
const pedidos = JSON.parse(fs.readFileSync('data/pedidos-historicos/carga/pedidos.json', 'utf8'));
const inc = JSON.parse(fs.readFileSync('data/pedidos-historicos/carga/incidencias.json', 'utf8'));

const contextoDe = new Map();
for (const c of ctx) contextoDe.set([c.archivo, c.hoja, c.bloque_idx].join(''), c.contexto_encabezado_raw);

const razones = {};
const suma = (r) => { razones[r] = (razones[r] || 0) + 1; };
const num = (v) => { const t = (v ?? '').trim(); if (t === '') return null; const n = Number(t.replace(',', '.')); return Number.isFinite(n) ? n : null; };

for (const r of bloques) {
  if (C.ARCHIVOS_IGNORADOS.has(r.archivo)) { suma('archivo duplicado (_NEOFRUT_XLS_CONVERTED)'); continue; }
  if (/^Espacio para Nombre y firma/i.test(r.fila_no) || /^Espacio para Nombre y firma/i.test(r.unidad_medida)) { suma('pie de firmas de la plantilla'); continue; }
  if (r.producto.trim() === '') { suma('renglón en blanco de la plantilla'); continue; }
  let cant = num(r.cant_solicitada);
  if (r.unidad_medida.trim() === '' && r.cant_solicitada.trim() !== '' && cant === null) cant = num(r.cant_devuelta);
  if (cant === null) { suma('producto impreso sin cantidad pedida'); continue; }
  if (cant <= 0) { suma('cantidad 0'); continue; }
  const raw = contextoDe.get([r.archivo, r.hoja, r.bloque_idx].join('')) ?? '';
  const mu = raw.replace(/\s+/g, ' ').match(/Unidad de Servicio que solicita:\s*\|?\s*([^|]*)/i);
  if (!C.sedeDeTexto(mu ? mu[1] : '')) { suma('sin sede reconocible (SERVICIOS ESPECIALES)'); continue; }
  suma('IMPORTADA');
}

const descartadosDup = inc.filter((x) => x.tipo === 'documento-duplicado').reduce((a, x) => a + x.lineas, 0);
const repetidas = inc.filter((x) => x.tipo === 'producto-repetido-en-documento').length;

console.log('=== pedidos_bloques_diarios.csv · ' + bloques.length + ' filas ===');
for (const [k, v] of Object.entries(razones).sort((a, b) => b[1] - a[1])) console.log('  ' + String(v).padStart(5) + '  ' + k);
console.log('\n  de las IMPORTADAS se restan:');
console.log('    ' + String(descartadosDup).padStart(3) + '  líneas de documentos duplicados descartados');
console.log('    ' + String(repetidas).padStart(3) + '  producto repetido dentro de un documento (se suma a su línea)');
console.log('  LÍNEAS FINALES: ' + pedidos.reduce((a, p) => a + p.lineas.length, 0));

const conDato = matriz.filter((r) => r.cantidad && Number(r.cantidad) > 0 && !/NOMBRE DEL PRODUCTO|Unidad de Servicio/i.test(r.producto));
console.log('\n=== pedidos_matriz_mensual.csv · ' + matriz.length + ' filas ===');
console.log('  ' + conDato.length + ' filas con una cantidad real -> 0 pedidos. Son plantillas en blanco:');
console.log('  lo único no vacío son las cabeceras (los días 1..30) y la columna TOTAL, que vale 0.');

console.log('\n=== cantidades del almacén ===');
const cd = pedidos.flatMap((p) => p.lineas).filter((l) => l.devuelta !== null).length;
const ca = pedidos.flatMap((p) => p.lineas).filter((l) => l.adicional !== null).length;
console.log('  líneas con cantidad_devuelta anotada :', cd);
console.log('  líneas con cantidad_adicional anotada:', ca);
