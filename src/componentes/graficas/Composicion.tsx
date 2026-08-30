/**
 * El anillo: cómo se reparte un total entre pocas partes.
 *
 * Anillo y no tarta porque el hueco del centro sirve para poner el total, que
 * es el dato que la tarta obliga a buscar en otro sitio.
 *
 * Un anillo solo se lee bien con POCAS porciones y diferencias grandes: el
 * ojo compara ángulos mucho peor que longitudes. Por eso `MAX_PORCIONES`
 * pliega la cola en «Otros» en vez de dibujar quince gajos que nadie puede
 * distinguir, y por eso cada porción lleva su porcentaje en la tabla de al
 * lado. Si las partes fueran muchas o parecidas, la forma correcta sería
 * barras horizontales —`GraficaBarras`— y no esto.
 */

import { COLOR_OTROS, Leyenda, SinDatos, colorSerie, useGlobo } from './comunes.js';

/** Pasadas seis, la séptima y siguientes se suman en «Otros». */
const MAX_PORCIONES = 6;

export interface Porcion { etiqueta: string; valor: number }

/** Punto del borde del anillo, con el ángulo medido desde arriba. */
function punto(cx: number, cy: number, radio: number, fraccion: number) {
  const angulo = fraccion * Math.PI * 2 - Math.PI / 2;
  return [cx + radio * Math.cos(angulo), cy + radio * Math.sin(angulo)];
}

export function GraficaAnillo({ porciones, titulo, total, rotuloTotal, sufijo = '' }: {
  porciones: Porcion[];
  titulo: string;
  /** El número del centro. Se pasa aparte porque puede no ser la suma —el
   *  reparto puede ser de líneas y el total, de pedidos—. */
  total: number;
  rotuloTotal: string;
  sufijo?: string;
}) {
  const { contenedor, vigilar, nodoGlobo } = useGlobo();

  const conValor = porciones.filter((p) => p.valor > 0);
  if (conValor.length === 0) return <SinDatos />;

  const ordenadas = [...conValor].sort((a, b) => b.valor - a.valor);
  const visibles = ordenadas.slice(0, MAX_PORCIONES);
  const cola = ordenadas.slice(MAX_PORCIONES);
  if (cola.length > 0) {
    visibles.push({
      etiqueta: `Otros (${cola.length})`,
      valor: cola.reduce((suma, p) => suma + p.valor, 0),
    });
  }

  const suma = visibles.reduce((s, p) => s + p.valor, 0);
  const series = visibles.map((p, i) => ({
    nombre: p.etiqueta,
    // «Otros» siempre gris: no es una categoría más, es lo que no se detalla.
    color: cola.length > 0 && i === visibles.length - 1 ? COLOR_OTROS : colorSerie(i),
  }));

  const LADO = 260;
  const cx = LADO / 2;
  const cy = LADO / 2;
  const radio = 104;
  const grosor = 38;

  let acumulado = 0;

  return (
    <>
      <div className="grafica grafica--anillo" ref={contenedor}>
        <svg viewBox={`0 0 ${LADO} ${LADO}`} className="grafica__lienzo grafica__lienzo--cuadrado"
             role="img" aria-label={titulo}>
          {visibles.map((porcion, i) => {
            const desde = acumulado / suma;
            acumulado += porcion.valor;
            const hasta = acumulado / suma;

            const [x1, y1] = punto(cx, cy, radio, desde);
            const [x2, y2] = punto(cx, cy, radio, hasta);
            const mayor = hasta - desde > 0.5 ? 1 : 0;
            const porcentaje = Math.round((porcion.valor / suma) * 100);

            /* Una sola porción no se puede dibujar como arco: con inicio y fin
             * en el mismo punto, el arco de SVG no pinta nada. Va como aro. */
            if (visibles.length === 1) {
              return (
                <circle key={porcion.etiqueta} cx={cx} cy={cy} r={radio}
                        fill="none" stroke={series[i]?.color} strokeWidth={grosor}
                        className="grafica__dato"
                        {...vigilar(`${porcion.etiqueta}: ${porcion.valor}${sufijo && ` ${sufijo}`} · 100 %`)} />
              );
            }

            return (
              <path
                key={porcion.etiqueta}
                d={`M${x1},${y1} A${radio},${radio} 0 ${mayor} 1 ${x2},${y2}`}
                fill="none"
                stroke={series[i]?.color}
                strokeWidth={grosor}
                /* El corte recto y el aro del color del fondo dejan los 2 px
                 * de aire entre porciones que pide el resto de las gráficas. */
                strokeLinecap="butt"
                className="grafica__dato"
                {...vigilar(`${porcion.etiqueta}: ${porcion.valor}${sufijo && ` ${sufijo}`} · ${porcentaje} %`)}
              />
            );
          })}

          <text x={cx} y={cy - 2} className="grafica__centro-valor" textAnchor="middle">
            {total}
          </text>
          <text x={cx} y={cy + 20} className="grafica__centro-rotulo" textAnchor="middle">
            {rotuloTotal}
          </text>
        </svg>
        {nodoGlobo}
      </div>
      <Leyenda series={series} />
    </>
  );
}
