/**
 * La pestaña «Detallado del día»: primero DÓNDE se pierde, después QUÉ pasó.
 *
 * Ha tenido tres formas, y las dos primeras fallaron por lo mismo — enseñaban
 * el dato sin responder ninguna pregunta:
 *
 *   1. Una rejilla sede×día×producto. Con más de una semana eran docenas de
 *      columnas de «0» y «—» ahogando los pocos hallazgos reales.
 *   2. Una lista plana de descuadres. Menos ruido, pero seguía siendo un
 *      REGISTRO: repetía la fecha en cada fila y no decía qué sede o qué
 *      producto es el problema del periodo.
 *
 * Ahora arriba va la conclusión —cuánto se pierde y dónde— y abajo el detalle
 * agrupado por día, para quien quiera bajar al caso concreto. El orden importa:
 * quien abre esto quiere saber a dónde mirar antes que qué pasó el martes.
 *
 * ── Se reutiliza lo que ya existe ──────────────────────────────────────────
 *
 * `GraficaBarras` e `Indicador` son de `componentes/graficas/`, la librería
 * compartida que ya usa el análisis de pedidos. NO se importa nada de
 * `pedidos/analisis/`: aquello es el juego de piezas de aquel módulo, y
 * cruzarlos ataría dos módulos que no se tocan. La tabla agrupada usa un
 * `<tbody>` por fecha con una fila de cabecera, igual que `Documento.tsx`
 * hace con las semanas del impreso.
 *
 * ── Pérdida y transferencia se cuentan aparte ──────────────────────────────
 *
 * Un neto que sume las dos miente: seis perdidos y seis traídos de otra sede
 * darían cero, y no hubo cero descuadres, hubo doce. Por eso los indicadores
 * las separan, y las gráficas ordenan solo por lo PERDIDO — es lo accionable;
 * traer producto de otra sede es una solución, no un problema.
 *
 * ── Por qué el filtro solo afecta al detalle ───────────────────────────────
 *
 * Las gráficas son la herramienta para decidir A DÓNDE mirar, así que enseñan
 * todas las sedes SIEMPRE: filtrarlas por sede dejaría una sola barra y no
 * habría nada que comparar. El filtro va junto a la tabla, que es lo único
 * que acota.
 */

import { useCallback, useMemo, useState } from 'react';
import { getConsolidado } from '../../servicios/salidasServicio.js';
import { usePeticion } from '../../utiles/usePeticion.js';
import { BloqueEstado } from '../BloqueEstado.js';
import { GraficaBarras, Indicador, type DatoBarra } from '../graficas/index.js';
import { formatearFechaLarga, nombreDiaCorto } from '../../utiles/fechas.js';

/** Cuántas filas de detalle se pintan como mucho. Corta la vista, no el dato. */
const TOPE = 300;

/** Cuántas barras entran en una gráfica antes de volverse un peine. */
const TOPE_BARRAS = 8;

interface Descuadre {
  fecha: string;
  cafeteriaId: string;
  cafeteriaNombre: string;
  productoNombre: string;
  ventasRegistradas: number | null;
  produccion: number;
  diferencia: number;
}

/** Lo perdido de una lista: solo las diferencias positivas. */
const perdidoDe = (lista: Descuadre[]) =>
  lista.reduce((n, d) => (d.diferencia > 0 ? n + d.diferencia : n), 0);

