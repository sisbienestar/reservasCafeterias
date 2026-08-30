/**
 * Vista 5 · Composición del pedido por categoría.
 *
 * Pregunta: ¿cómo se reparte el pedido entre alimentos y bebidas, aseo y
 * desechables, y ese reparto cambia por cafetería?
 *
 * ── Por qué hay dos anillos y no uno ──────────────────────────────────────
 *
 * Con los datos de hoy la respuesta por categoría es «todo es Alimentos y
 * bebidas»: 355 de los 357 pedidos del histórico llevan esa casilla marcada,
 * porque los almacenes de Aseo y Desechables todavía no tienen pedidos
 * registrados. Un anillo de una sola porción no es una respuesta, es un
 * círculo.
 *
 * Así que la vista enseña el reparto por categoría —que es lo que se pidió, y
 * que empezará a decir algo en cuanto se pidan aseo y desechables— y, cuando
 * ese reparto tiene una sola porción, añade el reparto por PROVEEDOR, que
 * contesta la misma pregunta de fondo —«¿en qué se va el pedido?»— con los
 * datos que sí existen. No se esconde la degeneración: se dice y se ofrece
 * algo que sí se puede leer.
 *
 * El reparto se mide en RENGLONES y no en cantidad. Es la parte del encargo
 * que decía «volumen o líneas de pedido», y aquí líneas es la única correcta:
 * las categorías agrupan productos de unidades distintas, y un anillo cuyos
 * gajos suman bandejas con libras repartiría un total que no existe.
 */

import { GraficaAnillo } from '../../graficas/index.js';
import type { Analisis } from '../../../servicios/analisisServicio.js';
import { Bloque, Pregunta, Tabla, Vacio, numero } from './comunes.js';

