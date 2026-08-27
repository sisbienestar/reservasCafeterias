/**
 * Entrada de admin.html.
 *
 * Orquesta las tres pestañas. Como el resto de páginas, habla solo con la
 * capa de servicios y no dibuja nada por su cuenta: de eso se encargan los
 * módulos de js/ui/.
 *
 * Una decisión que se nota en toda la pantalla: `buscarReservas` devuelve el
 * detalle y el consolidado en la misma respuesta, así que el resultado se
 * guarda en `estado.resultado` y cambiar entre las pestañas «Reservas» y
 * «Consolidado» no vuelve a consultar nada. Se consulta al aplicar filtros,
 * que es cuando de verdad cambia lo que hay que mirar.
 */

import {
  getCafeterias,
  crearCafeteria,
  actualizarCafeteria,
  archivarCafeteria,
  reactivarCafeteria,
} from './services/cafeteriasService.js';
import { getMenuDelDia, getMenuSemana, guardarMenuSemana } from './services/menuService.js';
import {
  buscarReservas,
  actualizarReserva,
  cancelarReserva,
} from './services/reservasService.js';

import { qs, qsa, pintar, crear, prepararLogo } from './ui/dom.js';
import { crearModalReserva } from './ui/modalReserva.js';
import { montarModalReserva } from './ui/marcadoModalReserva.js';
import { montarConfirmacion } from './ui/modalConfirmacion.js';
import { montarModalTicket } from './ui/modalTicket.js';
import { pedirAcceso, cerrarSesion } from './ui/accesoAdmin.js';
import { conCarga } from './ui/boton.js';
import * as tablaAdmin from './ui/adminReservas.js';
import { mostrarConsolidado } from './ui/adminConsolidado.js';
import { mostrarCafeterias, montarSemana } from './ui/adminCatalogo.js';

import {
  hoyISO,
  sumarDias,
  lunesDeEstaSemana,
  lunesDeSemana,
  formatearFechaCorta,
} from './utils/fechas.js';
import { formatearTelefono } from './utils/telefono.js';
import { aCSV, descargarTexto } from './utils/csv.js';

const vista = {
  aviso: qs('#aviso'),
  filtros: qs('#filtros'),
  periodo: qs('#filtro-periodo'),
  desde: qs('#filtro-desde'),
  hasta: qs('#filtro-hasta'),
  cafeteria: qs('#filtro-cafeteria'),
  estado: qs('#filtro-estado'),
  texto: qs('#filtro-texto'),
  tablaReservas: qs('#tabla-reservas'),
  indicadores: qs('#indicadores'),
  cuerpoConsolidado: qs('#cuerpo-consolidado'),

  formularioCafeteria: qs('#formulario-cafeteria'),
  cafeteriaNombre: qs('#cafeteria-nombre'),
  cafeteriaUbicacion: qs('#cafeteria-ubicacion'),
  cafeteriaFijos: qs('#cafeteria-fijos'),
  botonGuardarCafeteria: qs('#boton-guardar-cafeteria'),
  botonCancelarEdicion: qs('#boton-cancelar-edicion'),
  avisoCafeteria: qs('#aviso-cafeteria'),
  tablaCafeterias: qs('#tabla-cafeterias'),

  rotuloSemana: qs('#rotulo-semana'),
  rejillaCarta: qs('#rejilla-carta'),
  avisoCarta: qs('#aviso-carta'),
  botonGuardarSemana: qs('#boton-guardar-semana'),
  botonCopiarSemana: qs('#boton-copiar-semana'),

  dialogo: montarModalReserva(),
};

const estado = {
  /** Última respuesta de `buscarReservas`, compartida por dos pestañas. */
  resultado: null,
  /** Cafeterías, incluidas las cerradas: el histórico apunta a ellas. */
  cafeterias: [],
  /** Cafetería que se está editando en el catálogo, o null si se está creando. */
  cafeteriaEnEdicion: null,
  lunesCarta: lunesDeEstaSemana(),
  /** Mando del editor de la carta, devuelto por `montarSemana`. */
  semana: null,
  vistaActiva: 'reservas',
};

