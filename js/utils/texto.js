/**
 * Utilidades de texto.
 *
 * Las tres funciones se apoyan en lo mismo: separar los acentos de su letra
 * con NFD y quitarlos. En un sistema en español eso no es cosmético — sin
 * ello, buscar «Nicolas» no encontraría a «Nicolás», y el id de «Lasaña»
 * saldría con una eñe dentro.
 */

/** El rango Unicode de los acentos que NFD separa de su letra. */
const ACENTOS = /[\u0300-\u036f]/g;

/** Quita tildes y diéresis, deja la eñe convertida en n. */
export function sinAcentos(texto) {
  return String(texto ?? '').normalize('NFD').replace(ACENTOS, '');
}

/** 'Bandeja Paisa' → 'bandeja-paisa'. Identificador estable y legible. */
export function aSlug(texto) {
  return sinAcentos(texto)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Forma comparable de un texto para buscar: sin acentos y en minúsculas. */
export function normalizarBusqueda(texto) {
  return sinAcentos(texto).toLowerCase().trim();
}
