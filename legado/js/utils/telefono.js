/**
 * Utilidades de móvil.
 *
 * Los móviles se guardan como diez dígitos sin separadores ('3001234567').
 * Guardar la forma normalizada y no lo que se tecleó es lo que permite
 * comparar dos números: «300 123 4567», «+57 300 123 4567» y «300-1234567»
 * son la misma persona, y la reserva duplicada se detecta por ahí.
 */

/**
 * Deja el móvil en diez dígitos, o null si no es un móvil colombiano válido.
 * Acepta el indicativo +57 y cualquier separador; los celulares del país son
 * diez dígitos que empiezan por 3.
 */
export function normalizarTelefono(valor) {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  const sinIndicativo =
    digitos.length === 12 && digitos.startsWith('57') ? digitos.slice(2) : digitos;
  return /^3\d{9}$/.test(sinIndicativo) ? sinIndicativo : null;
}

/** '3001234567' → '300 123 4567'. Si no reconoce la forma, lo deja intacto. */
export function formatearTelefono(telefono) {
  const valor = String(telefono ?? '');
  if (!/^\d{10}$/.test(valor)) return valor;
  return `${valor.slice(0, 3)} ${valor.slice(3, 6)} ${valor.slice(6)}`;
}
