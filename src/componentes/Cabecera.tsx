/**
 * La cabecera institucional. Es idéntica en las tres pantallas y no lleva
 * nada más, igual que en el original.
 *
 * Quién ha entrado y por dónde se sale NO van aquí: van en `<BarraSesion>`,
 * dentro de cada página. Meterlos en la cabecera descuadraba el logo y
 * convertía la marca en un panel de control.
 *
 * La versión sí va aquí, y fuera del enlace de la marca: mientras esto sea un
 * prototipo, quien lo prueba tiene que poder decir qué versión está mirando
 * sin preguntar, y desde cualquier pantalla.
 */

import { Link } from 'react-router-dom';

/** Se suben a mano al publicar una versión nueva para probar. */
const VERSION = 'v1';
const FECHA_VERSION = '19 de agosto de 2026';

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

        <p className="cabecera__version">
          <span className="cabecera__version-nombre">Prototipo funcional {VERSION}</span>
          <span className="cabecera__version-fecha">{FECHA_VERSION}</span>
        </p>
      </div>
    </header>
  );
}
