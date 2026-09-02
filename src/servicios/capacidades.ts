/**
 * Qué puede hacer cada rol, para decidir QUÉ PINTAR.
 *
 * ── Esto NO es la cerradura ──────────────────────────────────────────────
 *
 * La cerradura es `PERMISOS` en `api/_nucleo/sesion.ts`, que el servidor
 * vuelve a comprobar en cada petición. Esto es su reflejo, y existe para no
 * ofrecer puertas que van a responder que no: un botón que siempre falla es
 * peor que un botón que no está. Falsear el rol en las herramientas de
 * desarrollo enseña los botones y todos devuelven NO_AUTORIZADO.
 *
 * ── Por qué una tabla y no un `if` en cada pantalla ──────────────────────
 *
 * Porque estaban repartidos: `rol === 'admin'` en la portada del módulo, otro
 * en el formulario, `rol !== 'mostrador'` dos veces en el documento y una
 * función suelta en `pedidosServicio`. Con tres roles eso ya costaba
 * encontrarlos todos; con las funciones de auxiliar que van a venir, cada una
 * nueva habría que ir a buscarla a cinco archivos y alguno se quedaría atrás.
 *
 * Aquí, añadir una capacidad es una fila y una palabra en las listas de abajo.
 * Y se ve de un vistazo qué puede cada quien, que es la pregunta que se hace
 * al añadir un rol.
 *
 * Se copia deliberadamente la FORMA de `PERMISOS`: lista blanca por rol. Una
 * capacidad nueva que nadie dé de alta queda prohibida para todos, y eso se
 * nota el primer día; al revés, nacería abierta y no se notaría nunca.
 */

import type { Rol } from '../contexto/Sesion.js';

/**
 * Lo que se puede hacer, en el vocabulario del negocio y no en el de la API.
 *
 * No son acciones del enrutador: una capacidad puede necesitar varias —
 * «elaborar» son `pedidos.crear` y `proveedores.listar`— y lo que la pantalla
 * pregunta es si enseña el camino entero, no cada llamada.
 */
export type Capacidad =
  /** Empezar un pedido nuevo: la lista de proveedores y su formulario. */
  | 'elaborarPedidos'
  /** Tocar un pedido que ya salió de la cafetería. */
  | 'modificarEnviados'
  /** Dar por definitivo un pedido enviado. */
  | 'confirmarPedidos'
  /** Dejar sin efecto un pedido. El de uno mismo, recién creado. */
  | 'anularPedidos'
  /** Dejar sin efecto un pedido que ya se envió. */
  | 'anularEnviados'
  /**
   * Borrar un pedido de la base, con su historial dentro.
   *
   * NO es «anular con otro nombre». Anular deja el pedido en el listado
   * diciendo que se decidió que no valía; esto lo hace desaparecer, y es para
   * lo que nunca debió estar ahí —el pedido de prueba, el duplicado de un
   * doble clic—. Por eso es de administración y de nadie más.
   */
  | 'eliminarPedidos'
  /** El catálogo de proveedores y productos, y las cuentas del módulo. */
  | 'administrarCatalogo'
  /** Cerrar la caja de una sede en el control de salidas. */
  | 'registrarSalidas'
  /**
   * Ver el día completo del control de salidas, que es el impreso.
   *
   * Cruza las cinco cafeterías por definición —el control consiste en verlas
   * juntas— así que no es del mostrador, por lo mismo que `verAnalisis`.
   */
  | 'verDiaSalidas'
  /** El catálogo de productos del control de salidas. */
  | 'administrarSalidas'
  /** El análisis del histórico. Cruza sedes por definición. */
  | 'verAnalisis';

const CAPACIDADES: Record<Rol, readonly Capacidad[]> = {
  /* El mostrador elabora y confirma lo suyo, y ahí acaba: en cuanto el pedido
     sale de la cafetería puede haber papel circulando. */
  mostrador: ['elaborarPedidos', 'anularPedidos', 'registrarSalidas'],

  /* El auxiliar administrativo NO elabora: su encargo empieza cuando el pedido
     ya está enviado y el proveedor dice qué puede traer. Aquí es donde irán
     creciendo sus funciones. */
  auxiliar: ['modificarEnviados', 'confirmarPedidos', 'verDiaSalidas'],

  admin: [
    'elaborarPedidos',
    'modificarEnviados',
    'confirmarPedidos',
    'anularPedidos',
    'anularEnviados',
    'eliminarPedidos',
    'administrarCatalogo',
    'verAnalisis',
    'registrarSalidas',
    'verDiaSalidas',
    'administrarSalidas',
  ],
};

/** ¿Este rol puede hacer esto? Sin rol —sin sesión todavía— la respuesta es no. */
export function puede(rol: Rol | undefined, capacidad: Capacidad): boolean {
  return rol ? CAPACIDADES[rol].includes(capacidad) : false;
}
