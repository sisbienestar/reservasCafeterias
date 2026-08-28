/**
 * Siembra el catálogo del módulo de pedidos: 9 proveedores y 223 productos,
 * extraídos de las nueve plantillas de Excel.
 *
 *   node --env-file=.env.local supabase/sembrar-pedidos.mjs
 *   node --env-file=.env.local supabase/sembrar-pedidos.mjs --de-verdad
 *
 * Sin `--de-verdad` no escribe: comprueba, aplica las limpiezas, y enseña lo
 * que haría. Igual que `importar.mjs`, y por el mismo motivo: un catálogo a
 * medio sembrar es peor que uno sin sembrar.
 *
 * Se puede ejecutar más de una vez. Usa `upsert` contra (proveedor_id, orden),
 * así que repetirlo corrige en vez de duplicar.
 *
 * `seed_pedidos.json` ya viene con los acentos correctos: la extracción llegó
 * con la codificación rota —«AlmacÃ©n», «PULPA DE PIÃA»— y se reparó una vez,
 * al escribirlo. No hay que volver a hacerlo aquí.
 */

// El primero de la lista, y tiene que seguir siéndolo: presta a Node el
// WebSocket que supabase-js exige y que la versión 20 no trae.
import './websocketDeNode.mjs';

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const archivo = process.argv.find((a) => a.endsWith('.json')) ?? 'seed_pedidos.json';
const deVerdad = process.argv.includes('--de-verdad');

if (!fs.existsSync(archivo)) {
  console.error(`No existe «${archivo}».`);
  console.error('Uso: node --env-file=.env.local supabase/sembrar-pedidos.mjs [seed.json] [--de-verdad]');
  process.exit(1);
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  process.exit(1);
}

const semilla = JSON.parse(fs.readFileSync(archivo, 'utf8'));
const problemas = [];
const avisos = [];

/* ── Limpiezas de la extracción ──────────────────────────────────────────
 *
 * Tres cosas venían mal de las plantillas, y las tres se arreglan aquí y no
 * a mano en el JSON: el JSON es lo que se extrajo, y tiene que poder volver a
 * extraerse igual.
 */

/**
 * Los códigos salieron de Excel como números en coma flotante: «1064996.0».
 * El punto cero no es parte del código.
 */
const sinPuntoCero = (codigo) =>
  typeof codigo === 'string' && /^\d+\.0$/.test(codigo) ? codigo.slice(0, -2) : codigo;

/**
 * En Desechables, Alimentos y Colombina la columna «código» repite el nombre
 * del producto. Eso no es un código: es la misma celda dos veces, y dejarla
 * imprimiría el nombre en la columna de códigos del FBE.04.
 */
const esNombreRepetido = (codigo, nombre) =>
  typeof codigo === 'string' && codigo.trim() === nombre.trim();

const proveedores = semilla.proveedores.map((p) => ({
  id: p.slug,
  nombre: p.nombre,
  tipo_documento: p.tipo_documento,
  categoria_fija: p.categoria_fija,
  activo: true,
}));

const idsProveedor = new Set(proveedores.map((p) => p.id));

for (const p of proveedores) {
  if (!['FBE.04', 'FBE.34'].includes(p.tipo_documento)) {
    problemas.push(`Proveedor «${p.id}»: tipo_documento «${p.tipo_documento}» no es FBE.04 ni FBE.34.`);
  }
  if (p.tipo_documento === 'FBE.34' && p.categoria_fija) {
    problemas.push(`Proveedor «${p.id}»: es FBE.34 y trae categoría fija; esa plantilla no tiene esa casilla.`);
  }
}

/*
 * Los encabezados disfrazados de producto.
 *
 * En la plantilla de Pulpas Camilo, «PULPA SIN DOSIFICAR» y «PULPA DOSIFICADA»
 * son las dos secciones de la hoja, no dos cosas que se puedan pedir: se
 * reconocen porque son las únicas filas sin unidad de medida. Sembrarlas como
 * productos pondría en el formulario dos casillas que nadie puede rellenar, y
 * dejaría la misma fruta repetida sin nada que las distinga.
 *
 * Así que la fila se convierte en la CATEGORÍA de las que vienen detrás, que
 * es lo que era en la hoja.
 */
