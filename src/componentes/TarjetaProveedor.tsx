/**
 * Tarjeta de proveedor de la portada del módulo de pedidos.
 *
 * Reutiliza `.tarjeta` entera, como la de cafetería y la de módulo: las tres
 * son «elige uno de estos» y no había razón para que se vieran distintas. No
 * añade ni una clase.
 */

import { Link } from 'react-router-dom';
import type { Proveedor } from '../servicios/proveedoresServicio.js';
import { iniciales } from '../utiles/iniciales.js';

/** Lo que en el nombre de un proveedor no lo distingue de los demás. */
const GENERICAS = /^(almacén|almacen|proveedor|distribuidora)$/i;

/**
 * El sobretítulo dice de qué tipo es, no su código.
 *
 * «FBE.04» es lo que sale impreso en el documento, pero en una rejilla donde
 * hay que elegir no significa nada: quien pide sabe si está pidiendo al
 * almacén de la Universidad o a un proveedor de fuera, y eso es lo que
 * distingue a las nueve tarjetas entre sí.
 */
const QUE_ES: Record<string, string> = {
  'FBE.04': 'Almacén interno',
  'FBE.34': 'Proveedor externo',
};

export function TarjetaProveedor({ proveedor }: { proveedor: Proveedor }) {
  return (
    <Link className="tarjeta" to={`/pedidos/${proveedor.id}`}>
      <div className="tarjeta__medio">
        <span className="tarjeta__inicial" aria-hidden="true">
          {iniciales(proveedor.nombre, GENERICAS)}
        </span>
      </div>

      <div className="tarjeta__cuerpo">
        <p className="tarjeta__ubicacion">{QUE_ES[proveedor.tipoDocumento]}</p>
        <h2 className="tarjeta__nombre">{proveedor.nombre}</h2>
      </div>

      <span className="tarjeta__flecha" aria-hidden="true">→</span>
    </Link>
  );
}
