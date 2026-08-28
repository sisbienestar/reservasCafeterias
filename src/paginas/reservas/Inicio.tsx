/**
 * La portada del módulo de reservas: las cafeterías del campus.
 *
 * Exige sesión, igual que la de pedidos. Fue pública mientras
 * `cafeterias.listar` lo era; al cerrarse las dos, el acceso se fue de aquí a
 * la lista de módulos, que es la única pantalla que queda abierta.
 *
 * Por eso aquí ya no hay `ModalAcceso`: con sesión siempre, no hay nada que
 * pedir. Quien pulsa la tarjeta de reservas sin haber entrado ve el acceso en
 * la portada y aterriza aquí después.
 */

import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getCafeterias } from '../../servicios/cafeteriasServicio.js';
import { usePeticion } from '../../utiles/usePeticion.js';
import { TarjetaCafeteria } from '../../componentes/TarjetaCafeteria.js';
import { BloqueEstado } from '../../componentes/BloqueEstado.js';
import { BarraSesion } from '../../componentes/BarraSesion.js';
import { Pie } from '../../componentes/Pie.js';
import { useHoy, useSesion } from '../../contexto/Sesion.js';
import { formatearFechaLarga } from '../../utiles/fechas.js';

export function Inicio() {
  const hoy = useHoy();
  const { contexto, salir } = useSesion();

  const consultar = useCallback(() => getCafeterias(), []);
  const { datos: cafeterias, cargando, error, recargar } = usePeticion(consultar, []);

  return (
    <>
      <main className="contenedor pagina">
        {/* Aquí siempre hay sesión, así que la barra siempre se pinta. El
            `&&` se queda porque `perfil` es opcional en el tipo. */}
        {contexto?.perfil && (
          <BarraSesion
            perfil={contexto.perfil}
            alSalir={salir}
            volver={{ a: '/', texto: '← Módulos' }}
          />
        )}

        {/* La fecha ANTES del título, como en el original: es el sobretítulo
            que sitúa, no un dato al pie. */}
        {/*
          Título a la izquierda y acción a la derecha, igual que en pedidos.
          El enlace a administración estaba en el pie y se ofrecía a todo el
          mundo, porque esta pantalla era pública y no se sabía quién miraba.
          Ahora pide sesión, así que se sabe: se enseña solo a quien puede
          usarlo, y donde se busca.
        */}
        <section className="encabezado-reserva">
          <div>
            <p className="portada__fecha">{formatearFechaLarga(hoy)}</p>
            <h1 className="encabezado-reserva__titulo">Reservas de almuerzos</h1>
          </div>

          {contexto?.perfil?.rol === 'admin' && (
            <div className="filtros__acciones">
              <Link className="boton boton--secundario" to="/reservas/admin">
                Administrar reservas
              </Link>
            </div>
          )}
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
      <Pie />

    </>
  );
}
