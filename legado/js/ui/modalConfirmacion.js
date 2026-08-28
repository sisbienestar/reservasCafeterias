/**
 * Modal de confirmación, en sustitución de `window.confirm()`.
 *
 * El `confirm()` del navegador funciona, pero se ve como una alerta del
 * sistema —tipografía ajena, botones «Aceptar/Cancelar» que no dicen qué se
 * acepta— y además **bloquea el hilo**: mientras está abierto, la página
 * entera se congela. Esto es un `<dialog>` como el del formulario de reserva,
 * así que hereda el foco atrapado, el cierre con Escape, el backdrop y el
 * `aria-modal` sin escribirlos a mano.
 *
 * Devuelve una promesa en vez de un booleano, que es la única diferencia real
 * para quien lo llama: `if (confirm(...))` pasa a ser
 * `if (await confirmar(...))`.
 *
 * Dos detalles pensados para acciones destructivas:
 *
 * - **El botón de confirmar dice qué hace** —«Sí, cancelar la reserva»— y no
 *   «Aceptar». Quien lee solo los botones tiene que poder decidir.
 * - **El foco arranca en «Volver»**, no en el botón destructivo. Un Enter
 *   reflejo sobre un diálogo que acaba de aparecer no debe borrar nada.
 */

import { crear } from './dom.js';

/**
 * Monta el diálogo una sola vez y devuelve la función para invocarlo.
 *
 * @param {HTMLElement} [anfitrion]
 * @returns {{confirmar: (opciones: {
 *   titulo: string, mensaje: string, textoConfirmar?: string,
 *   textoCancelar?: string, peligro?: boolean
 * }) => Promise<boolean>}}
 */
export function montarConfirmacion(anfitrion = document.body) {
  const titulo = crear('h2', {
    clase: 'modal__titulo',
    attrs: { id: 'titulo-confirmacion' },
  });
  const mensaje = crear('p', { clase: 'confirmacion__mensaje' });
  const botonCancelar = crear('button', {
    clase: 'boton boton--secundario',
    texto: 'Volver',
    attrs: { type: 'button' },
  });
  const botonConfirmar = crear('button', {
    clase: 'boton boton--primario',
    texto: 'Confirmar',
    attrs: { type: 'button' },
  });

  const dialogo = crear('dialog', {
    clase: 'modal modal--confirmacion',
    attrs: { 'aria-labelledby': 'titulo-confirmacion' },
    hijos: [
      crear('div', {
        clase: 'modal__panel',
        hijos: [
          crear('header', { clase: 'modal__cabecera', hijos: [titulo] }),
          mensaje,
          crear('footer', {
            clase: 'modal__pie',
            hijos: [botonCancelar, botonConfirmar],
          }),
        ],
      }),
    ],
  });

  anfitrion.appendChild(dialogo);

  let resolver = null;
  let respuesta = false;

  // Un único punto de salida: el evento `close` se dispara tanto si se pulsa
  // un botón como con Escape o con un clic en el backdrop. Resolviendo ahí,
  // los tres caminos quedan cubiertos sin repetir código, y ninguna forma de
  // cerrar el diálogo puede dejar la promesa colgada.
  dialogo.addEventListener('close', () => {
    const pendiente = resolver;
    resolver = null;
    if (pendiente) pendiente(respuesta);
  });

  botonConfirmar.addEventListener('click', () => {
    respuesta = true;
    dialogo.close();
  });
  botonCancelar.addEventListener('click', () => dialogo.close());

  // El <dialog> es su propio backdrop: un clic cuyo objetivo sea el diálogo
  // mismo, y no el panel de dentro, cayó fuera.
  dialogo.addEventListener('click', (evento) => {
    if (evento.target === dialogo) dialogo.close();
  });

  function confirmar({
    titulo: textoTitulo,
    mensaje: textoMensaje,
    textoConfirmar = 'Confirmar',
    textoCancelar = 'Volver',
    peligro = false,
  }) {
    respuesta = false;
    titulo.textContent = textoTitulo;
    mensaje.textContent = textoMensaje;
    botonConfirmar.textContent = textoConfirmar;
    botonCancelar.textContent = textoCancelar;
    botonConfirmar.className = peligro
      ? 'boton boton--peligro'
      : 'boton boton--primario';

    return new Promise((resolve) => {
      resolver = resolve;
      dialogo.showModal();
      // La salida segura se lleva el foco en las acciones destructivas.
      (peligro ? botonCancelar : botonConfirmar).focus();
    });
  }

  return { confirmar, dialogo };
}
