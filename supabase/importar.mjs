/**
 * Traslada el volcado de Google Sheets a Supabase.
 *
 *   1. En el editor de Apps Script, ejecuta `exportarTodo()`.
 *   2. Copia el JSON del registro a un archivo, por ejemplo `volcado.json`.
 *      (Sale troceado en varios mensajes: hay que pegarlos en orden.)
 *   3. node supabase/importar.mjs volcado.json
 *      Añade --de-verdad para que escriba; sin ese flag solo comprueba.
 *
 * NO exportes las pestañas a CSV a mano: `opciones` e `historial` llevan comas
 * dentro y se rompen.
 *
 * Se puede ejecutar más de una vez: usa `upsert`, así que repetirlo corrige en
 * vez de duplicar. El historial sí se rehace entero cada vez —se borran los
 * asientos de las reservas que se vuelven a importar—, porque no hay forma de
 * saber si un asiento del volcado es el mismo que uno ya escrito.
 */

// El primero de la lista, y tiene que seguir siéndolo: presta a Node el
// WebSocket que supabase-js exige y que la versión 20 no trae. Ver el archivo.
import './websocketDeNode.mjs';

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const archivo = process.argv.find((a) => a.endsWith('.json'));
const deVerdad = process.argv.includes('--de-verdad');

