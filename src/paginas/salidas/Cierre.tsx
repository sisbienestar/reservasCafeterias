/**
 * El cierre de UNA cafetería, en su propia dirección.
 *
 * Sigue existiendo aunque la portada del módulo ya enseñe las cuatro juntas,
 * porque es a donde apunta el historial: desde una fila de «Café Camilo
 * Torres · 21 de agosto» se va a ese cierre y no al día entero.
 *
 * La hoja es la MISMA que la de la portada —`CierreSede`—, no una copia. Lo
 * único que cambia es que aquí se pinta una y allí cuatro.
 */

import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getCierre, getProductosSalida } from '../../servicios/salidasServicio.js';
import { getCafeteria } from '../../servicios/cafeteriasServicio.js';
import { usePeticion } from '../../utiles/usePeticion.js';
import { CierreSede, type DatosSede } from '../../componentes/salidas/CierreSede.js';
import { BloqueEstado } from '../../componentes/BloqueEstado.js';
import { BarraVolver } from '../../componentes/BarraVolver.js';
import { Pie } from '../../componentes/Pie.js';
import { useHoy } from '../../contexto/Sesion.js';
import { formatearFechaLarga } from '../../utiles/fechas.js';

export function Cierre() {
  const { cafeteriaId = '' } = useParams();
  const hoy = useHoy();

  /*
   * La fecha es de la PANTALLA y no de la dirección: un cierre se hace el
   * mismo día casi siempre, así que la dirección lleva la sede —lo que no
   * cambia mientras se trabaja— y el día se elige aquí. En la dirección
   * habría obligado a navegar para corregir el de ayer, que es justo el caso
   * en el que uno ya está mirando esta pantalla.
   */
  const [fecha, setFecha] = useState(hoy);
  const [version, setVersion] = useState(0);

  const consultarSede = useCallback(
    () => (cafeteriaId ? getCafeteria(cafeteriaId) : Promise.resolve(null)),
    [cafeteriaId],
  );
  const { datos: cafeteria, error: errorSede } = usePeticion(consultarSede, [cafeteriaId]);

  const consultarProductos = useCallback(
    () => getProductosSalida({ soloActivos: true }), [],
  );
  const { datos: productos, cargando, error, recargar } = usePeticion(consultarProductos, []);

  const consultarCierre = useCallback(async (): Promise<DatosSede | null> => {
    if (!cafeteriaId) return null;
    const cierre = await getCierre(fecha, cafeteriaId);
    return cierre && {
      cerrado: true,
      responsableNombre: cierre.responsableNombre,
      lineas: cierre.lineas,
    };
  }, [fecha, cafeteriaId]);

  const { datos: guardado } = usePeticion(consultarCierre, [fecha, cafeteriaId, version]);

  return (
    <>
      <main className="contenedor pagina">
        <BarraVolver volver={{ a: '/salidas', texto: '← Control de salidas' }} />

        <section className="encabezado-reserva">
          <div className="encabezado-reserva__texto">
            <div className="encabezado-reserva__linea">
              <h1 className="encabezado-reserva__titulo">
                {cafeteria?.nombre ?? 'Cafetería'}
              </h1>
              <p className="encabezado-reserva__meta">{formatearFechaLarga(fecha)}</p>
            </div>
          </div>

          <div className="campo filtros__campo">
            <label className="campo__etiqueta" htmlFor="fecha-cierre">Día</label>
            <input
              id="fecha-cierre"
              className="campo__control"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
        </section>

        {errorSede && (
          <BloqueEstado tipo="error" titulo="No se pudo cargar la cafetería" detalle={errorSede} />
        )}

        {cargando && <BloqueEstado tipo="cargando" titulo="Cargando productos…" />}

        {error && (
          <BloqueEstado
            tipo="error"
            titulo="No se pudieron cargar los productos"
            detalle={error}
            accion={{ texto: 'Reintentar', alPulsar: recargar }}
          />
        )}

        {productos?.length === 0 && (
          <BloqueEstado
            tipo="vacio"
            titulo="No hay productos que controlar"
            detalle="Administración los da de alta en «Productos»."
          />
        )}

        {cafeteria && productos && productos.length > 0 && (
          <CierreSede
            fecha={fecha}
            cafeteria={cafeteria}
            productos={productos}
            datos={guardado ?? null}
            alGuardar={() => setVersion((n) => n + 1)}
          />
        )}
      </main>

      <Pie />
    </>
  );
}
