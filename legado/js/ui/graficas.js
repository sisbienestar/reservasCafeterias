/**
 * Gráficas en SVG, dibujadas a mano.
 *
 * Sin librerías, como el resto del proyecto. Son dos formas y las dos
 * representan lo mismo —cuántas reservas— así que ambas son de **serie
 * única** y usan un solo color: el verde institucional. Eso no es pereza,
 * es la regla: el color categórico (una tonalidad por serie) sirve cuando lo
 * que hay que distinguir son las series entre sí; aquí lo que hay que leer es
 * la magnitud, y una sola tonalidad se lee mejor y no tiene problemas de
 * daltonismo. Las canceladas no van como segunda serie: están en los
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

import { crear, crearSVG, pintar } from './dom.js';

const COLOR_DATO = 'var(--c-acento)';
const GROSOR_MAXIMO = 24;
const RADIO = 4;
const AIRE = 2;

/** Escala «bonita» para el eje: 0, y un tope redondo por encima del máximo. */
function topeRedondo(maximo) {
  if (maximo <= 5) return 5;
  const magnitud = 10 ** Math.floor(Math.log10(maximo));
  const paso = maximo / magnitud > 5 ? magnitud : magnitud / 2;
  return Math.ceil(maximo / paso) * paso;
}

/** Marcas del eje de valores: cuatro tramos hasta el tope. */
function marcasEje(tope) {
  const paso = tope / 4;
  return [0, paso, paso * 2, paso * 3, tope].map((v) => Math.round(v));
}

/**
 * Columna con la parte de arriba redondeada y la base cuadrada.
 * Si el valor es diminuto, el radio se recorta al alto disponible para que
 * la barra no se deforme en una pastilla.
 */
function rutaColumna(x, y, ancho, alto) {
  const r = Math.min(RADIO, ancho / 2, alto);
  return `M${x},${y + alto} L${x},${y + r} Q${x},${y} ${x + r},${y} ` +
    `L${x + ancho - r},${y} Q${x + ancho},${y} ${x + ancho},${y + r} ` +
    `L${x + ancho},${y + alto} Z`;
}

/** Barra horizontal: extremo derecho redondeado, base cuadrada a la izquierda. */
function rutaBarra(x, y, ancho, alto) {
  const r = Math.min(RADIO, alto / 2, ancho);
  return `M${x},${y} L${x + ancho - r},${y} Q${x + ancho},${y} ${x + ancho},${y + r} ` +
    `L${x + ancho},${y + alto - r} Q${x + ancho},${y + alto} ${x + ancho - r},${y + alto} ` +
    `L${x},${y + alto} Z`;
}

/**
 * Capa de interacción: un solo globo por gráfica que se mueve.
 *
 * Se usa un div de HTML y no un <text> de SVG a propósito: dentro del SVG
 * habría que medir el texto a mano para dibujarle el fondo, y se sale del
 * lienzo en cuanto está cerca del borde.
 */
function conectarGlobo(contenedor, globo) {
  return function vigilar(nodo, texto) {
    nodo.addEventListener('mouseenter', () => {
      globo.textContent = texto;
      globo.hidden = false;
    });
    nodo.addEventListener('mousemove', (evento) => {
      const caja = contenedor.getBoundingClientRect();
      globo.style.left = `${evento.clientX - caja.left}px`;
      globo.style.top = `${evento.clientY - caja.top}px`;
    });
    nodo.addEventListener('mouseleave', () => { globo.hidden = true; });
  };
}

/** Envoltorio común: lienzo responsivo + globo + mensaje de «sin datos». */
function lienzo(alto, contenido) {
  const contenedor = crear('div', { clase: 'grafica' });
  const globo = crear('div', { clase: 'grafica__globo', attrs: { hidden: true } });
  const svg = crearSVG(
    'svg',
    {
      // Sin `preserveAspectRatio: none`: estirar el lienzo deformaría también
      // el texto de los ejes. Escala proporcional y el alto lo pone el viewBox.
      viewBox: `0 0 1000 ${alto}`,
      class: 'grafica__lienzo',
      role: 'img',
    },
    contenido,
  );
  contenedor.appendChild(svg);
  contenedor.appendChild(globo);
  return { contenedor, svg, globo };
}

function sinDatos() {
  return crear('p', { clase: 'grafica__vacio', texto: 'No hay datos en este rango.' });
}

/**
 * Gráfica de columnas para una serie temporal.
 *
 * @param {{etiqueta: string, valorEje: string, valor: number}[]} datos
 * @param {{titulo: string}} opciones
 */
