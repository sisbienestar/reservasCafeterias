/** Lectura de parámetros de la URL. */

/** Devuelve el valor del parámetro, o null si no viene o viene vacío. */
export function paramUrl(nombre) {
  const valor = new URLSearchParams(window.location.search).get(nombre);
  return valor && valor.trim() ? valor.trim() : null;
}

/** Enlace a la página de reserva de una cafetería. */
export function urlReserva(cafeteriaId) {
  return `reserva.html?cafeteria=${encodeURIComponent(cafeteriaId)}`;
}
