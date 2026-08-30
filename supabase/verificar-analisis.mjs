/**
 * Comprueba que `analisis_pedidos` dice la verdad.
 *
 *   node --env-file=.env.local supabase/verificar-analisis.mjs
 *
 * La función de 13-analisis-pedidos.sql hace catorce agregados dentro de una
 * sola consulta. Un GROUP BY mal puesto no da error: da un número, y un
 * número equivocado en un panel del que se decide qué comprar es peor que una
 * pantalla rota, porque nadie se entera.
 *
 * Así que este guion vuelve a calcular los mismos agregados EN JAVASCRIPT, a
 * partir de las filas crudas de `pedido` y `pedido_linea`, y compara. Dos
 * implementaciones independientes que se equivoquen igual son mucho menos
 * probables que una sola sin comprobar. No sustituye a leer los números: dice
 * que el SQL cuenta lo mismo que cuenta la definición.
 *
 * Es de solo lectura y no escribe nada.
 */

import './websocketDeNode.mjs';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

let ok = 0;
const fallos = [];

function comprueba(rotulo, esperado, obtenido) {
  // Las cantidades son NUMERIC: se comparan con tolerancia de céntimo para no
  // fallar por cómo cada lado redondea la suma.
  const iguales = typeof esperado === 'number'
    ? Math.abs(esperado - obtenido) < 0.01
    : esperado === obtenido;
  if (iguales) { ok++; return; }
  fallos.push(`${rotulo}\n      esperado: ${esperado}\n      obtenido: ${obtenido}`);
}

/** Todas las filas de una tabla, en páginas: `select()` corta en 1000. */
async function todas(tabla, columnas) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db.from(tabla).select(columnas)
      .order('id').range(desde, desde + 999);
    if (error) throw error;
    filas.push(...data);
    if (data.length < 1000) return filas;
  }
}

console.log('Leyendo el detalle crudo…');
const [pedidos, lineas, productos, proveedores] = await Promise.all([
  todas('pedido', 'id, proveedor_id, cafeteria_id, fecha_elaboracion, estado, categoria_marcada'),
  todas('pedido_linea', 'id, pedido_id, producto_id, cantidad_solicitada'),
  todas('producto', 'id, nombre, unidad_medida, proveedor_id, activo'),
  todas('proveedor', 'id, nombre, activo, categoria_fija'),
]);

const porId = (filas) => new Map(filas.map((f) => [f.id, f]));
const pedidoDe = porId(pedidos);
const productoDe = porId(productos);
const proveedorDe = new Map(proveedores.map((p) => [p.id, p]));

/* La misma ventana que abre la pantalla: los últimos 180 días. */
const hoy = new Date().toISOString().slice(0, 10);
const desde = new Date(Date.parse(`${hoy}T12:00:00`) - 180 * 86_400_000)
  .toISOString().slice(0, 10);

console.log(`Rango de prueba: ${desde} → ${hoy}\n`);

/** El conjunto de trabajo, replicando el CTE `lineas` del SQL. */
const trabajo = lineas.flatMap((l) => {
  const p = pedidoDe.get(l.pedido_id);
  if (!p) return [];
  // Los DOS estados que cuentan: todo lo que salió de la cafetería.
  if (p.estado !== 'enviado' && p.estado !== 'confirmado') return [];
  if (p.fecha_elaboracion < desde || p.fecha_elaboracion > hoy) return [];
  const pr = productoDe.get(l.producto_id);
  if (!pr) return [];
  return [{
    cantidad: Number(l.cantidad_solicitada),
    pedidoId: p.id,
    cafeteriaId: p.cafeteria_id,
    proveedorId: p.proveedor_id,
    fecha: p.fecha_elaboracion,
    categoria: p.categoria_marcada,
    productoId: l.producto_id,
    unidad: pr.unidad_medida,
  }];
});

console.log('Llamando a analisis_pedidos…');
const { data: sql, error } = await db.rpc('analisis_pedidos', {
  p_desde: desde, p_hasta: hoy,
  p_cafeteria_id: '', p_proveedor_id: '', p_categoria: '',
  p_producto_id: 0, p_top: 20, p_dias_desuso: 90, p_granularidad: 'mes',
});

