/**
 * Vista 1 · Consumo comparado por cafetería.
 *
 * Pregunta: ¿qué y cuánto pide cada cafetería, y hay asimetrías que no tengan
 * explicación obvia?
 *
 * La pieza central es la tabla cruzada producto × cafetería, no la gráfica.
 * Es deliberado: una asimetría se ve comparando la fila de un producto entre
 * columnas, y para eso hace falta el número —«12 aquí, 2 allá»— no la altura
 * de una barra. La gráfica está para que salte a la vista cuál es el caso
 * extremo antes de ponerse a leer.
 *
 * La columna «reparto» es la que de verdad contesta la pregunta: dice qué
 * porcentaje del total de ese producto se lleva cada sede. Sin ella, una sede
 * que pide más de todo parecería anómala en todas las filas cuando lo único
 * que pasa es que es más grande.
 */

import { useMemo } from 'react';
import { GraficaBarrasAgrupadas, colorSerie } from '../../graficas/index.js';
import type { Analisis } from '../../../servicios/analisisServicio.js';
import {
  AvisoUnidades, Bloque, Pregunta, SelectorMedida, Tabla, Vacio,
  numero, type Medida,
} from './comunes.js';

/** Cuántos productos entran en la gráfica antes de que sea un peine. */
const SERIES_GRAFICA = 5;

