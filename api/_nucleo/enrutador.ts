/**
 * El mapa de acciones, y el único sitio donde se decide qué sale por el cable.
 *
 * Está separado de `api/index.ts` a propósito: aquí no se sabe nada de
 * peticiones HTTP ni de Vercel. Eso permite que `pruebas/servidor.mjs` monte
 * el mismo enrutador sobre un servidor de Node corriente y que
 * `pruebas/contrato.mjs` lo interrogue sin desplegar nada — que es lo que en
 * el backend anterior hacía `pruebas/appsscript.mjs` con Codigo.gs.
 */

import { exito, fallo, ErrorNegocio, type Sobre } from './sobre.js';
import { traducirError } from './supabase.js';
import {
  ACCIONES_PUBLICAS, autorizar, identificarSiHay, type Sesion,
} from './sesion.js';

import * as cafeterias from './acciones/cafeterias.js';
import * as menu from './acciones/menu.js';
import * as reservas from './acciones/reservas.js';
import * as proveedores from './acciones/proveedores.js';
import * as pedidos from './acciones/pedidos.js';
import * as analisis from './acciones/analisis.js';
import * as salidas from './acciones/salidas.js';
import * as cuentas from './acciones/cuentas.js';
import * as usuarios from './acciones/usuarios.js';
import {
  ajuste, ajusteSiNo, modulos as listarModulos,
} from './acciones/aplicacion.js';
import * as aplicacion from './acciones/aplicacion.js';

/**
 * Los manejadores reciben `Sesion | null`.
 *
 * A los privados nunca les llega nula —el enrutador lo garantiza antes de
 * llamarlos— pero el tipo lo dice igualmente, para que una acción nueva no
 * dé por hecho lo contrario y se entere al añadirla a las públicas.
 */
type Manejador = (params: Record<string, unknown>, sesion: Sesion | null) => Promise<unknown>;

/**
 * La fecha de HOY según el servidor, en la zona de Colombia.
 *
 * El prototipo la sacaba del reloj del navegador. Funcionaba porque los
 * equipos del mostrador están en Bucaramanga, pero hacía que un portátil con
 * la hora mal puesta —o abierto desde otro huso— registrara reservas del día
 * equivocado sin avisar. Ahora la fecha de trabajo la dice el servidor.
 *
 * `en-CA` porque su formato de fecha corto ES 'AAAA-MM-DD'. Es un rodeo, pero
 * el directo —toISOString()— da la fecha en UTC, que en Colombia (UTC−5) va
 * un día por delante desde las siete de la tarde.
 */
