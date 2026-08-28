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

export type Rol = 'mostrador' | 'admin';

/** La fila de `perfil` tal como sale de Postgres, antes de pasar a camelCase. */
interface FilaPerfil {
  usuario_id: string;
  nombre: string | null;
  rol: string;
  cafeteria_id: string | null;
}

export interface Sesion {
  usuarioId: string;
  nombre: string;
  rol: Rol;
  /** La sede de quien atiende el mostrador. `null` en los administradores. */
  cafeteriaId: string | null;
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
 *  · `cafeterias.listar` — la portada enseña las sedes del campus antes de
 *    entrar, que es lo que hace que la aplicación tenga una puerta y no un
 *    muro. Sin sesión devuelve solo las ACTIVAS: `incluir_inactivas` se
 *    ignora, porque una sede archivada es información de administración.
 *  · `app.contexto` — la fecha de trabajo y el interruptor de fin de semana.
 *    Sin sesión el `perfil` viene en `null`, y eso es justo lo que le dice a
 *    la pantalla que hay que ofrecer el acceso.
 *
 * Nada más entra aquí sin pensarlo dos veces. Todo lo demás toca reservas, y
 * una reserva lleva el nombre y el móvil de una persona.
 */
export const ACCIONES_PUBLICAS = new Set(['cafeterias.listar', 'app.contexto']);

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

  const perfil = desempaquetar<FilaPerfil | null>(
    await servicio()
      .from('perfil')
      .select('usuario_id, nombre, rol, cafeteria_id')
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
 * El administrador sí elige, y sin valor puede verlas todas.
 */
export function sedePermitida(sesion: Sesion, pedida: unknown): string | null {
  if (sesion.rol === 'mostrador') return sesion.cafeteriaId;
  const texto = String(pedida ?? '').trim();
  return texto || null;
}

/** Lanza si esta sesión no puede tocar algo de esa sede. */
export function exigirSede(sesion: Sesion, cafeteriaId: string): void {
  if (sesion.rol === 'admin') return;
  if (sesion.cafeteriaId !== cafeteriaId) {
    romper('NO_AUTORIZADO', 'Esa reserva es de otra cafetería.');
  }
}
