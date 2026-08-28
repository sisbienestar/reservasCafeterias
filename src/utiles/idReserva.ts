/**
 * El identificador de una reserva.
 *
 *     01-260823-001
 *     ▲   ▲      ▲
 *     │   │      └─ consecutivo de esa cafetería ESE día (3 dígitos)
 *     │   └──────── fecha AAMMDD
 *     └──────────── código de la cafetería (2 dígitos)
 *
 * A diferencia del identificador anterior —una cadena opaca con un número al
 * azar— este se puede leer, dictar por teléfono y buscar. Quien atiende dice
 * «la 007 de hoy» y se entiende.
 *
 * Aquí solo se LEE. Construirlo es cosa del servidor —de
 * `construir_id_reserva` en Postgres—, porque el consecutivo depende de lo
 * que ya hay en la base y dos mostradores registrando a la vez calcularían el
 * mismo número.
 */

/** '2026-08-23' → '260823'. */
export function codigoDeFecha(fechaISO: string): string {
  const [anio = '', mes = '', dia = ''] = String(fechaISO).split('-');
  return `${anio.slice(2)}${mes}${dia}`;
}

const FORMATO = /^(\d{2})-(\d{6})-(\d{3,})$/;

/**
 * Descompone un identificador, o devuelve null si no sigue el formato.
 *
 * Devolver null y no lanzar es deliberado: quedan reservas con el
 * identificador antiguo, importadas de la hoja, y la pantalla tiene que
 * seguir pintándolas en vez de romperse.
 */
export function partesIdReserva(id: unknown): { cafeteria: string; fecha: string; consecutivo: string } | null {
  const encontrado = FORMATO.exec(String(id ?? ''));
  if (!encontrado) return null;
  return {
    cafeteria: encontrado[1] as string,
    fecha: encontrado[2] as string,
    consecutivo: encontrado[3] as string,
  };
}

/** Los tres últimos dígitos: lo que se enseña en la tabla del día. */
export function numeroDeReserva(id: unknown): string {
  return partesIdReserva(id)?.consecutivo ?? '';
}

/** ¿Ese identificador sigue el formato nuevo? */
export const tieneFormatoNuevo = (id: unknown): boolean => partesIdReserva(id) !== null;
