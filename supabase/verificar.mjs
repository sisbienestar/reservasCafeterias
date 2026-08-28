/**
 * Comprueba que lo importado tiene la forma que exige CONTRATO.md §2.
 *
 *   npm run verificar
 *
 * No basta con que las filas esten. El contrato tiene una tabla entera de
 * «tipos que el frontend da por sentados» —telefono como cadena, activa como
 * booleano, fecha como 'AAAA-MM-DD', historial como arreglo— y cada uno de
 * ellos rompio la pantalla al menos una vez. Esto los mira uno a uno, sobre
 * los datos de verdad.
 *
 * Es lo mas parecido a `pruebas/contrato.mjs` que se puede hacer sin
 * autenticacion: interroga a Postgres directamente, sin pasar por la API. No
 * la sustituye —no comprueba ni sesion, ni permisos, ni codigos de error—,
 * pero se puede lanzar en cuanto termina la importacion, antes de que exista
 * ninguna cuenta.
 *
 * SOLO LEE. No escribe nada y no enseña nombres ni moviles.
 */

import './websocketDeNode.mjs';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  console.error('Usa `npm run verificar`, que carga .env.local.');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let fallos = 0;
let comprobaciones = 0;
const ok = (cond, etiqueta) => {
  comprobaciones++;
  console.log(`  ${cond ? 'OK   ' : 'FALLO'} · ${etiqueta}`);
  if (!cond) fallos++;
};
const titulo = (t) => console.log(`\n── ${t} ──`);

/* ── Que hay ─────────────────────────────────────────────────────────── */

titulo('Filas por tabla');
const cuentas = {};
for (const t of ['cafeteria', 'carta_opcion', 'reserva', 'reserva_asiento', 'reserva_cambio']) {
  const { count, error } = await db.from(t).select('*', { count: 'exact', head: true });
  if (error) { ok(false, `${t}: ${error.message}`); continue; }
  cuentas[t] = count;
  ok(count > 0 || t === 'reserva_cambio', `${t}: ${count} filas`);
}

/* ── Cafeterias ──────────────────────────────────────────────────────── */

titulo('cafeteria · los tipos que rompen la pantalla');
const { data: cafes } = await db.from('cafeteria')
  .select('id, codigo, nombre, activa, platos_fijos').order('codigo');

// 'FALSE' es una cadena y por tanto *truthy*: como texto, una cafeteria
// cerrada apareceria abierta en el inicio.
ok(cafes.every((c) => typeof c.activa === 'boolean'), 'activa es BOOLEANO, no texto');
ok(cafes.every((c) => Array.isArray(c.platos_fijos)), 'platos_fijos es ARREGLO, no texto JSON');
// Como numero, el 01 vuelve como 1 y el identificador saldria «1-260823-001».
ok(cafes.every((c) => /^\d{2}$/.test(c.codigo)), 'codigo son dos digitos, como texto');
ok(new Set(cafes.map((c) => c.codigo)).size === cafes.length, 'ningun codigo repetido');

/* ── La forma de una reserva ─────────────────────────────────────────── */

titulo('reservas_del_dia · la forma del contrato');
const { data: cualquiera } = await db.from('reserva')
  .select('cafeteria_id, fecha').eq('estado', 'activa').limit(1).single();

const { data: delDia, error: errDia } = await db.rpc('reservas_del_dia', {
  p_cafeteria_id: cualquiera.cafeteria_id,
  p_fecha: cualquiera.fecha,
});

if (errDia) {
  ok(false, `reventó: ${errDia.message}`);
} else {
  const r = delDia[0];
  ok(Array.isArray(delDia) && delDia.length > 0, `devuelve ${delDia.length} reserva(s)`);
  ok(typeof r?.telefono === 'string', 'telefono es CADENA');
  ok(/^\d{4}-\d{2}-\d{2}$/.test(r?.fecha ?? ''), `fecha es 'AAAA-MM-DD' → «${r?.fecha}»`);
  // Las pantallas ordenan comparando esta cadena como texto: dos formatos
  // conviviendo desordenarian las reservas del dia.
  ok(/Z$/.test(r?.timestamp ?? ''), `timestamp es ISO con Z → «${r?.timestamp}»`);
  ok(Array.isArray(r?.historial), 'historial es ARREGLO, no texto JSON');
  ok(r?.historial?.[0]?.tipo === 'creacion', 'toda reserva nace con su asiento de creacion');
  ok(Array.isArray(r?.historial?.[0]?.cambios), 'cambios es arreglo');
  ok(typeof r?.medio === 'string' && typeof r?.pago === 'string',
     'medio y pago son cadena, nunca null');
  // `consecutivo` y `creada_en` son de la base de datos, no del contrato.
  ok(r && !('consecutivo' in r) && !('creada_en' in r), 'no se escapan columnas internas');
  ok(delDia.every((x) => x.estado === 'activa'), 'SOLO reservas activas');
}