if (error) {
  console.error('\nLa función falló. ¿Se ejecutó 13-analisis-pedidos.sql?\n');
  console.error(error.message ?? error);
  process.exit(1);
}

/* ── Resumen ───────────────────────────────────────────────────────────── */
const unicos = (lista) => new Set(lista).size;
comprueba('resumen.pedidos', unicos(trabajo.map((l) => l.pedidoId)), sql.resumen.pedidos);
comprueba('resumen.lineas', trabajo.length, sql.resumen.lineas);
comprueba('resumen.productos', unicos(trabajo.map((l) => l.productoId)), sql.resumen.productos);
comprueba('resumen.sedes', unicos(trabajo.map((l) => l.cafeteriaId)), sql.resumen.sedes);
comprueba('resumen.proveedores', unicos(trabajo.map((l) => l.proveedorId)), sql.resumen.proveedores);
comprueba('resumen.unidades', unicos(trabajo.map((l) => l.unidad)), sql.resumen.unidades);

/* ── Que ninguna vista se invente o pierda renglones ───────────────────── */
const suma = (filas, campo) => filas.reduce((s, f) => s + Number(f[campo]), 0);

comprueba('por_sede_categoria suma los renglones',
  trabajo.length, suma(sql.por_sede_categoria, 'lineas'));
comprueba('por_categoria suma los renglones',
  trabajo.length, suma(sql.por_categoria, 'lineas'));
comprueba('por_proveedor suma los renglones',
  trabajo.length, suma(sql.por_proveedor, 'lineas'));
comprueba('por_dia_semana suma los renglones',
  trabajo.length, suma(sql.por_dia_semana, 'lineas'));
comprueba('por_fecha suma los renglones',
  trabajo.length, suma(sql.por_fecha, 'lineas'));
comprueba('por_fecha_sede suma los renglones',
  trabajo.length, suma(sql.por_fecha_sede, 'lineas'));
comprueba('tendencia suma los renglones',
  trabajo.length, suma(sql.tendencia, 'lineas'));
comprueba('tendencia_resumen suma los renglones',
  trabajo.length, suma(sql.tendencia_resumen, 'lineas'));

const cantidadTotal = suma(trabajo, 'cantidad');
comprueba('por_proveedor suma la cantidad', cantidadTotal, suma(sql.por_proveedor, 'cantidad'));
comprueba('por_fecha suma la cantidad', cantidadTotal, suma(sql.por_fecha, 'cantidad'));

/* ── Un proveedor concreto, de punta a punta ───────────────────────────── */
const agrupa = (filas, clave) => {
  const mapa = new Map();
  for (const f of filas) {
    const k = clave(f);
    const e = mapa.get(k) ?? { cantidad: 0, lineas: 0, pedidos: new Set() };
    e.cantidad += f.cantidad; e.lineas++; e.pedidos.add(f.pedidoId);
    mapa.set(k, e);
  }
  return mapa;
};

const porProveedor = agrupa(trabajo, (l) => l.proveedorId);
for (const fila of sql.por_proveedor) {
  const mio = porProveedor.get(fila.proveedor_id);
  comprueba(`por_proveedor «${fila.proveedor_id}» cantidad`, mio.cantidad, Number(fila.cantidad));
  comprueba(`por_proveedor «${fila.proveedor_id}» pedidos`, mio.pedidos.size, Number(fila.pedidos));
}

