/**
 * Los permisos, contra un backend en marcha.
 *
 *   npm run backend-local     (en otra ventana)
 *   npm run permisos
 *   npm run permisos -- https://TU-APP.vercel.app/api
 *
 * NO entra en Unknown command: "test"


Did you mean this?
  npm test # Test a package
To see a list of supported npm commands, run:
  npm help: aquella suite corre sin red y sin credenciales, y
 * esta necesita las dos. Crea una cuenta de mostrador desechable, la usa y la
 * borra al terminar; no toca ninguna cuenta real.
 *
 * La capa que el contrato NO prueba: quien puede hacer que.
 *
 * `pruebas/contrato.mjs` corre entero con un token de admin, asi que verifica
 * las reglas de negocio y ni una sola de autorizacion. Y la autorizacion es lo
 * que esta migracion vino a arreglar: antes, quien tuviera la URL del backend
 * leia y escribia todo el campus.
 *
 * Se comprueban tres cosas distintas:
 *   1. Sin sesion no se hace nada.
 *   2. Un mostrador no puede lo que es de administracion.
 *   3. Un mostrador no ve ni toca otra sede, AUNQUE LO PIDA explicitamente.
 *      Esta es la importante: el cliente manda `cafeteria_id` en cada
 *      peticion, y creerselo seria dejar que el navegador decida un permiso.
 */

import '../supabase/websocketDeNode.mjs';
import { createClient } from '@supabase/supabase-js';

const URL = process.argv[2] ?? 'http://localhost:3001';
const CORREO = 'mostrador-temporal@reservas.local';
const CLAVE = 'mostrador-' + 'temporal-2026-!aB';
const SEDE = 'camilo-torres';
const OTRA_SEDE = 'bienestar-pro';

const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let fallos = 0;
let n = 0;
const ok = (c, t) => { n++; console.log(`  ${c ? 'OK   ' : 'FALLO'} · ${t}`); if (!c) fallos++; };
const titulo = (t) => console.log(`\n── ${t} ──`);

async function pedir(accion, params, token) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ accion, params }),
  });
  return r.json();
}

/* ── 1 · Sin sesion ──────────────────────────────────────────────────── */

titulo('Sin sesion: lo publico se sirve');
/*
 * `app.contexto` es lo UNICO publico. Ver ACCIONES_PUBLICAS en sesion.ts.
 *
 * Aqui habia tres comprobaciones sobre `cafeterias.listar` sin sesion, de
 * cuando `/reservas` era la portada y enseñaba las sedes del campus antes de
 * entrar. Dejo de serlo al pasar la portada a la lista de MODULOS, que no
 * enseña ninguna sede, y desde entonces esta suite se caia en la tercera
 * linea —leia `.length` de un `data` que ya no venia— y no llegaba a correr
 * NI UNA de las pruebas de permisos, que son su motivo de existir.
 *
 * Lo que comprobaban no se pierde: `cafeterias.listar` pasa a la lista de
 * cerradas de abajo, y lo de `incluir_inactivas` baja a la seccion del
 * mostrador, que es donde ahora se puede pedir.
 */
const ctxAnonimo = await pedir('app.contexto', {}, null);
ok(ctxAnonimo.ok === true, 'app.contexto se sirve sin sesion');
ok(ctxAnonimo.data?.perfil === null, `y el perfil viene vacio → ${JSON.stringify(ctxAnonimo.data?.perfil)}`);
ok(/^\d{4}-\d{2}-\d{2}$/.test(ctxAnonimo.data?.hoy ?? ''),
   `con la fecha del servidor → ${ctxAnonimo.data?.hoy}`);

titulo('Sin sesion: lo demas, cerrado');
for (const accion of ['reservas.buscar', 'reservas.crear', 'reservas.delDia',
                      'reservas.cancelar', 'menu.semana', 'cafeterias.crear',
                      // Desde que la portada son los MODULOS, esta tambien:
                      // a quien le compra Bienestar y donde tiene sedes ya no
                      // se cuenta antes de entrar.
                      'cafeterias.listar']) {
  const s = await pedir(accion, {}, null);
  ok(s.ok === false && s.error.codigo === 'NO_AUTENTICADO',
     `${accion} → ${s.ok ? 'DEJO PASAR' : s.error.codigo}`);
}