function hoyEnColombia(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/**
 * Lo que la aplicación necesita saber nada más entrar.
 *
 * Es la acción número 15, y no estaba en el contrato de Apps Script porque
 * allí no podía estar: el frontend guardaba su propia copia de
 * `PERMITIR_FIN_DE_SEMANA` en `js/config.js` y había que acordarse de apagar
 * las dos. El README lo tenía anotado como problema. Con el backend en un
 * despliegue distinto del frontend, dos constantes gemelas se
 * desincronizarían todavía más fácil, así que la única de verdad es la del
 * servidor y la pantalla pregunta por ella.
 */
async function contexto(_params: Record<string, unknown>, sesion: Sesion | null) {
  /*
   * El interruptor y los textos salen de `ajuste`, no del entorno ni del
   * código. Antes `PERMITIR_FIN_DE_SEMANA` era una variable de Vercel y
   * cambiarla obligaba a redesplegar; el nombre y la versión eran constantes
   * dentro de `Cabecera.tsx`.
   *
   * Se piden a la vez que los módulos porque la portada necesita las dos cosas
   * para pintarse: son consultas dentro de la misma función, no viajes desde
   * el navegador, que es lo que cuesta caro.
   */
  const [finDeSemana, nombre, version, fechaVersion, modulos] = await Promise.all([
    ajusteSiNo('permitir_fin_de_semana'),
    ajuste('nombre_aplicacion', 'Servicios Cafeterías Bienestar UIS'),
    ajuste('version', ''),
    ajuste('fecha_version', ''),
    listarModulos(sesion),
  ]);

  return {
    hoy: hoyEnColombia(),
    permitir_fin_de_semana: finDeSemana,
    aplicacion: { nombre, version, fecha_version: fechaVersion },
    // Administración los ve todos, incluidos los apagados. Ver `aplicacion.ts`.
    modulos,
    // Sin sesión viene en null, y eso es información y no un hueco: es lo que
    // le dice a la pantalla que hay que ofrecer el acceso en vez de la
    // aplicación. Se sirve igualmente la fecha y el interruptor, que la
    // portada necesita y no son de nadie.
    perfil: sesion && {
      nombre: sesion.nombre,
      rol: sesion.rol,
      cafeteria_id: sesion.cafeteriaId,
      cafeteria_nombre: sesion.cafeteriaNombre,
    },
  };
}

/**
 * Envuelve un manejador que EXIGE sesión.
 *
 * El enrutador ya ha cortado antes de llegar aquí, así que esta comprobación
 * no debería saltar nunca. Se hace igual, y no con un `as Sesion`: un día
 * alguien añadirá una acción a `ACCIONES_PUBLICAS` sin mirar qué hace por
 * dentro, y la diferencia entre un fallo limpio y leer las reservas de todo
 * el campus sin sesión está exactamente aquí.
 */
const conSesion = (
  f: (p: Record<string, unknown>, s: Sesion) => Promise<unknown>,
): Manejador => (p, s) => {
  if (!s) {
    return Promise.reject(
      new ErrorNegocio('NO_AUTENTICADO', 'Hay que iniciar sesión para usar la aplicación.'),
    );
  }
  return f(p, s);
};

/** Las 54 acciones. Lo que no esté aquí es ACCION_DESCONOCIDA. */
const ACCIONES: Record<string, Manejador> = {
  'app.contexto': contexto,

  'cafeterias.listar': (p, s) => cafeterias.listar(p, s),
  'cafeterias.obtener': (p) => cafeterias.obtener(p),
  'cafeterias.crear': (p) => cafeterias.crear(p),
  'cafeterias.actualizar': (p) => cafeterias.actualizar(p),
  'cafeterias.archivar': (p) => cafeterias.archivar(p),
  'cafeterias.reactivar': (p) => cafeterias.reactivar(p),

  'menu.delDia': (p) => menu.delDia(p),
  'menu.semana': (p) => menu.semana(p),
  'menu.guardarSemana': (p) => menu.guardarSemana(p),

  'reservas.delDia': conSesion(reservas.delDia),
  'reservas.crear': conSesion(reservas.crear),
  'reservas.actualizar': conSesion(reservas.actualizar),
  'reservas.cancelar': conSesion(reservas.cancelar),
  'reservas.buscar': conSesion(reservas.buscar),

  // Módulo de pedidos. Ninguna es pública: ver ACCIONES_PUBLICAS en sesion.ts.
  'proveedores.listar': conSesion((p, s) => proveedores.listar(p, s)),
  'proveedores.obtener': conSesion((p) => proveedores.obtener(p)),
  'pedidos.crear': conSesion(pedidos.crear),
  'pedidos.obtener': conSesion((p) => pedidos.obtener(p)),
  'pedidos.buscar': conSesion(pedidos.buscar),
  'pedidos.actualizar': conSesion(pedidos.actualizar),
  'pedidos.enviar': conSesion(pedidos.enviar),
  // Cierra el pedido: queda como lo que el proveedor va a entregar.
  'pedidos.confirmar': conSesion(pedidos.confirmar),
  'pedidos.anular': conSesion(pedidos.anular),
  // Borrado de verdad, y solo `admin`: ver PERMISOS. No sustituye a `anular`
  // —lo normal es anular, que deja rastro— sino que limpia lo que nunca debió
  // estar en el histórico. Queda anotado en `registro`.
  'pedidos.eliminar': conSesion(pedidos.eliminar),

  // El panel del módulo. Todas son solo para `admin`: ver PERMISOS.
  'proveedores.crear': conSesion((p) => proveedores.crear(p)),
  'proveedores.actualizar': conSesion((p) => proveedores.actualizar(p)),
  'proveedores.archivar': conSesion((p) => proveedores.archivar(p)),
  'proveedores.reactivar': conSesion((p) => proveedores.reactivar(p)),

  'productos.listar': conSesion((p) => proveedores.listarProductos(p)),
  'productos.crear': conSesion((p) => proveedores.crearProductos(p)),
  'productos.actualizar': conSesion((p) => proveedores.actualizarProducto(p)),
  'productos.archivar': conSesion((p) => proveedores.archivarProducto(p)),
  'productos.reactivar': conSesion((p) => proveedores.reactivarProducto(p)),
  'productos.mover': conSesion((p) => proveedores.moverProducto(p)),

  /*
   * El análisis del histórico. Va con prefijo `pedidos.` a propósito: así
   * MODULO_DE ya lo cubre —apagar el módulo también apaga su análisis— sin
   * dar de alta un prefijo nuevo. Solo para `admin`: ver PERMISOS.
   */
  'pedidos.analisis': conSesion((p) => analisis.pedidos(p)),

  'cuentas.listar': conSesion(() => cuentas.listar()),

  // ── Módulo: control de salidas ────────────────────────────────────
  //
  // El cierre de caja. NO cruza con pedidos: son dos cosas distintas y la
  // palabra «salida» significa algo diferente en cada una. Ver
  // supabase/19-control-salidas.sql.
  'salidas.guardar': conSesion(salidas.guardar),
  'salidas.obtener': conSesion(salidas.obtener),
  'salidas.buscar': conSesion(salidas.buscar),
  // El día entero, cruzando sedes: alimenta el impreso. Solo `admin`, por lo
  // mismo que `pedidos.analisis`.
  'salidas.dia': conSesion((p) => salidas.dia(p)),
  'salidasProductos.listar': conSesion((p) => salidas.listarProductos(p)),
  'salidasProductos.crear': conSesion((p) => salidas.crearProducto(p)),
  'salidasProductos.actualizar': conSesion((p) => salidas.actualizarProducto(p)),
  'salidasProductos.archivar': conSesion((p) => salidas.archivarProducto(p)),
  'salidasProductos.reactivar': conSesion((p) => salidas.reactivarProducto(p)),

  // ── El administrador de la APLICACIÓN ─────────────────────────────
  'modulos.actualizar': conSesion(aplicacion.actualizarModulo),
  'ajustes.listar': conSesion(() => aplicacion.ajustes()),
  'ajustes.guardar': conSesion(aplicacion.guardarAjuste),
  'registro.listar': conSesion((p) => aplicacion.listarRegistro(p)),

  'usuarios.listar': conSesion(() => usuarios.listar()),
  'usuarios.crear': conSesion(usuarios.crear),
  'usuarios.actualizar': conSesion(usuarios.actualizar),
  'usuarios.contrasena': conSesion(usuarios.cambiarContrasena),
  'usuarios.eliminar': conSesion(usuarios.eliminar),
};

/**
 * De qué módulo es cada acción.
 *
 * Se mapea por PREFIJO y no acción por acción: así una acción nueva de un
 * módulo queda cubierta el día que se escribe, sin acordarse de darla de alta
 * en ningún sitio.
 *
 * Lo que NO está aquí queda siempre abierto, y es deliberado:
 *
 *   · `app.*` — la portada tiene que poder pintarse aunque no haya un solo
 *     módulo en servicio, aunque solo sea para decirlo.
 *   · `cafeterias.*` — las sedes del campus no son de reservas: pedidos las
 *     usa para saber quién pide. Atarlas a un módulo habría hecho que apagar
 *     reservas rompiera pedidos.
 *   · `usuarios.*`, `modulos.*`, `ajustes.*`, `registro.*`, `cuentas.*` — son
 *     la administración de la aplicación. Si apagar un módulo pudiera cerrar
 *     la puerta para volver a encenderlo, no habría vuelta atrás.
 */
const MODULO_DE: Record<string, string> = {
  reservas: 'reservas',
  menu: 'reservas',
  pedidos: 'pedidos',
  // Las dos del control de salidas. Dos prefijos y no uno porque el catálogo
  // se administra aparte, igual que `productos` en pedidos.
  salidas: 'salidas',
  salidasProductos: 'salidas',
  proveedores: 'pedidos',
  productos: 'pedidos',
};

/**
 * ¿Está cerrado el módulo de esta acción? Devuelve el motivo, o `null`.
 *
 * Solo consulta la base cuando la acción PERTENECE a un módulo, así que
 * `app.contexto` y la administración no pagan un viaje por esto.
 */
async function moduloCerrado(accion: string, sesion: Sesion | null): Promise<string | null> {
  if (sesion?.rol === 'admin') return null;

  const moduloId = MODULO_DE[accion.split('.')[0] ?? ''];
  if (!moduloId) return null;

  const activos = await listarModulos(sesion);
  const modulo = activos.find((m) => m.id === moduloId);

  // Ausente de la lista significa apagado: a quien no es admin solo se le
  // sirven los activos.
  if (!modulo) {
    return 'Ese módulo está fuera de servicio ahora mismo.';
  }
  return null;
}

/**
 * Ejecuta una acción y devuelve SIEMPRE el sobre, pase lo que pase.
 *
 * Que no se escape ninguna excepción es una regla del contrato, no una
 * cortesía: un error sin capturar saldría como la página de error de la
 * plataforma, el cliente recibiría HTML donde espera JSON y lo traduciría a
 * RESPUESTA_INVALIDA — un mensaje que no dice absolutamente nada de lo que
 * pasó.
 */
export async function manejar(
  accion: string,
  params: Record<string, unknown>,
  autorizacion: string | undefined | null,
): Promise<Sobre> {
  const manejador = ACCIONES[accion];
  if (!manejador) {
    return fallo('ACCION_DESCONOCIDA', `La API no reconoce la acción «${accion}».`);
  }

  try {
    /*
     * Se intenta identificar SIEMPRE, también en las acciones públicas: la
     * portada abierta con sesión no es lo mismo que abierta sin ella —una
     * enseña quién eres y por dónde salir—, y esa diferencia se decide aquí.
     *
     * Lo que cambia es qué pasa cuando no hay sesión: en una acción pública
     * se sigue como visitante; en el resto, se corta aquí mismo.
     */
    const publica = ACCIONES_PUBLICAS.has(accion);
    const sesion = await identificarSiHay(autorizacion);

    if (!sesion && !publica) {
      return fallo('NO_AUTENTICADO', 'Hay que iniciar sesión para usar la aplicación.');
    }
    if (sesion) autorizar(sesion, accion);

    /*
     * Y la puerta del módulo. Un módulo apagado no solo desaparece de la
     * portada: sus acciones dejan de responder.
     *
     * Sin esto, desactivarlo sería cosmético —bastaría con conocer la URL— y
     * eso es exactamente lo que dice la regla 3 que no vale. Administración
     * pasa igualmente, porque tiene que poder probar un módulo antes de
     * publicarlo.
     */
    const impedimento = await moduloCerrado(accion, sesion);
    if (impedimento) return fallo('MODULO_INACTIVO', impedimento);

    return exito(await manejador(params ?? {}, sesion));
  } catch (error) {
    if (error instanceof ErrorNegocio) {
      return fallo(error.codigo, error.message);
    }

    // Un error de Postgres que se escapó sin traducir en su acción: se
    // reconoce aquí antes de darlo por interno. Es la red de debajo de la red.
    const traducido = traducirError(error as { code?: string; message?: string });
    if (traducido) return fallo(traducido.codigo, traducido.message);

    // A partir de aquí es un fallo nuestro. El mensaje va al registro entero
    // y al cliente resumido: los detalles de un error interno pueden decir
    // más de la base de datos de lo que conviene contar por la puerta.
    console.error(`[${accion}]`, error);
    return fallo('ERROR_INTERNO', 'Ocurrió un error inesperado en el servidor.');
  }
}

export { ACCIONES };