export function VistaSedes({ datos, medida, alCambiarMedida }: {
  datos: Analisis; medida: Medida; alCambiarMedida: (m: Medida) => void;
}) {
  const { porSedeProducto, porSedeCategoria, resumen } = datos;

  /** Las sedes que aparecen, en orden estable por nombre. */
  const sedes = useMemo(() => {
    const vistas = new Map<string, string>();
    for (const f of porSedeProducto) vistas.set(f.cafeteriaId, f.cafeteriaNombre);
    for (const f of porSedeCategoria) vistas.set(f.cafeteriaId, f.cafeteriaNombre);
    return [...vistas].map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [porSedeProducto, porSedeCategoria]);

  /** La tabla cruzada: una fila por producto, una columna por sede. */
  const filas = useMemo(() => {
    const porProducto = new Map<number, {
      nombre: string; unidad: string;
      porSede: Map<string, number>; total: number;
    }>();

    for (const f of porSedeProducto) {
      const valor = medida === 'cantidad' ? f.cantidad : f.lineas;
      const fila = porProducto.get(f.productoId) ?? {
        nombre: f.productoNombre, unidad: f.unidad, porSede: new Map(), total: 0,
      };
      fila.porSede.set(f.cafeteriaId, (fila.porSede.get(f.cafeteriaId) ?? 0) + valor);
      fila.total += valor;
      porProducto.set(f.productoId, fila);
    }

    return [...porProducto].map(([id, f]) => ({ id, ...f }))
      .sort((a, b) => b.total - a.total);
  }, [porSedeProducto, medida]);

  /* La gráfica compara SEDES, así que las sedes son los grupos y los
   * productos las series. Solo los primeros: con quince productos serían
   * quince barritas de dos píxeles por cafetería. */
  const productosGrafica = filas.slice(0, SERIES_GRAFICA);
  const series = productosGrafica.map((f, i) => ({ nombre: f.nombre, color: colorSerie(i) }));
  const grupos = sedes.map((sede) => ({
    etiqueta: sede.nombre,
    valores: productosGrafica.map((f) => f.porSede.get(sede.id) ?? 0),
  }));

  const totalesSede = sedes.map((sede) => ({
    ...sede,
    valor: filas.reduce((suma, f) => suma + (f.porSede.get(sede.id) ?? 0), 0),
  }));
  const totalGeneral = totalesSede.reduce((s, t) => s + t.valor, 0);

  return (
    <>
      <Pregunta>
        ¿Qué y cuánto pide cada cafetería, y hay asimetrías que no tengan
        explicación obvia?
      </Pregunta>

      {sedes.length === 0 ? (
        <Vacio>Ninguna cafetería tiene pedidos con estos filtros.</Vacio>
      ) : (
        <>
          <Bloque
            titulo={`Los ${productosGrafica.length} productos de más peso, por cafetería`}
            nota="Cada grupo es una cafetería. Las barras de dentro son los productos
                  que más se piden en el conjunto filtrado, siempre en el mismo orden
                  y con el mismo color en todas las cafeterías."
            acciones={<SelectorMedida id="medida-sedes" valor={medida} alCambiar={alCambiarMedida} />}
          >
            <AvisoUnidades unidades={resumen.unidades} medida={medida} />
            <GraficaBarrasAgrupadas
              grupos={grupos} series={series}
              titulo="Productos más pedidos por cafetería"
            />
          </Bloque>

          <Bloque
            titulo="Por categoría"
            nota="El reparto por casilla del FBE.04, que es lo que marca el proveedor."
          >
            <Tabla minimo="520px">
              <thead>
                <tr>
                  <th scope="col">Cafetería</th>
                  <th scope="col">Categoría</th>
                  <th scope="col" className="tabla__numero">Pedidos</th>
                  <th scope="col" className="tabla__numero">Renglones</th>
                </tr>
              </thead>
              <tbody>
                {porSedeCategoria.map((f) => (
                  <tr key={`${f.cafeteriaId}-${f.categoria}`}>
                    <th scope="row" className="tabla__nombre">{f.cafeteriaNombre}</th>
                    <td>{f.categoria}</td>
                    <td className="tabla__numero">{numero(f.pedidos)}</td>
                    <td className="tabla__numero">{numero(f.lineas)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </Bloque>
          <Bloque
            titulo="Producto × cafetería" ancho="completo"
            nota={medida === 'cantidad'
              ? 'Cantidad pedida en el rango. La unidad va en su columna: cada fila es un producto, así que dentro de la fila las cifras sí son comparables.'
              : 'Número de renglones de pedido. No tiene unidad, así que se puede comparar entre productos.'}
          >
            {filas.length === 0 ? (
              <Vacio>No hay renglones con estos filtros.</Vacio>
            ) : (
              <Tabla minimo={`${420 + sedes.length * 120}px`} alto="26rem">
                <thead>
                  <tr>
                    <th scope="col">Producto</th>
                    {medida === 'cantidad' && <th scope="col">Unidad</th>}
                    {sedes.map((s) => (
                      <th key={s.id} scope="col" className="tabla__numero">{s.nombre}</th>
                    ))}
                    <th scope="col" className="tabla__numero">Total</th>
                    <th scope="col" className="tabla__numero">Reparto</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((fila) => (
                    <tr key={fila.id}>
                      <th scope="row" className="tabla__nombre">{fila.nombre}</th>
                      {medida === 'cantidad' && <td className="tabla__fecha">{fila.unidad}</td>}
                      {sedes.map((s) => {
                        const valor = fila.porSede.get(s.id) ?? 0;
                        return (
                          <td key={s.id} className="tabla__numero">
                            {valor === 0 ? <span className="tabla__cero">—</span> : numero(valor)}
                          </td>
                        );
                      })}
                      <td className="tabla__numero"><strong>{numero(fila.total)}</strong></td>
                      <td className="tabla__numero tabla__fecha">
                        {/* El reparto de ESTA fila entre sedes, que es donde se
                            ve la asimetría: «el 80 % lo pide una sola». */}
                        {sedes.map((s) => {
                          const valor = fila.porSede.get(s.id) ?? 0;
                          return valor > 0 ? Math.round((valor / fila.total) * 100) : null;
                        }).filter((p) => p !== null).join(' / ')} %
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    {medida === 'cantidad' && <td />}
                    {totalesSede.map((t) => (
                      <td key={t.id} className="tabla__numero"><strong>{numero(t.valor)}</strong></td>
                    ))}
                    <td className="tabla__numero"><strong>{numero(totalGeneral)}</strong></td>
                    <td />
                  </tr>
                </tfoot>
              </Tabla>
            )}
            {medida === 'cantidad' && resumen.unidades > 1 && (
              <p className="tabla__nota">
                La fila «Total» suma productos de unidades distintas: úsala solo
                para ver el peso relativo de cada sede, no como una magnitud.
              </p>
            )}
          </Bloque>

        </>
      )}
    </>
  );
}
