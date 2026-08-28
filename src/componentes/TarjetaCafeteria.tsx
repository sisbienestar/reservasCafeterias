/** Tarjeta de cafetería de la portada del módulo de reservas. */

import { Link } from 'react-router-dom';
import type { Cafeteria } from '../servicios/cafeteriasServicio.js';
import { iniciales } from '../utiles/iniciales.js';
import { MedioTarjeta } from './MedioTarjeta.js';

/** Lo que en el nombre de una sede no la distingue de las demás. */
const GENERICAS = /^(cafetería|cafeteria|comedor|autoservicio)$/i;

/**
 * La tarjeta entera es un enlace: navegar a la reserva es la única acción que
 * ofrece, y así funciona con teclado y con clic medio sin escribir nada.
 */
export function TarjetaCafeteria({ cafeteria }: { cafeteria: Cafeteria }) {
  return (
    <Link className="tarjeta tarjeta--compacta" to={`/reservas/${cafeteria.id}`}>
      <MedioTarjeta
        imagen={cafeteria.imagen}
        iniciales={iniciales(cafeteria.nombre, GENERICAS)}
      />

      <div className="tarjeta__cuerpo">
        <p className="tarjeta__ubicacion">{cafeteria.ubicacion}</p>
        <h2 className="tarjeta__nombre">{cafeteria.nombre}</h2>
      </div>

      <span className="tarjeta__flecha" aria-hidden="true">→</span>
    </Link>
  );
}