const basura = await pedir('reservas.buscar', {}, 'esto-no-es-un-token');
ok(basura.ok === false && basura.error.codigo === 'NO_AUTENTICADO',
   `un token inventado → ${basura.ok ? 'DEJO PASAR' : basura.error.codigo}`);

/* ── Cuenta de mostrador desechable ──────────────────────────────────── */

const { data: lista } = await admin.auth.admin.listUsers();
let usuario = lista.users.find((u) => u.email === CORREO);
if (!usuario) {
  const { data, error } = await admin.auth.admin.createUser({
    email: CORREO, password: CLAVE, email_confirm: true,
  });
  if (error) { console.error('No se pudo crear el mostrador:', error.message); process.exit(1); }
  usuario = data.user;
}
await admin.from('perfil').upsert({
  usuario_id: usuario.id, nombre: 'Mostrador (temporal)', rol: 'mostrador', cafeteria_id: SEDE,
});

const publico = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const { data: sesion } = await publico.auth.signInWithPassword({ email: CORREO, password: CLAVE });
const token = sesion.session.access_token;

/* ── 2 · Una cuenta sin perfil ───────────────────────────────────────── */

titulo('Una cuenta valida SIN perfil tampoco pasa');
await admin.from('perfil').delete().eq('usuario_id', usuario.id);
const sinPerfil = await pedir('reservas.delDia', {}, token);
ok(sinPerfil.ok === false && sinPerfil.error.codigo === 'NO_AUTORIZADO',
   `token bueno, sin fila en perfil → ${sinPerfil.ok ? 'DEJO PASAR' : sinPerfil.error.codigo}`);
// Y NO_AUTENTICADO seria peor que un error: mandaria a identificarse otra vez
// a quien ya lo hizo con credenciales buenas, en un bucle sin salida.
ok(sinPerfil.error?.codigo !== 'NO_AUTENTICADO',
   'y no se confunde con «no hay sesion», que la hay');
// Se le devuelve el perfil para el resto de las pruebas.
await admin.from('perfil').upsert({
  usuario_id: usuario.id, nombre: 'Mostrador (temporal)', rol: 'mostrador', cafeteria_id: SEDE,
});

/* ── 3 · Lo que el mostrador SI puede ────────────────────────────────── */

titulo('Lo que el mostrador si puede');
const ctx = await pedir('app.contexto', {}, token);
ok(ctx.ok === true, 'app.contexto');
ok(ctx.data?.perfil?.rol === 'mostrador', `su rol → ${ctx.data?.perfil?.rol}`);
ok(ctx.data?.perfil?.cafeteria_id === SEDE, `su sede → ${ctx.data?.perfil?.cafeteria_id}`);
ok(/^\d{4}-\d{2}-\d{2}$/.test(ctx.data?.hoy ?? ''), `la fecha la pone el servidor → ${ctx.data?.hoy}`);

for (const [accion, params] of [
  ['cafeterias.listar', {}],
  ['menu.delDia', { fecha: ctx.data.hoy, cafeteria_id: SEDE }],
  ['reservas.delDia', { cafeteria_id: SEDE, fecha: ctx.data.hoy }],
]) {
  const s = await pedir(accion, params, token);
  ok(s.ok === true, `${accion} → ${s.ok ? 'ok' : s.error.codigo}`);
}

/*
 * Una sede archivada es informacion de administracion, y fiarse del parametro
 * habria bastado para sacarla. Se pide con el token del mostrador porque sin
 * sesion ya no se puede pedir nada de esto.
 */
const activas = await pedir('cafeterias.listar', {}, token);
ok(Array.isArray(activas.data) && activas.data.every((c) => c.activa),
   `cafeterias.listar da SOLO las activas (${(activas.data ?? []).length})`);

const conInactivas = await pedir('cafeterias.listar', { incluir_inactivas: true }, token);
ok(conInactivas.ok === true && conInactivas.data?.length === activas.data?.length,
   `y incluir_inactivas se IGNORA para el mostrador `
   + `(${conInactivas.data?.length} = ${activas.data?.length})`);

