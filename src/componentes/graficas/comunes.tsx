/**
 * Lo que comparten todas las gráficas: escalas, trazos, globo y paleta.
 *
 * Estaba dentro de `graficas.tsx` cuando solo había dos formas y las dos eran
 * de serie única. Al aparecer el análisis de pedidos —líneas por proveedor,
 * barras agrupadas por sede, anillo por categoría, mapa de calor— hacía falta
 * un sitio donde las convenciones se escribieran UNA vez. Sin él habría dos
 * juegos de gráficas con dos ideas distintas de qué es una rejilla discreta,
 * que es el mismo problema que `react.css` tuvo con las clases duplicadas.
 *
 * Las convenciones de trazo, iguales en todas:
 *   · barra de 24 px como máximo, con el extremo del dato redondeado 4 px y
 *     la base cuadrada — el redondeo marca dónde acaba el valor
 *   · 2 px de aire entre marcas vecinas, hechos con el fondo, no con bordes
 *   · rejilla de 1 px continua y discreta, por detrás de los datos
 *   · el texto nunca va del color del dato: usa los tonos de texto
 */

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * El ancho de la caja, en píxeles de verdad.
 *
 * Existe por un fallo que solo se ve en pantallas anchas. Un SVG con
 * `viewBox="0 0 1000 300"` y `width: 100%` no se recorta al ensanchar: se
 * AMPLÍA. En un bloque de 1740 px la escala es 1,74, así que una gráfica
 * pensada para 300 px de alto se dibuja a 522, y una etiqueta de 11 px se
 * dibuja a 19. Todo «se ve muy grande» sin que nadie haya cambiado un tamaño.
 *
 * La salida no es `preserveAspectRatio="none"` —eso estira también el texto—
 * sino que el viewBox mida lo mismo que la caja: con 1 unidad = 1 píxel, el
 * alto es el que dice el código y el texto mide lo que dice el CSS, sea cual
 * sea el ancho. La gráfica se hace más ANCHA, que es lo que se quería, sin
 * hacerse más alta.
 */
const ANCHO_POR_DEFECTO = 1000;

function useAncho(contenedor: React.RefObject<HTMLDivElement | null>) {
  const [ancho, setAncho] = useState(ANCHO_POR_DEFECTO);

  useLayoutEffect(() => {
    const nodo = contenedor.current;
    if (!nodo) return;

    // Sin ResizeObserver se mide una vez: peor que seguir al contenedor, pero
    // mejor que quedarse con un ancho inventado.
    if (typeof ResizeObserver === 'undefined') {
      const medido = nodo.clientWidth;
      if (medido > 0) setAncho(medido);
      return;
    }

    const observador = new ResizeObserver(([entrada]) => {
      const medido = Math.round(entrada?.contentRect.width ?? 0);
      // El cero pasa cuando la caja está oculta —otra pestaña, por ejemplo—.
      // Aceptarlo dejaría un viewBox de ancho cero y la gráfica en blanco.
      if (medido > 0) setAncho(medido);
    });
    observador.observe(nodo);
    return () => observador.disconnect();
  }, [contenedor]);

  return ancho;
}

export const COLOR_DATO = 'var(--c-acento)';
export const GROSOR_MAXIMO = 24;
export const RADIO = 4;
export const AIRE = 2;

/**
 * La paleta categórica, en ORDEN FIJO. Ver el comentario largo de base.css.
 *
 * Se pide por POSICIÓN de la entidad en una lista estable —no por su puesto
 * en el ranking— para que al filtrar no se repinten los que quedan. Pasada la
 * octava serie no se inventa color: se devuelve el gris de «Otros», y quien
 * llama debe haber agrupado el resto bajo ese nombre.
 */
const SERIES = [
  'var(--c-serie-1)', 'var(--c-serie-2)', 'var(--c-serie-3)', 'var(--c-serie-4)',
  'var(--c-serie-5)', 'var(--c-serie-6)', 'var(--c-serie-7)', 'var(--c-serie-8)',
];
export const MAX_SERIES = SERIES.length;
export const COLOR_OTROS = 'var(--c-serie-otros)';

export function colorSerie(indice: number): string {
  return SERIES[indice] ?? COLOR_OTROS;
}

/** Los seis peldaños de la rampa secuencial, de claro a oscuro. */
export const RAMPA = [
  'var(--c-rampa-0)', 'var(--c-rampa-1)', 'var(--c-rampa-2)',
  'var(--c-rampa-3)', 'var(--c-rampa-4)', 'var(--c-rampa-5)',
];

/** Escala «bonita» para el eje: 0, y un tope redondo por encima del máximo. */
export function topeRedondo(maximo: number): number {
  if (maximo <= 5) return 5;
  const magnitud = 10 ** Math.floor(Math.log10(maximo));
  const paso = maximo / magnitud > 5 ? magnitud : magnitud / 2;
  return Math.ceil(maximo / paso) * paso;
}

