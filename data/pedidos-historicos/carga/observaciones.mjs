/**
 * Fase 3: las observaciones que la primera carga se dejó.
 *
 *   node data/pedidos-historicos/carga/observaciones.mjs
 *
 * Escribe `supabase/18-observaciones-historicas.sql`.
 *
 * ── Por qué no vinieron la primera vez ───────────────────────────────────
 *
 * No se perdieron: nunca se leyeron. `pedido.observaciones` no existía —lo
 * añadió `17-observaciones-y-formato-unico.sql`— y además `extraer.mjs` las
 * descarta sin querer: su `esFilaDeProducto` exige que la columna `producto`
 * tenga algo, y en la fila de observaciones el texto cae en `fila_no`, no en
 * `producto`. Se filtraban junto al pie de firmas.
 *
 * ── Cómo se ata cada texto a su pedido ───────────────────────────────────
 *
 * Por `origen_historico`, que ya guarda `archivo::hoja#bloque` justamente
 * para esto: «deja volver al Excel cuando una cifra no cuadre», dice
 * INFORME.md. Es la clave de la carga y no hay que inventar ninguna.
 *
 * ── La sigla del principio está a veces rancia, y NO se corrige ──────────
 *
 * Casi todas empiezan por una sigla de sede: «BE: 9 (Remision 576389)». En 23
 * de las 303 esa sigla contradice la casilla «Unidad de Servicio que
 * solicita» del mismo bloque, que es de donde sale la sede del pedido.
 *
 * Manda la casilla, y está comprobado con el número: en las que lo llevan,
 * 158 cuadran con el total pedido de SU bloque y NI UNA con el de un bloque
 * vecino. O sea que la observación es del bloque con el que se extrajo y lo
 * que quedó viejo es la sigla — se copió la hoja del día anterior y se
 * reordenaron las unidades de servicio sin retocar la nota escrita a mano.
 *
 * El texto va **literal**, sigla incluida, por la misma regla que
 * `producto_nombre` y `unidad_medida`: lo que decía el papel es lo que se
 * guarda. Corregirlo aquí sería reescribir el documento a toro pasado.
 */

import fs from 'node:fs';
import * as C from './comun.mjs';

const SALIDA = 'supabase/18-observaciones-historicas.sql';

/* El mismo tope que el CHECK `pedido_observaciones_cabe`. El máximo real es de
 * 53 caracteres, así que esto no recorta nada hoy; está para que el día que
 * entre una hoja con un párrafo, falle aquí y no al pegar el SQL. */
const MAX = 1000;

/* ── Lo que dicen las hojas ───────────────────────────────────────────── */

const observaciones = new Map();   // origen -> texto
let filas = 0;
let vacias = 0;

for (const r of C.leer('pedidos_bloques_diarios.csv')) {
  if (C.ARCHIVOS_IGNORADOS.has(r.archivo)) continue;

  /* El rótulo y su contenido vienen JUNTOS en `fila_no`, porque en la
   * plantilla «Observaciones:» y lo que se escribe al lado están en la misma
   * celda combinada. Por eso hay que quitarle el rótulo al texto. */
  const campo = (r.fila_no ?? '').trim();
  if (!/^observaci/i.test(campo)) continue;
  filas += 1;

  const texto = campo.replace(/^observaci\w*\s*:?/i, '').replace(/\s+/g, ' ').trim();
  if (!texto) { vacias += 1; continue; }   // el rótulo impreso, sin nada escrito

  if (texto.length > MAX) {
    console.error(`Observación de más de ${MAX} caracteres en ${r.archivo}::${r.hoja}#${r.bloque_idx}`);
    process.exit(1);
  }

  observaciones.set(`${r.archivo}::${r.hoja}#${r.bloque_idx}`, texto);
}

/* ── Cuáles tienen pedido ─────────────────────────────────────────────── */

/* `pedidos.json` es lo que produjo `extraer.mjs`, o sea exactamente los
 * bloques que llegaron a ser un pedido. Cruzar contra él —y no contra la
 * base— deja este guion sin credenciales y repetible. */