const productos = [];
const categoriaEnCurso = new Map();

for (const p of semilla.productos) {
  if (!idsProveedor.has(p.proveedor_slug)) {
    problemas.push(`Producto «${p.nombre}»: el proveedor «${p.proveedor_slug}» no está en la semilla.`);
    continue;
  }

  if (!p.unidad_medida) {
    categoriaEnCurso.set(p.proveedor_slug, p.nombre);
    avisos.push(`«${p.nombre}» (${p.proveedor_slug}) no es un producto: pasa a ser categoría de las filas siguientes.`);
    continue;
  }

  let codigo = sinPuntoCero(p.codigo);
  if (esNombreRepetido(codigo, p.nombre)) codigo = null;

  productos.push({
    proveedor_id: p.proveedor_slug,
    orden: p.orden,
    codigo,
    nombre: p.nombre,
    categoria: p.categoria ?? categoriaEnCurso.get(p.proveedor_slug) ?? null,
    unidad_medida: p.unidad_medida,
    activo: true,
  });
}

/* ── Comprobaciones ──────────────────────────────────────────────────────*/

const vistos = new Set();
for (const p of productos) {
  const clave = `${p.proveedor_id}·${p.orden}`;
  if (vistos.has(clave)) {
    problemas.push(`Orden repetido: «${p.proveedor_id}» ya tiene una fila ${p.orden}.`);
  }
  vistos.add(clave);
}

// Nombres repetidos DENTRO de la misma categoría de un proveedor. Entre
// categorías distintas es normal —la misma fruta dosificada y sin dosificar—;
// dentro de una, es una fila duplicada de la plantilla.
const porNombre = new Map();
for (const p of productos) {
  const clave = `${p.proveedor_id}·${p.categoria ?? ''}·${p.nombre.replace(/\s+/g, ' ').trim()}`;
  porNombre.set(clave, (porNombre.get(clave) ?? 0) + 1);
}
for (const [clave, veces] of porNombre) {
  if (veces > 1) {
    const [prov, cat, nombre] = clave.split('·');
    avisos.push(`«${nombre}» aparece ${veces} veces en ${prov}${cat ? ` / ${cat}` : ''}. Se siembran todas: revísalo en la plantilla.`);
  }
}

/* ── Informe ─────────────────────────────────────────────────────────────*/

console.log(`Semilla: ${archivo}`);
console.log(`  proveedores: ${proveedores.length}`);
console.log(`  productos:   ${productos.length}`);
console.log('');

for (const p of proveedores) {
  const suyos = productos.filter((x) => x.proveedor_id === p.id);
  const conCodigo = suyos.filter((x) => x.codigo).length;
  const categorias = new Set(suyos.map((x) => x.categoria).filter(Boolean));
  console.log(
    `  ${p.id.padEnd(22)} ${p.tipo_documento}  ${String(suyos.length).padStart(3)} productos` +
    `  ${String(conCodigo).padStart(3)} con código` +
    (categorias.size ? `  ${categorias.size} categorías` : ''),
  );
}

if (avisos.length) {
  console.log('\nAvisos (no impiden sembrar):');
  for (const a of avisos) console.log('  · ' + a);
}

if (problemas.length) {
  console.error('\nProblemas:');
  for (const p of problemas) console.error('  · ' + p);
  console.error('\nNo se escribe nada.');
  process.exit(1);
}

if (!deVerdad) {
  console.log('\nEnsayo. Añade --de-verdad para escribir en Supabase.');
  process.exit(0);
}

/* ── Escritura ───────────────────────────────────────────────────────────*/

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { error: errorProveedores } = await db
  .from('proveedor')
  .upsert(proveedores, { onConflict: 'id' });

if (errorProveedores) {
  console.error('Al escribir los proveedores:', errorProveedores.message);
  process.exit(1);
}
console.log(`\nProveedores escritos: ${proveedores.length}`);

const { error: errorProductos } = await db
  .from('producto')
  .upsert(productos, { onConflict: 'proveedor_id,orden' });

if (errorProductos) {
  console.error('Al escribir los productos:', errorProductos.message);
  process.exit(1);
}
console.log(`Productos escritos:   ${productos.length}`);
console.log('\nListo.');