const modal = crearModalReserva({
  dialogo: vista.dialogo,
  // Desde administración no se crean reservas: se registran en el mostrador,
  // que es donde está la persona. Aquí solo se corrigen.
  alCrear: () => {
    throw new Error('Las reservas se registran desde la pantalla de mostrador.');
  },
  alEditar: guardarCambiosReserva,
  alCancelar: pedirCancelacion,
});

const { confirmar } = montarConfirmacion();
const ticket = montarModalTicket();

/** Etiqueta visible de los campos de opción, para el CSV. */
const ETIQUETAS = {
  presencial: 'Presencial',
  telefono: 'Teléfono',
  pagado: 'Pagado',
  debe: 'Debe',
};

const nombreCafeteria = (id) =>
  estado.cafeterias.find((c) => c.id === id)?.nombre ?? id;

/* ── Avisos ───────────────────────────────────────────────────────────── */

function mostrarAviso(nodo, tipo, mensaje) {
  nodo.className = `aviso aviso--${tipo}`;
  nodo.textContent = mensaje;
  nodo.hidden = false;
}

function ocultarAviso(nodo) {
  nodo.hidden = true;
  nodo.textContent = '';
}

/* ── Pestañas ─────────────────────────────────────────────────────────── */

const PESTANAS = ['reservas', 'consolidado', 'catalogo'];

function cambiarVista(nombre) {
  estado.vistaActiva = nombre;

  qsa('.pestana').forEach((boton) => {
    const activa = boton.dataset.vista === nombre;
    boton.setAttribute('aria-selected', String(activa));
    boton.classList.toggle('pestana--activa', activa);
  });

  PESTANAS.forEach((clave) => {
    qs(`#vista-${clave}`).hidden = clave !== nombre;
  });

  // Los filtros mandan sobre las dos primeras pestañas y no pintan nada en
  // el catálogo, así que ahí se retiran en vez de quedarse inertes.
  vista.filtros.hidden = nombre === 'catalogo';

  if (nombre === 'consolidado' && estado.resultado) {
    mostrarConsolidado(
      { indicadores: vista.indicadores, cuerpo: vista.cuerpoConsolidado },
      estado.resultado.resumen,
    );
  }
  if (nombre === 'catalogo') cargarCatalogo();
}

function conectarPestanas() {
  const botones = qsa('.pestana');
  botones.forEach((boton, i) => {
    boton.addEventListener('click', () => cambiarVista(boton.dataset.vista));
    // Flechas para moverse entre pestañas: es lo que espera quien navega con
    // teclado en un tablist, y sin esto el patrón ARIA queda a medias.
    boton.addEventListener('keydown', (evento) => {
      const salto = evento.key === 'ArrowRight' ? 1 : evento.key === 'ArrowLeft' ? -1 : 0;
      if (salto === 0) return;
      evento.preventDefault();
      const destino = botones[(i + salto + botones.length) % botones.length];
      destino.focus();
      cambiarVista(destino.dataset.vista);
    });
  });
}

/* ── Filtros ──────────────────────────────────────────────────────────── */

/** Primer día del mes al que pertenece una fecha ISO. */
const primeroDelMes = (fechaISO) => `${fechaISO.slice(0, 8)}01`;