/* ── La busqueda del administrador ───────────────────────────────────── */

const { data: rango } = await db.from('reserva').select('fecha').order('fecha');
const desde = rango[0].fecha;
const hasta = rango[rango.length - 1].fecha;

titulo(`buscar_reservas · ${desde} a ${hasta}`);
const filtro = {
  p_desde: desde, p_hasta: hasta, p_cafeteria_id: null,
  p_estado: null, p_texto: null, p_digitos: '',
};

const { data: b, error: errB } = await db.rpc('buscar_reservas', { ...filtro, p_limite: 500 });
if (errB) {
  ok(false, `reventó: ${errB.message}`);
} else {
  const t = b.resumen.totales;
  ok(b.total === cuentas.reserva, `total = ${b.total}, todas las de la tabla`);
  ok(t.total === t.activas + t.canceladas, 'activas + canceladas suman el total');

  // Un hueco es informacion: omitirlo juntaria dos fechas lejanas en la
  // grafica como si fueran consecutivas.
  const diasDelRango =
    Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000) + 1;
  ok(b.resumen.por_dia.length === diasDelRango,
     `por_dia trae los ${diasDelRango} dias, tambien los vacios`);

  const sumaDias = b.resumen.por_dia.reduce((n, d) => n + d.activas + d.canceladas, 0);
  ok(sumaDias === b.total, `por_dia suma ${sumaDias} y cuadra con el total`);

  // Un consolidado de consumo que sume las canceladas manda a cocinar de mas.
  const sumaPlatos = b.resumen.por_plato.reduce((n, p) => n + Number(p.total), 0);
  ok(sumaPlatos === t.activas, `por_plato suma ${sumaPlatos} = solo las activas`);

  ok(b.resumen.por_cafeteria.every((c) => c.nombre && c.nombre !== c.cafeteria_id),
     'por_cafeteria trae el NOMBRE, no solo el id');
}

titulo('buscar_reservas · el limite recorta el detalle, nunca los totales');
const { data: corta } = await db.rpc('buscar_reservas', { ...filtro, p_limite: 3 });
ok(corta.reservas.length === Math.min(3, cuentas.reserva), `detalle recortado a ${corta.reservas.length}`);
// Si el limite recortara el total, la pantalla diria «1.240 reservas» encima
// de una tabla de 500 que no suma eso.
ok(corta.total === cuentas.reserva, `total intacto: ${corta.total}`);
ok(corta.resumen.totales.total === cuentas.reserva, 'resumen intacto');

const { data: todas } = await db.rpc('buscar_reservas', { ...filtro, p_limite: 0 });
ok(todas.reservas.length === cuentas.reserva,
   `limite 0 devuelve las ${todas.reservas.length}, que es lo que pide la exportacion a CSV`);

/* ── Buscar sin tildes ───────────────────────────────────────────────── */

titulo('unaccent_simple · quien busca escribe deprisa y sin acentos');
const { data: plano } = await db.rpc('unaccent_simple', { t: 'ÁRDILA Ñuño' });
ok(plano === 'ardila nuno', `«ÁRDILA Ñuño» → «${plano}»`);

/* ── Veredicto ───────────────────────────────────────────────────────── */

console.log(`\n${'─'.repeat(60)}`);
console.log(fallos === 0
  ? `✔ ${comprobaciones} comprobaciones · los datos tienen la forma que espera el frontend\n`
  : `✘ ${fallos} de ${comprobaciones} fallaron\n`);
process.exit(fallos === 0 ? 0 : 1);
