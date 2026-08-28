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
  /**
   * El nombre de la sede, cuando la pantalla lo sabe.
   *
   * No se saca de `perfil.cafeteriaId`, que es el slug: «camilo-torres» en
   * una barra de sesión se lee como un error, no como un dato. Lo pasa quien
   * ya tiene la cafetería cargada.
   */
  sede?: string | undefined;
}

export function BarraSesion({ perfil, alSalir, volver, sede }: Props) {
  return (
    <div className="barra-sesion">
      {/*
        Sin hueco reservado cuando no hay a dónde volver. Antes había un
        `visibility: hidden` que seguía ocupando ancho: en un móvil eso es una
        columna entera gastada en nada, y empujaba el resto hasta descuadrarlo.
        `.barra-sesion__quien` lleva `margin-left: auto`, así que la fila queda
        igual de bien con enlace y sin él.
      */}
      {volver && <Link className="enlace-volver" to={volver.a}>{volver.texto}</Link>}

      <span className="barra-sesion__quien">
        {/* `nombre` puede estar vacío: no es obligatorio en `perfil`. Entonces
            manda el rol, que nunca lo está. */}
        <span className="barra-sesion__nombre">
          {perfil.nombre || NOMBRE_ROL[perfil.rol] || 'Sesión'}
        </span>
        <span className="barra-sesion__rol">
          {NOMBRE_ROL[perfil.rol] ?? perfil.rol}
          {/* La sede es la mitad que de verdad importa comprobar: con qué
              cuenta se registra da igual si es la sede equivocada. */}
          {sede && ` · ${sede}`}
        </span>
      </span>

      <button className="boton boton--secundario boton--sm" type="button" onClick={alSalir}>
        Cerrar sesión
      </button>
    </div>
  );
}