/** Traduce el desplegable de periodo a un par de fechas. */
function rangoDePeriodo(periodo) {
  const hoy = hoyISO();
  switch (periodo) {
    case 'hoy':
      return [hoy, hoy];
    case 'semana':
      return [lunesDeEstaSemana(), sumarDias(lunesDeEstaSemana(), 6)];
    case 'semana-pasada': {
      const lunesPasado = sumarDias(lunesDeEstaSemana(), -7);
      return [lunesPasado, sumarDias(lunesPasado, 6)];
    }
    case '30':
      return [sumarDias(hoy, -29), hoy];
    case 'mes':
      return [primeroDelMes(hoy), hoy];
    case 'mes-pasado': {
      const finMesPasado = sumarDias(primeroDelMes(hoy), -1);
      return [primeroDelMes(finMesPasado), finMesPasado];
    }
    case 'todo':
      return [sumarDias(hoy, -180), hoy];
    default:
      return null; // personalizado: mandan las fechas que haya escritas
  }
}

function aplicarPeriodo() {
  const rango = rangoDePeriodo(vista.periodo.value);
  if (!rango) return;
  [vista.desde.value, vista.hasta.value] = rango;
}

function leerFiltros() {
  return {
    desde: vista.desde.value,
    hasta: vista.hasta.value,
    cafeteriaId: vista.cafeteria.value,
    estado: vista.estado.value,
    texto: vista.texto.value.trim(),
  };
}

/* ── Búsqueda ─────────────────────────────────────────────────────────── */

async function buscar() {
  const filtros = leerFiltros();
  if (!filtros.desde || !filtros.hasta) {
    mostrarAviso(vista.aviso, 'aviso', 'Indica las dos fechas del rango.');
    return;
  }
  if (filtros.desde > filtros.hasta) {
    mostrarAviso(vista.aviso, 'aviso', 'La fecha inicial es posterior a la final.');
    return;
  }

  ocultarAviso(vista.aviso);
  tablaAdmin.mostrarCargando(vista.tablaReservas);

  try {
    estado.resultado = await buscarReservas(filtros);
    pintarResultado();
  } catch (error) {
    tablaAdmin.mostrarError(vista.tablaReservas, error.message, buscar);
  }
}

function pintarResultado() {
  tablaAdmin.mostrarReservas(vista.tablaReservas, estado.resultado.reservas, {
    total: estado.resultado.total,
    nombreCafeteria,
    alEditar: abrirEdicion,
    // Aquí es donde más falta hace: administración ve reservas de cualquier
    // día, así que es el único sitio desde el que se puede volver a mandar el
    // ticket de una que ya no está en la pantalla del mostrador.
    alVerTicket: (reserva) => ticket.abrir(reserva, {
      nombre: nombreCafeteria(reserva.cafeteriaId),
    }),
  });

  if (estado.vistaActiva === 'consolidado') {
    mostrarConsolidado(
      { indicadores: vista.indicadores, cuerpo: vista.cuerpoConsolidado },
      estado.resultado.resumen,
    );
  }
}

/* ── Editar y cancelar reservas ───────────────────────────────────────── */

/**
 * Cartas ya consultadas, por sede y fecha.
 *
 * Revisar un día es abrir una reserva detrás de otra, todas de la misma fecha
 * y casi siempre de la misma sede. Sin esto, cada una pagaba su viaje entero
 * para traer exactamente la misma carta que la anterior.
 *
 * Se vacía al publicar una carta nueva, que es lo único que puede cambiarla
 * desde aquí.
 */
const cartasVistas = new Map();

async function cartaDeLaReserva(reserva) {
  const clave = `${reserva.cafeteriaId}|${reserva.fecha}`;
  if (!cartasVistas.has(clave)) {
    cartasVistas.set(clave, await getMenuDelDia(reserva.cafeteriaId, reserva.fecha));
  }
  return cartasVistas.get(clave);
}

async function abrirEdicion(reserva) {
  ocultarAviso(vista.aviso);
  try {
    // La carta se pide para la fecha DE LA RESERVA, no para hoy: se está
    // corrigiendo una reserva que puede ser de hace tres semanas, y la carta
    // que la valida es la de aquel día.
    const menu = await cartaDeLaReserva(reserva);
    if (menu.length === 0) {
      mostrarAviso(
        vista.aviso,
        'aviso',
        `El ${formatearFechaCorta(reserva.fecha)} no hay carta publicada, ` +
          'así que no se puede reasignar el plato.',
      );
      return;
    }
    modal.abrir({ menu, reserva });
  } catch (error) {
    mostrarAviso(vista.aviso, 'error', `No se pudo abrir el formulario: ${error.message}`);
  }
}