/** Marcas del eje de valores: cuatro tramos hasta el tope. */
export function marcasEje(tope: number): number[] {
  const paso = tope / 4;
  return [0, paso, paso * 2, paso * 3, tope].map((v) => Math.round(v));
}

/**
 * Columna con la parte de arriba redondeada y la base cuadrada.
 * Si el valor es diminuto, el radio se recorta al alto disponible para que la
 * barra no se deforme en una pastilla.
 */
export function rutaColumna(x: number, y: number, ancho: number, alto: number): string {
  const r = Math.min(RADIO, ancho / 2, alto);
  return `M${x},${y + alto} L${x},${y + r} Q${x},${y} ${x + r},${y} ` +
    `L${x + ancho - r},${y} Q${x + ancho},${y} ${x + ancho},${y + r} ` +
    `L${x + ancho},${y + alto} Z`;
}

/** Barra horizontal: extremo derecho redondeado, base cuadrada a la izquierda. */
export function rutaBarra(x: number, y: number, ancho: number, alto: number): string {
  const r = Math.min(RADIO, alto / 2, ancho);
  return `M${x},${y} L${x + ancho - r},${y} Q${x + ancho},${y} ${x + ancho},${y + r} ` +
    `L${x + ancho},${y + alto - r} Q${x + ancho},${y + alto} ${x + ancho - r},${y + alto} ` +
    `L${x},${y + alto} Z`;
}

export const SinDatos = () => <p className="grafica__vacio">No hay datos en este rango.</p>;

/**
 * El envoltorio común: lienzo responsivo más el globo.
 *
 * Un solo globo por gráfica, que se mueve. Es un div de HTML y no un `<text>`
 * de SVG a propósito: dentro del SVG habría que medir el texto a mano para
 * dibujarle el fondo, y se sale del lienzo en cuanto está cerca del borde.
 */
export function useGlobo() {
  const contenedor = useRef<HTMLDivElement>(null);
  const [globo, setGlobo] = useState<{ texto: string; x: number; y: number } | null>(null);
  // La misma caja sirve para medir: una gráfica ya tiene aquí su referencia.
  const ancho = useAncho(contenedor);

  const situar = (e: React.MouseEvent, texto: string) => {
    const caja = contenedor.current?.getBoundingClientRect();
    setGlobo({ texto, x: e.clientX - (caja?.left ?? 0), y: e.clientY - (caja?.top ?? 0) });
  };

  const vigilar = (texto: string) => ({
    onMouseEnter: (e: React.MouseEvent) => situar(e, texto),
    onMouseMove: (e: React.MouseEvent) => situar(e, texto),
    onMouseLeave: () => setGlobo(null),
  });

  const nodoGlobo: ReactNode = (
    <div className="grafica__globo" hidden={!globo}
         style={globo ? { left: `${globo.x}px`, top: `${globo.y}px` } : undefined}>
      {globo?.texto}
    </div>
  );

  return { contenedor, vigilar, nodoGlobo, ancho };
}

export interface Serie { nombre: string; color: string }

/**
 * La leyenda de una gráfica de varias series.
 *
 * Obligatoria a partir de dos series: sin ella la identidad dependería solo
 * del color, y hay tres tonos de la paleta que un ojo con daltonismo separa
 * peor. Con UNA sola serie no se pone —el título ya dice qué se mira y una
 * caja con un cuadrito solo gasta sitio—, que es lo que ya hacían las dos
 * gráficas de reservas.
 */
export function Leyenda({ series }: { series: Serie[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="leyenda">
      {series.map((s) => (
        <li key={s.nombre} className="leyenda__item">
          <span className="leyenda__marca" style={{ background: s.color }} aria-hidden="true" />
          {s.nombre}
        </li>
      ))}
    </ul>
  );
}

/**
 * Cada cuántas etiquetas del eje se pinta una, para que no se solapen.
 *
 * Antes era `ceil(n / 12)`: doce etiquetas SIEMPRE, sin mirar ni el ancho ni
 * lo que miden. Con 26 semanas rotuladas «sem. 16 de mar» el resultado eran
 * nueve etiquetas de unos 85 px repartidas en huecos de 74, y se leía
 * «sem. 2 de marsem. 16 de mar». El número que importa no es doce: es cuántas
 * CABEN, y eso depende del ancho de la caja y del largo del texto.
 *
 * Los 6,2 px por carácter son la anchura media de la tipografía de la interfaz
 * a 11 px. Es una estimación —medir de verdad exigiría un canvas— y por eso se
 * redondea al alza con los 14 px de aire: pasarse deja hueco de sobra, y
 * quedarse corto vuelve a juntar el texto, que es el fallo que se arregla.
 */
export function saltoDeEtiquetas(etiquetas: string[], anchoUtil: number): number {
  const masLarga = Math.max(...etiquetas.map((e) => e.length), 1);
  const anchoEtiqueta = masLarga * 6.2 + 14;
  const caben = Math.max(1, Math.floor(anchoUtil / anchoEtiqueta));
  return Math.ceil(etiquetas.length / caben);
}
