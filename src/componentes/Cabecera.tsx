/**
 * La cabecera institucional, y con ella quién ha entrado.
 *
 * ── Por qué la sesión SÍ va aquí, después de todo ────────────────────────
 *
 * Durante un tiempo no estuvo: vivía en `<BarraSesion>`, dentro de cada
 * página, «para no convertir la marca en un panel de control». El problema no
 * era estético sino de veracidad. Esa barra recibía la sede como propiedad de
 * cada pantalla, y las pantallas le pasaban la sede DE LO QUE ESTABAN
 * ENSEÑANDO: abrir un pedido de Administración 3 hacía que la barra dijera
 * «auxiliar · Cafetería Administración 3» sobre una cuenta que no tiene sede
 * ninguna. La identidad se leía como identidad y era contexto.
 *
 * Aquí no puede pasar: la cabecera no sabe qué hay debajo. Solo conoce el
 * perfil, así que solo puede decir la verdad sobre él — y el nombre de la sede
 * viene ahora dentro del propio perfil, no de la pantalla.
 *
 * Lo que se queda en cada página es el enlace de vuelta, que sí es suyo: ver
 * `<BarraVolver>`.
 *
 * La versión baja a su propia franja bajo la cabecera. Mientras esto sea un
 * prototipo tiene que poder decirse desde cualquier pantalla qué versión se
 * está mirando, pero es un dato de la aplicación y no de la persona: mezclarlo
 * con la identidad ponía dos cosas sin relación en la misma esquina.
 */

import { Link } from 'react-router-dom';
import { useSesion, NOMBRE_ROL } from '../contexto/Sesion.js';

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
  const { contexto, salir } = useSesion();
  const app = contexto?.aplicacion;
  const perfil = contexto?.perfil ?? null;

  return (
    <>
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

              `alt` vacío a propósito: es la MISMA identidad que ya dice el
              texto de al lado. Con un texto alternativo, un lector de pantalla
              leería «Universidad Industrial de Santander, Cafeterías UIS,
              Universidad Industrial de Santander, Servicios Cafeterías
              Bienestar UIS» — la marca cuatro veces para un solo enlace.
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

          {/* Sin sesión no hay nada que decir: la portada es pública y ahí el
              hueco se queda vacío en vez de con un «Invitado» inventado. */}
          {perfil && (
            <div className="cabecera__sesion">
              <span className="cabecera__quien">
                {/* `nombre` puede estar vacío: no es obligatorio en `perfil`.
                    Entonces manda el rol, que nunca lo está. */}
                <span className="cabecera__nombre">
                  {perfil.nombre || NOMBRE_ROL[perfil.rol] || 'Sesión'}
                </span>
                <span className="cabecera__rol">
                  {NOMBRE_ROL[perfil.rol] ?? perfil.rol}
                  {/* La sede es la mitad que de verdad importa comprobar: con
                      qué cuenta se registra da igual si es la sede equivocada.
                      Y es la de la PERSONA, que es la única que la cabecera
                      puede afirmar. */}
                  {perfil.cafeteriaNombre && ` · ${perfil.cafeteriaNombre}`}
                </span>
              </span>

              {/* A la vista y no escondido en un menú: la pantalla vive en un
                  equipo compartido y salir tiene que costar un clic. */}
              <button
                className="boton boton--secundario boton--sm"
                type="button"
                onClick={salir}
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </header>

      {/*
        La franja de la versión. Fuera de `.cabecera` a propósito: la cabecera
        va fija arriba, y esto no tiene por qué ocupar sitio en todas las
        pantallas mientras se lee. Se ve al principio, que es cuando se mira.
      */}
      {app?.version && (
        <p className="franja-version">
          <span className="contenedor franja-version__interior">
            <span className="franja-version__nombre">Prototipo funcional {app.version}</span>
            {app.fechaVersion && (
              <span className="franja-version__fecha">{app.fechaVersion}</span>
            )}
          </span>
        </p>
      )}
    </>
  );
}
