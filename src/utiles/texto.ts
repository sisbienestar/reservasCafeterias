/**
 * Utilidades de texto.
 *
 * Las tres se apoyan en lo mismo: separar los acentos de su letra con NFD y
 * quitarlos. En un sistema en español eso no es cosmético — sin ello, buscar
 * «Nicolas» no encontraría a «Nicolás», y el id de «Lasaña» saldría con una
 * eñe dentro.
 *
 * `aSlug` tiene que dar EXACTAMENTE el mismo resultado que su gemela de
 * `api/_nucleo/dominio.ts`. Si divergieran, el plato que la pantalla ofrece y
 * el que el servidor acepta dejarían de ser el mismo, y el síntoma sería un
 * MENU_INVALIDO sobre un plato que se ve en la lista.
 */

/** El rango Unicode de los acentos que NFD separa de su letra.
 *  Escrito con escapes y no con los caracteres literales a propósito: escritos
 *  en claro son marcas combinantes invisibles que se corrompen al copiar. */
const ACENTOS = /[\u0300-\u036f]/g;

/** Quita tildes y diéresis, deja la eñe convertida en n. */
export function sinAcentos(texto: unknown): string {
  return String(texto ?? '').normalize('NFD').replace(ACENTOS, '');
}

/** 'Bandeja Paisa' → 'bandeja-paisa'. Identificador estable y legible. */
export function aSlug(texto: unknown): string {
  return sinAcentos(texto)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Forma comparable de un texto para buscar: sin acentos y en minúsculas. */
export function normalizarBusqueda(texto: unknown): string {
  return sinAcentos(texto).toLowerCase().trim();
}
