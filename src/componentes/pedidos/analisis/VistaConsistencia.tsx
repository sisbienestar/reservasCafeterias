/**
 * Vista 6 · Consistencia del pedido.
 *
 * Pregunta: ¿qué productos se piden de forma tan estable que se les podría
 * ofrecer una plantilla pre-rellenada, y cuáles varían tanto que necesitan
 * revisión caso a caso?
 *
 * La medida es el COEFICIENTE DE VARIACIÓN: la desviación típica dividida
 * entre la media. La desviación a secas no sirve para ordenar una tabla que
 * mezcla productos de escalas distintas —3 de desviación es enorme en algo
 * que se pide de a 2 y despreciable en algo que se pide de a 200—; el
 * coeficiente no tiene unidad y por eso sí se puede comparar entre filas.
 *
 * El corte entre «estable» y «variable» está en `UMBRAL_ESTABLE`, y es una
 * elección, no una verdad. Por eso la tabla enseña también el coeficiente, el
 * mínimo y el máximo: quien mire puede no estar de acuerdo con el corte y
 * juzgar por los números. Y por eso la etiqueta lleva TEXTO y no solo color.
 *
 * Solo entran los pares producto × cafetería con al menos DOS pedidos: con
 * uno solo no hay variabilidad que medir, y una tabla llena de «0 % de
 * variación» calculados sobre una única observación diría que todo es
 * estable, que es justo lo contrario de lo que pasa.
 */

import { useMemo, useState } from 'react';
import type { Analisis } from '../../../servicios/analisisServicio.js';
import { UMBRAL_ESTABLE } from '../../../servicios/analisisServicio.js';
import { Bloque, Pregunta, Tabla, Vacio, numero } from './comunes.js';

type Orden = 'variables' | 'estables' | 'frecuencia';

const ROTULO_ORDEN: Record<Orden, string> = {
  variables: 'Los más variables primero',
  estables: 'Los más estables primero',
  frecuencia: 'Los más pedidos primero',
};

export function VistaConsistencia({ datos }: { datos: Analisis }) {
  const [orden, setOrden] = useState<Orden>('variables');
  const [soloEstables, setSoloEstables] = useState(false);

  const filas = useMemo(() => {
    const lista = soloEstables
      ? datos.consistencia.filter((f) => f.estable)
      : datos.consistencia;

    return [...lista].sort((a, b) => {
      if (orden === 'frecuencia') return b.veces - a.veces;
      return orden === 'variables'
        ? b.coeficiente - a.coeficiente
        : a.coeficiente - b.coeficiente;
    });
  }, [datos.consistencia, orden, soloEstables]);

  const estables = datos.consistencia.filter((f) => f.estable).length;

  return (
    <>
      <Pregunta>
        ¿Qué productos se piden de forma tan estable que se les podría ofrecer
        una plantilla de pedido base pre-rellenada, y cuáles varían tanto que
        necesitan revisión caso a caso?
      </Pregunta>

      {datos.consistencia.length === 0 ? (
        <Vacio>
          No hay ningún producto pedido dos veces o más en la misma cafetería con
          estos filtros. Sin al menos dos pedidos no hay variabilidad que medir.
        </Vacio>
      ) : (
        <Bloque
          titulo="Estabilidad por producto y cafetería" ancho="completo"
          nota={
            <>
              <strong>{estables}</strong> de {datos.consistencia.length} pares
              producto × cafetería se piden de forma estable (variación de hasta{' '}
              {Math.round(UMBRAL_ESTABLE * 100)} % sobre su media): son los candidatos a
              una plantilla pre-rellenada con su cantidad habitual. El resto conviene
              revisarlos pedido a pedido. Solo entran los que tienen dos pedidos o más.
            </>
          }
          acciones={
            <>
              <div className="campo campo--enlinea">
                <label className="campo__etiqueta" htmlFor="orden-consistencia">Ordenar</label>
                <select id="orden-consistencia" className="campo__control campo__control--sm"
                        value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
                  {(Object.keys(ROTULO_ORDEN) as Orden[]).map((o) => (
                    <option key={o} value={o}>{ROTULO_ORDEN[o]}</option>
                  ))}
                </select>
              </div>
              <div className="campo campo--enlinea campo--casilla">
                <input id="solo-estables" type="checkbox" checked={soloEstables}
                       onChange={(e) => setSoloEstables(e.target.checked)} />
                <label className="campo__etiqueta" htmlFor="solo-estables">
                  Solo los estables
                </label>
              </div>
            </>
          }
        >
          {filas.length === 0 ? (
            <Vacio>Ningún par cumple el filtro.</Vacio>
          ) : (
            <Tabla minimo="900px" alto="30rem">
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col">Cafetería</th>
                  <th scope="col" className="tabla__numero">Veces</th>
                  <th scope="col" className="tabla__numero">Promedio</th>
                  <th scope="col">Unidad</th>
                  <th scope="col" className="tabla__numero">Mín. – Máx.</th>
                  <th scope="col" className="tabla__numero">Desviación</th>
                  <th scope="col" className="tabla__numero">Variación</th>
                  <th scope="col">Lectura</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={`${f.productoId}-${f.cafeteriaId}`}>
                    <th scope="row" className="tabla__nombre">{f.productoNombre}</th>
                    <td>{f.cafeteriaNombre}</td>
                    <td className="tabla__numero">{numero(f.veces)}</td>
                    <td className="tabla__numero">
                      <strong>{f.promedio.toLocaleString('es-CO', { maximumFractionDigits: 1 })}</strong>
                    </td>
                    <td className="tabla__fecha">{f.unidad}</td>
                    <td className="tabla__numero tabla__fecha">
                      {numero(f.minimo)} – {numero(f.maximo)}
                    </td>
                    <td className="tabla__numero tabla__fecha">
                      {f.desviacion.toLocaleString('es-CO', { maximumFractionDigits: 1 })}
                    </td>
                    <td className="tabla__numero">
                      {Math.round(f.coeficiente * 100)} %
                    </td>
                    <td>
                      {/* Texto, no solo color: es la misma regla que la marca
                          de estado de las reservas. */}
                      <span className={f.estable
                        ? 'marca-estado marca-estado--activa'
                        : 'marca-estado marca-estado--aviso'}>
                        {f.estable ? 'Estable' : 'Variable'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          )}

          <p className="tabla__nota">
            «Variación» es la desviación típica dividida entre el promedio. No tiene
            unidad, así que se puede comparar entre productos de escalas muy distintas:
            una desviación de 3 es enorme en algo que se pide de a 2 y despreciable en
            algo que se pide de a 200.
          </p>
        </Bloque>
      )}
    </>
  );
}
