/**
 * Las gráficas de VARIAS series: líneas en el tiempo y barras agrupadas.
 *
 * Aquí sí hay color categórico, y no contradice la regla de `Basicas.tsx`: la
 * regla decía que una tonalidad por serie sirve «cuando lo que hay que
 * distinguir son las series entre sí», y eso es exactamente lo que se pide
 * aquí —qué proveedor sube y cuál baja, qué cafetería pide más—. Lo que no
 * cambia es lo demás: el color se asigna por POSICIÓN de la entidad en una
 * lista estable, nunca por su puesto en el ranking, para que quitar un
 * proveedor del filtro no repinte a los que quedan.
 *
 * Las dos llevan leyenda, porque a partir de dos series la identidad no puede
 * depender solo del color. Y las dos van siempre con su tabla al lado, que es
 * lo que hace legibles los tres tonos de la paleta con menos contraste.
 *
 * NO hay eje doble. Si algún día hacen falta dos medidas de escalas
 * distintas —cantidad y número de pedidos— son dos gráficas, no dos ejes: un
 * segundo eje deja que la forma de las curvas la decida quien elige las
 * escalas, y eso hace decir a la gráfica lo que uno quiera.
 */

import { useState } from 'react';
import {
  AIRE, GROSOR_MAXIMO, Leyenda, SinDatos,
  marcasEje, rutaColumna, saltoDeEtiquetas, topeRedondo, useGlobo, type Serie,
} from './comunes.js';

/** Un punto de una serie temporal. `valor` nulo = ese periodo no tiene dato. */
export interface PuntoSerie { etiqueta: string; valor: number | null }
export interface SerieTemporal extends Serie { puntos: PuntoSerie[] }

/**
 * Líneas para comparar la evolución de varias entidades.
 *
 * Todas las series comparten el eje de periodos, así que quien llama tiene
 * que mandarlas ya alineadas: `puntos[i]` de una serie y de otra son el mismo
 * periodo. Un hueco se manda como `null` y parte la línea — dibujar el
 * segmento por encima daría a entender que hubo pedidos que no hubo.
 */
export function GraficaLineas({ series, periodos, titulo, sufijo = '' }: {
  series: SerieTemporal[];
  periodos: string[];
  titulo: string;
  /** Se añade al valor en el globo: «12 líneas», «340 BANDEJA». */
  sufijo?: string;
}) {
  const { contenedor, vigilar, nodoGlobo, ancho: ANCHO } = useGlobo();
  /*
   * Qué serie está aislada. Pulsar su rótulo en la leyenda la deja sola —las
   * demás casi transparentes— y volver a pulsarlo las devuelve todas: con
   * cuatro sedes sobre el mismo eje, mirar una sin perder de vista dónde caen
   * las otras es la única forma de leer la gráfica.
   *
   * El estado vive AQUÍ y no en quien la usa: no hay ninguna pantalla que
   * necesite decidirlo desde fuera, y ponerlo en las props obligaría a
   * cablearlo en cada sitio para tener lo mismo.
   *
   * Va antes del `return` de «sin datos» porque un hook no puede quedar
   * detrás de una salida temprana.
   */
  const [seleccion, setSeleccion] = useState<number | null>(null);
  if (series.length === 0 || periodos.length === 0) return <SinDatos />;

  /* Si cambia el filtro y ahora hay menos series, el índice guardado podría
     no señalar a ninguna: entonces no hay ninguna aislada, y no todas
     apagadas. */
  const resaltada = seleccion !== null && seleccion < series.length ? seleccion : null;

  const ALTO = 210;
  const margen = { arriba: 10, derecha: 12, abajo: 28, izquierda: 40 };
  const anchoUtil = ANCHO - margen.izquierda - margen.derecha;
  const altoUtil = ALTO - margen.arriba - margen.abajo;

  const maximo = Math.max(
    ...series.flatMap((s) => s.puntos.map((p) => p.valor ?? 0)), 1,
  );
  const tope = topeRedondo(maximo);

  /* Con un solo periodo no hay recta que trazar: el punto se pone en medio en
   * vez de pegado al eje, donde se leería como el origen. */
  const x = (i: number) => (periodos.length === 1
    ? margen.izquierda + anchoUtil / 2
    : margen.izquierda + (i / (periodos.length - 1)) * anchoUtil);
  const y = (v: number) => margen.arriba + altoUtil - (v / tope) * altoUtil;

  const saltoEtiqueta = saltoDeEtiquetas(periodos, anchoUtil);

  return (
    <>
      <div className="grafica" ref={contenedor}>
        <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="grafica__lienzo" role="img" aria-label={titulo}>
          {marcasEje(tope).map((marca) => (
            <g key={marca}>
              <line x1={margen.izquierda} x2={ANCHO - margen.derecha}
                    y1={y(marca)} y2={y(marca)} className="grafica__rejilla" />
              <text x={margen.izquierda - 8} y={y(marca) + 4}
                    className="grafica__marca" textAnchor="end">{marca}</text>
            </g>
          ))}

          {periodos.map((periodo, i) => (
            i % saltoEtiqueta === 0 && (
              <text key={periodo} x={x(i)} y={ALTO - 14}
                    className="grafica__marca" textAnchor="middle">{periodo}</text>
            )
          ))}

          {series.map((serie, indiceSerie) => {
            /* Al aislar una, las demás se apagan casi del todo y dejan de
             * recibir el ratón: si no, el globo saltaría sobre una línea que
             * ya casi no se ve. */
            const apagada = resaltada !== null && resaltada !== indiceSerie;

            /* Cada tramo continuo va en su propio `path`. Es lo que hace que
             * un hueco parta la línea en vez de saltarlo con una recta. */
            const tramos: string[] = [];
            let actual: string[] = [];
            serie.puntos.forEach((punto, i) => {
              if (punto.valor === null) {
                if (actual.length) tramos.push(actual.join(' '));
                actual = [];
                return;
              }
              actual.push(`${actual.length ? 'L' : 'M'}${x(i)},${y(punto.valor)}`);
            });
            if (actual.length) tramos.push(actual.join(' '));

            return (
              <g key={serie.nombre}
                 className={`grafica__serie${apagada ? ' grafica__serie--apagada' : ''}`}>
                {tramos.map((d, i) => (
                  <path key={i} d={d} fill="none" stroke={serie.color} strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round" />
                ))}
                {serie.puntos.map((punto, i) => punto.valor !== null && (
                  <circle
                    key={periodos[i]}
                    cx={x(i)} cy={y(punto.valor)} r="4.5"
                    fill={serie.color}
                    /* Anillo del color del fondo: donde dos series se cruzan,
                     * separa los puntos en vez de dejar una mancha. */
                    stroke="var(--c-superficie)" strokeWidth="2"
                    className="grafica__dato"
                    {...vigilar(`${serie.nombre} · ${periodos[i]}: ${punto.valor}${sufijo && ` ${sufijo}`}`)}
                  />
                ))}
              </g>
            );
          })}
        </svg>
        {nodoGlobo}
      </div>
      <Leyenda
        series={series}
        resaltada={resaltada}
        /* Volver a pulsar la que ya está aislada las devuelve todas. */
        alPulsar={(i) => setSeleccion((antes) => (antes === i ? null : i))}
      />
    </>
  );
}

