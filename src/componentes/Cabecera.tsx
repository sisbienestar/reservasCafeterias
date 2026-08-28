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
import { useSesion } from '../contexto/Sesion.js';

export function Cabecera() {
  /*
   * El nombre y la versión salen de `ajuste`, no de constantes aquí. Antes
   * había que editar este archivo y desplegar para subir la versión del
   * prototipo; ahora se cambia desde el panel.
   *
   * Sin contexto todavía —el primer instante de carga— se pinta la marca sin
   * texto en vez de un nombre inventado que luego cambiaría delante de quien
   * mira.
   */
  const { contexto } = useSesion();
  const app = contexto?.aplicacion;

  return (
    <header className="cabecera">
      <div className="contenedor cabecera__interior">
        <Link className="marca" to="/">
          <img
            className="marca__logo"
            src="/assets/img/logo-uis.webp"
            alt="Universidad Industrial de Santander"
          />

          {/*
            El logo de Cafeterías UIS, al lado del de la Universidad.

            `alt` vacío a propósito: es la MISMA identidad que ya dice el texto
            de al lado. Con un texto alternativo, un lector de pantalla leería
            «Universidad Industrial de Santander, Cafeterías UIS, Universidad
            Industrial de Santander, Servicios Cafeterías Bienestar UIS» — la
            marca cuatro veces para un solo enlace.
          */}
          <img
            className="marca__logo marca__logo--cafeterias"
            src="/assets/img/cafeteriasUIS.png"
            alt=""
          />
          <span className="marca__texto">
            <span className="marca__institucion">Universidad Industrial de Santander</span>
            {/* El nombre de la APLICACIÓN, no el del módulo: la cabecera es
                idéntica en todas las pantallas y reservas ya solo es una de
                las cosas que hay dentro. Quién dice en qué módulo estás es el
                título de cada portada. */}
            <span className="marca__producto">{app?.nombre ?? ''}</span>
          </span>
        </Link>

        {app?.version && (
          <p className="cabecera__version">
            <span className="cabecera__version-nombre">Prototipo funcional {app.version}</span>
            <span className="cabecera__version-fecha">{app.fechaVersion}</span>
          </p>
        )}
      </div>
    </header>
  );
}
