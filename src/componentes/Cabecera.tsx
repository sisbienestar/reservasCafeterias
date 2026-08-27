/**
 * La cabecera institucional. Es idéntica en las tres pantallas y no lleva
 * nada más, igual que en el original.
 *
 * Quién ha entrado y por dónde se sale NO van aquí: van en `<BarraSesion>`,
 * dentro de cada página. Meterlos en la cabecera descuadraba el logo y
 * convertía la marca en un panel de control.
 */

import { Link } from 'react-router-dom';

export function Cabecera() {
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
      </div>
    </header>
  );
}
