/**
 * La pestaña «Detallado del día»: el consolidado diario de diferencias, con
 * el desglose por cafetería a un clic.
 *
 * Una fila por DÍA con las cifras de todas las sedes juntas —un solo dato por
 * día, que es la pregunta que se hace mirando un histórico— y el chevron
 * despliega debajo las cafeterías de ese día. Es el patrón master-detail: la
 * jerarquía tiene dos niveles y se comparan valores entre ellos en la misma
 * rejilla, que es justo cuando conviene desplegar en línea en vez de mandar a
 * otra pantalla.
 *
 * ── Por qué no hay gráficas aquí ───────────────────────────────────────────
 *
 * Las hubo, y sobraban: esta pestaña es la tabla del histórico. Las gráficas
 * —y el detalle por producto— son de la pestaña «Análisis», que se hará
 * aparte. Mezclarlas dejaba dos herramientas discutiendo en la misma pantalla.
 *
 * ── Los viajes al servidor ─────────────────────────────────────────────────
 *
 * Las filas salen de `salidas.dias`, que ya devuelve el día agregado por el
 * servidor. El desglose de una sede NO se pide hasta que alguien despliega ese
 * día, y se guarda: desplegar el mismo día dos veces no cuesta un viaje
 * segundo. Traerlo todo por adelantado habría descargado el detalle de seis
 * meses para enseñar tres días.
 *
 * ── Las sedes que no cerraron salen igual ──────────────────────────────────
 *
 * `salidas.buscar` solo devuelve los cierres que existen, así que el desglose
 * se cruza con el catálogo de cafeterías: la que falta se enseña con su nombre
 * y un «sin cerrar». Es el mismo criterio de siempre — el hueco ES el
 * hallazgo, y aquí es además lo que explica el «3 de 4» de la fila de arriba.
 *
 * Al mostrador no se le ofrece desplegar: su fila YA es su sede, y un chevron
 * que abre una sola línea repetida no añade nada.
 */

import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  buscarCierres, getDiasCierre, type FichaCierre,
} from '../../servicios/salidasServicio.js';
import { getCafeterias } from '../../servicios/cafeteriasServicio.js';
import { usePeticion } from '../../utiles/usePeticion.js';
import { BloqueEstado } from '../BloqueEstado.js';
import { formatearFechaLarga, nombreDiaCorto } from '../../utiles/fechas.js';

/** El signo delante, siempre: el color no es el único que lo dice. */
const conSigno = (n: number): string => (n > 0 ? `+${n}` : String(n));

