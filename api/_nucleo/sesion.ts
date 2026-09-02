/**
 * Quién llama y qué puede hacer.
 *
 * Esto es lo que sustituye al pestillo. En el prototipo, `admin.html`
 * comparaba un SHA-256 en el navegador y `reserva.html` no pedía nada: quien
 * tuviera la URL del backend leía y escribía todo el campus. Era, dicho por
 * el propio README, «la deuda más importante del proyecto».
 *
 * Ahora hay dos comprobaciones y son distintas:
 *
 *   AUTENTICAR  ¿de quién es este token? Lo responde Supabase.
 *   AUTORIZAR   ¿puede esta persona hacer esta acción? Lo responde la tabla
 *               de abajo, y para las reservas también la sede del perfil.
 *
 * La segunda es la que importa aquí. Que alguien tenga una cuenta válida no
 * dice nada sobre si puede cancelar reservas o ver el histórico de otra sede.
 */

import { publico, servicio, desempaquetar } from './supabase.js';
import { ErrorNegocio, romper } from './sobre.js';

/**
 * Los tres roles.
 *
 * `auxiliar` es «Auxiliar Administrativo Cafeterías», y existe por un paso del
 * proceso que antes no tenía dueño: lo que se pide no siempre es lo que el
 * proveedor puede traer, y alguien tiene que cuadrar el pedido con lo que va a
 * llegar de verdad. Ver `supabase/15-pedido-definitivo.sql`.
 *
 * Va SIN sede, como el administrador: el mismo camión reparte en varias, y un
 * auxiliar atado a una no podría modificar el pedido de las demás.
 */
export type Rol = 'mostrador' | 'auxiliar' | 'admin';

/** La fila de `perfil` tal como sale de Postgres, antes de pasar a camelCase. */
interface FilaPerfil {
  usuario_id: string;
  nombre: string | null;
  rol: string;
  cafeteria_id: string | null;
  /* El nombre de la sede, traído con la fila del perfil. Recurso incrustado
   * de PostgREST: un viaje, no dos. */
  cafeteria: { nombre: string } | null;
}

export interface Sesion {
  usuarioId: string;
  nombre: string;
  rol: Rol;
  /** La sede de quien atiende el mostrador. `null` en los administradores. */
  cafeteriaId: string | null;
  /**
   * El NOMBRE de esa sede. Vacío en quien no tiene ninguna.
   *
   * Lo necesita la cabecera, que enseña con qué cuenta se está trabajando en
   * todas las pantallas: «camilo-torres» ahí se lee como un error y no como
   * un dato. Antes lo pasaba cada página desde lo que tuviera cargado, y eso
   * hacía que en un pedido de otra sede la barra dijera la sede DEL PEDIDO
   * como si fuera la de la persona.
   */
  cafeteriaNombre: string;
}

/**
 * Qué puede hacer cada rol.
 *
 * Es una lista blanca a propósito: una acción nueva que nadie dé de alta aquí
 * queda prohibida para todos, y eso se nota el primer día. Al revés —una
 * lista negra— una acción nueva nacería abierta a todo el mundo y no se
 * notaría nunca.
 */
