/**
 * Mapa de calor: una cuadrícula donde el color de cada celda dice cuánto.
 *
 * Es la forma correcta cuando hay DOS dimensiones categóricas —fecha × sede—
 * y una magnitud, y cuando lo que se busca son huecos y rachas más que el
 * valor exacto de una casilla. Una tabla con los mismos números dice el valor
 * mejor, pero no deja ver de un vistazo que una sede lleva tres semanas sin
 * pedir; eso es lo que aporta el color.
 *
 * La rampa es de UN SOLO TONO, de claro a oscuro (ver base.css). Un arcoíris
 * haría leer un cambio de color como un cambio de categoría, y aquí todos los
 * peldaños son la misma cosa medida con más o menos intensidad.
 *
 * El cero tiene su propio peldaño, el más claro, y NO es el mismo que «poco»:
 * la diferencia entre no haber pedido nada y haber pedido una vez es
 * precisamente lo que la administradora está buscando.
 */

import { RAMPA, SinDatos, saltoDeEtiquetas, useGlobo } from './comunes.js';

export interface CeldaCalor {
  /** Índice de columna (periodo) y de fila (sede, producto…). */
  columna: number;
  fila: number;
  valor: number;
}

export function MapaCalor({ columnas, filas, celdas, titulo, sufijo = '' }: {
  /** Rótulos del eje horizontal, ya formateados. */
  columnas: string[];
  /** Rótulos del eje vertical. */
  filas: string[];
  celdas: CeldaCalor[];
  titulo: string;
  sufijo?: string;
}) {
  const { contenedor, vigilar, nodoGlobo, ancho: ANCHO } = useGlobo();
  if (columnas.length === 0 || filas.length === 0) return <SinDatos />;

  
  const ALTO_FILA = 30;
  /* Igual que en las barras: proporcional en pantalla estrecha, tope en ancha. */
  const margen = { arriba: 8, derecha: 8, abajo: 34, izquierda: Math.min(190, ANCHO * 0.3) };
  const alto = margen.arriba + margen.abajo + filas.length * ALTO_FILA;
  const anchoUtil = ANCHO - margen.izquierda - margen.derecha;
  const anchoCelda = anchoUtil / columnas.length;

  const maximo = Math.max(...celdas.map((c) => c.valor), 1);

  /* El valor en un peldaño de la rampa. Cinco tramos por encima del cero:
   * más peldaños no se distinguen y menos aplasta el rango. */
  const peldano = (valor: number): string => {
    if (valor <= 0) return RAMPA[0]!;
    const paso = Math.ceil((valor / maximo) * (RAMPA.length - 1));
    return RAMPA[Math.min(Math.max(paso, 1), RAMPA.length - 1)]!;
  };

  const porCelda = new Map(celdas.map((c) => [`${c.fila}:${c.columna}`, c.valor]));
  const saltoEtiqueta = saltoDeEtiquetas(columnas, anchoUtil);

  return (
    <>
      <div className="grafica" ref={contenedor}>
        <svg viewBox={`0 0 ${ANCHO} ${alto}`} className="grafica__lienzo"
             role="img" aria-label={titulo}>
          {filas.map((fila, f) => (
            <text key={fila} x={margen.izquierda - 10}
                  y={margen.arriba + f * ALTO_FILA + ALTO_FILA / 2 + 4}
                  className="grafica__marca" textAnchor="end">{fila}</text>
          ))}

          {columnas.map((columna, c) => (
            c % saltoEtiqueta === 0 && (
              <text key={columna} x={margen.izquierda + c * anchoCelda + anchoCelda / 2}
                    y={alto - 14} className="grafica__marca" textAnchor="middle">{columna}</text>
            )
          ))}

          {filas.map((fila, f) => columnas.map((columna, c) => {
            const valor = porCelda.get(`${f}:${c}`) ?? 0;
            return (
              <rect
                key={`${f}:${c}`}
                /* El píxel de separación se hace con el fondo, no con borde:
                 * un borde por celda pintaría una rejilla que compite con el
                 * dato en cuanto la cuadrícula es densa. */
                x={margen.izquierda + c * anchoCelda + 1}
                y={margen.arriba + f * ALTO_FILA + 1}
                width={Math.max(anchoCelda - 2, 1)}
                height={ALTO_FILA - 2}
                rx="2"
                fill={peldano(valor)}
                className="grafica__dato"
                {...vigilar(`${fila} · ${columna}: ${valor}${sufijo && ` ${sufijo}`}`)}
              />
            );
          }))}
        </svg>
        {nodoGlobo}
      </div>

      {/* La escala. Sin ella el color es una intensidad sin unidad: se ve que
          una celda es más oscura que otra, pero no cuánto más. */}
      <div className="escala-calor">
        <span className="escala-calor__extremo">0</span>
        {RAMPA.map((color) => (
          <span key={color} className="escala-calor__paso" style={{ background: color }} />
        ))}
        <span className="escala-calor__extremo">{maximo}{sufijo && ` ${sufijo}`}</span>
      </div>
    </>
  );
}
