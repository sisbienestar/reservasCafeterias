/**
 * Vista 2 · Tendencia de pedidos en el tiempo por proveedor.
 *
 * Pregunta: ¿el volumen pedido a cada proveedor sube, baja o se mantiene?
 *
 * Una línea por proveedor sobre un eje común. Aquí el color SÍ es categórico
 * —lo que hay que distinguir son los proveedores entre sí— y por eso lleva
 * leyenda; el color se asigna por la posición del proveedor en la lista
 * ordenada por volumen del periodo, que es estable mientras no cambien los
 * filtros.
 *
 * La variación contra el periodo anterior compara con la ventana
 * inmediatamente previa del MISMO largo: si se miran 90 días, se compara con
 * los 90 anteriores. Un mes contra el mes anterior sin igualar los largos
 * haría que febrero pareciera siempre una caída.
 *
 * Cuidado con leer la última columna de la gráfica: si el rango termina a
 * mitad de mes, ese punto es un mes incompleto y siempre parecerá un desplome.
 * La nota del bloque lo advierte.
 */

import { useMemo } from 'react';
import { GraficaLineas, colorSerie, MAX_SERIES } from '../../graficas/index.js';
import type { Analisis, Granularidad } from '../../../servicios/analisisServicio.js';
import {
  AvisoUnidades, Bloque, Pregunta, SelectorMedida, Tabla, Vacio,
  numero, rotularPeriodo, variacion, type Medida,
} from './comunes.js';

/** Por debajo de este rango tiene sentido ofrecer la semana. */
export const DIAS_PARA_SEMANA = 120;