/* ── 4 · Lo que NO puede ─────────────────────────────────────────────── */

titulo('Lo que el mostrador NO puede: es administracion');
// `pedidos.eliminar` borra la fila de verdad, con sus lineas y su historial.
// El mostrador anula —eso si puede, y deja rastro— pero no borra: si esta
// linea deja de fallar, un mostrador puede hacer desaparecer un pedido del
// historico sin que quede constancia de que existio.
for (const accion of ['reservas.cancelar', 'reservas.buscar', 'menu.semana',
                      'menu.guardarSemana', 'cafeterias.crear', 'cafeterias.archivar',
                      'cafeterias.actualizar', 'cafeterias.reactivar',
                      'pedidos.eliminar']) {
  const s = await pedir(accion, {}, token);
  ok(s.ok === false && s.error.codigo === 'NO_AUTORIZADO',
     `${accion} → ${s.ok ? 'DEJO PASAR' : s.error.codigo}`);
}

/* ── 5 · La sede la impone el servidor ───────────────────────────────── */

titulo('La sede la impone el servidor, no el cliente');

/**
 * Se elige a proposito un dia en el que SU sede tenga reservas.
 *
 * Con un dia vacio, «todas las filas son de su sede» se cumple sin que el
 * servidor haya hecho nada: cero filas satisfacen cualquier cosa. Una prueba
 * que pasa en vacio no prueba nada, y esta es justo la que no puede fallar.
 */
const { data: candidatos } = await admin.from('reserva')
  .select('fecha').eq('cafeteria_id', SEDE).eq('estado', 'activa');
const conteo = {};
for (const c of candidatos) conteo[c.fecha] = (conteo[c.fecha] ?? 0) + 1;
const DIA = Object.keys(conteo).sort((a, b) => conteo[b] - conteo[a])[0];

const { count: propias } = await admin.from('reserva')
  .select('*', { count: 'exact', head: true })
  .eq('cafeteria_id', SEDE).eq('fecha', DIA).eq('estado', 'activa');

const otra = await pedir('reservas.delDia', { cafeteria_id: OTRA_SEDE, fecha: DIA }, token);
const sedes = [...new Set((otra.data ?? []).map((r) => r.cafeteria_id))];

ok(otra.ok === true, `pide ${OTRA_SEDE} el ${DIA} y no da error…`);
ok(propias > 0, `(su sede tiene ${propias} reservas ese dia, asi que la prueba no pasa en vacio)`);
ok((otra.data?.length ?? 0) === propias,
   `…y le devuelve ${otra.data?.length} filas, las mismas que tiene SU sede`);
ok(sedes.length === 1 && sedes[0] === SEDE,
   `todas de ${SEDE}, ninguna de ${OTRA_SEDE} → ${sedes.join(', ')}`);

// Editar una reserva de otra sede: aqui no basta con filtrar, hay que negar.
const { data: ajena } = await admin.from('reserva')
  .select('id, nombre, telefono, menu_id, medio, pago')
  .neq('cafeteria_id', SEDE).eq('estado', 'activa').limit(1).single();

const intento = await pedir('reservas.actualizar', {
  id: ajena.id, nombre: ajena.nombre, telefono: ajena.telefono,
  menu_id: ajena.menu_id, medio: 'presencial', pago: 'pagado',
}, token);
ok(intento.ok === false && intento.error.codigo === 'NO_AUTORIZADO',
   `editar una reserva de otra sede → ${intento.ok ? 'LA EDITO' : intento.error.codigo}`);

/* ── Limpieza ────────────────────────────────────────────────────────── */

await admin.from('perfil').delete().eq('usuario_id', usuario.id);
await admin.auth.admin.deleteUser(usuario.id);

console.log(`\n${'─'.repeat(60)}`);
console.log(fallos === 0
  ? `✔ ${n} comprobaciones · los permisos los impone el servidor\n`
  : `✘ ${fallos} de ${n} fallaron\n`);
process.exit(fallos === 0 ? 0 : 1);
