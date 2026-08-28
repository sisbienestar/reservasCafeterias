/** Tarjeta de cafetería de la página de inicio. */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Cafeteria } from '../servicios/cafeteriasServicio.js';

/** Palabras que no aportan identidad y no deben dar la inicial. */
const VACIAS = /^(de|del|la|las|el|los|y|cafetería|cafeteria|comedor|autoservicio)$/i;

/**
 * Iniciales para el marcador de posición: hasta dos, de las dos primeras
 * palabras con contenido.
 *
 * Dos y no una porque con una sola letra «Bienestar Pro» y «Bienestar
 * Universitario» darían las dos una «B», y sus tarjetas se verían idénticas
 * mientras no haya fotos. «Administración 3» sale como «A3», que es como la
 * llama todo el mundo.
 */
function iniciales(nombre: string): string {
  const palabras = nombre.split(/\s+/).filter((p) => p && !VACIAS.test(p));
  const letras = palabras.slice(0, 2).map((p) => p.charAt(0).toUpperCase());
  return letras.join('') || nombre.charAt(0).toUpperCase();
}

/**
 * La tarjeta entera es un enlace: navegar a la reserva es la única acción que
 * ofrece, y así funciona con teclado y con clic medio sin escribir nada.
 */
export function TarjetaCafeteria({ cafeteria }: { cafeteria: Cafeteria }) {
  // Una ruta mal escrita o un archivo que falte dejarían el icono de imagen
  // rota dentro de la tarjeta. Mejor volver a las iniciales.
  const [fotoRota, setFotoRota] = useState(false);
  const hayFoto = Boolean(cafeteria.imagen) && !fotoRota;

  return (
    <Link className="tarjeta" to={`/reserva/${cafeteria.id}`}>
      <div className="tarjeta__medio">
        {hayFoto ? (
          <img
            className="tarjeta__imagen"
            src={cafeteria.imagen}
            /* alt vacío a propósito: la foto es decorativa y el nombre de la
               cafetería va justo debajo. Describirla aquí obligaría a un
               lector de pantalla a oír dos veces lo mismo. */
            alt=""
            loading="lazy"
            onError={() => setFotoRota(true)}
          />
        ) : (
          <span className="tarjeta__inicial" aria-hidden="true">
            {iniciales(cafeteria.nombre)}
          </span>
        )}
      </div>

      <div className="tarjeta__cuerpo">
        <p className="tarjeta__ubicacion">{cafeteria.ubicacion}</p>
        <h2 className="tarjeta__nombre">{cafeteria.nombre}</h2>
      </div>

      <span className="tarjeta__flecha" aria-hidden="true">→</span>
    </Link>
  );
}
