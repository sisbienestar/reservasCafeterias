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
 * azar— este se puede leer, dictar por teléfono y buscar en la hoja. Quien
 * atiende dice «la 007 de hoy» y se entiende.
 *
 * El consecutivo es **por cafetería y por día**: la primera reserva de la
 * mañana en cada sede es la 001. Por eso los tres campos van juntos: el
 * número por sí solo no identifica nada.
 *
 * Nunca se reutiliza un consecutivo, ni siquiera si la reserva se cancela.
 * Reciclarlo haría que dos reservas distintas compartieran identificador, y
 * el historial de una acabaría contando lo que le pasó a la otra.
 */

/** '2026-08-23' → '260823'. */
export function codigoDeFecha(fechaISO) {
  const [anio, mes, dia] = String(fechaISO).split('-');
  return `${anio.slice(2)}${mes}${dia}`;
}

/**
 * Arma el identificador. El consecutivo se rellena a tres dígitos, pero no se
 * recorta: si una sede pasara de 999 reservas en un día crecería a cuatro, que
 * es preferible a repetir un número.
 */
export function construirIdReserva(codigoCafeteria, fechaISO, consecutivo) {
  const numero = String(consecutivo).padStart(3, '0');
  return `${codigoCafeteria}-${codigoDeFecha(fechaISO)}-${numero}`;
}

const FORMATO = /^(\d{2})-(\d{6})-(\d{3,})$/;

/**
 * Descompone un identificador, o devuelve null si no sigue el formato.
 *
 * Devolver null y no lanzar es deliberado: en la hoja pueden quedar reservas
 * con el identificador antiguo, y la pantalla tiene que seguir pintándolas
 * en vez de romperse.
 */
export function partesIdReserva(id) {
  const encontrado = FORMATO.exec(String(id ?? ''));
  if (!encontrado) return null;
  return {
    cafeteria: encontrado[1],
    fecha: encontrado[2],
    consecutivo: encontrado[3],
  };
}

/** Los tres últimos dígitos: lo que se enseña en la tabla del día. */
export function numeroDeReserva(id) {
  const partes = partesIdReserva(id);
  return partes ? partes.consecutivo : '';
}

/** ¿Ese identificador sigue el formato nuevo? */
export const tieneFormatoNuevo = (id) => partesIdReserva(id) !== null;
