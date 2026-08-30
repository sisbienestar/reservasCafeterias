/**
 * Lee los archivos de `supabase/` con el analizador de Postgres de verdad.
 *
 *   npm run sql                 · todos
 *   npm run sql -- 15           · los que lleven «15» en el nombre
 *
 * Existe porque estos archivos NO los ejecuta nadie automáticamente: se pegan
 * a mano en el editor de Supabase. Un paréntesis de menos no lo detecta ni el
 * tipado ni las pruebas ni el despliegue — lo detecta Fredy, pegando, y para
 * entonces ya ha costado un viaje de ida y vuelta. Ha pasado dos veces.
 *
 * `libpg-query` es el analizador C de PostgreSQL compilado, no una imitación
 * en JavaScript: lo que él acepta, lo acepta el servidor.
 *
 * ── Lo que esto NO comprueba ─────────────────────────────────────────────
 *
 * 1. El interior de las funciones plpgsql. Para el analizador de SQL, el
 *    cuerpo entre `$$` es una cadena de texto y nada más; el que lo entiende
 *    es otro analizador que solo existe dentro del servidor. Por eso aquí se
 *    revisa a mano lo poco que se puede: que los BEGIN cierren.
 * 2. Que las tablas, columnas y funciones que se nombran EXISTAN. Eso es
 *    semántica, y hace falta una base delante.
 *
 * O sea: aprueba «sintaxis correcta», no «va a funcionar». Sigue habiendo que
 * mirar la salida de la pegada.
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadModule, parse } from 'libpg-query';

const DIRECTORIO = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const filtro = process.argv[2] ?? '';

const archivos = fs.readdirSync(DIRECTORIO)
  .filter((n) => n.endsWith('.sql'))
  .filter((n) => !filtro || n.includes(filtro))
  .sort();

if (archivos.length === 0) {
  console.error(filtro ? `Ningún .sql con «${filtro}».` : 'No hay .sql en supabase/.');
  process.exit(1);
}

/**
 * Los cuerpos de función, para mirarles los BEGIN.
 *
 * Se buscan por la etiqueta de dólar completa —`$$`, `$cuerpo$`— y no por
 * `$$` a secas, porque una función que use etiqueta con nombre partiría el
 * texto por donde no es.
 */
function cuerpos(sql) {
  const encontrados = [];
  const etiqueta = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/g;
  let abre;
  while ((abre = etiqueta.exec(sql)) !== null) {
    const cierre = sql.indexOf(abre[0], abre.index + abre[0].length);
    if (cierre === -1) break;
    encontrados.push(sql.slice(abre.index + abre[0].length, cierre));
    etiqueta.lastIndex = cierre + abre[0].length;
  }
  return encontrados;
}

/** Palabras clave fuera de comentarios y de literales: contarlas dentro engaña. */
function limpiar(texto) {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'[^']*'/g, "''");
}

const cuenta = (texto, palabra) =>
  (texto.match(new RegExp(`\\b${palabra}\\b`, 'gi')) || []).length;

await loadModule();

let fallos = 0;

for (const archivo of archivos) {
  const ruta = path.join(DIRECTORIO, archivo);
  const sql = fs.readFileSync(ruta, 'utf8');
  const problemas = [];
  let sentencias = 0;

  try {
    sentencias = (await parse(sql)).stmts.length;
  } catch (e) {
    const posicion = e.cursorPosition ?? 0;
    const linea = sql.slice(0, posicion).split('\n').length;
    problemas.push(`sintaxis, línea ~${linea}: ${e.message ?? e}`);
  }

  /*
   * Cada BEGIN y cada CASE de plpgsql se cierran con un END. No es una
   * comprobación completa —no dice si el END cierra lo que debe— pero atrapa
   * lo que de verdad pasa al editar a mano: quitar un trozo y dejarse la
   * pareja.
   *
   * Los `END IF` y `END LOOP` se descuentan: cierran un IF o un bucle, que no
   * se abrieron con ningún BEGIN. Contarlos daba por rotos los seis archivos
   * que llevan meses en producción, y así fue como se supo que la cuenta
   * estaba mal. El `END CASE` sí cuenta, porque su CASE sí abre.
   */
  for (const [i, cuerpo] of cuerpos(sql).entries()) {
    const limpio = limpiar(cuerpo);
    const abren = cuenta(limpio, 'BEGIN') + cuenta(limpio, 'CASE');
    const cierran = cuenta(limpio, 'END')
      - (limpio.match(/\bEND\s+IF\b/gi) || []).length
      - (limpio.match(/\bEND\s+LOOP\b/gi) || []).length;
    if (abren !== cierran) {
      problemas.push(`cuerpo ${i + 1}: ${abren} BEGIN/CASE frente a ${cierran} END sueltos`);
    }
  }

  if (problemas.length) {
    fallos += 1;
    console.log(`✘ ${archivo}`);
    for (const p of problemas) console.log(`    ${p}`);
  } else {
    console.log(`✔ ${archivo.padEnd(26)} ${String(sentencias).padStart(4)} sentencias`);
  }
}

console.log('\n' + '─'.repeat(52));
console.log(fallos === 0
  ? `  ${archivos.length} archivos · ninguno con errores de sintaxis`
  : `  ${fallos} de ${archivos.length} archivos con problemas`);

process.exit(fallos === 0 ? 0 : 1);
