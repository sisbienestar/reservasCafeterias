/**
 * Tarjeta de módulo de la portada.
 *
 * Reutiliza `.tarjeta` entera —la misma que las cafeterías— a propósito: son
 * dos rejillas de «elige uno de estos» y no había razón para que se vieran
 * distintas. Lo único propio es `.tarjeta--proximamente`.
 *
 * Un módulo sin `ruta` no es un enlace roto: no es un enlace. Se pinta como
 * `<div>`, así no lo recoge el tabulador ni promete nada al pulsarlo.
 *
 * Un módulo APAGADO sí es un enlace, y a propósito: solo lo recibe
 * administración —el servidor no se lo sirve a nadie más— y su razón de ser es
 * poder entrar a probarlo antes de publicarlo. Lo que cambia es que se pinta
 * apagado y la etiqueta lo dice.
 */

import { Link } from 'react-router-dom';
import type { Modulo } from '../contexto/Sesion.js';

export function TarjetaModulo({ modulo }: { modulo: Modulo }) {
  const apagado = !modulo.activo;
  const etiqueta = apagado ? 'Fuera de servicio' : modulo.etiqueta;

  const interior = (
    <>
      <div className="tarjeta__medio">
        <span className="tarjeta__inicial" aria-hidden="true">{modulo.inicial}</span>
      </div>

      <div className="tarjeta__cuerpo">
        <p className="tarjeta__ubicacion">{etiqueta}</p>
        <h2 className="tarjeta__nombre">{modulo.nombre}</h2>
      </div>

      {modulo.ruta && <span className="tarjeta__flecha" aria-hidden="true">→</span>}
    </>
  );

  if (!modulo.ruta) {
    return <div className="tarjeta tarjeta--proximamente">{interior}</div>;
  }

  return (
    <Link
      className={`tarjeta${apagado ? ' tarjeta--proximamente' : ''}`}
      to={modulo.ruta}
    >
      {interior}
    </Link>
  );
}
