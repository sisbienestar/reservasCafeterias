/**
 * La pestaña «Análisis»: por qué se pierde producto, con gráficas.
 *
 * Las otras dos pestañas enseñan LO QUE PASÓ —el consolidado y el día a día—.
 * Esta busca el porqué, y por eso es la única con gráficas: aquí sí se compara
 * la forma de una serie con otra, que es lo que una tabla no deja hacer.
 *
 * ── Cada pregunta con su forma ─────────────────────────────────────────────
 *
 * No todo es una gráfica, y ese es el primer criterio:
 *
 *   cuánto se pierde en total        una CIFRA — no hay nada que comparar
 *   si sube o baja con el tiempo     una LÍNEA — cambio a lo largo del tiempo
 *   qué producto y qué sede pierden  BARRAS — magnitudes que se ordenan
 *   dónde se cruzan los dos          MAPA DE CALOR — dos ejes categóricos
 *
 * ── Una medida por gráfica ─────────────────────────────────────────────────
 *
 * La línea enseña UNIDADES perdidas y el porcentaje de merma vive en su
 * indicador, arriba. Meter las dos en la misma gráfica pediría dos escalas en
 * el mismo dibujo, y dos escalas en un eje es la manera más rápida de que dos
 * curvas parezcan cruzarse donde no se cruzan.
 *
 * ── Colores ────────────────────────────────────────────────────────────────
 *
 * Nada de paleta nueva. Las barras y la línea son una sola medida, así que van
 * en el color de dato del proyecto; el mapa de calor es magnitud y usa la
 * rampa de un tono que ya define `base.css`. La paleta categórica de ocho no
 * pinta aquí porque no hay ocho identidades que distinguir, hay una cantidad
 * que crece.
 *
 * ── Ni una petición nueva ──────────────────────────────────────────────────
 *
 * Mismo `getConsolidado` que las otras dos pestañas: la matriz
 * (día, sede, producto) entera en un viaje.
 */

import { useCallback, useMemo } from 'react';
import { getConsolidado } from '../../servicios/salidasServicio.js';
import { usePeticion } from '../../utiles/usePeticion.js';
import { BloqueEstado } from '../BloqueEstado.js';
import {
  GraficaBarras, GraficaLineas, Indicador, MapaCalor, colorSerie,
  type CeldaCalor, type DatoBarra, type SerieTemporal,
} from '../graficas/index.js';
import { formatearFechaCorta, lunesDeSemana } from '../../utiles/fechas.js';

/** Cuántas barras entran antes de que la gráfica sea un peine. */
const TOPE_BARRAS = 8;

/**
 * Cuántos puntos caben en el eje antes de que las líneas se enreden.
 *
 * Pasado ese número se agrupa por semana. Es el arreglo de verdad para varias
 * series: el problema de cuatro líneas sobre ciento treinta puntos diarios no
 * es que sean cuatro, es que la pérdida diaria es ruidosa y el ruido de cuatro
 * sedes a la vez tapa la tendencia de todas. Agrupando, se leen.
 *
 * No se agrupa por mes ni con el rango máximo: un año son 52 semanas, y el
 * salto de etiquetas de la propia gráfica ya se encarga de que quepan.
 */
const MAX_PUNTOS = 40;

