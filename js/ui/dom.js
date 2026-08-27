/** Ayudas mínimas de DOM. Sin dependencias, sin framework. */

export const qs = (selector, raiz = document) => raiz.querySelector(selector);
export const qsa = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

/**
 * Crea un elemento.
 * `texto` se asigna con textContent, nunca con innerHTML: los nombres y móviles
 * los escribe el usuario y acabarán viniendo de una hoja de cálculo editable.
 *
 * @param {string} tag
 * @param {{clase?: string, texto?: string, attrs?: Object, hijos?: Node[]}} opciones
 */
export function crear(tag, { clase, texto, attrs = {}, hijos = [] } = {}) {
  const el = document.createElement(tag);
  if (clase) el.className = clase;
  if (texto != null) el.textContent = texto;
  for (const [nombre, valor] of Object.entries(attrs)) {
    if (valor === true) el.setAttribute(nombre, '');
    else if (valor !== false && valor != null) el.setAttribute(nombre, valor);
  }
  hijos.forEach((hijo) => hijo && el.appendChild(hijo));
  return el;
}

const NS_SVG = 'http://www.w3.org/2000/svg';

/**
 * Crea un elemento SVG. Va aparte de `crear` porque el SVG vive en su propio
 * espacio de nombres: `document.createElement('rect')` produce un elemento
 * HTML desconocido que no dibuja nada, y es un fallo silencioso difícil de
 * ver —el nodo aparece en el inspector, pero el lienzo sale en blanco.
 *
 * @param {string} tag
 * @param {Object} attrs
 * @param {Node[]} hijos
 */
export function crearSVG(tag, attrs = {}, hijos = []) {
  const el = document.createElementNS(NS_SVG, tag);
  for (const [nombre, valor] of Object.entries(attrs)) {
    if (valor != null && valor !== false) el.setAttribute(nombre, valor);
  }
  hijos.forEach((hijo) => hijo && el.appendChild(hijo));
  return el;
}

/** Vacía un contenedor. */
export function limpiar(contenedor) {
  contenedor.replaceChildren();
}

/** Reemplaza el contenido de un contenedor por los nodos dados. */
export function pintar(contenedor, ...nodos) {
  contenedor.replaceChildren(...nodos.filter(Boolean));
}

/**
 * Bloque de estado (cargando / vacío / error) con la misma pinta en todas las
 * vistas. `accion` es un botón opcional, por ejemplo "Reintentar".
 */
export function bloqueEstado({ tipo = 'vacio', titulo, detalle, accion }) {
  const nodo = crear('div', { clase: `estado estado--${tipo}` });
  if (tipo === 'cargando') {
    nodo.appendChild(crear('span', { clase: 'estado__spinner', attrs: { 'aria-hidden': 'true' } }));
  }
  nodo.appendChild(crear('p', { clase: 'estado__titulo', texto: titulo }));
  if (detalle) nodo.appendChild(crear('p', { clase: 'estado__detalle', texto: detalle }));
  if (accion) {
    const boton = crear('button', {
      clase: 'boton boton--secundario boton--sm',
      texto: accion.texto,
      attrs: { type: 'button' },
    });
    boton.addEventListener('click', accion.alPulsar);
    nodo.appendChild(boton);
  }
  return nodo;
}

/**
 * Oculta el logo si el archivo no existe todavía, para no dejar el ícono de
 * imagen rota en el header. El wordmark de texto al lado se mantiene.
 */
export function prepararLogo() {
  qsa('[data-logo]').forEach((img) => {
    img.addEventListener('error', () => { img.hidden = true; }, { once: true });
    if (img.complete && img.naturalWidth === 0) img.hidden = true;
  });
}