const PERMISOS: Record<Rol, readonly string[]> = {
  // El mostrador registra, corrige y consulta lo de SU sede. No cancela y no
  // ve el histórico: eso es administración, y es la misma división que ya
  // tenían reserva.html y admin.html, ahora impuesta por el servidor.
  mostrador: [
    'app.contexto',
    'cafeterias.listar',
    'cafeterias.obtener',
    'menu.delDia',
    'reservas.delDia',
    'reservas.crear',
    'reservas.actualizar',
    'proveedores.listar',
    'proveedores.obtener',
    'pedidos.crear',
    'pedidos.obtener',
    'pedidos.buscar',
    'pedidos.actualizar',
    'pedidos.enviar',
    'pedidos.anular',
    // Control de salidas: cierra la caja de SU sede y consulta lo suyo. No
    // tiene 'salidas.dia' —el impreso cruza las cinco cafeterías— ni el
    // catálogo de productos, que es administración.
    'salidas.guardar',
    'salidas.obtener',
    'salidas.buscar',
    'salidas.dias',
    'salidasProductos.listar',
  ],
  /*
   * El auxiliar vive en el módulo de pedidos y en ningún sitio más.
   *
   * Ve el historial de TODAS las sedes —el proveedor es común— y edita lo que
   * la matriz de `16-unificar-estados.sql` le deja: los creados y los
   * enviados, pero no uno ya confirmado, que es su propio punto de no retorno.
   * `pedidos.confirmar` es el gesto que lo cierra.
   *
   * NO tiene `pedidos.crear` ni `pedidos.enviar`: su encargo empieza cuando el
   * pedido ya salió de la cafetería. Tampoco `pedidos.anular` — dar de baja
   * algo que puede llevar papel firmado circulando es decisión de
   * administración, y para su trabajo no hace falta anular sino corregir
   * cantidades. Ni el análisis, que es una herramienta de decisión de compra.
   */
  auxiliar: [
    'app.contexto',
    'cafeterias.listar',
    'cafeterias.obtener',
    'proveedores.listar',
    'proveedores.obtener',
    'pedidos.obtener',
    'pedidos.buscar',
    'pedidos.actualizar',
    'pedidos.confirmar',
    // Del control de salidas solo LEE, y todas las sedes: no tiene sede
    // propia, así que no cierra ninguna caja. Ver el comentario de arriba.
    'salidas.obtener',
    'salidas.buscar',
    'salidas.dias',
    'salidas.dia',
    'salidasProductos.listar',
  ],
  admin: [
    'app.contexto',
    'cafeterias.listar',
    'cafeterias.obtener',
    'cafeterias.crear',
    'cafeterias.actualizar',
    'cafeterias.archivar',
    'cafeterias.reactivar',
    'menu.delDia',
    'menu.semana',
    'menu.guardarSemana',
    'reservas.delDia',
    'reservas.crear',
    'reservas.actualizar',
    'reservas.cancelar',
    'reservas.buscar',
    'proveedores.listar',
    'proveedores.obtener',
    'pedidos.crear',
    'pedidos.obtener',
    'pedidos.buscar',
    'pedidos.actualizar',
    'pedidos.enviar',
    'pedidos.confirmar',
    'pedidos.anular',
    // Borrar un pedido de la base, con su historial dentro. SOLO aquí, y no
    // por desconfianza del mostrador: anular es la respuesta de negocio y la
    // tienen los dos. Esto es la herramienta de limpieza para lo que nunca
    // debió estar en el histórico, y lo que se lleva por delante no vuelve.
    'pedidos.eliminar',
    // El análisis cruza las sedes por definición: compara lo que pide cada
    // una. Por eso no está en `mostrador`, que solo ve la suya.
    'pedidos.analisis',
    'proveedores.crear',
    'proveedores.actualizar',
    'proveedores.archivar',
    'proveedores.reactivar',
    'productos.listar',
    'productos.crear',
    'productos.actualizar',
    'productos.archivar',
    'productos.reactivar',
    'productos.mover',
    'cuentas.listar',
    'modulos.actualizar',
    'ajustes.listar',
    'ajustes.guardar',
    // Control de salidas, entero: cierra cualquier sede, ve el día completo
    // —que es el impreso— y administra el catálogo de productos.
    'salidas.guardar',
    'salidas.obtener',
    'salidas.buscar',
    'salidas.dias',
    'salidas.dia',
    'salidasProductos.listar',
    'salidasProductos.crear',
    'salidasProductos.actualizar',
    'salidasProductos.archivar',
    'salidasProductos.reactivar',
    'registro.listar',
    'usuarios.listar',
    'usuarios.crear',
    'usuarios.actualizar',
    'usuarios.contrasena',
    'usuarios.eliminar',
  ],
};

/**
 * Saca el token del encabezado `Authorization: Bearer …`.
 *
 * A diferencia del backend anterior, aquí SÍ hay un encabezado propio, así
 * que la petición deja de ser «simple» y dispara el preflight de CORS. No es
 * un problema como lo era en Apps Script: una función de Vercel sí sabe
 * responder a un OPTIONS, y `api/index.ts` lo hace.
 */
export function tokenDe(autorizacion: string | undefined | null): string {
  const bruto = String(autorizacion ?? '').trim();
  return /^Bearer\s+/i.test(bruto) ? bruto.replace(/^Bearer\s+/i, '').trim() : '';
}

/**
 * Las acciones que se pueden hacer SIN sesión.
 *
 * Son dos y ninguna toca datos de nadie:
 *
 *  · `app.contexto` — la fecha de trabajo y el interruptor de fin de semana.
 *    Sin sesión el `perfil` viene en `null`, y eso es justo lo que le dice a
 *    la pantalla que hay que ofrecer el acceso.
 *
 * Es UNA, y nada más entra aquí sin pensarlo dos veces.
 *
 * `cafeterias.listar` estuvo aquí mientras `/reservas` era pública. Salió al
 * dejar de serlo: ninguna pantalla sin sesión la necesita ya, y una acción
 * pública que nadie usa es una puerta abierta sin nadie que entre por ella.
 *
 * Con esto los dos módulos piden lo mismo: la puerta de la aplicación es la
 * lista de módulos, y a partir de ahí hay que entrar.
 */
export const ACCIONES_PUBLICAS = new Set(['app.contexto']);

/**
 * Como `identificar`, pero devuelve `null` en vez de fallar.
 *
 * Es para las acciones públicas: si la sesión caducó mientras alguien tenía
 * la portada abierta, lo correcto es enseñarle la portada como a cualquier
 * visitante, no un error. Quien necesite sesión ya la exigirá.
 */