export function VistaComposicion({ datos }: { datos: Analisis }) {
  const { porCategoria, porCategoriaSede, porProveedor, resumen } = datos;

  /*
   * ¿El reparto por categoría dice algo?
   *
   * No basta con contar cuántas categorías hay. En los datos reales salen DOS
   * —«Alimentos y bebidas» y un residuo sin casilla marcada— y la primera se
   * lleva más del 99 %: son dos porciones, pero una es invisible y el anillo
   * sigue sin contestar nada. Lo que importa no es cuántas hay, sino si
   * alguna se lo lleva casi todo.
   */
  const mayor = Math.max(0, ...porCategoria.map((c) => c.lineas));
  const totalCategorias = porCategoria.reduce((s, c) => s + c.lineas, 0);
  const degenerado = porCategoria.length <= 1
    || (totalCategorias > 0 && mayor / totalCategorias >= 0.95);

  /** El cruce sede × categoría, pivotado: una fila por sede. */
  const categorias = [...new Set(porCategoriaSede.map((f) => f.categoria))].sort();
  const sedes = [...new Map(porCategoriaSede.map((f) => [f.cafeteriaId, f.cafeteriaNombre]))]
    .sort((a, b) => a[1].localeCompare(b[1], 'es'));
  const celda = new Map(porCategoriaSede.map((f) => [`${f.cafeteriaId}:${f.categoria}`, f.lineas]));

  return (
    <>
      <Pregunta>
        ¿Cómo se reparte el pedido entre alimentos y bebidas, aseo y
        desechables, y ese reparto cambia por cafetería?
      </Pregunta>

      {porCategoria.length === 0 ? (
        <Vacio>No hay pedidos con estos filtros.</Vacio>
      ) : (
        <>
          <Bloque
            titulo="Reparto por categoría"
            nota="Se mide en renglones de pedido, no en cantidad: las categorías juntan
                  productos de unidades distintas —bandejas, libras, unidades— y sumarlas
                  repartiría un total que no significa nada."
          >
            <GraficaAnillo
              porciones={porCategoria.map((c) => ({ etiqueta: c.categoria, valor: c.lineas }))}
              titulo="Reparto del pedido por categoría"
              total={resumen.lineas}
              rotuloTotal="renglones"
              sufijo="renglones"
            />

            <Tabla minimo="520px">
              <thead>
                <tr>
                  <th scope="col">Categoría</th>
                  <th scope="col" className="tabla__numero">Pedidos</th>
                  <th scope="col" className="tabla__numero">Renglones</th>
                  <th scope="col" className="tabla__numero">Reparto</th>
                </tr>
              </thead>
              <tbody>
                {porCategoria.map((c) => (
                  <tr key={c.categoria}>
                    <th scope="row" className="tabla__nombre">{c.categoria}</th>
                    <td className="tabla__numero">{numero(c.pedidos)}</td>
                    <td className="tabla__numero">{numero(c.lineas)}</td>
                    <td className="tabla__numero">
                      {resumen.lineas > 0 ? `${Math.round((c.lineas / resumen.lineas) * 100)} %` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabla>

            {degenerado && (
              <p className="aviso aviso--aviso" role="status">
                Con el filtro actual{' '}
                {porCategoria.length <= 1
                  ? <>solo hay <strong>una categoría</strong></>
                  : <>una sola categoría se lleva el{' '}
                      <strong>{Math.round((mayor / totalCategorias) * 100)} %</strong></>}
                , así que el anillo no reparte nada. No es un fallo: los almacenes de{' '}
                <em>Aseo y productos químicos</em> y <em>Desechables</em> existen en el
                catálogo pero todavía no tienen pedidos registrados. Mientras tanto, el
                reparto por proveedor de aquí abajo contesta la misma pregunta.
              </p>
            )}
          </Bloque>

          {degenerado && (
            <Bloque
              titulo="Reparto por proveedor"
              nota="A quién se le pide, en renglones. Es la lectura útil de «en qué se va
                    el pedido» mientras la categoría no distinga."
            >
              <GraficaAnillo
                porciones={porProveedor.map((p) => ({ etiqueta: p.proveedorNombre, valor: p.lineas }))}
                titulo="Reparto del pedido por proveedor"
                total={resumen.pedidos}
                rotuloTotal="pedidos"
                sufijo="renglones"
              />
              <Tabla minimo="560px">
                <thead>
                  <tr>
                    <th scope="col">Proveedor</th>
                    <th scope="col" className="tabla__numero">Pedidos</th>
                    <th scope="col" className="tabla__numero">Renglones</th>
                    <th scope="col" className="tabla__numero">Reparto</th>
                  </tr>
                </thead>
                <tbody>
                  {porProveedor.map((p) => (
                    <tr key={p.proveedorId}>
                      <th scope="row" className="tabla__nombre">{p.proveedorNombre}</th>
                      <td className="tabla__numero">{numero(p.pedidos)}</td>
                      <td className="tabla__numero">{numero(p.lineas)}</td>
                      <td className="tabla__numero">
                        {resumen.lineas > 0 ? `${Math.round((p.lineas / resumen.lineas) * 100)} %` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Tabla>
            </Bloque>
          )}

          <Bloque
            titulo="Desglose por cafetería" ancho="completo"
            nota="Renglones de cada categoría en cada sede. Es donde se vería que una
                  cafetería pide proporcionalmente más aseo que las demás."
          >
            {sedes.length === 0 ? (
              <Vacio>No hay pedidos por cafetería con estos filtros.</Vacio>
            ) : (
              <Tabla minimo={`${320 + categorias.length * 160}px`}>
                <thead>
                  <tr>
                    <th scope="col">Cafetería</th>
                    {categorias.map((c) => (
                      <th key={c} scope="col" className="tabla__numero">{c}</th>
                    ))}
                    <th scope="col" className="tabla__numero">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sedes.map(([id, nombre]) => {
                    const valores = categorias.map((c) => celda.get(`${id}:${c}`) ?? 0);
                    const total = valores.reduce((s, v) => s + v, 0);
                    return (
                      <tr key={id}>
                        <th scope="row" className="tabla__nombre">{nombre}</th>
                        {valores.map((v, i) => (
                          <td key={categorias[i]} className="tabla__numero">
                            {v === 0 ? <span className="tabla__cero">—</span> : (
                              <>
                                {numero(v)}{' '}
                                <span className="tabla__fecha">
                                  ({total > 0 ? Math.round((v / total) * 100) : 0} %)
                                </span>
                              </>
                            )}
                          </td>
                        ))}
                        <td className="tabla__numero"><strong>{numero(total)}</strong></td>
                      </tr>
                    );
                  })}
                </tbody>
              </Tabla>
            )}
          </Bloque>
        </>
      )}
    </>
  );
}