export interface GrupoBarras {
  /** El eje: una cafetería, un mes… */
  etiqueta: string;
  /** Un valor por serie, en el MISMO orden que `series`. */
  valores: number[];
}

/**
 * Barras agrupadas: varias series lado a lado dentro de cada grupo.
 *
 * Agrupadas y no apiladas a propósito. Apilar sirve para leer el total y su
 * reparto; aquí la pregunta es «¿pide más A o B?», y en una pila solo el
 * segmento de abajo arranca de una base común — los de arriba flotan y dejan
 * de ser comparables entre grupos. El total, cuando hace falta, está en la
 * tabla que acompaña.
 */
export function GraficaBarrasAgrupadas({ grupos, series, titulo, sufijo = '' }: {
  grupos: GrupoBarras[];
  series: Serie[];
  titulo: string;
  sufijo?: string;
}) {
  const { contenedor, vigilar, nodoGlobo, ancho: ANCHO } = useGlobo();
  if (grupos.length === 0 || series.length === 0) return <SinDatos />;

  const ALTO = 210;
  const margen = { arriba: 10, derecha: 8, abajo: 32, izquierda: 40 };
  const anchoUtil = ANCHO - margen.izquierda - margen.derecha;
  const altoUtil = ALTO - margen.arriba - margen.abajo;

  const tope = topeRedondo(Math.max(...grupos.flatMap((g) => g.valores), 1));
  const banda = anchoUtil / grupos.length;
  /* El aire de dentro separa las series; el de fuera separa los grupos, y es
   * mayor para que se lean como grupos y no como una fila continua. */
  const grosor = Math.max(2, Math.min(GROSOR_MAXIMO, (banda - AIRE * 4) / series.length - AIRE));
  const anchoGrupo = grosor * series.length + AIRE * (series.length - 1);

  return (
    <>
      <div className="grafica" ref={contenedor}>
        <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="grafica__lienzo" role="img" aria-label={titulo}>
          {marcasEje(tope).map((marca) => {
            const y = margen.arriba + altoUtil - (marca / tope) * altoUtil;
            return (
              <g key={marca}>
                <line x1={margen.izquierda} x2={ANCHO - margen.derecha} y1={y} y2={y}
                      className="grafica__rejilla" />
                <text x={margen.izquierda - 8} y={y + 4}
                      className="grafica__marca" textAnchor="end">{marca}</text>
              </g>
            );
          })}

          {grupos.map((grupo, g) => {
            const inicio = margen.izquierda + g * banda + (banda - anchoGrupo) / 2;
            return (
              <g key={grupo.etiqueta}>
                <text x={margen.izquierda + g * banda + banda / 2} y={ALTO - 16}
                      className="grafica__marca" textAnchor="middle">{grupo.etiqueta}</text>
                {grupo.valores.map((valor, s) => {
                  const alto = (valor / tope) * altoUtil;
                  const x = inicio + s * (grosor + AIRE);
                  const y = margen.arriba + altoUtil - alto;
                  if (valor <= 0) return null;
                  return (
                    <path
                      key={series[s]?.nombre ?? s}
                      d={rutaColumna(x, y, grosor, Math.max(alto, 1))}
                      fill={series[s]?.color}
                      className="grafica__dato"
                      {...vigilar(`${grupo.etiqueta} · ${series[s]?.nombre}: ${valor}${sufijo && ` ${sufijo}`}`)}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
        {nodoGlobo}
      </div>
      <Leyenda series={series} />
    </>
  );
}