export function VistaTendencia({ datos, medida, alCambiarMedida, alCambiarGranularidad }: {
  datos: Analisis;
  medida: Medida;
  alCambiarMedida: (m: Medida) => void;
  alCambiarGranularidad: (g: Granularidad) => void;
}) {
  const { tendencia, tendenciaResumen, granularidad, resumen, periodoPrevio } = datos;

  const valor = (f: { cantidad: number; lineas: number; pedidos: number }) => (
    medida === 'cantidad' ? f.cantidad : medida === 'lineas' ? f.lineas : f.pedidos
  );

  /** Los periodos del eje, ordenados y sin repetir. */
  const periodos = useMemo(
    () => [...new Set(tendencia.map((p) => p.periodo))].sort(),
    [tendencia],
  );

  /*
   * Una serie por proveedor, alineada con `periodos`. Un periodo sin pedidos
   * va como `null` y parte la línea: dibujarlo como cero diría que se pidió
   * cero, y lo que pasó es que no hubo pedido — que en un histórico con meses
   * de vacaciones es una diferencia real.
   */
  const series = useMemo(() => {
    const porProveedor = new Map<string, { nombre: string; total: number; puntos: Map<string, number> }>();
    for (const p of tendencia) {
      const s = porProveedor.get(p.proveedorId)
        ?? { nombre: p.proveedorNombre, total: 0, puntos: new Map() };
      s.puntos.set(p.periodo, valor(p));
      s.total += valor(p);
      porProveedor.set(p.proveedorId, s);
    }

    const ordenados = [...porProveedor].sort((a, b) => b[1].total - a[1].total);
    // Pasados los ocho tonos no se inventa color: se recorta la lista y se
    // dice en la nota. Un noveno tono generado sería indistinguible.
    return ordenados.slice(0, MAX_SERIES).map(([, s], i) => ({
      nombre: s.nombre,
      color: colorSerie(i),
      puntos: periodos.map((periodo) => ({
        etiqueta: periodo,
        valor: s.puntos.has(periodo) ? s.puntos.get(periodo)! : null,
      })),
    }));
  }, [tendencia, periodos, medida]);

  const proveedoresDeMas = new Set(tendencia.map((p) => p.proveedorId)).size - series.length;
  const puedeSemana = datos.dias <= DIAS_PARA_SEMANA;

  return (
    <>
      <Pregunta>
        ¿El volumen pedido a cada proveedor sube, baja o se mantiene estable?
      </Pregunta>

      {periodos.length === 0 ? (
        <Vacio>No hay pedidos con estos filtros.</Vacio>
      ) : (
        <>
          <Bloque
            titulo={`Evolución por proveedor, por ${granularidad}`} ancho="completo"
            nota={
              <>
                Cada línea es un proveedor. Un tramo cortado quiere decir que ese{' '}
                {granularidad} no hubo ningún pedido, que no es lo mismo que pedir cero.
                {' '}Si el rango empieza o acaba a mitad de {granularidad}, el primer y
                el último punto son tramos incompletos y caen por eso, no por una bajada real.
                {proveedoresDeMas > 0 && ` Se dibujan los ${series.length} de más volumen; quedan ${proveedoresDeMas} fuera de la gráfica, pero están en la tabla.`}
              </>
            }
            acciones={
              <>
                <div className="campo campo--enlinea">
                  <label className="campo__etiqueta" htmlFor="granularidad">Agrupar por</label>
                  <select
                    id="granularidad" className="campo__control campo__control--sm"
                    value={granularidad} disabled={!puedeSemana}
                    onChange={(e) => alCambiarGranularidad(e.target.value as Granularidad)}
                  >
                    <option value="mes">Mes</option>
                    <option value="semana">Semana</option>
                  </select>
                </div>
                <SelectorMedida id="medida-tendencia" valor={medida} alCambiar={alCambiarMedida} />
              </>
            }
          >
            {!puedeSemana && (
              <p className="tabla__nota">
                La vista por semana se ofrece en rangos de hasta {DIAS_PARA_SEMANA} días.
                Este tiene {numero(datos.dias)}: por semana serían más columnas de las
                que caben en el eje.
              </p>
            )}
            <AvisoUnidades unidades={resumen.unidades} medida={medida} />
            <GraficaLineas
              series={series}
              periodos={periodos.map((p) => rotularPeriodo(p, granularidad))}
              titulo="Volumen pedido por proveedor a lo largo del tiempo"
            />
          </Bloque>

          {/* Completo aunque sea una tabla: es el único bloque de su fila, y a
              media rejilla dejaba vacía la otra media pantalla. */}
          <Bloque
            titulo="Total del periodo y variación" ancho="completo"
            nota={`Se compara con los ${numero(datos.dias)} días inmediatamente
                   anteriores (${periodoPrevio.desde} a ${periodoPrevio.hasta}), para que
                   las dos ventanas tengan el mismo largo.`}
          >
            <Tabla minimo="720px">
              <thead>
                <tr>
                  <th scope="col">Proveedor</th>
                  <th scope="col" className="tabla__numero">Pedidos</th>
                  <th scope="col" className="tabla__numero">Renglones</th>
                  <th scope="col" className="tabla__numero">Cantidad</th>
                  <th scope="col" className="tabla__numero">Cantidad anterior</th>
                  <th scope="col" className="tabla__numero">Variación</th>
                </tr>
              </thead>
              <tbody>
                {tendenciaResumen.map((f) => (
                  <tr key={f.proveedorId}>
                    <th scope="row" className="tabla__nombre">{f.proveedorNombre}</th>
                    <td className="tabla__numero">{numero(f.pedidos)}</td>
                    <td className="tabla__numero">{numero(f.lineas)}</td>
                    <td className="tabla__numero">{numero(f.cantidad)}</td>
                    <td className="tabla__numero tabla__fecha">
                      {f.cantidadPrevia > 0 ? numero(f.cantidadPrevia) : '—'}
                    </td>
                    <td className="tabla__numero">
                      {/* El signo va en el texto, no solo en el color: una
                          flecha verde o roja sola no la lee todo el mundo. */}
                      {f.variacion === null ? (
                        <span className="tabla__cero" title="No hubo pedidos en el periodo anterior">
                          sin base
                        </span>
                      ) : (
                        <span className={f.variacion >= 0 ? 'variacion variacion--sube' : 'variacion variacion--baja'}>
                          {variacion(f.variacion)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
            <p className="tabla__nota">
              «Sin base» quiere decir que en el periodo anterior no hubo ni un pedido
              de ese proveedor: no hay nada contra lo que medir el cambio.
            </p>
          </Bloque>
        </>
      )}
    </>
  );
}
