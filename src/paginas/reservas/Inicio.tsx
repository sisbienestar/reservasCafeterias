/**
 * La portada del módulo de reservas: las cafeterías del campus.
 *
 * Es pública. Y es también donde vive el acceso: quien pulsa una sede o
 * «Admin» sin sesión acaba aquí, con el modal delante y el destino guardado.
 * El acceso es de cada módulo, no de la aplicación; `ExigeSesion` sabe a qué
 * portada devolver porque cada ruta se lo dice.
 *
 * No hay ningún botón de «Entrar» suelto. La sesión se pide cuando hace
 * falta, no antes: un botón de entrar en una pantalla que no lo necesita solo
 * invita a hacer un trámite que puede no llegar a hacer falta.
 */

import { useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getCafeterias } from '../../servicios/cafeteriasServicio.js';
import { usePeticion } from '../../utiles/usePeticion.js';
import { TarjetaCafeteria } from '../../componentes/TarjetaCafeteria.js';
import { BloqueEstado } from '../../componentes/BloqueEstado.js';
import { BarraSesion } from '../../componentes/BarraSesion.js';
import { ModalAcceso } from '../../componentes/ModalAcceso.js';
import { Pie } from '../../componentes/Pie.js';
import { useHoy, useSesion } from '../../contexto/Sesion.js';
import { formatearFechaLarga } from '../../utiles/fechas.js';

export function Inicio() {
  const hoy = useHoy();
  const { contexto, salir } = useSesion();
  const donde = useLocation();
  const navegar = useNavigate();

  const consultar = useCallback(() => getCafeterias(), []);
  const { datos: cafeterias, cargando, error, recargar } = usePeticion(consultar, []);

  /**
   * A dónde iba quien acabó aquí sin sesión.
   *
   * Lo deja `ExigeSesion` al desviar. Si está, hay que pedir el acceso y
   * llevar allí al entrar; si no, esto es una visita normal a la portada.
   */
  const destino = (donde.state as { pedirAcceso?: string } | null)?.pedirAcceso ?? null;
  const [pidiendoAcceso, setPidiendoAcceso] = useState(Boolean(destino));

  const alEntrar = useCallback(() => {
    setPidiendoAcceso(false);
    navegar(destino ?? '/reservas', { replace: true });
  }, [destino, navegar]);

  const alCerrar = useCallback(() => {
    setPidiendoAcceso(false);
    // Se limpia el destino del historial: si no, volver aquí con el botón de
    // atrás reabriría el formulario que se acaba de cerrar.
    navegar('/reservas', { replace: true });
  }, [navegar]);

  return (
    <>
      <main className="contenedor pagina">
        {/* Sin sesión la vuelta a los módulos es el logo de la cabecera, que
            está en todas las pantallas. Con sesión hay barra, y ahí cabe
            decirlo con palabras. */}
        {contexto?.perfil && (
          <BarraSesion
            perfil={contexto.perfil}
            alSalir={salir}
            volver={{ a: '/', texto: '← Módulos' }}
          />
        )}

        {/* La fecha ANTES del título, como en el original: es el sobretítulo
            que sitúa, no un dato al pie. */}
        <section className="portada">
          <p className="portada__fecha">{formatearFechaLarga(hoy)}</p>
          <h1 className="portada__titulo">Reservas de almuerzos</h1>
        </section>

        <section aria-labelledby="titulo-cafeterias">
          <h2 className="seccion__titulo" id="titulo-cafeterias">Cafeterías del campus</h2>

          {cargando && <BloqueEstado tipo="cargando" titulo="Cargando cafeterías…" />}

          {error && (
            <BloqueEstado
              tipo="error"
              titulo="No se pudieron cargar las cafeterías"
              detalle={error}
              accion={{ texto: 'Reintentar', alPulsar: recargar }}
            />
          )}

          {/*
            Una lista vacía no es un error, pero tampoco un estado normal: si
            no hay ninguna sede activa, alguien las archivó todas. Decirlo con
            esas palabras ahorra el rato de buscar el fallo en otro sitio.
          */}
          {cafeterias?.length === 0 && (
            <BloqueEstado
              tipo="vacio"
              titulo="No hay cafeterías en servicio"
              detalle="Todas están archivadas. Puedes reactivarlas desde el catálogo, en Administración."
            />
          )}

          {/*
            Las tarjetas cuelgan DIRECTAMENTE de la rejilla, sin <li> en medio.
            `.rejilla-tarjetas` es un grid y coloca a sus hijos inmediatos:
            envolverlas hacía que colocara los <li> y las tarjetas perdían su
            sitio.

            Son enlaces normales, sin saber nada de sesión. Pulsar una sin
            haber entrado navega, `ExigeSesion` devuelve aquí con el destino y
            el modal aparece. Que la tarjeta no tenga que preguntarse si hay
            sesión es lo que deja una sola puerta en vez de dos.
          */}
          {cafeterias && cafeterias.length > 0 && (
            <div className="rejilla-tarjetas" aria-live="polite">
              {cafeterias.map((cafeteria) => (
                <TarjetaCafeteria key={cafeteria.id} cafeteria={cafeteria} />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* El enlace a administración va SIEMPRE, con sesión o sin ella: es la
          única puerta que hay, y esconderla la haría inalcanzable. */}
      <Pie conEnlaceAdmin />

      <ModalAcceso abierto={pidiendoAcceso} alCerrar={alCerrar} alEntrar={alEntrar} />
    </>
  );
}
