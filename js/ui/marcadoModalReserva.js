/**
 * Marcado del modal de reserva, en un solo sitio.
 *
 * Lo usan dos páginas: la de mostrador (`reserva.html`) y la de
 * administración (`admin.html`). Antes vivía escrito a mano dentro de
 * reserva.html, y copiarlo a la segunda página habría garantizado justo lo
 * que evitamos al unificar «crear» y «editar» en un único modal: que un día
 * se corrija la validación —o se añada un campo— en una copia y no en la
 * otra.
 *
 * Aquí solo está la estructura. El comportamiento sigue en `modalReserva.js`,
 * que recibe este <dialog> ya montado.
 */

import { crear } from './dom.js';

/**
 * Un grupo de opciones excluyentes, con radios en vez de un desplegable.
 *
 * Con dos opciones, un radio es un clic y un desplegable son dos —abrir y
 * elegir—, y además las dos alternativas están a la vista sin desplegar nada.
 * En un mostrador donde se rellena esto decenas de veces al día, esa
 * diferencia se nota.
 *
 * Va en un <fieldset> con <legend> y no en un <div> con <label>: es lo que
 * hace que un lector de pantalla anuncie «Pago, grupo» antes de leer las
 * opciones, en lugar de soltar dos radios sueltos sin contexto.
 */
function grupoOpciones(nombre, etiqueta, opciones, claveError) {
  return crear('fieldset', {
    clase: 'campo campo--opciones',
    hijos: [
      crear('legend', { clase: 'campo__etiqueta', texto: etiqueta }),
      crear('div', {
        clase: 'opciones',
        hijos: opciones.map(({ valor, texto }) => {
          const id = `campo-${nombre}-${valor}`;
          return crear('label', {
            clase: 'opcion',
            attrs: { for: id },
            hijos: [
              crear('input', {
                clase: 'opcion__radio',
                attrs: { type: 'radio', id, name: nombre, value: valor },
              }),
              crear('span', { clase: 'opcion__texto', texto }),
            ],
          });
        }),
      }),
      crear('p', { clase: 'campo__error', attrs: { 'data-error': claveError } }),
    ],
  });
}

/** Un campo: etiqueta, control y hueco para su mensaje de error. */
function campo(idControl, etiqueta, control, claveError) {
  return crear('div', {
    clase: 'campo',
    hijos: [
      crear('label', {
        clase: 'campo__etiqueta',
        texto: etiqueta,
        attrs: { for: idControl },
      }),
      control,
      crear('p', { clase: 'campo__error', attrs: { 'data-error': claveError } }),
    ],
  });
}

/**
 * Construye el <dialog> del formulario de reserva y lo cuelga del documento.
 *
 * @param {HTMLElement} [anfitrion]  dónde insertarlo; por defecto, el body
 * @returns {HTMLDialogElement}
 */
export function montarModalReserva(anfitrion = document.body) {
  const cerrarCabecera = crear('button', {
    clase: 'modal__cerrar',
    texto: '×',
    attrs: { type: 'button', 'data-cerrar': '', 'aria-label': 'Cerrar' },
  });

  const nombre = crear('input', {
    clase: 'campo__control',
    attrs: {
      id: 'campo-nombre',
      name: 'nombre',
      type: 'text',
      // autocomplete="off" a propósito: quien teclea es el personal, y el
      // autocompletado le ofrecería SUS datos, no los de quien reserva.
      autocomplete: 'off',
      placeholder: 'Laura Camila Ardila',
    },
  });

  const telefono = crear('input', {
    clase: 'campo__control',
    attrs: {
      id: 'campo-telefono',
      name: 'telefono',
      type: 'tel',
      // inputmode="tel" saca el teclado numérico en el celular sin que el
      // navegador intente validar el formato por su cuenta.
      inputmode: 'tel',
      autocomplete: 'off',
      placeholder: '300 123 4567',
    },
  });

  const menu = crear('select', {
    clase: 'campo__control',
    attrs: { id: 'campo-menu', name: 'menu' },
  });

  const formulario = crear('form', {
    clase: 'modal__panel',
    attrs: { novalidate: '' },
    hijos: [
      crear('header', {
        clase: 'modal__cabecera',
        hijos: [
          crear('h2', {
            clase: 'modal__titulo',
            texto: 'Registrar reserva',
            attrs: { id: 'titulo-modal' },
          }),
          cerrarCabecera,
        ],
      }),
      // Solo al editar: identifica QUÉ reserva se está tocando, que en una
      // tabla de veinte filas parecidas no es evidente.
      crear('p', {
        clase: 'modal__identificador',
        attrs: { 'data-identificador': '', hidden: true },
      }),
      crear('p', {
        clase: 'modal__nota',
        texto: 'Solo se registran reservas para el día de hoy.',
        attrs: { 'data-nota': '' },
      }),
      crear('p', {
        clase: 'modal__error',
        attrs: { 'data-error-general': '', role: 'alert', hidden: true },
      }),
      campo('campo-nombre', 'Nombre de quien reserva', nombre, 'nombre'),
      campo('campo-telefono', 'Móvil de contacto', telefono, 'telefono'),
      campo('campo-menu', 'Menú del día', menu, 'menu'),
      // Ninguno viene preseleccionado a propósito: en «Pago» un valor por
      // defecto acabaría marcando como pagado lo que no lo está, y eso es
      // dinero. Se obliga a elegir.
      grupoOpciones('medio', 'Medio de reserva', [
        { valor: 'presencial', texto: 'Presencial' },
        { valor: 'telefono', texto: 'Teléfono' },
      ], 'medio'),
      grupoOpciones('pago', 'Pago', [
        { valor: 'pagado', texto: 'Pagado' },
        { valor: 'debe', texto: 'Debe' },
      ], 'pago'),
      // Solo visible al editar: una reserva nueva no tiene nada que contar.
      crear('section', {
        clase: 'historial',
        attrs: { 'data-historial': '', hidden: true },
        hijos: [
          crear('h3', { clase: 'historial__titulo', texto: 'Historial de la reserva' }),
          crear('ol', {
            clase: 'historial__lista',
            attrs: { 'data-historial-lista': '' },
          }),
        ],
      }),
      crear('footer', {
        clase: 'modal__pie',
        hijos: [
          // Solo aparece al editar, y va separado a la izquierda: es la
          // acción destructiva y no debe quedar pegada a «Guardar cambios»,
          // donde se pulsa por inercia.
          crear('button', {
            clase: 'boton boton--peligro-plano modal__pie-aparte',
            texto: 'Cancelar reserva',
            attrs: { type: 'button', 'data-cancelar-reserva': '', hidden: true },
          }),
          // No hay botón de cerrar en el pie: para salir sin guardar están la
          // × de la cabecera, la tecla Escape y el clic en el fondo. Un
          // «Cancelar» junto a «Guardar cambios» solo añadía ruido —y al
          // editar competía con «Cancelar reserva», que sí destruye algo.
          crear('button', {
            clase: 'boton boton--primario',
            texto: 'Registrar reserva',
            attrs: { type: 'submit', 'data-confirmar': '' },
          }),
        ],
      }),
    ],
  });

  // <dialog> nativo a propósito: trae gratis el foco atrapado, el cierre con
  // Escape, el backdrop y el aria-modal, que a mano son cien líneas fáciles
  // de hacer mal.
  const dialogo = crear('dialog', {
    clase: 'modal',
    attrs: { id: 'dialogo-reserva', 'aria-labelledby': 'titulo-modal' },
    hijos: [formulario],
  });

  anfitrion.appendChild(dialogo);
  return dialogo;
}