/**
 * El aviso se muestra DESPUÉS de refrescar, no antes: `buscar()` empieza
 * limpiando el aviso —para que un error del filtro anterior no se quede
 * pegado— y ponerlo primero lo borraba justo después de escribirlo.
 */
async function guardarCambiosReserva(id, datos) {
  const reserva = await actualizarReserva(id, datos);
  await buscar();
  mostrarAviso(vista.aviso, 'exito', `Reserva de ${reserva.nombre} actualizada.`);
}

/**
 * Se llama desde dentro del modal de edición. Devuelve `true` si la reserva
 * se canceló y `false` si se echó atrás, que es lo que el modal usa para
 * decidir si cerrarse. Un fallo del servicio sube tal cual: lo enseña el
 * propio modal, que es lo que se está mirando.
 *
 * @returns {Promise<boolean>}
 */
async function pedirCancelacion(reserva) {
  const confirmado = await confirmar({
    titulo: 'Cancelar reserva',
    mensaje:
      `La reserva de ${reserva.nombre}, del ${formatearFechaCorta(reserva.fecha)}, ` +
      'quedará marcada como cancelada. El registro y su historial se conservan.',
    textoConfirmar: 'Sí, cancelar la reserva',
    peligro: true,
  });
  if (!confirmado) return false;

  await cancelarReserva(reserva.id);
  await buscar();
  mostrarAviso(vista.aviso, 'aviso', `Reserva de ${reserva.nombre} cancelada.`);
  return true;
}

/* ── Exportación ──────────────────────────────────────────────────────── */

async function exportar() {
  const filtros = leerFiltros();
  if (!filtros.desde || !filtros.hasta) {
    mostrarAviso(vista.aviso, 'aviso', 'Indica las dos fechas del rango antes de exportar.');
    return;
  }

  const boton = qs('#boton-exportar');
  boton.disabled = true;
  boton.textContent = 'Preparando…';

  try {
    // `limite: 0` para llevarse TODAS las filas del filtro, no las 500 que se
    // muestran en pantalla: exportar una página en vez del reporte completo
    // sería la peor clase de error, porque el archivo parece correcto.
    const todo = await buscarReservas({ ...filtros, limite: 0 });

    const csv = aCSV(
      ['N.º de reserva', 'Fecha', 'Cafetería', 'Nombre', 'Móvil', 'Menú del día',
       'Medio', 'Pago', 'Estado', 'Registrada'],
      todo.reservas.map((r) => [
        r.id,
        r.fecha,
        nombreCafeteria(r.cafeteriaId),
        r.nombre,
        formatearTelefono(r.telefono),
        r.menuNombre,
        // Etiqueta legible y no el valor interno: el CSV lo abre una persona
        // en Excel, no un programa.
        ETIQUETAS[r.medio] ?? '—',
        ETIQUETAS[r.pago] ?? '—',
        r.estado === 'activa' ? 'Activa' : 'Cancelada',
        new Date(r.timestamp).toLocaleString('es-CO'),
      ]),
    );

    descargarTexto(`reservas_${filtros.desde}_a_${filtros.hasta}.csv`, csv);
    mostrarAviso(vista.aviso, 'exito', `Exportadas ${todo.total} reservas.`);
  } catch (error) {
    mostrarAviso(vista.aviso, 'error', `No se pudo exportar: ${error.message}`);
  } finally {
    boton.disabled = false;
    boton.textContent = 'Exportar CSV';
  }
}

/* ── Catálogo: cafeterías ─────────────────────────────────────────────── */

