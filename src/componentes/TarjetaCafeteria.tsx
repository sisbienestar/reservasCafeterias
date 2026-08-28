/** Tarjeta de cafetería de la portada del módulo de reservas. */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Cafeteria } from '../servicios/cafeteriasServicio.js';
import { iniciales } from '../utiles/iniciales.js';

/** Lo que en el nombre de una sede no la distingue de las demás. */
const GENERICAS = /^(cafetería|cafeteria|comedor|autoservicio)$/i;

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
    <Link className="tarjeta" to={`/reservas/${cafeteria.id}`}>
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
            {iniciales(cafeteria.nombre, GENERICAS)}
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
