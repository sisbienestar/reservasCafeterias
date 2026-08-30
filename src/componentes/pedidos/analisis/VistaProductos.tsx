/**
 * Vista 3 · Productos más pedidos y productos en desuso.
 *
 * Pregunta: ¿en qué productos vale la pena poner atención, y cuáles ya no se
 * piden y podrían salir del catálogo activo?
 *
 * Dos tablas que miran en direcciones opuestas, y con un alcance distinto a
 * propósito:
 *
 *   · El TOP mira el rango filtrado. «Lo que más se pide este semestre.»
 *   · El DESUSO mira TODO el histórico, no el rango. La pregunta «¿hace
 *     cuánto que no se pide esto?» no depende de la ventana que se esté
 *     mirando, y contestarla con el rango sacaría del catálogo cualquier
 *     producto solo por haber elegido un mes en el que no tocaba pedirlo.
 *     Es la diferencia entre «no se pidió en marzo» y «no se pide desde 2025».
 *
 * Las barras del top son de serie única —una magnitud, un color— y van
 * horizontales porque los nombres de producto son largos.
 */

import { GraficaBarras } from '../../graficas/index.js';
import type { Analisis } from '../../../servicios/analisisServicio.js';
import { Bloque, Pregunta, Tabla, Vacio, numero } from './comunes.js';

export function VistaProductos({ datos, top, alCambiarTop, diasDesuso, alCambiarDesuso }: {
  datos: Analisis;
  top: number;
  alCambiarTop: (n: number) => void;
  diasDesuso: number;
  alCambiarDesuso: (n: number) => void;
}) {
  const { topProductos, enDesuso } = datos;

  /*
   * Las barras van con `lineas` —en cuántos pedidos apareció— y no con la
   * cantidad: la cantidad de productos con unidades distintas no se puede
   * poner en el mismo eje, y «en cuántos pedidos entró» es además la mejor
   * medida de «a qué producto hay que prestarle atención». La cantidad, con
   * su unidad al lado, está en la tabla.
   * El servidor ordena por esa MISMA medida, no por la cantidad: si la barra
   * midiera una cosa y el orden fuera otro, la gráfica subiría y bajaría sin
   * motivo visible. Ver el comentario de `top_productos` en el SQL.
   */
  const barras = topProductos.map((p) => ({ etiqueta: p.productoNombre, valor: p.lineas }));

  const nunca = enDesuso.filter((p) => p.ultima === null).length;

  return (
    <>
      <Pregunta>
        ¿En qué productos vale la pena poner atención, y cuáles ya no se piden
        y podrían salir del catálogo activo?
      </Pregunta>

      <Bloque
        titulo={`Los ${topProductos.length} productos más pedidos`} ancho="completo"
        nota="Ordenados por renglones: en cuántos renglones de pedido apareció el
              producto. Es una medida sin unidad, así que se puede comparar entre
              productos; la cantidad mezcla unidades —911 unidades y 212 libras no
              se ordenan en la misma lista— y por eso va en la tabla, con la suya
              al lado."
        acciones={
          <div className="campo campo--enlinea">
            <label className="campo__etiqueta" htmlFor="top-n">Mostrar</label>
            <select id="top-n" className="campo__control campo__control--sm" value={top}
                    onChange={(e) => alCambiarTop(Number(e.target.value))}>
              {[10, 20, 30, 50].map((n) => <option key={n} value={n}>Top {n}</option>)}
            </select>
          </div>
        }
      >
        {topProductos.length === 0 ? (
          <Vacio>No hay pedidos con estos filtros.</Vacio>
        ) : (
          <>
            <GraficaBarras datos={barras} titulo="Productos más pedidos" />
            <Tabla minimo="760px">
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col">Proveedor</th>
                  <th scope="col" className="tabla__numero">Cantidad</th>
                  <th scope="col">Unidad</th>
                  <th scope="col" className="tabla__numero">Renglones</th>
                  <th scope="col" className="tabla__numero">Pedidos</th>
                  <th scope="col">Último</th>
                </tr>
              </thead>
              <tbody>
                {topProductos.map((p) => (
                  <tr key={p.productoId}>
                    <th scope="row" className="tabla__nombre">{p.productoNombre}</th>
                    <td>{p.proveedorNombre}</td>
                    <td className="tabla__numero"><strong>{numero(p.cantidad)}</strong></td>
                    <td className="tabla__fecha">{p.unidad}</td>
                    <td className="tabla__numero">{numero(p.lineas)}</td>
                    <td className="tabla__numero">{numero(p.pedidos)}</td>
                    <td className="tabla__fecha">{p.ultima ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
          </>
        )}
      </Bloque>

      {/* Completo por lo mismo que el de arriba: solo en su fila. */}
      <Bloque
        titulo="Sin pedir: candidatos a revisar" ancho="completo"
        nota={
          <>
            Productos <strong>activos</strong> del catálogo que no aparecen en ningún
            pedido confirmado desde hace más de {numero(diasDesuso)} días. Se mira{' '}
            <strong>todo el histórico</strong>, no el rango de arriba: la antigüedad de
            un producto no depende de qué ventana se esté mirando. El filtro de
            proveedor y el de categoría sí se aplican.
          </>
        }
        acciones={
          <div className="campo campo--enlinea">
            <label className="campo__etiqueta" htmlFor="desuso">Sin pedir desde hace</label>
            <select id="desuso" className="campo__control campo__control--sm" value={diasDesuso}
                    onChange={(e) => alCambiarDesuso(Number(e.target.value))}>
              <option value={30}>1 mes</option>
              <option value={60}>2 meses</option>
              <option value={90}>3 meses</option>
              <option value={180}>6 meses</option>
              <option value={365}>1 año</option>
            </select>
          </div>
        }
      >
        {enDesuso.length === 0 ? (
          <Vacio>
            Todos los productos activos se han pedido en los últimos {numero(diasDesuso)} días.
          </Vacio>
        ) : (
          <>
            <Tabla minimo="680px" alto="26rem">
              <thead>
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col">Proveedor</th>
                  <th scope="col">Unidad</th>
                  <th scope="col">Última vez</th>
                  <th scope="col" className="tabla__numero">Días</th>
                </tr>
              </thead>
              <tbody>
                {enDesuso.map((p) => (
                  <tr key={p.productoId} className={p.ultima === null ? 'tabla__fila--apagada' : undefined}>
                    <th scope="row" className="tabla__nombre">{p.productoNombre}</th>
                    <td>{p.proveedorNombre}</td>
                    <td className="tabla__fecha">{p.unidad}</td>
                    <td className="tabla__fecha">
                      {p.ultima ?? <span className="marca-estado marca-estado--cancelada">Nunca</span>}
                    </td>
                    <td className="tabla__numero">{p.dias === null ? '—' : numero(p.dias)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
            <p className="tabla__nota">
              {nunca > 0 && (
                <>
                  {nunca === 1 ? 'Uno de ellos no se ha pedido nunca' : `${nunca} de ellos no se han pedido nunca`}
                  {' '}desde que existe el registro.{' '}
                </>
              )}
              Archivar un producto se hace en la pestaña <strong>Productos</strong>, y no
              borra nada: los pedidos que lo llevan siguen imprimiéndose igual.
            </p>
          </>
        )}
      </Bloque>
    </>
  );
}
