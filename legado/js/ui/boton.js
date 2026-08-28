/**
 * Estado «trabajando» de un botón.
 *
 * El backend vive en Google Sheets: una petición puede tardar uno o dos
 * segundos, y bastante más en la primera del día, cuando Apps Script arranca
 * en frío. Sin señal alguna, quien atiende en el mostrador pulsa, no ve nada,
 * y vuelve a pulsar. De ahí que esto haga dos cosas a la vez:
 *
 * 1. **Avisa**: un girador dentro del propio botón, donde está mirando el
 *    ojo. Un indicador en otra parte de la pantalla no se ve cuando acabas
 *    de hacer clic.
 * 2. **Bloquea**: el botón queda deshabilitado mientras dura la tarea. Es la
 *    mitad importante — dos clics seguidos en «Registrar reserva» son dos
 *    reservas, y la segunda la rechazaría el duplicado con un error que no
 *    explica nada.
 *
 * `aria-busy` lo anuncia también a un lector de pantalla, que no ve el
 * girador. Y si el sistema tiene reducida la animación, el bloqueo y el
 * cambio de texto siguen comunicando lo mismo sin depender del movimiento.
 */

import { crear } from './dom.js';

/**
 * Ejecuta `tarea` mostrando el botón como ocupado, y lo restaura pase lo que
 * pase — también si la tarea lanza, porque un botón que se queda inservible
 * tras un error obliga a recargar la página.
 *
 * @param {HTMLButtonElement} boton
 * @param {() => any} tarea
 * @param {string} [texto]  reemplaza la etiqueta mientras dura; si se omite,
 *                          se conserva la original y solo se añade el girador
 * @returns {Promise<any>} lo que devuelva la tarea
 */
export async function conCarga(boton, tarea, texto) {
  if (!boton || boton.disabled) return undefined;

  const original = [...boton.childNodes];
  const etiqueta = boton.textContent;

  boton.disabled = true;
  boton.setAttribute('aria-busy', 'true');
  boton.replaceChildren(
    crear('span', { clase: 'boton__girador', attrs: { 'aria-hidden': 'true' } }),
    document.createTextNode(texto ?? etiqueta),
  );

  try {
    return await tarea();
  } finally {
    boton.replaceChildren(...original);
    boton.removeAttribute('aria-busy');
    boton.disabled = false;
  }
}

/**
 * Crea un botón cuya acción ya viene envuelta en `conCarga`.
 *
 * Se usa en las filas de las tablas: así ninguna vista tiene que acordarse de
 * mostrar el indicador, y el que se olvide es imposible.
 *
 * @param {{texto: string, clase?: string, etiqueta?: string,
 *          textoOcupado?: string, alPulsar: () => any}} opciones
 */
export function botonConCarga({ texto, clase = 'boton--secundario', etiqueta, textoOcupado, alPulsar }) {
  const boton = crear('button', {
    clase: `boton ${clase} boton--sm`,
    texto,
    attrs: { type: 'button', 'aria-label': etiqueta ?? texto },
  });
  boton.addEventListener('click', () => conCarga(boton, alPulsar, textoOcupado));
  return boton;
}