export async function identificarSiHay(
  autorizacion: string | undefined | null,
): Promise<Sesion | null> {
  if (!tokenDe(autorizacion)) return null;
  try {
    return await identificar(autorizacion);
  } catch (error) {
    /*
     * NO_AUTORIZADO SÍ sube: es una cuenta válida a la que le falta la fila
     * en `perfil`, y eso hay que decirlo con esas palabras.
     *
     * Tratarlo como «no hay sesión» mandaría a esa persona a identificarse
     * otra vez, entraría con las mismas credenciales —que son buenas— y
     * volvería al mismo sitio. Un bucle en el que nada de lo que haga ayuda,
     * porque lo que falta se lo tiene que dar administración.
     *
     * Lo que sí se convierte en «visitante» es un token caducado o inválido:
     * ahí volver a entrar es exactamente la salida.
     */
    if (error instanceof ErrorNegocio && error.codigo === 'NO_AUTORIZADO') throw error;
    return null;
  }
}

/**
 * Valida el token y trae el perfil. Lanza NO_AUTENTICADO si algo falla.
 *
 * Un token válido de alguien SIN perfil también se rechaza: `auth.users` la
 * puede poblar cualquiera que se registre si el proyecto lo permite, mientras
 * que una fila en `perfil` la crea el administrador a mano. La cuenta es la
 * identidad; el perfil es el permiso, y son dos cosas.
 */
export async function identificar(autorizacion: string | undefined | null): Promise<Sesion> {
  const token = tokenDe(autorizacion);
  if (!token) romper('NO_AUTENTICADO', 'Hay que iniciar sesión para usar la aplicación.');

  const { data, error } = await publico().auth.getUser(token);
  if (error || !data?.user) {
    romper('NO_AUTENTICADO', 'La sesión caducó. Vuelve a entrar.');
  }

  /*
   * `!perfil_cafeteria_id_fkey` NO es adorno, y quitarlo tira la aplicación
   * entera.
   *
   * Desde `19-control-salidas.sql` hay DOS relaciones entre `perfil` y
   * `cafeteria`: esta —a qué sede tiene acceso la cuenta— y la de vuelta,
   * `cafeteria.responsable_usuario_id`. Con dos caminos, `cafeteria(nombre)` a
   * secas es ambiguo y PostgREST responde «more than one relationship was
   * found» en vez de la fila.
   *
   * Y esto es `identificar()`, así que ese fallo no rompe una pantalla: rompe
   * TODAS las peticiones con sesión a la vez. Costó un acceso que se quedaba
   * girando en «Ingresando…» sin decir por qué, porque el modal espera al
   * perfil y el perfil no llegaba nunca.
   *
   * Las otras tres consultas que incrustan la sede desde el perfil llevan el
   * mismo nombre: `usuarios.ts` (dos) y `cuentas.ts`.
   */
  const perfil = desempaquetar<FilaPerfil | null>(
    await servicio()
      .from('perfil')
      .select('usuario_id, nombre, rol, cafeteria_id, cafeteria!perfil_cafeteria_id_fkey(nombre)')
      .eq('usuario_id', data.user.id)
      .maybeSingle(),
  );

  if (!perfil) {
    romper('NO_AUTORIZADO',
      'Tu cuenta existe pero no tiene permisos asignados. Habla con administración.');
  }

  return {
    usuarioId: perfil.usuario_id,
    nombre: perfil.nombre ?? '',
    rol: perfil.rol as Rol,
    cafeteriaId: perfil.cafeteria_id ?? null,
    cafeteriaNombre: perfil.cafeteria?.nombre ?? '',
  };
}

/** ¿Puede este rol ejecutar esta acción? Lanza NO_AUTORIZADO si no. */
export function autorizar(sesion: Sesion, accion: string): void {
  if (!PERMISOS[sesion.rol]?.includes(accion)) {
    romper('NO_AUTORIZADO', `Tu perfil no puede ejecutar «${accion}».`);
  }
}

/**
 * La sede sobre la que esta sesión puede trabajar.
 *
 * El mostrador NO elige: se le impone la suya, se haya pedido la que se haya
 * pedido. Filtrar por el `cafeteria_id` que llega en los parámetros sería
 * confiar en el cliente para decidir un permiso, y el cliente es justo lo que
 * no se puede creer — basta con cambiar el valor en las herramientas de
 * desarrollo para leer los móviles de otra sede.
 *
 * El administrador y el auxiliar sí eligen, y sin valor pueden verlas todas.
 */
export function sedePermitida(sesion: Sesion, pedida: unknown): string | null {
  if (sesion.rol === 'mostrador') return sesion.cafeteriaId;
  const texto = String(pedida ?? '').trim();
  return texto || null;
}

/**
 * Lanza si esta sesión no puede tocar algo de esa sede.
 *
 * La condición es «tener sede» y no «ser admin»: los dos roles sin sede la ven
 * entera, y escribirlo por el `cafeteriaId` en vez de enumerando roles hace
 * que un cuarto rol sin sede funcione el día que exista, en vez de quedarse
 * fuera en silencio. Lo que cada uno puede HACER lo decide `PERMISOS`; esto
 * solo decide DÓNDE.
 */
export function exigirSede(sesion: Sesion, cafeteriaId: string): void {
  if (sesion.cafeteriaId === null) return;
  if (sesion.cafeteriaId !== cafeteriaId) {
    romper('NO_AUTORIZADO', 'Esa reserva es de otra cafetería.');
  }
}