async function cargarCafeterias() {
  // Con las cerradas incluidas: el histórico apunta a ellas y el filtro tiene
  // que poder seleccionarlas.
  estado.cafeterias = await getCafeterias({ incluirInactivas: true });

  const seleccionada = vista.cafeteria.value;
  pintar(
    vista.cafeteria,
    crear('option', { texto: 'Todas', attrs: { value: '' } }),
    ...estado.cafeterias.map((c) =>
      crear('option', {
        texto: c.activa ? c.nombre : `${c.nombre} (cerrada)`,
        attrs: { value: c.id },
      }),
    ),
  );
  vista.cafeteria.value = seleccionada;
}

async function cargarCatalogo() {
  await cargarCafeterias();
  mostrarCafeterias(vista.tablaCafeterias, estado.cafeterias, {
    alEditar: empezarEdicionCafeteria,
    alArchivar: (c) => cambiarEstadoCafeteria(c, archivarCafeteria, 'cerrada'),
    alReactivar: (c) => cambiarEstadoCafeteria(c, reactivarCafeteria, 'reabierta'),
  });

  // La carta se monta una sola vez. Volver a montarla en cada visita a la
  // pestaña borraría sin avisar lo que se estuviera escribiendo, y salir un
  // momento a mirar un reporte es exactamente lo que uno hace a media carta.
  if (!estado.semana) await cargarSemana();
}

function empezarEdicionCafeteria(cafeteria) {
  estado.cafeteriaEnEdicion = cafeteria;
  vista.cafeteriaNombre.value = cafeteria.nombre;
  vista.cafeteriaUbicacion.value = cafeteria.ubicacion;
  vista.cafeteriaFijos.value = (cafeteria.platosFijos ?? []).join('\n');
  vista.botonGuardarCafeteria.textContent = 'Guardar cambios';
  vista.botonCancelarEdicion.hidden = false;
  ocultarAviso(vista.avisoCafeteria);
  vista.cafeteriaNombre.focus();
}

function terminarEdicionCafeteria() {
  estado.cafeteriaEnEdicion = null;
  vista.formularioCafeteria.reset();
  vista.botonGuardarCafeteria.textContent = 'Añadir cafetería';
  vista.botonCancelarEdicion.hidden = true;
}

async function guardarCafeteria(evento) {
  evento.preventDefault();
  const datos = {
    nombre: vista.cafeteriaNombre.value.trim(),
    ubicacion: vista.cafeteriaUbicacion.value.trim(),
    // Un plato por línea, como en el editor de la carta: el número de
    // productos fijos cambia de una sede a otra y el texto libre lo absorbe.
    platosFijos: vista.cafeteriaFijos.value.split('\n').map((x) => x.trim()).filter(Boolean),
  };

  if (datos.nombre.length < 3) {
    mostrarAviso(vista.avisoCafeteria, 'aviso', 'Escribe el nombre de la cafetería.');
    vista.cafeteriaNombre.focus();
    return;
  }

  vista.botonGuardarCafeteria.disabled = true;
  try {
    if (estado.cafeteriaEnEdicion) {
      await actualizarCafeteria(estado.cafeteriaEnEdicion.id, datos);
      mostrarAviso(vista.avisoCafeteria, 'exito', `«${datos.nombre}» actualizada.`);
    } else {
      const nueva = await crearCafeteria(datos);
      mostrarAviso(
        vista.avisoCafeteria,
        'exito',
        `«${nueva.nombre}» creada con el identificador «${nueva.id}».`,
      );
    }
    terminarEdicionCafeteria();
    await cargarCatalogo();
  } catch (error) {
    mostrarAviso(vista.avisoCafeteria, 'error', error.message);
  } finally {
    vista.botonGuardarCafeteria.disabled = false;
  }
}