/** Suma lo perdido por una clave y lo deja listo para la gráfica. */
function rankingPor(lista: Descuadre[], clave: (d: Descuadre) => string): DatoBarra[] {
  const suma = new Map<string, number>();
  for (const d of lista) {
    if (d.diferencia <= 0) continue;
    const k = clave(d);
    suma.set(k, (suma.get(k) ?? 0) + d.diferencia);
  }
  return [...suma]
    .map(([etiqueta, valor]) => ({ etiqueta, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, TOPE_BARRAS);
}

export function VistaDetallado({ desde, hasta }: { desde: string; hasta: string }) {
  const consultar = useCallback(() => getConsolidado(desde, hasta), [desde, hasta]);
  const { datos, cargando, error, recargar } = usePeticion(consultar, [desde, hasta]);

  const [filtroSede, setFiltroSede] = useState('');

  /* Solo las casillas que NO cuadran: es el foco entero de esta pestaña. Lo
     que cuadró o no se contó ya se ve, completo, en «Consolidado». */
  const descuadres = useMemo<Descuadre[]>(() => {
    if (!datos) return [];
    const nombreCafeteria = new Map(datos.cafeterias.map((c) => [c.cafeteriaId, c.nombre]));
    const nombreProducto = new Map(datos.productos.map((p) => [p.productoId, p.nombre]));

    return datos.celdas
      .filter((c) => c.diferencia !== null && c.diferencia !== 0)
      .map((c) => ({
        fecha: c.fecha,
        cafeteriaId: c.cafeteriaId,
        cafeteriaNombre: nombreCafeteria.get(c.cafeteriaId) ?? c.cafeteriaId,
        productoNombre: nombreProducto.get(c.productoId) ?? '',
        ventasRegistradas: c.ventasRegistradas,
        produccion: c.produccion,
        diferencia: c.diferencia!,
      }))
      // Más reciente primero, mismo criterio que ya usa el historial.
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  }, [datos]);

  /* El resumen del periodo ENTERO, sin filtrar: es la conclusión de arriba. */
  const resumen = useMemo(() => ({
    total: descuadres.length,
    perdido: perdidoDe(descuadres),
    traido: descuadres.reduce((n, d) => (d.diferencia < 0 ? n - d.diferencia : n), 0),
    dias: new Set(descuadres.map((d) => d.fecha)).size,
  }), [descuadres]);

  const porSede = useMemo(() => rankingPor(descuadres, (d) => d.cafeteriaNombre), [descuadres]);
  const porProducto = useMemo(() => rankingPor(descuadres, (d) => d.productoNombre), [descuadres]);

  /* El detalle SÍ se filtra, y se corta ANTES de agrupar para que el tope
     signifique «trescientas filas» y no «trescientos días». */
  const porDia = useMemo(() => {
    const filtrados = filtroSede
      ? descuadres.filter((d) => d.cafeteriaId === filtroSede)
      : descuadres;

    const grupos = new Map<string, Descuadre[]>();
    for (const d of filtrados.slice(0, TOPE)) {
      const dia = grupos.get(d.fecha) ?? [];
      dia.push(d);
      grupos.set(d.fecha, dia);
    }
    return { grupos: [...grupos], total: filtrados.length };
  }, [descuadres, filtroSede]);

  return (
    <>
      {cargando && <BloqueEstado tipo="cargando" titulo="Cargando…" />}

      {error && (
        <BloqueEstado
          tipo="error"
          titulo="No se pudo cargar el detallado"
          detalle={error}
          accion={{ texto: 'Reintentar', alPulsar: recargar }}
        />
      )}

      {datos && datos.dias.length === 0 && (
        <BloqueEstado
          tipo="vacio"
          titulo="No hay ningún cierre en ese periodo"
          detalle="Sin días cerrados no hay nada que detallar. Prueba con otro rango."
        />
      )}

      {datos && datos.dias.length > 0 && descuadres.length === 0 && (
        <BloqueEstado
          tipo="vacio"
          titulo="Ningún descuadre en este periodo"
          detalle="Todo lo que se contó cuadró exacto."
        />
      )}

      {datos && descuadres.length > 0 && (
        <>
          <div className="rejilla-indicadores">
            <Indicador
              rotulo="Producto perdido"
              valor={resumen.perdido}
              detalle="se produjo y no se vendió"
            />
            <Indicador
              rotulo="Traído de otra sede"
              valor={resumen.traido}
              detalle="se vendió más de lo producido"
            />
            <Indicador rotulo="Descuadres" valor={resumen.total} />
            <Indicador
              rotulo="Días con descuadre"
              valor={resumen.dias}
              detalle={`de ${datos.dias.length} con cierre`}
            />
          </div>

          <section className="bloque-consolidado">
            <h3 className="bloque-consolidado__titulo">Dónde se pierde más</h3>
            <p className="bloque-consolidado__nota">
              Producto perdido en el periodo, por cafetería. Lo que se trajo de
              otra sede no entra: es la solución, no el problema.
            </p>
            <GraficaBarras datos={porSede} titulo="Producto perdido por cafetería" />
          </section>

          <section className="bloque-consolidado">
            <h3 className="bloque-consolidado__titulo">Qué se pierde más</h3>
            <p className="bloque-consolidado__nota">
              El mismo producto perdido, repartido por plato.
            </p>
            <GraficaBarras datos={porProducto} titulo="Producto perdido por plato" />
          </section>

          <form className="filtros" onSubmit={(e) => e.preventDefault()}>
            <div className="filtros__campo filtros__campo--ancho">
              <label className="campo__etiqueta" htmlFor="filtro-sede-detallado">
                Detalle de la cafetería
              </label>
              <select className="campo__control" id="filtro-sede-detallado" value={filtroSede}
                      onChange={(e) => setFiltroSede(e.target.value)}>
                <option value="">Todas</option>
                {datos.cafeterias.map((c) => (
                  <option key={c.cafeteriaId} value={c.cafeteriaId}>{c.nombre}</option>
                ))}
              </select>
            </div>
          </form>

          {porDia.total === 0 ? (
            <BloqueEstado
              tipo="vacio"
              titulo="Esa cafetería no tuvo descuadres"
              detalle="Todo lo que contó en este periodo cuadró exacto."
            />
          ) : (
            <div className="tabla-envoltorio bloque-tabla">
              <table className="tabla tabla--compacta">
                <caption className="tabla__caption">
                  Cada día con sus casillas descuadradas: la producción contra
                  lo que registró la caja.
                </caption>

                <thead>
                  <tr>
                    <th scope="col">Cafetería</th>
                    <th scope="col">Producto</th>
                    <th scope="col">Ventas / Producción</th>
                    <th scope="col">Diferencia</th>
                    <th scope="col">Qué pasó</th>
                  </tr>
                </thead>

                {/* Un `<tbody>` por día, con la fecha de cabecera: así deja de
                    repetirse en cada fila y cada día trae su propio subtotal.
                    Mismo patrón que las semanas de `Documento.tsx`. */}
                {porDia.grupos.map(([fecha, filas]) => {
                  const perdido = perdidoDe(filas);
                  return (
                    <tbody key={fecha}>
                      <tr>
                        <th colSpan={2} scope="colgroup">
                          {nombreDiaCorto(fecha)}
                          {' '}
                          {formatearFechaLarga(fecha).replace(/^[^,]+,\s*/, '')}
                        </th>
                        <th colSpan={3} className="tabla__numero" scope="colgroup">
                          {filas.length} {filas.length === 1 ? 'descuadre' : 'descuadres'}
                          {perdido > 0 && ` · ${perdido} perdidos`}
                        </th>
                      </tr>

                      {filas.map((d) => (
                        <tr key={`${d.fecha}|${d.cafeteriaId}|${d.productoNombre}`}>
                          <td className="tabla__nombre">{d.cafeteriaNombre}</td>
                          <td>{d.productoNombre}</td>
                          <td className="tabla__numero">
                            {d.ventasRegistradas === null ? '—' : d.ventasRegistradas}
                            {' / '}
                            {d.produccion}
                          </td>
                          <td className="tabla__numero salidas__descuadre">
                            {d.diferencia > 0 ? `+${d.diferencia}` : d.diferencia}
                          </td>
                          <td>{d.diferencia > 0 ? 'Se perdió' : 'Vino de otra sede'}</td>
                        </tr>
                      ))}
                    </tbody>
                  );
                })}
              </table>
            </div>
          )}

          {porDia.total > TOPE && (
            <p className="campo__ayuda">
              Mostrando {TOPE} de {porDia.total} — acorta el rango o filtra por
              cafetería para verlos todos.
            </p>
          )}
        </>
      )}
    </>
  );
}
