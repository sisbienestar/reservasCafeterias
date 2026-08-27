/**
 * La cabecera institucional, con quién ha entrado y por dónde se sale.
 *
 * El bloque de identidad —logo, nombre de la universidad, nombre del
 * sistema— es el mismo marcado que tenían las tres páginas vanilla, copiado
 * tal cual para que el CSS siga valiendo sin tocarlo.
 *
 * Lo nuevo es la derecha: en el prototipo no había a quién nombrar, porque no
 * había sesión. Ahora sí, y enseñarlo no es adorno: en una herramienta que
 * comparten varios turnos, saber con qué cuenta se está trabajando es lo que
 * evita registrar toda una mañana con la sesión de otra sede.
 */

import { Link } from 'react-router-dom';
import type { Perfil } from '../contexto/Sesion.js';

interface Props {
  perfil?: Perfil | undefined;
  alSalir?: (() => void) | undefined;
}

const NOMBRE_ROL: Record<string, string> = {
  mostrador: 'Mostrador',
  admin: 'Administración',
};

export function Cabecera({ perfil, alSalir }: Props) {
  return (
    <header className="cabecera">
      <div className="contenedor cabecera__interior">
        <Link className="marca" to="/">
          <img
            className="marca__logo"
            src="/assets/img/logo-uis.webp"
            alt="Universidad Industrial de Santander"
          />
          <span className="marca__texto">
            <span className="marca__institucion">Universidad Industrial de Santander</span>
            <span className="marca__producto">
              Sistema de Reserva de Almuerzos Cafeterías UIS
            </span>
          </span>
        </Link>

        {perfil && (
          <div className="cabecera__sesion">
            <span className="cabecera__quien">
              {/* El nombre puede estar vacío: `perfil.nombre` no es
                  obligatorio. Entonces manda el rol, que nunca lo está. */}
              <strong>{perfil.nombre || NOMBRE_ROL[perfil.rol] || 'Sesión'}</strong>
              <span className="cabecera__rol">{NOMBRE_ROL[perfil.rol] ?? perfil.rol}</span>
            </span>

            {perfil.rol === 'admin' && (
              <Link className="boton boton--secundario boton--sm" to="/admin">
                Administración
              </Link>
            )}

            {alSalir && (
              <button
                type="button"
                className="boton boton--secundario boton--sm"
                onClick={alSalir}
              >
                Salir
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