async function cambiarEstadoCafeteria(cafeteria, accion, participio) {
  if (participio === 'cerrada') {
    const seguir = await confirmar({
      titulo: `Cerrar «${cafeteria.nombre}»`,
      mensaje:
        'Dejará de ofrecerse en la pantalla de mostrador. Sus reservas históricas ' +
        'no se tocan y podrás reabrirla cuando quieras.',
      textoConfirmar: 'Sí, cerrar la cafetería',
      peligro: true,
    });
    if (!seguir) return;
  }

  try {
    await accion(cafeteria.id);
    mostrarAviso(vista.avisoCafeteria, 'aviso', `«${cafeteria.nombre}» ${participio}.`);
    await cargarCatalogo();
  } catch (error) {
    mostrarAviso(vista.avisoCafeteria, 'error', error.message);
  }
}

/* ── Catálogo: carta semanal ──────────────────────────────────────────── */

async function cargarSemana() {
  const lunes = estado.lunesCarta;
  vista.rotuloSemana.textContent =
    `${formatearFechaCorta(lunes)} – ${formatearFechaCorta(sumarDias(lunes, 6))}`;

  try {
    const dias = await getMenuSemana(lunes);
    estado.semana = montarSemana(vista.rejillaCarta, dias, {
      alCambiar: () => ocultarAviso(vista.avisoCarta),
    });
  } catch (error) {
    mostrarAviso(vista.avisoCarta, 'error', `No se pudo cargar la carta: ${error.message}`);
  }
}

/**
 * Cambiar de semana descarta lo escrito, así que se avisa antes. Perder diez
 * minutos de tecleo por pulsar una flecha sería el fallo más caro de esta
 * pantalla, y el más fácil de cometer.
 */
async function moverSemana(dias) {
  if (estado.semana?.hayPendientes()) {
    const seguir = await confirmar({
      titulo: 'Hay cambios sin guardar',
      mensaje:
        'Los platos que escribiste en esta semana se perderán si cambias de semana ahora.',
      textoConfirmar: 'Salir sin guardar',
      textoCancelar: 'Seguir editando',
      peligro: true,
    });
    if (!seguir) return;
  }
  ocultarAviso(vista.avisoCarta);
  estado.lunesCarta = dias === 0
    ? lunesDeEstaSemana()
    : lunesDeSemana(sumarDias(estado.lunesCarta, dias));
  cargarSemana();
}

async function guardarSemana() {
  if (!estado.semana) return;

  vista.botonGuardarSemana.disabled = true;
  vista.botonGuardarSemana.textContent = 'Guardando…';
  try {
    const dias = estado.semana.leer();
    await guardarMenuSemana(estado.lunesCarta, dias);
    estado.semana.marcarGuardado();
    // Publicar una carta invalida las que se hubieran consultado al editar
    // reservas: seguir usándolas ofrecería platos que ya no existen.
    cartasVistas.clear();

    const conServicio = dias.filter((d) => d.platos.length > 0).length;
    mostrarAviso(
      vista.avisoCarta,
      'exito',
      `Carta guardada · ${conServicio} ${conServicio === 1 ? 'día' : 'días'} con servicio.`,
    );
  } catch (error) {
    mostrarAviso(vista.avisoCarta, 'error', error.message);
  } finally {
    vista.botonGuardarSemana.disabled = false;
    vista.botonGuardarSemana.textContent = 'Guardar semana';
  }
}

/**
 * Trae la carta de la semana anterior a las cajas, como punto de partida.
 *
 * Es el atajo que de verdad ahorra trabajo: la mayoría de las semanas se
 * parecen a la anterior, y editar cuatro platos es mucho menos que escribir
 * veintiuno. No guarda nada — deja los días marcados como pendientes, porque
 * copiar no es publicar.
 */
