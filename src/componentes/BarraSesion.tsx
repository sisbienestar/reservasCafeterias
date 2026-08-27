/**
 * La franja de arriba de cada pantalla: por dónde se vuelve y por dónde se sale.
 *
 * Reutiliza `.barra-sesion`, que en el original solo tenía la pantalla de
 * administración —«← Ir a la pantalla de mostrador» y «Cerrar sesión»—. Ahora
 * la llevan las tres, porque ahora las tres tienen sesión.
 *
 * Va aquí y no en la cabecera a propósito: la cabecera es la marca
 * institucional y es idéntica en todo el sistema. Meterle dentro quién ha
 * entrado la convertía en otra cosa y descuadraba el logo.
 */

import { Link } from 'react-router-dom';
import type { Perfil } from '../contexto/Sesion.js';

const NOMBRE_ROL: Record<string, string> = {
  mostrador: 'Mostrador',
  admin: 'Administración',
};

interface Props {
  perfil: Perfil;
  alSalir: () => void;
  /** A dónde vuelve esta pantalla, si vuelve a alguna parte. */
  volver?: { a: string; texto: string } | undefined;
}

export function BarraSesion({ perfil, alSalir, volver }: Props) {
  return (
    <div className="barra-sesion">
      {volver
        ? <Link className="enlace-volver" to={volver.a}>{volver.texto}</Link>
        : <span className="enlace-volver enlace-volver--inerte" aria-hidden="true" />}

      <span className="barra-sesion__quien">
        {/* `nombre` puede estar vacío: no es obligatorio en `perfil`. Entonces
            manda el rol, que nunca lo está. */}
        {perfil.nombre || NOMBRE_ROL[perfil.rol] || 'Sesión'}
        <span className="barra-sesion__rol">{NOMBRE_ROL[perfil.rol] ?? perfil.rol}</span>
      </span>

      <button className="boton boton--secundario boton--sm" type="button" onClick={alSalir}>
        Cerrar sesión
      </button>
    </div>
  );
}
