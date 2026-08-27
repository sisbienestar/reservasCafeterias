/**
 * Modal que enseña el ticket de una reserva.
 *
 * No se abre solo al registrar. El mostrador atiende rápido y un diálogo que
 * aparece después de cada reserva obligaría a cerrarlo veinte veces por
 * servicio, deshaciendo justo el trabajo que se hizo para que registrar sea
 * inmediato. Se abre cuando alguien lo pide: desde el aviso de «reserva
 * registrada» o desde el formulario de edición.
 *
 * El ticket se muestra dentro de un `<pre>`, no reconstruido con etiquetas.
 * Lo que se ve en pantalla es exactamente la misma cadena que se copia y que
 * se enviará por WhatsApp: mantener dos versiones —una bonita y otra de
 * texto— es garantizar que un día digan cosas distintas.
 */

import { crear } from './dom.js';
import { construirTicket, mensajeWhatsApp, enlaceWhatsApp } from '../utils/ticket.js';

/**
 * Monta el diálogo una vez y devuelve cómo abrirlo.
 *
 * @param {HTMLElement} [anfitrion]
 * @returns {{abrir: (reserva: object, cafeteria: object) => void}}
 */
export function montarModalTicket(anfitrion = document.body) {
  const papel = crear('pre', { clase: 'ticket' });

  const aviso = crear('p', {
    clase: 'ticket__aviso',
    attrs: { role: 'status', hidden: true },
  });

  const botonCopiar = crear('button', {
    clase: 'boton boton--secundario',
    texto: 'Copiar ticket',
    attrs: { type: 'button' },
  });

  // Enlace y no botón: abre WhatsApp con el mensaje ya escrito y **quien
  // atiende pulsa enviar**. Nada sale de aquí por su cuenta, que es lo
  // correcto mientras no exista la automatización con su plantilla aprobada.
  const enlaceEnviar = crear('a', {
    clase: 'boton boton--primario',
    texto: 'Abrir en WhatsApp',
    attrs: { target: '_blank', rel: 'noopener' },
  });

  const cerrar = crear('button', {
    clase: 'modal__cerrar',
    texto: '×',
    attrs: { type: 'button', 'aria-label': 'Cerrar' },
  });

  const dialogo = crear('dialog', {
    clase: 'modal modal--ticket',
    attrs: { 'aria-labelledby': 'titulo-ticket' },
    hijos: [
      crear('div', {
        clase: 'modal__panel',
        hijos: [
          crear('header', {
            clase: 'modal__cabecera',
            hijos: [
              crear('h2', {
                clase: 'modal__titulo',
                texto: 'Ticket de confirmación',
                attrs: { id: 'titulo-ticket' },
              }),
              cerrar,
            ],
          }),
          crear('p', {
            clase: 'modal__nota',
            texto: 'Se envía por WhatsApp al móvil de la reserva.',
          }),
          papel,
          aviso,
          crear('footer', {
            clase: 'modal__pie',
            hijos: [botonCopiar, enlaceEnviar],
          }),
        ],
      }),
    ],
  });

  anfitrion.appendChild(dialogo);
  cerrar.addEventListener('click', () => dialogo.close());

  function decir(texto, esFallo = false) {
    aviso.textContent = texto;
    aviso.hidden = false;
    aviso.classList.toggle('ticket__aviso--error', esFallo);
  }

  botonCopiar.addEventListener('click', async () => {
    // El portapapeles falla por motivos que no dependen de nadie —permiso
    // denegado, página servida sin HTTPS—, así que hay una salida: si no se
    // puede copiar, se selecciona el texto para que baste con Ctrl+C.
    try {
      await navigator.clipboard.writeText(papel.dataset.paraEnviar);
      decir('Ticket copiado. Ya se puede pegar en WhatsApp.');
    } catch (error) {
      seleccionar(papel);
      decir('No se pudo copiar solo: el ticket quedó seleccionado, pulsa Ctrl+C.', true);
    }
  });

  return {
    /**
     * @param {import('../services/reservasService.js').Reserva} reserva
     * @param {{nombre: string, ubicacion?: string}} cafeteria
     */
    abrir(reserva, cafeteria) {
      papel.textContent = construirTicket(reserva, cafeteria);
      // Lo que se copia lleva las comillas de WhatsApp; lo que se ve, no.
      // Enseñarlas en pantalla sería enseñar la fontanería.
      papel.dataset.paraEnviar = mensajeWhatsApp(reserva, cafeteria);

      const enlace = enlaceWhatsApp(reserva, cafeteria);
      if (enlace) {
        enlaceEnviar.href = enlace;
        enlaceEnviar.hidden = false;
      } else {
        // Sin un móvil de diez dígitos no hay a quién escribir. Se esconde el
        // enlace en vez de dejarlo roto: un botón que no lleva a ninguna
        // parte se pulsa igual, y entonces el fallo parece del sistema.
        enlaceEnviar.hidden = true;
      }

      aviso.hidden = true;
      dialogo.showModal();
      botonCopiar.focus();
    },
  };
}

/** Selecciona el contenido de un nodo, para que Ctrl+C funcione. */
function seleccionar(nodo) {
  const rango = document.createRange();
  rango.selectNodeContents(nodo);
  const seleccion = window.getSelection();
  seleccion.removeAllRanges();
  seleccion.addRange(rango);
}
