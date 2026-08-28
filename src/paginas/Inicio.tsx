/**
 * Elegir cafetería.
 *
 * Solo la ve administración. El mostrador no pasa por aquí: tiene UNA sede y
 * `App` lo manda directo a ella, porque elegir la propia todos los días no es
 * una decisión, es un clic.
 */

import { useCallback } from 'react';
import { getCafeterias } from '../servicios/cafeteriasServicio.js';
import { usePeticion } from '../utiles/usePeticion.js';
import { TarjetaCafeteria } from '../componentes/TarjetaCafeteria.js';
import { BloqueEstado } from '../componentes/BloqueEstado.js';
import { BarraSesion } from '../componentes/BarraSesion.js';
import { Link } from 'react-router-dom';
import { Pie } from '../componentes/Pie.js';
import { useHoy, useSesion } from '../contexto/Sesion.js';
import { formatearFechaLarga } from '../utiles/fechas.js';

export function Inicio() {
  const hoy = useHoy();
  const { contexto, salir } = useSesion();
  const consultar = useCallback(() => getCafeterias(), []);
  const { datos: cafeterias, cargando, error, recargar } = usePeticion(consultar, []);

  return (
    <>
      <main className="contenedor pagina">
        {/*
          La portada es pública. Con sesión enseña quién ha entrado y por
          dónde salir; sin ella, la puerta. Y sin ella no falta nada más: las
          tarjetas se ven igual, porque saber qué cafeterías hay en el campus
          no es un dato de nadie.
        */}
        {contexto?.perfil
          ? <BarraSesion perfil={contexto.perfil} alSalir={salir} />
          : (
            <div className="barra-sesion">
              <Link className="boton boton--secundario boton--sm barra-sesion__entrar" to="/entrar">
                Entrar
              </Link>
            </div>
          )}

        {/* La fecha ANTES del título, como en el original: es el sobretítulo
            que sitúa, no un dato al pie. */}
        <section className="portada">
          <p className="portada__fecha">{formatearFechaLarga(hoy)}</p>
          <h1 className="portada__titulo">Sistema de reservas Cafeterías UIS</h1>
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
            sitio. Es lo que rompía esta pantalla.
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

      <Pie conEnlaceAdmin={contexto?.perfil?.rol === 'admin'} />
    </>
  );
}