/* ── El día de la semana: que ISODOW sea lunes = 1 ─────────────────────── */
const porDia = agrupa(trabajo, (l) => {
  const d = new Date(`${l.fecha}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
});
for (const fila of sql.por_dia_semana) {
  const mio = porDia.get(Number(fila.dia));
  comprueba(`por_dia_semana día ${fila.dia} renglones`, mio ? mio.lineas : 0, Number(fila.lineas));
}

/* ── Top de productos ──────────────────────────────────────────────────── */
const porProducto = agrupa(trabajo, (l) => l.productoId);
/* Por RENGLONES, igual que el SQL: la cantidad mezcla unidades y no ordena. */
const topEsperado = [...porProducto]
  .sort((a, b) => b[1].lineas - a[1].lineas || b[1].cantidad - a[1].cantidad)
  .slice(0, 20);
comprueba('top_productos: cuántos', Math.min(20, porProducto.size), sql.top_productos.length);
if (topEsperado.length > 0 && sql.top_productos.length > 0) {
  comprueba('top_productos: el primero es el de más renglones',
    productoDe.get(topEsperado[0][0]).nombre, sql.top_productos[0].producto_nombre);
  comprueba('top_productos: renglones del primero',
    topEsperado[0][1].lineas, Number(sql.top_productos[0].lineas));
  comprueba('top_productos: la lista baja de renglones', true,
    sql.top_productos.every((p, i, l) => i === 0 || Number(l[i - 1].lineas) >= Number(p.lineas)));
}

/* ── Desuso: mira TODO el histórico, no el rango ───────────────────────── */
const ultimaVez = new Map();
for (const l of lineas) {
  const p = pedidoDe.get(l.pedido_id);
  if (!p || (p.estado !== 'enviado' && p.estado !== 'confirmado')) continue;
  const previa = ultimaVez.get(l.producto_id);
  if (!previa || p.fecha_elaboracion > previa) ultimaVez.set(l.producto_id, p.fecha_elaboracion);
}
const corte = new Date(Date.parse(`${hoy}T12:00:00`) - 90 * 86_400_000).toISOString().slice(0, 10);
const desusoEsperado = productos.filter((pr) => {
  if (!pr.activo) return false;
  if (!proveedorDe.get(pr.proveedor_id)?.activo) return false;
  const ultima = ultimaVez.get(pr.id);
  return !ultima || ultima < corte;
});
comprueba('en_desuso: cuántos', desusoEsperado.length, sql.en_desuso.length);
comprueba('en_desuso: nunca pedidos',
  desusoEsperado.filter((p) => !ultimaVez.has(p.id)).length,
  sql.en_desuso.filter((p) => p.ultima === null).length);

/* ── Consistencia: solo pares con dos pedidos o más ────────────────────── */
const pares = new Map();
for (const l of trabajo) {
  const k = `${l.productoId}:${l.cafeteriaId}`;
  const e = pares.get(k) ?? [];
  e.push(l.cantidad);
  pares.set(k, e);
}
const conDos = [...pares.values()].filter((c) => c.length >= 2).length;
comprueba('consistencia: pares con 2+ pedidos', conDos, sql.consistencia.length);

const primero = sql.consistencia[0];
if (primero) {
  const cantidades = pares.get(`${primero.producto_id}:${primero.cafeteria_id}`);
  const media = cantidades.reduce((s, c) => s + c, 0) / cantidades.length;
  const varianza = cantidades.reduce((s, c) => s + (c - media) ** 2, 0) / (cantidades.length - 1);
  comprueba(`consistencia «${primero.producto_nombre}» promedio`, media, Number(primero.promedio));
  comprueba(`consistencia «${primero.producto_nombre}» desviación`,
    Math.sqrt(varianza), Number(primero.desviacion));
}

/* ── Coherencia interna del propio resultado ───────────────────────────── */
comprueba('productos_disponibles = productos distintos',
  sql.resumen.productos, sql.productos_disponibles.length);
comprueba('grano_fecha con 181 días es semana', 'semana', sql.grano_fecha);

/* ── Resultado ─────────────────────────────────────────────────────────── */
console.log('');
if (fallos.length === 0) {
  console.log(`✔ ${ok} comprobaciones · 0 fallos`);
  console.log('  El SQL cuenta lo mismo que el recuento independiente en JavaScript.');
} else {
  console.log(`✘ ${ok} bien · ${fallos.length} fallos\n`);
  for (const f of fallos) console.log(`  · ${f}`);
  process.exitCode = 1;
}
