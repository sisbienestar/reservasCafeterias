/** Tarjeta de cafetería de la página de inicio. */

import { crear } from './dom.js';
import { urlReserva } from '../utils/url.js';

/** Palabras que no aportan identidad y no deben dar la inicial. */
const VACIAS = /^(de|del|la|las|el|los|y|cafetería|cafeteria|comedor)$/i;

/**
 * Iniciales para el marcador de posición: hasta dos, de las dos primeras
 * palabras con contenido.
 *
 * Dos y no una porque con una sola letra «Bienestar Pro» y «Bienestar
 * Universitario» darían las dos una «B», y sus tarjetas se verían idénticas
 * mientras no haya fotos. «Administración 3» sale como «A3», que es como la
 * llama todo el mundo.
 */
function iniciales(nombre) {
  const palabras = nombre.split(/\s+/).filter((p) => p && !VACIAS.test(p));
  const letras = palabras.slice(0, 2).map((p) => p.charAt(0).toUpperCase());
  return letras.join('') || nombre.charAt(0).toUpperCase();
}

/**
 * La tarjeta entera es un <a>: navegar a la reserva es la única acción que
 * ofrece, y así funciona con teclado y con clic medio sin escribir nada.
 *
 * @param {import('../services/cafeteriasService.js').Cafeteria} cafeteria
 */
export function tarjetaCafeteria(cafeteria) {
  const medio = crear('div', { clase: 'tarjeta__medio' });

  // Marcador de posición: se usa cuando no hay foto, y también cuando la hay
  // pero no carga.
  const marcador = crear('span', {
    clase: 'tarjeta__inicial',
    texto: iniciales(cafeteria.nombre),
    attrs: { 'aria-hidden': 'true' },
  });

  if (cafeteria.imagen) {
    const foto = crear('img', {
      clase: 'tarjeta__imagen',
      // alt vacío a propósito: la foto es decorativa y el nombre de la
      // cafetería va justo debajo. Describirla aquí obligaría a un lector de
      // pantalla a oír dos veces lo mismo.
      attrs: { src: cafeteria.imagen, alt: '', loading: 'lazy' },
    });
    // Una ruta mal escrita o un archivo que falte dejarían el icono de imagen
    // rota dentro de la tarjeta. Mejor volver a las iniciales.
    foto.addEventListener('error', () => {
      foto.remove();
      medio.appendChild(marcador);
    }, { once: true });
    medio.appendChild(foto);
  } else {
    medio.appendChild(marcador);
  }

  return crear('a', {
    clase: 'tarjeta',
    attrs: { href: urlReserva(cafeteria.id) },
    hijos: [
      medio,
      crear('div', {
        clase: 'tarjeta__cuerpo',
        hijos: [
          crear('p', { clase: 'tarjeta__ubicacion', texto: cafeteria.ubicacion }),
          crear('h2', { clase: 'tarjeta__nombre', texto: cafeteria.nombre }),
        ],
      }),
      crear('span', { clase: 'tarjeta__flecha', texto: '→', attrs: { 'aria-hidden': 'true' } }),
    ],
  });
}
