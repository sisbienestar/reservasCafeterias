/**
 * La portada: los módulos de la aplicación.
 *
 * Es la puerta, y es pública, igual que antes lo era la lista de cafeterías.
 * Sigue sin haber un botón de «Entrar» suelto: la sesión se pide al abrir lo
 * que la necesita.
 *
 * Y aquí vive el acceso de los módulos que son privados enteros. Pedidos lo
 * es: su portada ya exige sesión, así que no puede alojar su propio modal
 * —quien no ha entrado no llega a verla—. Reservas conserva el suyo porque su
 * portada sí es pública y es ahí donde hay que devolver a quien pulsó una
 * sede. Cada módulo pide el acceso en la última pantalla pública del camino.
 *
 * Aquí NO va el enlace a administración. Administración es de reservas, no de
 * la aplicación: su sitio es el pie del módulo, no este.
 */

import { useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { TarjetaModulo } from '../componentes/TarjetaModulo.js';
import { BarraSesion } from '../componentes/BarraSesion.js';
import { ModalAcceso } from '../componentes/ModalAcceso.js';
import { Pie } from '../componentes/Pie.js';
import { useHoy, useSesion } from '../contexto/Sesion.js';
import { formatearFechaLarga } from '../utiles/fechas.js';

export function Modulos() {
  const hoy = useHoy();
  const { contexto, salir } = useSesion();
  const donde = useLocation();
  const navegar = useNavigate();

  /** A dónde iba quien acabó aquí sin sesión. Lo deja `ExigeSesion`. */
  const destino = (donde.state as { pedirAcceso?: string } | null)?.pedirAcceso ?? null;
  const [pidiendoAcceso, setPidiendoAcceso] = useState(Boolean(destino));

  const alEntrar = useCallback(() => {
    setPidiendoAcceso(false);
    navegar(destino ?? '/', { replace: true });
  }, [destino, navegar]);

  const alCerrar = useCallback(() => {
    setPidiendoAcceso(false);
    // Se limpia el destino del historial: si no, volver aquí con el botón de
    // atrás reabriría el formulario que se acaba de cerrar.
    navegar('/', { replace: true });
  }, [navegar]);

  return (
    <>
      <main className="contenedor pagina">
        {/* Con sesión iniciada, la barra va también aquí: si no, la portada
            sería la única pantalla desde la que no se puede salir. */}
        {contexto?.perfil && (
          <BarraSesion
            perfil={contexto.perfil}
            alSalir={salir}
            {...(contexto.perfil.rol === 'admin'
              ? { volver: { a: '/admin', texto: 'Administrar la aplicación' } }
              : {})}
          />
        )}

        <section className="portada">
          <p className="portada__fecha">{formatearFechaLarga(hoy)}</p>
          <h1 className="portada__titulo">{contexto?.aplicacion.nombre}</h1>
          <p className="portada__bajada">
            Herramienta interna del personal de las cafeterías de la Universidad
            Industrial de Santander.
          </p>
        </section>

        <section aria-labelledby="titulo-modulos">
          <h2 className="seccion__titulo" id="titulo-modulos">Módulos</h2>

          {/*
            Sin estados de carga ni de error: los módulos llegan dentro de
            `app.contexto`, que la aplicación ya espera antes de pintar nada.
            Pedirlos aparte habría añadido un segundo viaje para dibujar la
            primera pantalla.

            Y llegan YA FILTRADOS por el servidor: administración recibe
            también los apagados y los demás solo los activos. Aquí no se
            decide eso.
          */}
          <div className="rejilla-tarjetas">
            {(contexto?.modulos ?? []).map((modulo) => (
              <TarjetaModulo key={modulo.id} modulo={modulo} />
            ))}
          </div>
        </section>
      </main>

      <Pie />

      <ModalAcceso abierto={pidiendoAcceso} alCerrar={alCerrar} alEntrar={alEntrar} />
    </>
  );
}
