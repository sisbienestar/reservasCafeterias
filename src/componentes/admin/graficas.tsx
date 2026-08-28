/**
 * Gráficas en SVG, dibujadas a mano. Port directo de `legado/js/ui/graficas.js`.
 *
 * Sin librerías, como el resto del proyecto. Son dos formas y las dos
 * representan lo mismo —cuántas reservas— así que ambas son de **serie
 * única** y usan un solo color: el verde institucional. Eso no es pereza, es
 * la regla: el color categórico (una tonalidad por serie) sirve cuando lo que
 * hay que distinguir son las series entre sí; aquí lo que hay que leer es la
 * magnitud, y una sola tonalidad se lee mejor y no tiene problemas de
 * daltonismo. **Las canceladas no van como segunda serie**: están en los
 * indicadores, en las tablas y en el filtro de estado.
 *
 * Por eso tampoco llevan leyenda: con una sola serie, el título ya dice qué
 * se está mirando y una caja con un solo cuadrito de color solo gasta sitio.
 *
 * Convenciones de trazo, iguales en las dos:
 *   · barra de 24 px como máximo, con el extremo del dato redondeado 4 px y
 *     la base cuadrada — el redondeo marca dónde acaba el valor
 *   · 2 px de aire entre barras vecinas, hechos con el fondo, no con bordes
 *   · rejilla de 1 px continua y discreta, por detrás de los datos
 *   · el texto nunca va del color del dato: usa los tonos de texto
 */

import { useRef, useState, type ReactNode } from 'react';

const COLOR_DATO = 'var(--c-acento)';
const GROSOR_MAXIMO = 24;
const RADIO = 4;
const AIRE = 2;

/** Escala «bonita» para el eje: 0, y un tope redondo por encima del máximo. */
function topeRedondo(maximo: number): number {
  if (maximo <= 5) return 5;
  const magnitud = 10 ** Math.floor(Math.log10(maximo));
  const paso = maximo / magnitud > 5 ? magnitud : magnitud / 2;
  return Math.ceil(maximo / paso) * paso;
}

/** Marcas del eje de valores: cuatro tramos hasta el tope. */
function marcasEje(tope: number): number[] {
  const paso = tope / 4;
  return [0, paso, paso * 2, paso * 3, tope].map((v) => Math.round(v));
}

/**
 * Columna con la parte de arriba redondeada y la base cuadrada.
 * Si el valor es diminuto, el radio se recorta al alto disponible para que la
 * barra no se deforme en una pastilla.
 */
function rutaColumna(x: number, y: number, ancho: number, alto: number): string {
  const r = Math.min(RADIO, ancho / 2, alto);
  return `M${x},${y + alto} L${x},${y + r} Q${x},${y} ${x + r},${y} ` +
    `L${x + ancho - r},${y} Q${x + ancho},${y} ${x + ancho},${y + r} ` +
    `L${x + ancho},${y + alto} Z`;
}

/** Barra horizontal: extremo derecho redondeado, base cuadrada a la izquierda. */
function rutaBarra(x: number, y: number, ancho: number, alto: number): string {
  const r = Math.min(RADIO, alto / 2, ancho);
  return `M${x},${y} L${x + ancho - r},${y} Q${x + ancho},${y} ${x + ancho},${y + r} ` +
    `L${x + ancho},${y + alto - r} Q${x + ancho},${y + alto} ${x + ancho - r},${y + alto} ` +
    `L${x},${y + alto} Z`;
}

export interface DatoColumna { etiqueta: string; valorEje: string; valor: number }
export interface DatoBarra { etiqueta: string; valor: number }

const SinDatos = () => <p className="grafica__vacio">No hay datos en este rango.</p>;

/**
 * El envoltorio común: lienzo responsivo más el globo.
 *
 * Un solo globo por gráfica, que se mueve. Es un div de HTML y no un `<text>`
 * de SVG a propósito: dentro del SVG habría que medir el texto a mano para
 * dibujarle el fondo, y se sale del lienzo en cuanto está cerca del borde.
 */
function useGlobo() {
  const contenedor = useRef<HTMLDivElement>(null);
  const [globo, setGlobo] = useState<{ texto: string; x: number; y: number } | null>(null);

  const vigilar = (texto: string) => ({
    onMouseEnter: (e: React.MouseEvent) => {
      const caja = contenedor.current?.getBoundingClientRect();
      setGlobo({ texto, x: e.clientX - (caja?.left ?? 0), y: e.clientY - (caja?.top ?? 0) });
    },
    onMouseMove: (e: React.MouseEvent) => {
      const caja = contenedor.current?.getBoundingClientRect();
      setGlobo({ texto, x: e.clientX - (caja?.left ?? 0), y: e.clientY - (caja?.top ?? 0) });
    },
    onMouseLeave: () => setGlobo(null),
  });

  const nodoGlobo: ReactNode = (
    <div className="grafica__globo" hidden={!globo}
         style={globo ? { left: `${globo.x}px`, top: `${globo.y}px` } : undefined}>
      {globo?.texto}
    </div>
  );

  return { contenedor, vigilar, nodoGlobo };
}

/** Gráfica de columnas para una serie temporal. */
export function GraficaColumnas({ datos, titulo }: { datos: DatoColumna[]; titulo: string }) {
  const { contenedor, vigilar, nodoGlobo } = useGlobo();
  if (datos.length === 0) return <SinDatos />;

  const ALTO = 260;
  const margen = { arriba: 16, derecha: 8, abajo: 34, izquierda: 44 };
  const anchoUtil = 1000 - margen.izquierda - margen.derecha;
  const altoUtil = ALTO - margen.arriba - margen.abajo;

  const tope = topeRedondo(Math.max(...datos.map((d) => d.valor), 1));
  const banda = anchoUtil / datos.length;
  const grosor = Math.max(2, Math.min(GROSOR_MAXIMO, banda - AIRE));

  // Con muchas columnas no cabe una etiqueta por barra: se rotulan unas pocas
  // repartidas. Amontonarlas todas sería ilegible.
  const saltoEtiqueta = Math.ceil(datos.length / 12);

  return (
    <div className="grafica" ref={contenedor}>
      {/* Sin `preserveAspectRatio: none`: estirar el lienzo deformaría también
          el texto de los ejes. Escala proporcional y el alto lo pone el viewBox. */}
      <svg viewBox={`0 0 1000 ${ALTO}`} className="grafica__lienzo" role="img" aria-label={titulo}>
        {/* La rejilla primero: tiene que quedar por detrás de los datos. */}
        {marcasEje(tope).map((marca) => {
          const y = margen.arriba + altoUtil - (marca / tope) * altoUtil;
          return (
            <g key={marca}>
              <line x1={margen.izquierda} x2={1000 - margen.derecha} y1={y} y2={y}
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
  const { contenedor, vigilar, nodoGlobo } = useGlobo();
  if (datos.length === 0) return <SinDatos />;

  const ALTO_FILA = 30;
  const margen = { arriba: 8, derecha: 56, abajo: 8, izquierda: 210 };
  const alto = margen.arriba + margen.abajo + datos.length * ALTO_FILA;
  const anchoUtil = 1000 - margen.izquierda - margen.derecha;

  const tope = Math.max(...datos.map((d) => d.valor), 1);
  const grosor = Math.min(GROSOR_MAXIMO, ALTO_FILA - AIRE * 2);

  return (
    <div className="grafica" ref={contenedor}>
      <svg viewBox={`0 0 1000 ${alto}`} className="grafica__lienzo" role="img" aria-label={titulo}>
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