export function graficaColumnas(datos, { titulo }) {
  if (datos.length === 0) return sinDatos();

  const ALTO = 260;
  const margen = { arriba: 16, derecha: 8, abajo: 34, izquierda: 44 };
  const anchoUtil = 1000 - margen.izquierda - margen.derecha;
  const altoUtil = ALTO - margen.arriba - margen.abajo;

  const tope = topeRedondo(Math.max(...datos.map((d) => d.valor), 1));
  const banda = anchoUtil / datos.length;
  const grosor = Math.max(2, Math.min(GROSOR_MAXIMO, banda - AIRE));

  const nodos = [];

  // Rejilla primero: tiene que quedar por detrás de los datos.
  for (const marca of marcasEje(tope)) {
    const y = margen.arriba + altoUtil - (marca / tope) * altoUtil;
    nodos.push(crearSVG('line', {
      x1: margen.izquierda, x2: 1000 - margen.derecha, y1: y, y2: y, class: 'grafica__rejilla',
    }));
    nodos.push(crearSVG('text', {
      x: margen.izquierda - 8, y: y + 4, class: 'grafica__marca', 'text-anchor': 'end',
    }, [document.createTextNode(String(marca))]));
  }

  // Con muchas columnas no cabe una etiqueta por barra: se rotulan unas
  // pocas repartidas. Amontonarlas todas sería ilegible.
  const saltoEtiqueta = Math.ceil(datos.length / 12);

  const columnas = datos.map((dato, i) => {
    const alto = (dato.valor / tope) * altoUtil;
    const x = margen.izquierda + i * banda + (banda - grosor) / 2;
    const y = margen.arriba + altoUtil - alto;

    if (i % saltoEtiqueta === 0) {
      nodos.push(crearSVG('text', {
        x: x + grosor / 2, y: ALTO - 12, class: 'grafica__marca', 'text-anchor': 'middle',
      }, [document.createTextNode(dato.etiqueta)]));
    }

    const barra = crearSVG('path', {
      d: rutaColumna(x, y, grosor, Math.max(alto, dato.valor > 0 ? 1 : 0)),
      fill: COLOR_DATO,
      class: 'grafica__dato',
    });
    return { barra, dato };
  });

  columnas.forEach(({ barra }) => nodos.push(barra));

  const { contenedor, svg, globo } = lienzo(ALTO, nodos);
  svg.setAttribute('aria-label', titulo);
  const vigilar = conectarGlobo(contenedor, globo);
  columnas.forEach(({ barra, dato }) => vigilar(barra, `${dato.valorEje}: ${dato.valor}`));

  return contenedor;
}

/**
 * Gráfica de barras horizontales para comparar categorías.
 * Va en horizontal porque los nombres —cafeterías, platos— son largos y en
 * vertical habría que girarlos.
 *
 * @param {{etiqueta: string, valor: number}[]} datos
 * @param {{titulo: string}} opciones
 */
export function graficaBarras(datos, { titulo }) {
  if (datos.length === 0) return sinDatos();

  const ALTO_FILA = 30;
  const margen = { arriba: 8, derecha: 56, abajo: 8, izquierda: 210 };
  const alto = margen.arriba + margen.abajo + datos.length * ALTO_FILA;
  const anchoUtil = 1000 - margen.izquierda - margen.derecha;

  const tope = Math.max(...datos.map((d) => d.valor), 1);
  const grosor = Math.min(GROSOR_MAXIMO, ALTO_FILA - AIRE * 2);
  const nodos = [];
  const barras = [];

  datos.forEach((dato, i) => {
    const y = margen.arriba + i * ALTO_FILA + (ALTO_FILA - grosor) / 2;
    const ancho = (dato.valor / tope) * anchoUtil;

    nodos.push(crearSVG('text', {
      x: margen.izquierda - 10, y: y + grosor / 2 + 4,
      class: 'grafica__marca', 'text-anchor': 'end',
    }, [document.createTextNode(dato.etiqueta)]));

    const barra = crearSVG('path', {
      d: rutaBarra(margen.izquierda, y, Math.max(ancho, 2), grosor),
      fill: COLOR_DATO,
      class: 'grafica__dato',
    });
    nodos.push(barra);
    barras.push({ barra, dato });

    // El valor va al final de la barra, no dentro: dentro no cabe en las
    // cortas y quedaría recortado.
    nodos.push(crearSVG('text', {
      x: margen.izquierda + Math.max(ancho, 2) + 8, y: y + grosor / 2 + 4,
      class: 'grafica__valor',
    }, [document.createTextNode(String(dato.valor))]));
  });

  const { contenedor, svg, globo } = lienzo(alto, nodos);
  svg.setAttribute('viewBox', `0 0 1000 ${alto}`);
  svg.setAttribute('aria-label', titulo);
  const vigilar = conectarGlobo(contenedor, globo);
  barras.forEach(({ barra, dato }) => vigilar(barra, `${dato.etiqueta}: ${dato.valor}`));

  return contenedor;
}

/** Indicador suelto: rótulo arriba, número grande debajo. */
export function indicador(rotulo, valor, detalle) {
  return crear('div', {
    clase: 'indicador',
    hijos: [
      crear('p', { clase: 'indicador__rotulo', texto: rotulo }),
      crear('p', { clase: 'indicador__valor', texto: String(valor) }),
      detalle ? crear('p', { clase: 'indicador__detalle', texto: detalle }) : null,
    ],
  });
}

/** Fila de indicadores. */
export function filaIndicadores(contenedor, indicadores) {
  pintar(contenedor, ...indicadores.map(([rotulo, valor, detalle]) =>
    indicador(rotulo, valor, detalle),
  ));
}
