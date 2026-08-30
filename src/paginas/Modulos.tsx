/**
 * La portada: los módulos de la aplicación.
 *
 * Es la puerta, y es pública, igual que antes lo era la lista de cafeterías.
 * Sigue sin haber un botón de «Entrar» suelto: la sesión se pide al abrir lo
 * que la necesita.
 *
 * Y aquí vive el acceso, para los dos módulos. Las dos portadas de módulo
 * exigen sesión, así que ninguna puede alojar su propio modal: quien no ha
 * entrado no llega a verlas. Esta es la única pantalla abierta, y por eso es
 * la única que puede pedir la contraseña.
 *
 * La administración de cada módulo vive dentro de él; la de la APLICACIÓN
 * cuelga de la barra de sesión de aquí arriba, y solo para `admin`.
 */

import { useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { TarjetaModulo } from '../componentes/TarjetaModulo.js';
import { BarraVolver } from '../componentes/BarraVolver.js';
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
          <BarraVolver
            {...(contexto.perfil.rol === 'admin'
              ? { volver: { a: '/admin', texto: 'Administrar la aplicación' } }
              : {})}
          />
        )}

        <section className="portada portada--con-emblema">
          {/*
            Los cuatro van SUELTOS, sin envoltorios. Es una rejilla, y cada uno
            se coloca por su nombre de zona: así el emblema puede abarcar el
            título y la bajada en escritorio, y solo el título en un móvil, sin
            cambiar el HTML. Con envoltorios haría falta una estructura para
            cada anchura.
          */}
          <p className="portada__fecha">{formatearFechaLarga(hoy)}</p>
          <h1 className="portada__titulo">{contexto?.aplicacion.nombre}</h1>

          {/* Decorativo: el nombre que dice el logo ya está en el titular de al
              lado, así que un texto alternativo lo repetiría. */}
          <img className="portada__emblema" src="/assets/img/cafeteriasUIS.png" alt="" />

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
