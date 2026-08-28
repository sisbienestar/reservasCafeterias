/**
 * Modal de reserva. Sirve para crear y para editar.
 *
 * El marcado vive en reserva.html dentro de un <dialog>; aquí solo va el
 * comportamiento. Se usa <dialog> nativo a propósito: trae gratis el foco
 * atrapado, el cierre con Escape, el backdrop y el `aria-modal`, que a mano
 * son cien líneas fáciles de hacer mal.
 *
 * Un solo modal para los dos modos y no dos modales: los campos son los
 * mismos y duplicarlos garantizaría que un día se corrija la validación en
 * uno y no en el otro. Lo que cambia entre modos son los rótulos, los valores
 * de partida, el historial y a qué callback se llama al guardar.
 *
 * El módulo no sabe nada de servicios: recibe los datos ya cargados y avisa
 * de la confirmación con un callback. Quien orquesta es paginaReserva.js.
 */

import { qs, qsa, crear, pintar } from './dom.js';
import { normalizarTelefono, formatearTelefono } from '../utils/telefono.js';
import { formatearMarcaTemporal } from '../utils/fechas.js';

/** Nombre visible de cada campo en el historial. */
const ETIQUETA_CAMPO = {
  nombre: 'Nombre',
  telefono: 'Móvil',
  menu: 'Menú',
};

/** Encabezado de cada asiento del historial, según su tipo. */
const ETIQUETA_ASIENTO = {
  creacion: 'Reserva registrada',
  modificacion: 'Reserva modificada',
  cancelacion: 'Reserva cancelada',
};

/**
 * @param {{dialogo: HTMLDialogElement, alCrear: Function, alEditar: Function,
 *          alCancelar: Function}} opciones
 *        alCrear(datos) · alEditar(id, datos). Si lanzan, el modal se queda
 *        abierto y muestra el mensaje; si resuelven, se cierra solo.
 *
 *        alCancelar(reserva) → Promise<boolean>. Devuelve `true` si la reserva
 *        se canceló de verdad y `false` si quien lo pidió se echó atrás: el
 *        modal solo se cierra en el primer caso.
 *
 *        Es OPCIONAL. Sin él, el botón «Cancelar reserva» no aparece: es como
 *        la pantalla de mostrador impide anular reservas reutilizando este
 *        mismo formulario.
 */