if (!archivo) {
  console.error('Uso: node supabase/importar.mjs <volcado.json> [--de-verdad]');
  process.exit(1);
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const volcado = JSON.parse(fs.readFileSync(archivo, 'utf8'));
const problemas = [];

/* ── Comprobaciones antes de escribir ────────────────────────────────────
 *
 * Se revisa TODO primero y se escribe después. Un volcado a medio importar es
 * peor que uno sin importar: no se sabe por dónde iba y volver a lanzarlo
 * puede tropezar con lo que ya entró.
 */

const FORMATO_ID = /^(\d{2})-(\d{6})-(\d{3,})$/;
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

const cafeterias = volcado.cafeterias ?? [];
const cartas = volcado.menuSemanal ?? [];
const reservas = volcado.reservas ?? [];

const idsCafeteria = new Set(cafeterias.map((c) => c.id));

for (const c of cafeterias) {
  if (!/^\d{2,}$/.test(String(c.codigo ?? ''))) {
    problemas.push(`Cafetería «${c.id}»: el código «${c.codigo}» no son dos dígitos.`);
  }
}

for (const r of reservas) {
  if (!idsCafeteria.has(r.cafeteria_id)) {
    problemas.push(`Reserva ${r.id}: apunta a la cafetería «${r.cafeteria_id}», que no está en el volcado.`);
  }
  if (!ES_FECHA.test(String(r.fecha))) {
    problemas.push(`Reserva ${r.id}: la fecha «${r.fecha}» no es AAAA-MM-DD.`);
  }
}

/**
 * Dos reservas con el MISMO identificador.
 *
 * `reserva.id` es la clave primaria, así que Postgres rechazaría la segunda.
 * Que pueda pasar no es teórico: la hoja no tenía clave primaria, y
 * `migrarAIdentificadorNuevo()` —la función que convirtió los identificadores
 * viejos al formato nuevo— pudo asignar a una reserva la fecha equivocada y
 * dejarla pisando a otra.
 *
 * Se avisa aquí, con los dos casos delante, porque el error de Postgres solo
 * nombraría el identificador y habría que ir a buscar a mano cuál era la otra.
 */
const porId = new Map();
for (const r of reservas) {
  if (!porId.has(r.id)) porId.set(r.id, []);
  porId.get(r.id).push(r);
}
for (const [id, grupo] of porId) {
  if (grupo.length < 2) continue;
  problemas.push(
    `Identificador repetido: ${grupo.length} reservas comparten «${id}» ` +
    `(fechas ${grupo.map((r) => r.fecha).join(' y ')}). ` +
    'La clave primaria no lo admite: corrige el de una de ellas en la hoja.',
  );
}

/**
 * El identificador dice una fecha y la fila dice otra.
 *
 * No rompe nada por sí solo —el identificador es una cadena y la fecha es una
 * columna aparte—, pero es la señal de que algo asignó mal ese identificador,
 * y de ahí salen los repetidos de arriba. Además vuelve inútil lo que hace
 * legible al identificador: si «02-260823-001» no es del 23 de agosto, deja de
 * poder dictarse por teléfono y buscarse.
 *
 * Se avisa sin bloquear: el histórico es el que es, y a estas alturas cambiar
 * un identificador que ya se imprimió en un ticket tiene su propio coste.
 */
const incoherentes = [];
for (const r of reservas) {
  const m = FORMATO_ID.exec(String(r.id));
  if (!m) continue;
  const delId = `20${m[2].slice(0, 2)}-${m[2].slice(2, 4)}-${m[2].slice(4, 6)}`;
  if (delId !== String(r.fecha)) incoherentes.push({ id: r.id, fila: r.fecha, delId });
}

/**
 * El índice `reserva_sin_duplicado` no admite dos reservas ACTIVAS del mismo
 * móvil el mismo día y sede. Apps Script aplicaba la regla, pero la hoja se
 * editaba a veces a mano, así que puede haber parejas que la incumplan. Si las
 * hay, hay que resolverlas ANTES: Postgres rechazaría la segunda con un error
 * que no dice cuál era la primera.
 */
const vistos = new Map();
for (const r of reservas) {
  if (r.estado === 'cancelada') continue;
  const clave = `${r.cafeteria_id}|${r.fecha}|${r.telefono}`;
  if (vistos.has(clave)) {
    problemas.push(
      `Duplicado activo: ${vistos.get(clave)} y ${r.id} comparten móvil ${r.telefono} ` +
      `el ${r.fecha} en ${r.cafeteria_id}. Cancela una de las dos en la hoja antes de importar.`,
    );
  } else {
    vistos.set(clave, r.id);
  }
}

if (incoherentes.length) {
  console.log(`
Aviso · ${incoherentes.length} identificador(es) con una fecha que no es la de su fila:`);
  for (const i of incoherentes) {
    console.log(`  · ${i.id} — la fila dice ${i.fila}, el identificador dice ${i.delId}`);
  }
  console.log('  No impide importar. Se conserva el identificador tal cual: puede estar impreso en un ticket.');
}

if (problemas.length) {
  console.error(`\n${problemas.length} problema(s) en el volcado:\n`);
  problemas.forEach((p) => console.error('  · ' + p));
  console.error('\nNo se escribió nada.');
  process.exit(1);
}

/* ── Consecutivos ────────────────────────────────────────────────────────
 *
 * El consecutivo sale del identificador cuando este tiene el formato nuevo.
 * Los identificadores antiguos no lo llevan, así que se les asigna uno
 * detrás del mayor de su día y sede: el `id` original se conserva tal cual
 * —es la clave primaria y hay tickets impresos con él—, y el consecutivo solo
 * sirve para que `max(consecutivo) + 1` no vuelva a repartir un número usado.
 */
const porGrupo = new Map();
for (const r of reservas) {
  const grupo = `${r.cafeteria_id}|${r.fecha}`;
  if (!porGrupo.has(grupo)) porGrupo.set(grupo, []);
  porGrupo.get(grupo).push(r);
}

const consecutivoDe = new Map();
let antiguos = 0;

for (const [, grupo] of porGrupo) {
  let mayor = 0;
  const sinFormato = [];

  for (const r of grupo) {
    const m = FORMATO_ID.exec(String(r.id));
    if (m) {
      const n = Number(m[3]);
      consecutivoDe.set(r.id, n);
      mayor = Math.max(mayor, n);
    } else {
      sinFormato.push(r);
    }
  }

  for (const r of sinFormato) {
    mayor += 1;
    consecutivoDe.set(r.id, mayor);
    antiguos += 1;
  }
}

/* ── Resumen ─────────────────────────────────────────────────────────── */

const asientos = reservas.reduce((n, r) => n + (r.historial?.length ?? 0), 0);
const opciones = cartas.reduce((n, c) => n + (c.opciones?.length ?? 0), 0);

console.log('\nVolcado revisado, sin problemas:');
console.log(`  ${cafeterias.length} cafeterías`);
console.log(`  ${cartas.length} cartas · ${opciones} platos`);
console.log(`  ${reservas.length} reservas · ${asientos} asientos de historial`);
if (antiguos) console.log(`  ${antiguos} con identificador del formato antiguo (se conserva)`);

if (!deVerdad) {
  console.log('\nEnsayo. Añade --de-verdad para escribir en Supabase.\n');
  process.exit(0);
}

/* ── Escritura ───────────────────────────────────────────────────────── */

/** Corta en trozos: PostgREST no traga diez mil filas de una. */
function* enLotes(lista, tamano = 500) {
  for (let i = 0; i < lista.length; i += tamano) yield lista.slice(i, i + tamano);
}

async function escribir(tabla, filas, opciones = {}) {
  for (const lote of enLotes(filas)) {
    const { error } = await db.from(tabla).upsert(lote, opciones);
    if (error) {
      console.error(`\nFalló al escribir en ${tabla}: ${error.message}`);
      if (error.details) console.error(error.details);
      process.exit(1);
    }
  }
  console.log(`  ${tabla}: ${filas.length} filas`);
}

console.log('\nEscribiendo…');

await escribir('cafeteria', cafeterias.map((c) => ({
  id: c.id,
  codigo: String(c.codigo),
  nombre: c.nombre,
  ubicacion: c.ubicacion ?? '',
  imagen: c.imagen ?? '',
  // 'FALSE' es una cadena y por tanto *truthy*: sin este !== false, una
  // cafetería cerrada volvería a aparecer abierta.
  activa: c.activa !== false,
  platos_fijos: Array.isArray(c.platos_fijos) ? c.platos_fijos : [],
})));

await escribir('carta_opcion', cartas.flatMap((c) =>
  (c.opciones ?? []).map((o, i) => ({
    fecha: c.fecha, id: o.id, nombre: o.nombre, orden: i,
  }))));

await escribir('reserva', reservas.map((r) => ({
  id: r.id,
  consecutivo: consecutivoDe.get(r.id),
  nombre: r.nombre,
  // Siempre cadena. Como número habría perdido el cero inicial en la hoja.
  telefono: String(r.telefono),
  cafeteria_id: r.cafeteria_id,
  fecha: r.fecha,
  menu_id: r.menu_id,
  menu_nombre: r.menu_nombre,
  // Las anteriores al 24 de agosto de 2026 no traen estos campos. Van como
  // NULL y no como '': el CHECK del esquema no admite la cadena vacía, y NULL
  // es además lo que significan —«no se registró»—, mientras que '' sugeriría
  // que alguien eligió algo.
  medio: r.medio || null,
  pago: r.pago || null,
  estado: r.estado ?? 'activa',
  creada_en: r.timestamp,
})));

/**
 * El historial se rehace entero. Se borra primero porque los asientos no
 * tienen una clave estable con la que reconocerlos —su id es un BIGSERIAL que
 * asigna Postgres—, así que un upsert los duplicaría en cada pasada.
 */
console.log('  reserva_asiento: rehaciendo el historial…');
for (const lote of enLotes(reservas.map((r) => r.id), 200)) {
  const { error } = await db.from('reserva_asiento').delete().in('reserva_id', lote);
  if (error) {
    console.error(`\nFalló al limpiar el historial: ${error.message}`);
    process.exit(1);
  }
}

let escritos = 0;
for (const r of reservas) {
  for (const asiento of r.historial ?? []) {
    const { data, error } = await db.from('reserva_asiento').insert({
      reserva_id: r.id,
      tipo: asiento.tipo,
      ocurrido_en: asiento.timestamp,
      // Sin autor: estos asientos se escribieron cuando no había identidad de
      // usuario, y no hay a quién atribuirlos. Inventar uno sería peor que
      // dejarlo vacío.
      autor: null,
    }).select('id').single();

    if (error) {
      console.error(`\nFalló un asiento de ${r.id}: ${error.message}`);
      process.exit(1);
    }

    const cambios = (asiento.cambios ?? []).map((c, i) => ({
      asiento_id: data.id, campo: c.campo, antes: c.antes, despues: c.despues, orden: i,
    }));
    if (cambios.length) {
      const { error: fallo } = await db.from('reserva_cambio').insert(cambios);
      if (fallo) {
        console.error(`\nFallaron los cambios de un asiento de ${r.id}: ${fallo.message}`);
        process.exit(1);
      }
    }
    escritos += 1;
  }
}
console.log(`  reserva_asiento: ${escritos} asientos`);

console.log('\nImportado.\n');
console.log('Siguiente paso: crear las cuentas y sus filas en `perfil`.');
console.log('Sin una fila en `perfil`, una cuenta válida no puede hacer nada.\n');
