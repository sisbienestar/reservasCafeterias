/**
 * Las gráficas de SERIE ÚNICA, en SVG dibujado a mano. Port directo de
 * `legado/js/ui/graficas.js`; las convenciones de trazo están en `comunes.tsx`.
 *
 * Sin librerías, como el resto del proyecto. Las dos formas de aquí leen una
 * MAGNITUD —cuántas reservas, cuánto se pidió de un producto— y por eso usan
 * un solo color: el verde institucional. Eso no es pereza, es la regla: el
 * color categórico (una tonalidad por serie) sirve cuando lo que hay que
 * distinguir son las series entre sí; para leer magnitud, una sola tonalidad
 * se lee mejor y no tiene problemas de daltonismo. **Las canceladas no van
 * como segunda serie**: están en los indicadores, en las tablas y en el
 * filtro de estado.
 *
 * Por eso tampoco llevan leyenda: con una sola serie, el título ya dice qué
 * se está mirando y una caja con un solo cuadrito de color solo gasta sitio.
 * Las de varias series —que sí la llevan— están en `Series.tsx`.
 */

import {
  COLOR_DATO, GROSOR_MAXIMO, AIRE,
  marcasEje, rutaBarra, rutaColumna, saltoDeEtiquetas, topeRedondo, useGlobo, SinDatos,
} from './comunes.js';

export interface DatoColumna { etiqueta: string; valorEje: string; valor: number }
export interface DatoBarra { etiqueta: string; valor: number }

/** Gráfica de columnas para una serie temporal. */
export function GraficaColumnas({ datos, titulo }: { datos: DatoColumna[]; titulo: string }) {
  const { contenedor, vigilar, nodoGlobo, ancho: ANCHO } = useGlobo();
  if (datos.length === 0) return <SinDatos />;

  const ALTO = 260;
  const margen = { arriba: 16, derecha: 8, abajo: 34, izquierda: 44 };
  const anchoUtil = ANCHO - margen.izquierda - margen.derecha;
  const altoUtil = ALTO - margen.arriba - margen.abajo;

  const tope = topeRedondo(Math.max(...datos.map((d) => d.valor), 1));
  const banda = anchoUtil / datos.length;
  const grosor = Math.max(2, Math.min(GROSOR_MAXIMO, banda - AIRE));

  // Con muchas columnas no cabe una etiqueta por barra: se rotulan las que
  // quepan de verdad en el ancho que hay. Amontonarlas todas sería ilegible.
  const saltoEtiqueta = saltoDeEtiquetas(datos.map((d) => d.etiqueta), anchoUtil);

  return (
    <div className="grafica" ref={contenedor}>
      {/* Sin `preserveAspectRatio: none`: estirar el lienzo deformaría también
          el texto de los ejes. Escala proporcional y el alto lo pone el viewBox. */}
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="grafica__lienzo" role="img" aria-label={titulo}>
        {/* La rejilla primero: tiene que quedar por detrás de los datos. */}
        {marcasEje(tope).map((marca) => {
          const y = margen.arriba + altoUtil - (marca / tope) * altoUtil;
          return (
            <g key={marca}>
              <line x1={margen.izquierda} x2={ANCHO - margen.derecha} y1={y} y2={y}
                    className="grafica__rejilla" />
              <text x={margen.izquierda - 8} y={y + 4} className="grafica__marca" textAnchor="end">
                {marca}
              </text>
            </g>
          );
        })}

        {datos.map((dato, i) => {
          if (i % saltoEtiqueta !== 0) return null;
          const x = margen.izquierda + i * banda + (banda - grosor) / 2;
          return (
            <text key={`e-${dato.valorEje}`} x={x + grosor / 2} y={ALTO - 12}
                  className="grafica__marca" textAnchor="middle">
              {dato.etiqueta}
            </text>
          );
        })}

        {datos.map((dato, i) => {
          const alto = (dato.valor / tope) * altoUtil;
          const x = margen.izquierda + i * banda + (banda - grosor) / 2;
          const y = margen.arriba + altoUtil - alto;
          return (
            <path
              key={dato.valorEje}
              d={rutaColumna(x, y, grosor, Math.max(alto, dato.valor > 0 ? 1 : 0))}
              fill={COLOR_DATO}
              className="grafica__dato"
              {...vigilar(`${dato.valorEje}: ${dato.valor}`)}
            />
          );
        })}
      </svg>
      {nodoGlobo}
    </div>
  );
}

/**
 * Gráfica de barras horizontales para comparar categorías.
 * Va en horizontal porque los nombres —cafeterías, platos— son largos y en
 * vertical habría que girarlos.
 */
export function GraficaBarras({ datos, titulo }: { datos: DatoBarra[]; titulo: string }) {
  const { contenedor, vigilar, nodoGlobo, ancho: ANCHO } = useGlobo();
  if (datos.length === 0) return <SinDatos />;

  const ALTO_FILA = 30;
  /* El hueco de los rótulos ya no es fijo: con escala 1:1 un margen de 210 px
     se comería una pantalla estrecha entera. Se reserva un tercio del ancho
     como mucho, que es lo que deja sitio para la barra. */
  const margen = { arriba: 8, derecha: 56, abajo: 8, izquierda: Math.min(210, ANCHO * 0.34) };
  const alto = margen.arriba + margen.abajo + datos.length * ALTO_FILA;
  const anchoUtil = ANCHO - margen.izquierda - margen.derecha;

  const tope = Math.max(...datos.map((d) => d.valor), 1);
  const grosor = Math.min(GROSOR_MAXIMO, ALTO_FILA - AIRE * 2);

  return (
    <div className="grafica" ref={contenedor}>
      <svg viewBox={`0 0 ${ANCHO} ${alto}`} className="grafica__lienzo" role="img" aria-label={titulo}>
        {datos.map((dato, i) => {
          const y = margen.arriba + i * ALTO_FILA + (ALTO_FILA - grosor) / 2;
          const ancho = Math.max((dato.valor / tope) * anchoUtil, 2);
          return (
            <g key={dato.etiqueta}>
              <text x={margen.izquierda - 10} y={y + grosor / 2 + 4}
                    className="grafica__marca" textAnchor="end">
                {dato.etiqueta}
              </text>
              <path
                d={rutaBarra(margen.izquierda, y, ancho, grosor)}
                fill={COLOR_DATO}
                className="grafica__dato"
                {...vigilar(`${dato.etiqueta}: ${dato.valor}`)}
              />
              {/* El valor va al final de la barra, no dentro: dentro no cabe
                  en las cortas y quedaría recortado. */}
              <text x={margen.izquierda + ancho + 8} y={y + grosor / 2 + 4}
                    className="grafica__valor">
                {dato.valor}
              </text>
            </g>
          );
        })}
      </svg>
      {nodoGlobo}
    </div>
  );
}

/** Indicador suelto: rótulo arriba, número grande debajo. */
export function Indicador({ rotulo, valor, detalle }: {
  rotulo: string; valor: number | string; detalle?: string | undefined;
}) {
  return (
    <div className="indicador">
      <p className="indicador__rotulo">{rotulo}</p>
      <p className="indicador__valor">{valor}</p>
      {detalle && <p className="indicador__detalle">{detalle}</p>}
    </div>
  );
}
