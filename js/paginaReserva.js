/**
 * Entrada de reserva.html.
 *
 * Página única para las cuatro cafeterías: todo lo específico sale del
 * parámetro ?cafeteria=<id> de la URL. Orquesta servicios y UI; no conoce el
 * mock ni dibuja nada por su cuenta.
 */

import { getCafeteria } from './services/cafeteriasService.js';
import { getMenuDelDia } from './services/menuService.js';
import {
  getReservasDelDia,
  crearReserva,
  actualizarReserva,
} from './services/reservasService.js';

import { qs, crear, pintar, bloqueEstado, prepararLogo } from './ui/dom.js';
import { crearModalReserva } from './ui/modalReserva.js';
import { montarModalReserva } from './ui/marcadoModalReserva.js';
import * as tabla from './ui/tablaReservas.js';
import { mostrarResumen } from './ui/resumenDelDia.js';
import { montarModalTicket } from './ui/modalTicket.js';

import { PERMITIR_FIN_DE_SEMANA } from './config.js';
import { paramUrl } from './utils/url.js';
import { hoyISO, formatearFechaLarga, esDiaDeServicio } from './utils/fechas.js';

const cafeteriaId = paramUrl('cafeteria');

const vista = {
  contenido: qs('#contenido'),
  nombre: qs('#nombre-cafeteria'),
  ubicacion: qs('#ubicacion-cafeteria'),
  fecha: qs('#fecha-hoy'),
  resumen: qs('#contenedor-resumen'),
  tabla: qs('#contenedor-tabla'),
  botonReservar: qs('#boton-reservar'),
  aviso: qs('#aviso'),
  // El marcado del modal no está en el HTML: lo monta un módulo compartido
  // con la página de administración, para que el formulario exista una sola
  // vez en el proyecto.
  dialogo: montarModalReserva(),
};

/**
 * Estado de la página. Un objeto plano basta para dos vistas.
 *
 * `menu` y `reservas` no están aquí por comodidad: son lo que permite que
 * abrir el formulario y ver una reserva registrada no cuesten un viaje al
 * servidor. Cada viaje a Apps Script son más de mil milisegundos incluso
 * cuando no lee nada, y en un mostrador eso es la diferencia entre responder
 * y hacer esperar.
 */
const estado = {
  cafeteria: null,
  ultimaReservaId: null,
  /** La carta de hoy en esta sede, ya con sus platos fijos. */
  menu: [],
  /** Las reservas activas de hoy, tal como las devolvió el servidor. */
  reservas: [],
  /**
   * Cuántas veces ha escrito esta pantalla desde que cargó.
   *
   * Sirve para resolver una carrera concreta: se registra una reserva, sale
   * el refresco de fondo, y antes de que vuelva se registra otra. Ese
   * refresco pidió la tabla cuando la segunda todavía no existía, así que al
   * llegar la borraría de la pantalla. Comparando el sello de antes y el de
   * después se sabe que llega tarde y se descarta.
   */
  escrituras: 0,
};

/** Anota una escritura local y repinta. Todo cambio propio pasa por aquí. */
function aplicarCambioLocal(reservas) {
  estado.reservas = reservas;
  estado.escrituras++;
  pintarTabla();
}

// Sin `alCancelar`: desde el mostrador NO se cancela. Aquí se corrige lo que
// se escuchó mal, pero anular una reserva es una decisión administrativa y
// vive en admin.html, detrás de su clave. Al no pasar el callback, el modal
// esconde el botón; la regla no depende de que la pantalla se acuerde.
const modal = crearModalReserva({
  dialogo: vista.dialogo,
  alCrear: confirmarReserva,
  alEditar: guardarCambios,
});

const ticket = montarModalTicket();

/* ── Arranque ─────────────────────────────────────────────────────────── */