export function VistaDetallado({ desde, hasta, suSede }: {
  desde: string;
  hasta: string;
  /** La sede del mostrador, o `null` para quien las ve todas. */
  suSede: string | null;
}) {
  const navegar = useNavigate();

  const consultar = useCallback(
    () => getDiasCierre({ desde, hasta }), [desde, hasta],
  );
  const { datos, cargando, error, recargar } = usePeticion(consultar, [desde, hasta]);

  /* El catálogo, para poder nombrar a la sede que NO cerró: el desglose solo
     trae las que sí. Al mostrador no le hace falta — no despliega. */
  const consultarSedes = useCallback(
    () => (suSede ? Promise.resolve([]) : getCafeterias()), [suSede],
  );
  const { datos: sedes } = usePeticion(consultarSedes, [suSede]);

  /** Qué días están desplegados. */
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  /** El desglose ya traído, por fecha. Desplegar dos veces no cuesta dos viajes. */
  const [desglose, setDesglose] = useState<Record<string, FichaCierre[]>>({});
  const [cargandoDia, setCargandoDia] = useState<string | null>(null);

  const dias = datos ?? [];
  const puedeDesplegar = !suSede;

  async function alternar(fecha: string) {
    setAbiertos((antes) => {
      const nuevos = new Set(antes);
      if (nuevos.has(fecha)) nuevos.delete(fecha); else nuevos.add(fecha);
      return nuevos;
    });

    if (desglose[fecha]) return;
    setCargandoDia(fecha);
    try {
      const fichas = await buscarCierres({ desde: fecha, hasta: fecha });
      setDesglose((antes) => ({ ...antes, [fecha]: fichas }));
    } finally {
      setCargandoDia(null);
    }
  }

  /** Las filas del desglose: las que cerraron, y detrás las que no. */
  function desgloseDe(fecha: string) {
    const fichas = desglose[fecha] ?? [];
    const cerradas = new Set(fichas.map((f) => f.cafeteriaId));
    const faltan = (sedes ?? []).filter((c) => !cerradas.has(c.id));
    return { fichas, faltan };
  }

  /** Cuántas columnas ocupa el desglose, para el `colSpan` del aviso. */
  const columnas = puedeDesplegar ? 6 : 5;

  return (
    <>
      {cargando && <BloqueEstado tipo="cargando" titulo="Cargando cierres…" />}

      {error && (
        <BloqueEstado
          tipo="error"
          titulo="No se pudo cargar el historial"
          detalle={error}
          accion={{ texto: 'Reintentar', alPulsar: recargar }}
        />
      )}

      {datos && dias.length === 0 && (
        <BloqueEstado
          tipo="vacio"
          titulo="No hay cierres en ese periodo"
          detalle="Prueba con un periodo más amplio, o registra el cierre desde el módulo."
        />
      )}

      {dias.length > 0 && (
        <div className="tabla-envoltorio bloque-tabla">
          <table className="tabla">
            <caption className="tabla__caption">
              Un día por fila, con las cifras de todas las sedes juntas.
              {puedeDesplegar && ' Despliega un día para ver cafetería por cafetería.'}
            </caption>

            <thead>
              <tr>
                <th scope="col">Día</th>
                {/* Solo tiene sentido con varias sedes: para el mostrador
                    sería siempre «1 de 1». */}
                {puedeDesplegar && <th scope="col">Cerradas</th>}
                <th scope="col">Ventas</th>
                <th scope="col">Producción</th>
                <th scope="col">Diferencia</th>
                <th scope="col"><span className="visualmente-oculto">Acciones</span></th>
              </tr>
            </thead>

            {/* Un `<tbody>` por día: la fila del día y, si está desplegado, las
                de sus sedes. Agruparlas así es lo que deja apuntar
                `aria-controls` al bloque entero. */}
            {dias.map((d) => {
              const abierto = abiertos.has(d.fecha);
              const completo = d.cerradas >= d.sedes;
              const { fichas, faltan } = desgloseDe(d.fecha);
              const panel = `dia-${d.fecha}`;

              return (
                <tbody key={d.fecha} id={panel}>
                  <tr
                    className={puedeDesplegar ? 'tabla__fila--pulsable' : undefined}
                    onClick={puedeDesplegar ? () => void alternar(d.fecha) : undefined}
                  >
                    <td className="tabla__nombre">
                      {puedeDesplegar && (
                        <button
                          type="button"
                          className="tabla__desplegar"
                          aria-expanded={abierto}
                          aria-controls={panel}
                          /* El clic de la fila ya alterna; sin frenarlo aquí se
                             llamaría dos veces al pulsar el chevron. */
                          onClick={(e) => { e.stopPropagation(); void alternar(d.fecha); }}
                        >
                          <span aria-hidden="true">{abierto ? '▾' : '▸'}</span>
                          <span className="visualmente-oculto">
                            {abierto ? 'Plegar' : 'Desplegar'} el detalle del día
                          </span>
                        </button>
                      )}
                      {' '}
                      {nombreDiaCorto(d.fecha)}
                      {' '}
                      {formatearFechaLarga(d.fecha).replace(/^[^,]+,\s*/, '')}
                    </td>

                    {puedeDesplegar && (
                      <td className="tabla__numero">
                        {d.cerradas} de {d.sedes}
                        {!completo && (
                          <span className="tabla__detalle salidas__descuadre">incompleto</span>
                        )}
                      </td>
                    )}

                    <td className="tabla__numero">{d.totalVentas}</td>
                    <td className="tabla__numero">{d.totalProduccion}</td>
                    <td className={`tabla__numero${d.totalDiferencia ? ' salidas__descuadre' : ''}`}>
                      {conSigno(d.totalDiferencia)}
                    </td>

                    <td className="tabla__acciones">
                      <button
                        type="button"
                        className="boton boton--sm boton--secundario"
                        onClick={(e) => { e.stopPropagation(); navegar(`/salidas/dia/${d.fecha}`); }}
                      >
                        Ver el día
                      </button>
                    </td>
                  </tr>

                  {abierto && cargandoDia === d.fecha && !desglose[d.fecha] && (
                    <tr className="tabla__fila--hija">
                      <td colSpan={columnas}>Cargando el detalle…</td>
                    </tr>
                  )}

                  {abierto && fichas.map((f) => (
                    <tr key={f.cafeteriaId} className="tabla__fila--hija">
                      <td>{f.cafeteriaNombre}</td>
                      {puedeDesplegar && <td />}
                      <td className="tabla__numero">{f.totalVentas}</td>
                      <td className="tabla__numero">{f.totalProduccion}</td>
                      <td className={`tabla__numero${f.totalDiferencia ? ' salidas__descuadre' : ''}`}>
                        {conSigno(f.totalDiferencia)}
                      </td>
                      <td />
                    </tr>
                  ))}

                  {/* Las que no cerraron, al final y apagadas: el hueco es el
                      hallazgo, y es lo que explica el «3 de 4» de arriba. */}
                  {abierto && faltan.map((c) => (
                    <tr key={c.id} className="tabla__fila--hija tabla__fila--apagada">
                      <td className="tabla__nombre">{c.nombre}</td>
                      {puedeDesplegar && <td />}
                      <td className="tabla__numero">—</td>
                      <td className="tabla__numero">—</td>
                      <td className="tabla__numero">
                        <span className="tabla__detalle">sin cerrar</span>
                      </td>
                      <td />
                    </tr>
                  ))}
                </tbody>
              );
            })}

            <tfoot>
              <tr>
                <th scope="row">Total del periodo</th>
                {puedeDesplegar && <td />}
                <td className="tabla__numero">
                  {dias.reduce((n, d) => n + d.totalVentas, 0)}
                </td>
                <td className="tabla__numero">
                  {dias.reduce((n, d) => n + d.totalProduccion, 0)}
                </td>
                <td className={`tabla__numero${
                  dias.reduce((n, d) => n + d.totalDiferencia, 0) ? ' salidas__descuadre' : ''}`}>
                  {conSigno(dias.reduce((n, d) => n + d.totalDiferencia, 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
