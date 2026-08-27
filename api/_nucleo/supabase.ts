/**
 * La conexión con Supabase, y la traducción de sus errores a los del contrato.
 *
 * Aquí hay dos clientes y la diferencia entre ellos es de seguridad, no de
 * comodidad:
 *
 *  · `servicio()` usa la clave de SERVICIO. Se salta RLS por completo, así
 *    que puede leer y escribir todo. Vive solo en el servidor y NUNCA puede
 *    acabar en un archivo que el navegador descargue. Es la que usan las
 *    acciones, DESPUÉS de que `sesion.ts` haya comprobado quién llama.
 *
 *  · `publico()` usa la clave anónima y sirve para una sola cosa: preguntarle
 *    a Supabase si un token de sesión es válido y de quién es.
 *
 * Que las acciones usen la clave de servicio es lo que obliga a que la
 * autorización esté escrita en el código de cada acción. Con RLS cerrado del
 * todo (ver 02-rls.sql), este archivo es la única puerta que existe.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { fallo, ErrorNegocio, type CodigoError } from './sobre.js';

function requerido(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    // Sin esto, el síntoma sería un «fetch failed» a la URL `undefined`, que
    // no dice nada. Con esto, el registro de Vercel nombra la variable que
    // falta.
    throw new Error(`Falta la variable de entorno ${nombre}.`);
  }
  return valor;
}

let _servicio: SupabaseClient | null = null;

/** Cliente con permisos totales. Solo servidor. */
export function servicio(): SupabaseClient {
  if (!_servicio) {
    _servicio = createClient(
      requerido('SUPABASE_URL'),
      requerido('SUPABASE_SERVICE_ROLE_KEY'),
      // Una función sin estado no tiene dónde guardar una sesión, y no la
      // necesita: la clave de servicio ya la autoriza.
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return _servicio;
}

/** Cliente anónimo, solo para validar tokens de sesión. */
export function publico(): SupabaseClient {
  return createClient(requerido('SUPABASE_URL'), requerido('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/* ── Traducción de errores ──────────────────────────────────────────────
 *
 * Postgres habla en SQLSTATE y en nombres de restricción. El frontend habla
 * en códigos del contrato. Si esa traducción no se hiciera aquí, cada acción
 * tendría que reconocer un '23505' por su cuenta — y la que se olvidara
 * mostraría «error interno» en el mostrador para algo tan corriente como un
 * móvil repetido.
 */

/** Los SQLSTATE propios que levantan las funciones de 03-funciones.sql. */
const POR_SQLSTATE: Record<string, [CodigoError, string]> = {
  RS001: ['SIN_CAMBIOS', 'No se modificó ningún dato de la reserva.'],
  RS002: ['RESERVA_NO_ENCONTRADA', 'Esa reserva ya no existe.'],
  RS003: ['RESERVA_CANCELADA', 'Esa reserva está cancelada.'],
  RS004: ['CAFETERIA_NO_ENCONTRADA', 'No existe esa cafetería.'],
};

/**
 * Las violaciones de unicidad, por nombre de restricción.
 *
 * Se distingue por NOMBRE y no por el texto del mensaje, que cambia entre
 * versiones de Postgres y viene además traducido según la configuración
 * regional del servidor. El nombre lo elegimos nosotros en el esquema.
 */
const POR_RESTRICCION: Record<string, [CodigoError, string]> = {
  reserva_sin_duplicado: [
    'RESERVA_DUPLICADA',
    'Ese móvil ya tiene una reserva para hoy en esta cafetería.',
  ],
  // No debería ocurrir: el candado de `crear_reserva` serializa el reparto de
  // consecutivos. Si aparece, es que alguien insertó por fuera de la función.
  reserva_consecutivo_unico: [
    'ERROR_INTERNO',
    'Se repitió el consecutivo de la reserva. Vuelve a intentarlo.',
  ],
  cafeteria_pkey: ['CAFETERIA_DUPLICADA', 'Ya existe una cafetería con ese identificador.'],
  cafeteria_codigo_key: ['CAFETERIA_DUPLICADA', 'Ya existe una cafetería con ese código.'],
  carta_opcion_pkey: ['MENU_DUPLICADO', 'Hay un plato repetido en la carta de ese día.'],
};

interface ErrorPostgres { code?: string; message?: string; details?: string | null }

/**
 * Convierte el error de Supabase en un ErrorNegocio, o lo deja pasar.
 *
 * Devolver el error tal cual cuando no se reconoce es deliberado: envolverlo
 * en un código del contrato que no le corresponde haría creer al mostrador
 * que el problema es suyo —«ese plato no está en la carta»— cuando en
 * realidad se cayó la base de datos.
 */
export function traducirError(error: ErrorPostgres): ErrorNegocio | null {
  const codigo = error?.code ?? '';

  const propio = POR_SQLSTATE[codigo];
  if (propio) return new ErrorNegocio(propio[0], propio[1]);

  if (codigo === '23505') {
    const texto = `${error.message ?? ''} ${error.details ?? ''}`;
    for (const [restriccion, [cod, mensaje]] of Object.entries(POR_RESTRICCION)) {
      if (texto.includes(restriccion)) return new ErrorNegocio(cod, mensaje);
    }
    return new ErrorNegocio('ERROR_INTERNO', 'Se intentó guardar un dato repetido.');
  }

  // Clave foránea rota: apuntar a una cafetería que no existe.
  if (codigo === '23503') {
    return new ErrorNegocio('CAFETERIA_NO_ENCONTRADA', 'No existe esa cafetería.');
  }

  return null;
}

/** Lanza el error traducido si lo hay, y si no, uno genérico con su texto. */
export function reventar(error: ErrorPostgres): never {
  const traducido = traducirError(error);
  if (traducido) throw traducido;
  throw new Error(error?.message ?? 'Error de base de datos.');
}

/**
 * Azúcar para el patrón `const { data, error } = await …` que repite todo.
 *
 * El tipo de `data` lo pone quien llama y no se infiere del cliente. Sin
 * tipos generados, supabase-js no sabe qué columnas tiene cada tabla y deduce
 * formas inservibles a partir del texto del `select`; dejarle inferir haría
 * que un `.maybeSingle()` acabara valiendo `never` y que el compilador
 * rechazara leer campos que sí existen. Anotarlo aquí a mano es admitir que
 * el tipo es una declaración nuestra, no una comprobación —lo que de verdad
 * verifica la forma es `pruebas/contrato.mjs` contra la base real—.
 */
export function desempaquetar<T>(
  respuesta: { data: unknown; error: ErrorPostgres | null },
): T {
  if (respuesta.error) reventar(respuesta.error);
  return respuesta.data as T;
}

export { fallo };