async function iniciar() {
  prepararLogo();
  vista.fecha.textContent = formatearFechaLarga(hoyISO());

  if (!cafeteriaId) {
    mostrarFalloDePagina(
      'Falta indicar la cafetería',
      'Vuelve al inicio y elige una de las cuatro cafeterías.',
    );
    return;
  }

  // Las tres consultas salen a la vez. Antes iban en fila —la cafetería,
  // luego la tabla, y la carta solo al pulsar «Registrar reserva»— y como
  // cada una cuesta un viaje entero, la página tardaba lo que suman las
  // tres. Ninguna depende del resultado de las otras, así que no hay razón
  // para encadenarlas.
  const diaHabil = esDiaDeServicio(hoyISO());
  const [resCafeteria, resReservas, resMenu] = await Promise.allSettled([
    getCafeteria(cafeteriaId),
    diaHabil ? getReservasDelDia(cafeteriaId) : Promise.resolve([]),
    diaHabil ? getMenuDelDia(cafeteriaId) : Promise.resolve([]),
  ]);

  if (resCafeteria.status === 'rejected') {
    mostrarFalloDePagina('No se encontró esa cafetería', resCafeteria.reason.message);
    return;
  }
  estado.cafeteria = resCafeteria.value;

  document.title = `${estado.cafeteria.nombre} · Reservas UIS`;
  vista.nombre.textContent = estado.cafeteria.nombre;
  vista.ubicacion.textContent = estado.cafeteria.ubicacion;

  // El interruptor de pruebas se anuncia en pantalla, y no solo en un
  // comentario del código: si se queda encendido, el personal registraría
  // reservas de fin de semana que la cocina no va a ver nunca.
  if (PERMITIR_FIN_DE_SEMANA) {
    mostrarAviso(
      'aviso',
      'MODO PRUEBAS: la regla de fin de semana está desactivada. ' +
        'Apaga PERMITIR_FIN_DE_SEMANA en js/config.js antes de usarlo de verdad.',
    );
  }

  // Fin de semana: el botón se queda deshabilitado y la tabla se sustituye
  // por una explicación. Sin esto quedaría un «Todavía no hay reservas para
  // hoy · Usa Registrar reserva para anotar la primera», que invita a hacer
  // algo que la API va a rechazar.
  if (!esDiaDeServicio(hoyISO())) {
    mostrarAviso(
      'aviso',
      'Los sábados y domingos no hay servicio de almuerzo: hoy no se registran reservas.',
    );
    tabla.mostrarSinServicio(vista.tabla);
    return;
  }

  vista.botonReservar.disabled = false;
  // Sin girador: abrir el formulario ya no consulta nada, así que anunciar
  // que el sistema está trabajando sería mentir sobre una espera que no
  // existe. El girador sigue donde hace falta, al guardar.
  vista.botonReservar.addEventListener('click', () => abrirFormulario(null));

  // Si alguna de las dos falló, se pide otra vez y esta sí enseña el error.
  if (resReservas.status === 'fulfilled' && resMenu.status === 'fulfilled') {
    estado.reservas = resReservas.value;
    estado.menu = resMenu.value;
    pintarTabla();
  } else {
    await refrescarTabla();
  }
}

/* ── Tabla ────────────────────────────────────────────────────────────── */

/**
 * Pinta el consolidado y la tabla con lo que ya hay en `estado`.
 *
 * No consulta nada: las cuentas por plato y por cobro salen de las mismas
 * reservas que ya se pintan debajo. Pedírselas al servidor habría añadido un
 * viaje entero a cada refresco para contar lo que ya está en memoria.
 */
function pintarTabla() {
  mostrarResumen(vista.resumen, estado.reservas);
  tabla.mostrarReservas(vista.tabla, estado.reservas, {
    idDestacado: estado.ultimaReservaId,
    alEditar: (reserva) => abrirFormulario(reserva),
    // Desde la fila: es donde está cada reserva y donde se la busca cuando
    // alguien vuelve a pedir su comprobante. El aviso de «reserva
    // registrada» solo lo ofrece la primera vez.
    alVerTicket: (reserva) => ticket.abrir(reserva, estado.cafeteria),
  });
}

/**
 * Vuelve a pedir al servidor la tabla y la carta, las dos a la vez.
 *
 * Van juntas porque tardan lo mismo en paralelo que una sola en serie, y así
 * la carta que guarda `estado` nunca envejece más de un refresco: si el
 * administrador publica un plato nuevo a media mañana, el mostrador lo tiene
 * tras la siguiente reserva sin haber pagado un viaje extra por ello.
 *
 * @param {{enSegundoPlano?: boolean}} [opciones] en segundo plano no muestra
 *        el «cargando» ni el error: la pantalla ya enseña algo correcto y
 *        taparlo sería peor que no refrescar.
 */
async function refrescarTabla({ enSegundoPlano = false } = {}) {
  if (!enSegundoPlano) tabla.mostrarCargando(vista.tabla);
  const sello = estado.escrituras;

  try {
    const [reservas, menu] = await Promise.all([
      getReservasDelDia(estado.cafeteria.id),
      getMenuDelDia(estado.cafeteria.id),
    ]);

    // La carta se acepta siempre: no hay nada local con lo que pueda chocar.
    estado.menu = menu;

    // La tabla no, si mientras tanto se escribió: esta respuesta se pidió
    // antes de ese cambio y no lo incluye. Se queda la versión local, que sí
    // lo tiene, y el siguiente refresco pondrá todo de acuerdo.
    if (enSegundoPlano && sello !== estado.escrituras) return;
    estado.reservas = reservas;
    pintarTabla();
  } catch (error) {
    if (enSegundoPlano) return;
    // El consolidado se va con la tabla: dejar las cifras de la consulta
    // anterior encima de un mensaje de error las haría parecer vigentes.
    mostrarResumen(vista.resumen, []);
    tabla.mostrarError(vista.tabla, error.message, () => refrescarTabla());
  }
}

/* ── Modal ────────────────────────────────────────────────────────────── */

