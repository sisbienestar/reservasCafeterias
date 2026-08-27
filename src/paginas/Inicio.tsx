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
import { useHoy } from '../contexto/Sesion.js';
import { formatearFechaLarga } from '../utiles/fechas.js';

export function Inicio() {
  const hoy = useHoy();
  const consultar = useCallback(() => getCafeterias(), []);
  const { datos: cafeterias, cargando, error, recargar } = usePeticion(consultar, []);

  return (
    <main className="contenedor pagina" id="contenido">
      <div className="portada">
        <h1 className="portada__titulo">Cafeterías</h1>
        <p className="portada__fecha">{formatearFechaLarga(hoy)}</p>
      </div>

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
        Una lista vacía no es un error, pero tampoco es un estado normal: si no
        hay ninguna sede activa, alguien las archivó todas. Decirlo con esas
        palabras ahorra el rato de buscar el fallo en otro sitio.
      */}
      {cafeterias?.length === 0 && (
        <BloqueEstado
          tipo="vacio"
          titulo="No hay cafeterías en servicio"
          detalle="Todas están archivadas. Puedes reactivarlas desde el catálogo, en Administración."
        />
      )}

      {cafeterias && cafeterias.length > 0 && (
        <ul className="rejilla-tarjetas">
          {cafeterias.map((cafeteria) => (
            <li key={cafeteria.id}>
              <TarjetaCafeteria cafeteria={cafeteria} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