/** Suma lo perdido por una clave y lo deja ordenado para la gráfica. */
function ranking(perdidoPor: Map<string, number>): DatoBarra[] {
  return [...perdidoPor]
    .filter(([, valor]) => valor > 0)
    .map(([etiqueta, valor]) => ({ etiqueta, valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, TOPE_BARRAS);
}

export function VistaAnalisis({ desde, hasta }: { desde: string; hasta: string }) {
  const consultar = useCallback(() => getConsolidado(desde, hasta), [desde, hasta]);
  const { datos, cargando, error, recargar } = usePeticion(consultar, [desde, hasta]);

  const analisis = useMemo(() => {
    const sedes = datos?.cafeterias ?? [];
    const nombreSede = new Map(sedes.map((c) => [c.cafeteriaId, c.nombre]));
    const nombreProducto = new Map((datos?.productos ?? []).map((p) => [p.productoId, p.nombre]));

    /* El grano lo decide cuántos días hay, no una preferencia: en cuanto no
       caben, se agrupa por semana. Ver `MAX_PUNTOS`. */
    const diasConCierre = datos?.dias ?? [];
    const porSemana = diasConCierre.length > MAX_PUNTOS;
    const claveDe = (f: string) => (porSemana ? lunesDeSemana(f) : f);
    const periodos = [...new Set(diasConCierre.map(claveDe))].sort();

    let produccion = 0;
    let perdido = 0;
    let traido = 0;

    const porPeriodo = new Map<string, number>();
    const porSedePeriodo = new Map<string, number>();
    /* Qué sedes cerraron en qué periodo: sin esto no se puede distinguir «no
       perdió nada» de «no cerró», y la línea mentiría en el segundo caso. */
    const cerroEn = new Set<string>();
    const porSede = new Map<string, number>();
    const porProducto = new Map<string, number>();
    /* El cruce, por las dos claves a la vez: es lo que alimenta el mapa. */
    const porCruce = new Map<string, number>();

    for (const c of datos?.celdas ?? []) {
      produccion += c.produccion;
      const periodo = claveDe(c.fecha);
      cerroEn.add(`${c.cafeteriaId}|${periodo}`);
      if (c.diferencia === null) continue;

      if (c.diferencia < 0) { traido -= c.diferencia; continue; }
      if (c.diferencia === 0) continue;

      perdido += c.diferencia;
      const sede = nombreSede.get(c.cafeteriaId) ?? c.cafeteriaId;
      const producto = nombreProducto.get(c.productoId) ?? '';
      porPeriodo.set(periodo, (porPeriodo.get(periodo) ?? 0) + c.diferencia);
      const clave = `${c.cafeteriaId}|${periodo}`;
      porSedePeriodo.set(clave, (porSedePeriodo.get(clave) ?? 0) + c.diferencia);
      porSede.set(sede, (porSede.get(sede) ?? 0) + c.diferencia);
      porProducto.set(producto, (porProducto.get(producto) ?? 0) + c.diferencia);
      porCruce.set(`${sede}|${producto}`, (porCruce.get(`${sede}|${producto}`) ?? 0) + c.diferencia);
    }

    const etiquetas = periodos.map((p) => formatearFechaCorta(p));

    const serieTotal: SerieTemporal[] = [{
      nombre: 'Todas las cafeterías',
      color: 'var(--c-acento)',
      puntos: periodos.map((p, i) => ({
        etiqueta: etiquetas[i]!,
        valor: porPeriodo.get(p) ?? 0,
      })),
    }];

    /*
     * Una línea por sede, con el color de su POSICIÓN en el catálogo y no de
     * su puesto en el ranking: si el mes que viene una pierde menos y cambia
     * de orden, no se repintan ni ella ni las demás.
     */
    const seriesSede: SerieTemporal[] = sedes.map((s, i) => ({
      nombre: s.nombre,
      color: colorSerie(i),
      puntos: periodos.map((p, j) => ({
        etiqueta: etiquetas[j]!,
        /* Un periodo sin cierre es un HUECO y parte la línea; uno con cierre
           y sin pérdida es un cero de verdad. Dibujar el hueco como cero diría
           que esa sede cuadró un día que no trabajó. */
        valor: cerroEn.has(`${s.cafeteriaId}|${p}`)
          ? porSedePeriodo.get(`${s.cafeteriaId}|${p}`) ?? 0
          : null,
      })),
    }));

    /* El mapa: las sedes en filas y los productos en columnas, y solo los
       productos que alguien perdió alguna vez — una columna a cero en todas
       las filas ocupa sitio y no dice nada. */
    const filas = [...nombreSede.values()];
    const columnas = [...nombreProducto.values()]
      .filter((p) => filas.some((s) => (porCruce.get(`${s}|${p}`) ?? 0) > 0));

    const celdas: CeldaCalor[] = [];
    filas.forEach((s, fila) => columnas.forEach((p, columna) => {
      celdas.push({ columna, fila, valor: porCruce.get(`${s}|${p}`) ?? 0 });
    }));

    return {
      produccion,
      perdido,
      traido,
      /* La merma como parte de lo producido: es la cifra comparable entre
         sedes de tamaños distintos, y por eso va arriba y no en una gráfica. */
      tasa: produccion > 0 ? (perdido / produccion) * 100 : 0,
      porSemana,
      etiquetas,
      serieTotal,
      seriesSede,
      barrasSede: ranking(porSede),
      barrasProducto: ranking(porProducto),
      calor: { filas, columnas, celdas },
    };
  }, [datos]);

  const hayDatos = Boolean(datos) && (datos?.dias.length ?? 0) > 0;

  return (
    <>
      {cargando && <BloqueEstado tipo="cargando" titulo="Cargando el periodo…" />}

      {error && (
        <BloqueEstado
          tipo="error"
          titulo="No se pudo cargar el análisis"
          detalle={error}
          accion={{ texto: 'Reintentar', alPulsar: recargar }}
        />
      )}

      {datos && !hayDatos && (
        <BloqueEstado
          tipo="vacio"
          titulo="No hay ningún cierre en ese periodo"
          detalle="Sin días cerrados no hay nada que analizar. Prueba con otro rango."
        />
      )}

      {hayDatos && (
        <>
          <div className="rejilla-indicadores">
            <Indicador
              rotulo="Merma"
              valor={`${analisis.tasa.toFixed(1)}%`}
              detalle="de todo lo producido"
            />
            <Indicador
              rotulo="Producto perdido"
              valor={analisis.perdido}
              detalle="unidades que no se vendieron"
            />
            <Indicador
              rotulo="Producción"
              valor={analisis.produccion}
              detalle="unidades en el periodo"
            />
            <Indicador
              rotulo="Traído de otra sede"
              valor={analisis.traido}
              detalle="se vendió más de lo producido"
            />
          </div>

          <section className="bloque-consolidado">
            <h3 className="bloque-consolidado__titulo">Cómo evoluciona la pérdida</h3>
            <p className="bloque-consolidado__nota">
              Unidades perdidas {analisis.porSemana ? 'cada semana' : 'cada día'},
              sumando las cafeterías. Una sola medida: el porcentaje de merma
              está arriba, y meterlo aquí pediría un segundo eje.
            </p>
            <GraficaLineas
              periodos={analisis.etiquetas}
              series={analisis.serieTotal}
              titulo={`Producto perdido por ${analisis.porSemana ? 'semana' : 'día'}`}
              sufijo=" perdidas"
            />
          </section>

          <section className="bloque-consolidado">
            <h3 className="bloque-consolidado__titulo">
              Cómo evoluciona la pérdida en cada cafetería
            </h3>
            <p className="bloque-consolidado__nota">
              Lo mismo, separado por sede: es lo que dice si el total sube
              porque suben todas o porque una arrastra a las demás. Un tramo
              cortado es una sede que no cerró en ese periodo — no es un cero.
              {analisis.porSemana && ' El rango es largo, así que se agrupa por'
                + ' semana: en días, cuatro líneas de una cifra tan movida se'
                + ' tapan entre sí y no se lee ninguna.'}
            </p>
            <GraficaLineas
              periodos={analisis.etiquetas}
              series={analisis.seriesSede}
              titulo="Producto perdido por cafetería a lo largo del tiempo"
              sufijo=" perdidas"
            />
          </section>

          <section className="bloque-consolidado">
            <h3 className="bloque-consolidado__titulo">Qué producto se pierde más</h3>
            <p className="bloque-consolidado__nota">
              Unidades perdidas en todo el periodo, por plato.
            </p>
            <GraficaBarras datos={analisis.barrasProducto} titulo="Producto perdido por plato" />
          </section>

          <section className="bloque-consolidado">
            <h3 className="bloque-consolidado__titulo">Qué cafetería pierde más</h3>
            <p className="bloque-consolidado__nota">
              Lo mismo, repartido por sede. Compáralo con el tamaño de cada
              una: perder más siendo más grande no es lo mismo que perder más
              siendo pequeña.
            </p>
            <GraficaBarras datos={analisis.barrasSede} titulo="Producto perdido por cafetería" />
          </section>

          <section className="bloque-consolidado">
            <h3 className="bloque-consolidado__titulo">Dónde se cruzan sede y producto</h3>
            <p className="bloque-consolidado__nota">
              La casilla más oscura es el par que más pierde. Es lo que las dos
              gráficas de arriba no pueden decir: si una sede pierde en todo o
              solo en un plato.
            </p>
            <MapaCalor
              columnas={analisis.calor.columnas}
              filas={analisis.calor.filas}
              celdas={analisis.calor.celdas}
              titulo="Producto perdido por cafetería y plato"
              sufijo=" perdidas"
            />
          </section>
        </>
      )}
    </>
  );
}
