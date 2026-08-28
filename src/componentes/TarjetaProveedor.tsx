/**
 * Tarjeta de proveedor de la portada del módulo de pedidos.
 *
 * Reutiliza `.tarjeta` entera, como la de cafetería y la de módulo: las tres
 * son «elige uno de estos».
 *
 * Lo único propio es `.tarjeta--compacta`, que la encoge, y la comparte con
 * la de cafetería: las dos son listas de «elige dónde» que se recorren a
 * diario, y a tamaño completo obligaban a desplazar para verlas enteras.
 */

import { Link } from 'react-router-dom';
import type { Proveedor } from '../servicios/proveedoresServicio.js';
import { iniciales } from '../utiles/iniciales.js';
import { MedioTarjeta } from './MedioTarjeta.js';

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
    <Link className="tarjeta tarjeta--compacta" to={`/pedidos/${proveedor.id}`}>
      <MedioTarjeta
        imagen={proveedor.imagen}
        iniciales={iniciales(proveedor.nombre, GENERICAS)}
      />

      <div className="tarjeta__cuerpo">
        <p className="tarjeta__ubicacion">{QUE_ES[proveedor.tipoDocumento]}</p>
        <h2 className="tarjeta__nombre">{proveedor.nombre}</h2>
      </div>

      <span className="tarjeta__flecha" aria-hidden="true">→</span>
    </Link>
  );
}