const pedidos = JSON.parse(fs.readFileSync('data/pedidos-historicos/carga/pedidos.json', 'utf8'));
const origenes = new Set(pedidos.map((p) => `${p.archivo}::${p.hoja}#${p.bloque_idx}`));

const conPedido = [];
const huerfanas = [];
for (const [origen, texto] of observaciones) {
  if (origenes.has(origen)) conPedido.push([origen, texto]);
  else huerfanas.push([origen, texto]);
}

conPedido.sort(([a], [b]) => a.localeCompare(b));

/* ── El SQL ───────────────────────────────────────────────────────────── */

const sql = (s) => `'${s.replace(/'/g, "''")}'`;

const l = [];
const w = (s = '') => l.push(s);

w('-- reservasCafeterias · las observaciones del histórico');
w('-- ===========================================================================');
w('--');
w('-- GENERADO por data/pedidos-historicos/carga/observaciones.mjs. No editar a');
w('-- mano: se regenera. Ver INFORME.md, sección «Las observaciones».');
w('--');
w('-- Se ejecuta UNA VEZ, entero, DESPUÉS de 17-observaciones-y-formato-unico.sql,');
w('-- que es quien crea la columna.');
w('--');
w('-- La carga de 12-historico-pedidos.sql no las trajo: la columna no existía');
w('-- todavía, y el extractor las descartaba junto al pie de firmas porque el');
w('-- texto no cae en la columna `producto`.');
w('--');
w(`-- Filas «Observaciones» en las hojas : ${filas}`);
w(`--   con algo escrito                 : ${filas - vacias}`);
w(`--   solo el rótulo impreso           : ${vacias}`);
w(`-- De las escritas, con pedido cargado: ${conPedido.length}`);
w(`--   sin pedido (bloque descartado)   : ${huerfanas.length}`);
w('--');
w('-- El texto va LITERAL, con su sigla de sede aunque en 23 casos esa sigla');
w('-- contradiga la unidad de servicio del propio bloque. Manda la unidad de');
w('-- servicio —de ahí sale `cafeteria_id`— y la sigla se quedó vieja al copiar');
w('-- la hoja del día anterior. Comprobado con el número que la acompaña: 158');
w('-- cuadran con el total de SU bloque y ninguna con la de un bloque vecino.');
w('');
w('BEGIN;');
w('');
w('/* `observaciones = \'\'` en el WHERE: esto NO pisa lo que alguien haya escrito');
w(' * desde la aplicación. Y hace el archivo repetible — pegarlo dos veces deja');
w(' * lo mismo que pegarlo una. */');
w('UPDATE pedido p SET observaciones = v.texto');
w('  FROM (VALUES');

conPedido.forEach(([origen, texto], i) => {
  const coma = i === conPedido.length - 1 ? '' : ',';
  w(`    (${sql(origen)}, ${sql(texto)})${coma}`);
});

w('  ) AS v(origen, texto)');
w(' WHERE p.origen_historico = v.origen');
w("   AND p.observaciones = '';");
w('');
w('COMMIT;');
w('');
w('/* Comprobación, para leer en la salida. */');
w('SELECT COUNT(*) FILTER (WHERE observaciones <> \'\') AS con_observacion,');
w('       COUNT(*)                                    AS historicos');
w('  FROM pedido WHERE origen_historico IS NOT NULL;');

fs.writeFileSync(SALIDA, `${l.join('\n')}\n`);

console.log(`Filas «Observaciones» leídas   : ${filas}`);
console.log(`  con texto                    : ${filas - vacias}`);
console.log(`  solo el rótulo               : ${vacias}`);
console.log(`Con pedido cargado             : ${conPedido.length}`);
console.log(`Sin pedido (bloque descartado) : ${huerfanas.length}`);
console.log(`\nEscrito ${SALIDA}`);

if (huerfanas.length) {
  const ruta = 'data/pedidos-historicos/carga/observaciones-huerfanas.json';
  fs.writeFileSync(ruta, `${JSON.stringify(huerfanas, null, 2)}\n`);
  console.log(`Las ${huerfanas.length} sin pedido, en ${ruta}`);
}