export function crearModalReserva({ dialogo, alCrear, alEditar, alCancelar }) {
  const formulario = qs('form', dialogo);
  const titulo = qs('#titulo-modal', dialogo);
  const nota = qs('[data-nota]', dialogo);
  const campoNombre = qs('#campo-nombre', dialogo);
  const campoTelefono = qs('#campo-telefono', dialogo);
  const campoMenu = qs('#campo-menu', dialogo);
  const radios = (nombre) => qsa(`input[name="${nombre}"]`, dialogo);
  const cajaError = qs('[data-error-general]', dialogo);
  const botonConfirmar = qs('[data-confirmar]', dialogo);
  const botonCancelarReserva = qs('[data-cancelar-reserva]', dialogo);
  const identificador = qs('[data-identificador]', dialogo);
  const bloqueHistorial = qs('[data-historial]', dialogo);
  const listaHistorial = qs('[data-historial-lista]', dialogo);

  let enviando = false;
  /** Reserva que se está editando, o null si se está creando una nueva. */
  let enEdicion = null;

  // Hoy solo la × de la cabecera, pero se recorren todos por si el marcado
  // añade otra salida más adelante.
  qsa('[data-cerrar]', dialogo).forEach((boton) =>
    boton.addEventListener('click', () => dialogo.close()),
  );

  // Clic en el backdrop: el <dialog> es su propio backdrop, así que un clic
  // cuyo objetivo sea el diálogo mismo (y no un hijo) cayó fuera del panel.
  dialogo.addEventListener('click', (evento) => {
    if (evento.target === dialogo && !enviando) dialogo.close();
  });

  dialogo.addEventListener('cancel', (evento) => {
    if (enviando) evento.preventDefault();
  });

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (enviando) return;

    limpiarErrores();
    const datos = leerFormulario();
    const errores = validar(datos);

    if (Object.keys(errores).length > 0) {
      marcarErrores(errores);
      return;
    }

    bloquear(true);
    try {
      if (enEdicion) await alEditar(enEdicion.id, datos);
      else await alCrear(datos);
      bloquear(false);
      dialogo.close();
    } catch (error) {
      // Se reactivan los campos ANTES de mover el foco: enfocar un control
      // deshabilitado no hace nada y el cursor se quedaría fuera del modal.
      bloquear(false);
      mostrarErrorGeneral(error.message);
      // El duplicado se resuelve cambiando el móvil, así que se apunta ahí.
      if (error.codigo === 'RESERVA_DUPLICADA') campoTelefono.focus();
    }
  });

  /**
   * Cancelar desde dentro del modal.
   *
   * Quien decide si de verdad se cancela es `alCancelar`, que pide su propia
   * confirmación: por eso puede devolver `false` sin que eso sea un error. El
   * modal solo se cierra cuando la cancelación ocurrió, para que decir «no»
   * devuelva a la edición en la que se estaba.
   */
  botonCancelarReserva.addEventListener('click', async () => {
    // El botón está oculto sin `alCancelar`, pero se comprueba igual: nada
    // impide invocarlo desde la consola, y esta es la última barrera.
    if (enviando || !enEdicion || !alCancelar) return;

    limpiarErrores();
    bloquear(true, botonCancelarReserva, 'Cancelando…');
    try {
      const cancelada = await alCancelar(enEdicion);
      bloquear(false, botonCancelarReserva);
      if (cancelada) dialogo.close();
    } catch (error) {
      bloquear(false, botonCancelarReserva);
      mostrarErrorGeneral(error.message);
    }
  });

  /** El móvil sale ya normalizado a diez dígitos; null si no es válido. */
  /** El valor marcado de un grupo de radios, o '' si no hay ninguno. */
  const marcado = (nombre) => radios(nombre).find((r) => r.checked)?.value ?? '';

  function leerFormulario() {
    return {
      nombre: campoNombre.value.trim(),
      telefono: normalizarTelefono(campoTelefono.value),
      menuId: campoMenu.value,
      medio: marcado('medio'),
      pago: marcado('pago'),
    };
  }

  function validar({ nombre, telefono, menuId, medio, pago }) {
    const errores = {};
    if (nombre.length < 3) {
      errores.nombre = 'Escribe el nombre completo de la persona.';
    }
    if (telefono === null) {
      errores.telefono = 'Escribe un móvil de diez dígitos, por ejemplo 300 123 4567.';
    }
    if (!menuId) errores.menu = 'Elige una opción del menú.';
    if (!medio) errores.medio = 'Indica si la reserva se hizo presencial o por teléfono.';
    if (!pago) errores.pago = 'Indica si ya pagó o queda debiendo.';
    return errores;
  }

  function marcarErrores(errores) {
    const campos = {
      nombre: campoNombre,
      telefono: campoTelefono,
      menu: campoMenu,
      // El foco va al primer radio del grupo: enfocar el <fieldset> no lleva
      // a ninguna parte y quien navega con teclado se queda sin saber dónde.
      medio: radios('medio')[0],
      pago: radios('pago')[0],
    };
    for (const [clave, mensaje] of Object.entries(errores)) {
      const campo = campos[clave];
      campo.setAttribute('aria-invalid', 'true');
      const destino = qs(`[data-error="${clave}"]`, dialogo);
      if (destino) destino.textContent = mensaje;
    }
    const primero = campos[Object.keys(errores)[0]];
    primero.focus();
  }

  function limpiarErrores() {
    [campoNombre, campoTelefono, campoMenu, ...radios('medio'), ...radios('pago')]
      .forEach((campo) => campo.removeAttribute('aria-invalid'));
    dialogo.querySelectorAll('[data-error]').forEach((n) => { n.textContent = ''; });
    cajaError.textContent = '';
    cajaError.hidden = true;
  }

  function mostrarErrorGeneral(mensaje) {
    cajaError.textContent = mensaje;
    cajaError.hidden = false;
  }

  /**
   * Bloquea el formulario mientras hay una petición en marcha.
   *
   * `enTrabajo` es el botón que se pulsó, y es el único que muestra el
   * girador: si al cancelar la señal apareciera en «Guardar cambios», estaría
   * apuntando a la acción equivocada.
   */
  function bloquear(estado, enTrabajo = botonConfirmar, texto = 'Guardando…') {
    enviando = estado;
    botonConfirmar.disabled = estado;
    botonCancelarReserva.disabled = estado;
    formulario.querySelectorAll('input, select').forEach((campo) => {
      campo.disabled = estado;
    });

    if (estado) {
      enTrabajo.setAttribute('aria-busy', 'true');
      enTrabajo.replaceChildren(
        crear('span', { clase: 'boton__girador', attrs: { 'aria-hidden': 'true' } }),
        document.createTextNode(texto),
      );
    } else {
      enTrabajo.removeAttribute('aria-busy');
      enTrabajo.replaceChildren(
        document.createTextNode(
          enTrabajo === botonConfirmar ? textoBotonGuardar() : 'Cancelar reserva',
        ),
      );
    }
  }

  const textoBotonGuardar = () => (enEdicion ? 'Guardar cambios' : 'Registrar reserva');

  /* ── Historial ──────────────────────────────────────────────────────── */

  /** Un cambio suelto: 'Menú: Bandeja paisa → Pasta al pesto'. */
  function lineaCambio({ campo, antes, despues }) {
    const valor = (v) => (campo === 'telefono' ? formatearTelefono(v) : v);
    return crear('li', {
      clase: 'historial__cambio',
      texto: `${ETIQUETA_CAMPO[campo] ?? campo}: ${valor(antes)} → ${valor(despues)}`,
    });
  }

  function asientoHistorial(asiento) {
    const encabezado = crear('p', {
      clase: 'historial__marca',
      texto: `${ETIQUETA_ASIENTO[asiento.tipo] ?? 'Cambio'} · ${formatearMarcaTemporal(asiento.timestamp)}`,
    });

    const cambios = asiento.cambios ?? [];
    return crear('li', {
      clase: 'historial__asiento',
      hijos: [
        encabezado,
        cambios.length > 0
          ? crear('ul', {
              clase: 'historial__cambios',
              hijos: cambios.map(lineaCambio),
            })
          : null,
      ],
    });
  }

  /**
   * Pinta el historial, del asiento más reciente al más antiguo: lo que
   * interesa al abrir es el último cambio, no el alta.
   */
  function pintarHistorial(reserva) {
    if (!reserva || reserva.historial.length === 0) {
      bloqueHistorial.hidden = true;
      pintar(listaHistorial);
      return;
    }
    const recientesPrimero = [...reserva.historial].reverse();
    pintar(listaHistorial, ...recientesPrimero.map(asientoHistorial));
    bloqueHistorial.hidden = false;
  }

  /** Deja marcado el valor dado, o ninguno si no viene. */
  function marcar(nombre, valor) {
    radios(nombre).forEach((r) => { r.checked = r.value === valor; });
  }

  /* ── Apertura ───────────────────────────────────────────────────────── */

  /** Rellena el desplegable del menú y deja elegido el plato de la reserva. */
  function pintarMenu(menu, menuIdActual) {
    // Una sola lista, sin encabezados. Los platos fijos van al final porque
    // el servidor los devuelve así, no porque la vista los reordene.
    pintar(
      campoMenu,
      crear('option', { texto: 'Selecciona un plato', attrs: { value: '' } }),
      ...menu.map((o) => crear('option', { texto: o.nombre, attrs: { value: o.id } })),
    );
    // Si el plato de una reserva vieja ya no está en la carta de hoy, el
    // value no existe y el select se queda en el placeholder: hay que elegir
    // de nuevo, que es exactamente lo correcto.
    campoMenu.value = menuIdActual ?? '';
  }

  /**
   * @param {{menu: {id: string, nombre: string}[],
   *          reserva?: import('../services/reservasService.js').Reserva|null}} datos
   *        Sin `reserva` el modal abre en modo creación.
   */
  function abrir({ menu, reserva = null }) {
    enEdicion = reserva;
    limpiarErrores();
    formulario.reset();

    titulo.textContent = reserva ? 'Editar reserva' : 'Registrar reserva';
    nota.textContent = reserva
      ? 'Se puede cambiar el nombre, el móvil y el plato. Cada cambio queda en el historial.'
      : 'Solo se registran reservas para el día de hoy.';
    botonConfirmar.textContent = textoBotonGuardar();
    botonCancelarReserva.textContent = 'Cancelar reserva';

    // El identificador entero —cafetería, fecha y consecutivo— y no solo el
    // número corto de la tabla: aquí es donde se comprueba que se está
    // editando la reserva correcta, y para eso hacen falta las tres partes.
    if (reserva && reserva.id) {
      identificador.textContent = `Reserva n.º ${reserva.id}`;
      identificador.hidden = false;
    } else {
      identificador.hidden = true;
    }

    // Cancelar la reserva solo tiene sentido sobre una que ya existe, y solo
    // donde esté permitido: sin `alCancelar` el botón no aparece. Así el
    // mostrador no lo ofrece por el hecho de usar el mismo formulario.
    botonCancelarReserva.hidden = !reserva || !alCancelar;

    campoNombre.value = reserva ? reserva.nombre : '';
    campoTelefono.value = reserva ? formatearTelefono(reserva.telefono) : '';
    // Una reserva vieja puede no traer estos campos: entonces se queda sin
    // marcar y hay que elegir, que es lo correcto.
    marcar('medio', reserva?.medio);
    marcar('pago', reserva?.pago);
    pintarMenu(menu, reserva ? reserva.menuId : '');
    pintarHistorial(reserva);

    dialogo.showModal();
    campoNombre.focus();
  }

  return { abrir, cerrar: () => dialogo.close() };
}
