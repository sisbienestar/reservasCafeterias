/**
 * Fase 2 · paso 3: el SQL de carga.
 *
 * Escribe `supabase/12-historico-pedidos.sql`. Es idempotente: se puede
 * ejecutar dos veces sin duplicar nada, porque cada pedido lleva su
 * procedencia —archivo, hoja y bloque— y esa es la clave por la que se
 * reconoce si ya está cargado.
 */
import fs from 'node:fs';
import * as C from './comun.mjs';
import { PROVEEDOR_REAL } from './emparejar.mjs';

const pedidos = JSON.parse(fs.readFileSync('data/pedidos-historicos/carga/pedidos.json', 'utf8'));
const decisiones = new Map(JSON.parse(fs.readFileSync('data/pedidos-historicos/carga/decisiones.json', 'utf8')).map((d) => [d.clave, d]));
const nuevos = JSON.parse(fs.readFileSync('data/pedidos-historicos/carga/nuevos.json', 'utf8'));
const cat = JSON.parse(fs.readFileSync('data/pedidos-historicos/carga/catalogo-actual.json', 'utf8'));

const txt = (s) => (s === null || s === undefined ? 'NULL' : "'" + String(s).replace(/'/g, "''") + "'");
const nn = (n) => (n === null || n === undefined ? 'NULL' : String(n));

/* El `orden` de los productos nuevos sigue al último que ya tenga el
 * proveedor: `producto_orden_unico` es (proveedor_id, orden). */
const ultimoOrden = {};
for (const p of cat) ultimoOrden[p.proveedor_id] = Math.max(ultimoOrden[p.proveedor_id] ?? 0, p.orden);

const claveNueva = (proveedor, nombre) => proveedor + '|' + C.norm(nombre);
const ordenDe = new Map();
for (const n of nuevos) {
  // Un proveedor nuevo no tiene ningún `orden` todavía y empieza en el 1.
  ultimoOrden[n.proveedor] ??= 0;
  ordenDe.set(claveNueva(n.proveedor, n.nombre), ++ultimoOrden[n.proveedor]);
}
for (const [k, o] of ordenDe) {
  if (!Number.isInteger(o) || o < 1) throw new Error('orden inválido para ' + k + ': ' + o);
}

const L = [];
const w = (s = '') => L.push(s);

w('-- reservasCafeterias · histórico de pedidos de las plantillas de Excel');
w('-- ===========================================================================');
w('--');
w('-- Carga los pedidos que se hicieron entre febrero y agosto de 2026 con las');
w('-- plantillas FBE.04, antes de que existiera el módulo. Se ejecuta DESPUÉS de');
w('-- 05-pedidos.sql, y después de sembrar el catálogo con sembrar-pedidos.mjs.');
w('--');
w('-- Se puede ejecutar más de una vez: cada pedido lleva escrito de qué archivo,');
w('-- hoja y bloque salió, y esa procedencia es única. Volver a ejecutarlo no');
w('-- duplica nada, y por eso va todo dentro de una transacción.');
w('--');
w('-- Lo que NO entra, y por qué, está en `data/pedidos-historicos/INFORME.md`.');
w('');
w('BEGIN;');
w('');
w('/* ── De dónde salió cada pedido ─────────────────────────────────────────');
w(' *');
w(' * Los pedidos que crea la aplicación no tienen procedencia: nacen en el');
w(' * formulario y su trazabilidad es `creado_por` + `creado_en`. Los importados');
w(' * no tienen a quién atribuirse —se escribieron en una hoja de cálculo, sin');
w(' * cuenta detrás—, así que lo que se guarda es el archivo del que vienen.');
w(' *');
w(' * Sirve para dos cosas, y las dos importan: hace la carga repetible sin');
w(' * duplicar, y deja poder volver al Excel original cuando una cifra no cuadre.');
w(' */');
w('ALTER TABLE pedido');
w('  ADD COLUMN IF NOT EXISTS origen_historico TEXT;');
w('');
w('COMMENT ON COLUMN pedido.origen_historico IS');
w("  'Archivo::hoja#bloque del Excel del que se importó. NULL en los pedidos creados por la aplicación.';");
w('');
w('-- La clave que hace repetible la carga. Parcial, porque sólo los importados');
w('-- tienen procedencia y NULL no choca con NULL en un índice único.');
w('CREATE UNIQUE INDEX IF NOT EXISTS pedido_origen_historico_unico');
w('  ON pedido (origen_historico) WHERE origen_historico IS NOT NULL;');
w('');

/* ── Una sede que no es una cafetería ──────────────────────────────────── */
w('/* ── «Servicios Especiales» ─────────────────────────────────────────────');
w(' *');
w(' * Una hoja de Vicky pide para «SERVICIOS ESPECIALES», que no es ninguna de');
w(' * las cinco cafeterías pero sí es quien solicita, y `pedido.cafeteria_id` es');
w(' * NOT NULL. Se da de alta como sede para que ese pedido pueda existir.');
w(' *');
w(' * Nace `activa = FALSE`, y no es un descuido: `cafeteria` NO está atada a');
w(' * ningún módulo —la usan reservas y pedidos— así que darla de alta activa la');
w(' * pondría a ofrecer almuerzos en /reservas, que no es lo que es. Inactiva');
w(' * queda fuera de las dos listas y sus pedidos siguen siendo consultables,');
w(' * que es exactamente lo que 01-esquema.sql previó para una sede cerrada.');
w(' */');
w('INSERT INTO cafeteria (id, codigo, nombre, ubicacion, imagen, activa) VALUES');
w('  (' + [txt('servicios-especiales'), txt('06'), txt('Servicios Especiales'),
  txt(''), txt(''), 'FALSE'].join(', ') + ')');
w('ON CONFLICT (id) DO NOTHING;');
w('');

/* ── Proveedores nuevos ────────────────────────────────────────────────── */
const NOMBRE_PROVEEDOR = { rapifritos: 'Rapifritos', neofrut: 'Neofrut', fruver: 'Fruver' };
const provNuevos = [...new Set(nuevos.map((n) => n.proveedor))].filter((p) => !cat.some((c) => c.proveedor_id === p));
if (provNuevos.length) {
  w('/* ── Proveedores que no estaban ─────────────────────────────────────────');
  w(' *');
  w(' * «Rapifritos» (los archivos EMPANADAS-RAPRITOS) es el que más pedidos tiene');
  w(' * de todo el histórico y no estaba en el catálogo.');
  w(' *');
  w(' * «Neofrut» se crea aparte aunque sus nueve pulpas se llamen exactamente');
  w(' * igual que las de `pulpas-camilo`: aquélla está dada de alta como FBE.34 y');
  w(' * estas hojas son FBE.04. Si resultan ser el mismo proveedor, fusionarlos');
  w(' * es un UPDATE; separar lo que ya se hubiera fusionado obliga a volver a');
  w(' * los Excel.');
  w(' *');
  w(' * Los dos son FBE.04 con «Alimentos y bebidas» marcada, como los almacenes.');
  w(' */');
  w('INSERT INTO proveedor (id, nombre, tipo_documento, categoria_fija, activo) VALUES');
  w(provNuevos.map((p) => '  (' + [txt(p), txt(NOMBRE_PROVEEDOR[p] ?? p), txt('FBE.04'),
    txt('Alimentos y bebidas'), 'TRUE'].join(', ') + ')').join(',\n'));
  w('ON CONFLICT (id) DO NOTHING;');
  w('');
}

/* ── Productos nuevos ──────────────────────────────────────────────────── */
w('/* ── Productos que no estaban en el catálogo ────────────────────────────');
w(' *');
w(' * ' + nuevos.length + ' en total. Los de Rapifritos son su catálogo entero; los de Coca-Cola');
w(' * son presentaciones que el catálogo sembrado no recogía —la de 6 unidades');
w(' * frente a la de 24, el Zero frente al Sin Azúcar, el Del Valle de 188 ml—.');
w(' *');
w(' * `orden` continúa donde acababa el proveedor, porque `producto_orden_unico`');
w(' * es (proveedor_id, orden) y es la clave del `upsert` de la siembra: si se');
w(' * reutilizaran números, volver a sembrar pisaría estos.');
w(' */');
w('INSERT INTO producto (proveedor_id, orden, codigo, nombre, categoria, unidad_medida, activo) VALUES');
const filasProd = nuevos.map((n) => '  (' + [txt(n.proveedor), ordenDe.get(claveNueva(n.proveedor, n.nombre)),
  'NULL', txt(n.nombre), 'NULL', txt(n.unidad), 'TRUE'].join(', ') + ')');
w(filasProd.join(',\n'));
w('ON CONFLICT (proveedor_id, orden) DO NOTHING;');
w('');

/* ── El catálogo de FRUVER DF ──────────────────────────────────────────── */
const fruver = JSON.parse(fs.readFileSync('data/pedidos-historicos/carga/fruver.json', 'utf8'));
w('/* ── Fruver ─────────────────────────────────────────────────────────────');
w(' *');
w(' * La hoja «FRUVER DF» aparece repetida, idéntica y EN BLANCO, en cuatro de');
w(' * los libros. No tiene ni un pedido, pero sí un catálogo de ' + fruver.length + ' frutas y');
w(' * verduras que no se parece a ningún proveedor de la base.');
w(' *');
w(' * Se da de alta `activo = FALSE`: el proveedor existe y su catálogo queda');
w(' * guardado, pero no sale en el mostrador hasta que se confirme de quién es.');
w(' * Activarlo es un UPDATE de una línea.');
w(' */');
w('INSERT INTO proveedor (id, nombre, tipo_documento, categoria_fija, activo) VALUES');
w('  (' + [txt('fruver'), txt('Fruver'), txt('FBE.04'), txt('Alimentos y bebidas'), 'FALSE'].join(', ') + ')');
w('ON CONFLICT (id) DO NOTHING;');
w('');
w('INSERT INTO producto (proveedor_id, orden, codigo, nombre, categoria, unidad_medida, activo) VALUES');
w(fruver.map((p, i) => '  (' + [txt('fruver'), i + 1, 'NULL', txt(p.nombre), 'NULL',
  txt(p.unidad), 'TRUE'].join(', ') + ')').join(',\n'));
w('ON CONFLICT (proveedor_id, orden) DO NOTHING;');
w('');

/* ── Pedidos ───────────────────────────────────────────────────────────── */
w('/* ── Los pedidos ────────────────────────────────────────────────────────');
w(' *');
w(' * ' + pedidos.length + ' documentos, ' + pedidos.reduce((a, p) => a + p.lineas.length, 0) + ' líneas, del 2 de febrero al 21 de agosto de 2026.');
w(' *');
w(' * · `estado` = confirmado. Son pedidos que se hicieron, se imprimieron y se');
w(' *   despacharon hace meses; nacer como borrador los pondría a la espera de');
w(' *   una confirmación que ya ocurrió fuera del sistema.');
w(' * · `creado_por` = NULL. Lo previsto en 05-pedidos.sql para este caso: se');
w(' *   escribieron cuando no había cuentas a las que atribuirlos.');
w(' * · `confirmado_en` = la fecha de elaboración a mediodía. No se sabe la hora');
w(' *   real, y dejarlo NULL contradiría a `estado`.');
w(' * · `tipo_documento` = FBE.04 para todos, que es la plantilla con la que se');
w(' *   escribieron, aunque hoy tres de esos proveedores estén dados de alta como');
w(' *   FBE.34. Es lo que manda el esquema: el pedido guarda el formato con el');
w(' *   que se elaboró, no el que tiene el proveedor ahora.');
w(' */');
w('');

let nLineas = 0;
for (const p of pedidos) {
  const proveedor = PROVEEDOR_REAL[p.proveedor_id];
  const origen = p.archivo + '::' + p.hoja + '#' + p.bloque_idx;

  w('WITH nuevo_pedido AS (');
  w('  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,');
  w('                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,');
  w('                      creado_por, creado_en, origen_historico)');
  w('  VALUES (' + [txt(proveedor), txt(p.cafeteria_id), txt('FBE.04'), txt(p.categoria_marcada),
    txt(p.fecha), txt(''), txt('confirmado'), txt(p.fecha + ' 12:00:00+00'),
    'NULL', txt(p.fecha + ' 12:00:00+00'), txt(origen)].join(', ') + ')');
  w('  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING');
  w('  RETURNING id');
  w(')');
  w('INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,');
  w('                          producto_nombre, producto_categoria, unidad_medida,');
  w('                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)');

  const filas = p.lineas.map((l) => {
    const d = decisiones.get(proveedor + '|' + C.norm(l.nombre));
    const esNuevo = d.via === 'nuevo';
    // El producto al que apunta la línea: el del catálogo, o el nuevo por su orden.
    const ref = esNuevo
      ? '(SELECT id FROM producto WHERE proveedor_id = ' + txt(proveedor) + ' AND orden = ' + ordenDe.get(claveNueva(proveedor, d.grupo_nombre ?? l.nombre)) + ')'
      : String(d.producto_id);
    // El nombre y la unidad van COPIADOS TAL COMO SE ESCRIBIERON en la hoja:
    // es lo que decía el documento que se imprimió y se firmó.
    nLineas++;
    /* Los NULL van con tipo escrito. En un UNION ALL donde una columna es NULL
     * en todas las ramas, Postgres la resuelve como `text`; el casteo evita
     * depender de eso. `producto_codigo` y `producto_categoria` son NULL
     * siempre: las plantillas no traían ni código ni agrupación. */
    return '  SELECT id, ' + ref + ', ' + l.orden + ', NULL::TEXT, ' + txt(l.nombre) +
      ', NULL::TEXT, ' + txt(l.unidad) + ', ' + nn(l.cantidad) + '::NUMERIC(10,2), ' +
      (l.devuelta === null ? 'NULL::NUMERIC(10,2)' : nn(l.devuelta) + '::NUMERIC(10,2)') + ', ' +
      (l.adicional === null ? 'NULL::NUMERIC(10,2)' : nn(l.adicional) + '::NUMERIC(10,2)') +
      ' FROM nuevo_pedido';
  });
  w(filas.join('\n  UNION ALL\n'));
  w(';');
  w('');
}

w('COMMIT;');
w('');
w('-- Comprobación rápida después de ejecutar:');
w('--   SELECT COUNT(*) FROM pedido       WHERE origen_historico IS NOT NULL;  -- ' + pedidos.length);
w('--   SELECT COUNT(*) FROM pedido_linea pl JOIN pedido p ON p.id = pl.pedido_id');
w('--     WHERE p.origen_historico IS NOT NULL;                                -- ' + nLineas);

fs.writeFileSync('supabase/12-historico-pedidos.sql', L.join('\n'));
console.log('escrito supabase/12-historico-pedidos.sql');
console.log('  proveedores nuevos:', provNuevos.length, provNuevos.join(', '));
console.log('  productos nuevos  :', nuevos.length);
console.log('  pedidos           :', pedidos.length);
console.log('  líneas            :', nLineas);