/**
 * Abre el formulario. Con `reserva` en null crea una nueva; con una reserva
 * la edita.
 *
 * Es síncrona a propósito: la carta ya está en `estado` desde que cargó la
 * página y se renueva con cada refresco de la tabla. Antes se pedía aquí, y
 * ese era el retraso que se notaba al pulsar el botón —más de un segundo
 * mirando un girador para enseñar un formulario que ya se podía dibujar—.
 *
 * Que la carta pueda ser de hace unos minutos no abre ningún agujero: el
 * servidor valida el plato al guardar y responde MENU_INVALIDO si ya no está.
 * La pantalla puede ir un momento por detrás; los datos, nunca.
 *
 * @param {import('./services/reservasService.js').Reserva|null} reserva
 */
function abrirFormulario(reserva) {
  ocultarAviso();

  if (estado.menu.length === 0) {
    mostrarAviso(
      'aviso',
      'Hoy no hay carta publicada, así que todavía no se pueden registrar reservas.',
    );
    return;
  }

  modal.abrir({ menu: estado.menu, reserva });
}

/**
 * Se pasa al modal como callback. Si lanza, el modal se queda abierto y
 * muestra el mensaje; si resuelve, el modal se cierra solo.
 */
async function confirmarReserva(datos) {
  const reserva = await crearReserva({
    nombre: datos.nombre,
    telefono: datos.telefono,
    cafeteriaId: estado.cafeteria.id,
    menuId: datos.menuId,
    medio: datos.medio,
    pago: datos.pago,
  });

  estado.ultimaReservaId = reserva.id;
  // El servidor ya la confirmó y la devolvió entera, así que la tabla se
  // pinta con lo que tenemos. Volver a pedirla solo para verla aparecer
  // dejaría el modal abierto y el mostrador esperando otro viaje completo.
  // La relectura va por detrás, para recoger lo que hayan hecho otros.
  aplicarCambioLocal([...estado.reservas, reserva]);
  // El ticket se ofrece, no se impone: un diálogo que apareciera solo tras
  // cada reserva habría que cerrarlo veinte veces por servicio, y eso deshace
  // el trabajo que se hizo para que registrar fuese inmediato.
  mostrarAviso('exito', `Reserva registrada · ${reserva.nombre} · ${reserva.menuNombre}.`, {
    texto: 'Ver ticket',
    alPulsar: () => ticket.abrir(reserva, estado.cafeteria),
  });
  refrescarTabla({ enSegundoPlano: true });
}

/** Igual que la anterior, pero para una reserva que ya existía. */
async function guardarCambios(id, datos) {
  const reserva = await actualizarReserva(id, {
    nombre: datos.nombre,
    telefono: datos.telefono,
    menuId: datos.menuId,
    medio: datos.medio,
    pago: datos.pago,
  });

  estado.ultimaReservaId = reserva.id;
  const cambios = reserva.historial[reserva.historial.length - 1].cambios.length;
  mostrarAviso(
    'exito',
    `Reserva de ${reserva.nombre} actualizada · ` +
      `${cambios} ${cambios === 1 ? 'cambio registrado' : 'cambios registrados'}.`,
  );

  // La fila se sustituye por la que devolvió el servidor —no por lo que el
  // formulario creía haber enviado—, así que la tabla sigue reflejando el
  // servidor sin pagar un viaje más. El refresco de detrás trae el resto.
  aplicarCambioLocal(estado.reservas.map((r) => (r.id === reserva.id ? reserva : r)));
  refrescarTabla({ enSegundoPlano: true });
}

/* ── Avisos y fallos ──────────────────────────────────────────────────── */

/**
 * @param {string} tipo
 * @param {string} mensaje
 * @param {{texto: string, alPulsar: () => void}} [accion] botón dentro del
 *        aviso, para lo que se ofrece pero no se impone.
 */
function mostrarAviso(tipo, mensaje, accion) {
  vista.aviso.className = `aviso aviso--${tipo}`;
  vista.aviso.textContent = mensaje;

  if (accion) {
    vista.aviso.appendChild(crear('button', {
      clase: 'aviso__accion',
      texto: accion.texto,
      attrs: { type: 'button' },
    })).addEventListener('click', accion.alPulsar);
  }

  vista.aviso.hidden = false;
}

function ocultarAviso() {
  vista.aviso.hidden = true;
  vista.aviso.textContent = '';
}

/** Fallo del que la página no puede recuperarse: se reemplaza todo. */
function mostrarFalloDePagina(titulo, detalle) {
  const bloque = bloqueEstado({ tipo: 'error', titulo, detalle });
  const volver = document.createElement('a');
  volver.className = 'boton boton--secundario boton--sm';
  volver.href = 'index.html';
  volver.textContent = 'Volver al inicio';
  bloque.appendChild(volver);
  pintar(vista.contenido, bloque);
}

iniciar();