async function copiarSemanaAnterior() {
  if (!estado.semana) return;

  if (estado.semana.hayPendientes()) {
    const seguir = await confirmar({
      titulo: 'Reemplazar lo escrito',
      mensaje:
        'La carta de la semana anterior sustituirá lo que hay ahora en las cajas, ' +
        'incluidos los cambios que aún no has guardado.',
      textoConfirmar: 'Copiar de todos modos',
      textoCancelar: 'Seguir editando',
      peligro: true,
    });
    if (!seguir) return;
  }

  try {
    const anterior = await getMenuSemana(sumarDias(estado.lunesCarta, -7));
    estado.semana.volcar(anterior);
    mostrarAviso(
      vista.avisoCarta,
      'aviso',
      'Copiada la carta de la semana anterior. Revísala y pulsa «Guardar semana».',
    );
  } catch (error) {
    mostrarAviso(vista.avisoCarta, 'error', error.message);
  }
}

/* ── Arranque ─────────────────────────────────────────────────────────── */

function conectarEventos() {
  vista.filtros.addEventListener('submit', (evento) => {
    evento.preventDefault();
    conCarga(qs('#filtros [type="submit"]'), buscar, 'Buscando…');
  });

  vista.periodo.addEventListener('change', () => {
    aplicarPeriodo();
    buscar();
  });

  // Tocar una fecha a mano deja el periodo en «personalizado»: si se quedara
  // marcado «Últimos 30 días» con otras fechas dentro, el desplegable estaría
  // mintiendo sobre lo que se está viendo.
  [vista.desde, vista.hasta].forEach((campo) =>
    campo.addEventListener('change', () => { vista.periodo.value = 'personalizado'; }),
  );

  const botonLimpiar = qs('#boton-limpiar');
  botonLimpiar.addEventListener('click', () => conCarga(botonLimpiar, () => {
    vista.filtros.reset();
    vista.periodo.value = '30';
    aplicarPeriodo();
    return buscar();
  }, 'Limpiando…'));

  qs('#boton-exportar').addEventListener('click', exportar);

  vista.formularioCafeteria.addEventListener('submit', guardarCafeteria);
  vista.botonCancelarEdicion.addEventListener('click', terminarEdicionCafeteria);

  qs('#semana-anterior').addEventListener('click', () => moverSemana(-7));
  qs('#semana-siguiente').addEventListener('click', () => moverSemana(7));
  qs('#semana-actual').addEventListener('click', () => moverSemana(0));
  vista.botonGuardarSemana.addEventListener('click', guardarSemana);
  vista.botonCopiarSemana.addEventListener('click', () =>
    conCarga(vista.botonCopiarSemana, copiarSemanaAnterior, 'Copiando…'));

  // Red de seguridad del navegador para el cierre de pestaña o la recarga.
  window.addEventListener('beforeunload', (evento) => {
    if (estado.semana?.hayPendientes()) evento.preventDefault();
  });
}

async function iniciar() {
  prepararLogo();

  // Nada se carga antes de entrar: si no se acierta la clave, esta promesa no
  // se resuelve y la página se queda en la pantalla de acceso.
  await pedirAcceso({ acceso: qs('#acceso'), contenido: qs('#contenido') });

  qs('#boton-salir').addEventListener('click', () => {
    cerrarSesion();
    // Se recarga en vez de esconder el contenido a mano: así no queda en
    // memoria nada de lo que se estaba consultando, ni una carta a medio
    // escribir que la siguiente persona pudiera ver.
    window.location.reload();
  });

  conectarPestanas();
  conectarEventos();
  aplicarPeriodo();

  // Las dos a la vez. La búsqueda no necesita el listado de cafeterías: sin
  // él, el filtro de sede se queda en «todas», que es justo su valor de
  // partida. Encadenarlas costaba un viaje entero de más en cada entrada.
  const [listado] = await Promise.allSettled([cargarCafeterias(), buscar()]);
  if (listado.status === 'rejected') {
    mostrarAviso(vista.aviso, 'error',
      `No se pudieron cargar las cafeterías: ${listado.reason.message}`);
  }
}

iniciar();
