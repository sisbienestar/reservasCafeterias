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

export function TarjetaProveedor({ proveedor }: { proveedor: Proveedor }) {
  return (
    <Link className="tarjeta tarjeta--compacta" to={`/pedidos/${proveedor.id}`}>
      <MedioTarjeta
        imagen={proveedor.imagen}
        iniciales={iniciales(proveedor.nombre, GENERICAS)}
      />

      <div className="tarjeta__cuerpo">
        {/*
          El sobretítulo es la CATEGORÍA, y antes decía «Almacén interno» o
          «Proveedor externo» según el tipo de documento. Dejó de poder
          decirlo: desde que todos los pedidos se imprimen en FBE.04, ese tipo
          es el mismo para los once proveedores y la frase habría llamado
          almacén de la Universidad a Ramo y a Coca-Cola.

          La categoría sí los reparte —alimentos, aseo, desechables— y además
          es la casilla que va marcada con X en la hoja que se firma. Un
          proveedor sin categoría se queda sin sobretítulo antes que con uno
          falso: la imagen y el nombre ya lo identifican.
        */}
        {proveedor.categoriaFija && (
          <p className="tarjeta__ubicacion">{proveedor.categoriaFija}</p>
        )}
        <h2 className="tarjeta__nombre">{proveedor.nombre}</h2>
      </div>

      <span className="tarjeta__flecha" aria-hidden="true">→</span>
    </Link>
  );
}
