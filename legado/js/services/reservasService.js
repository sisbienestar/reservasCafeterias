/**
 * Servicio de reservas.
 *
 * En esta fase todo es "de hoy": la fecha no la elige el usuario, la pone el
 * servicio. Cuando se permita reservar con antelación, el parámetro `fecha`
 * ya está en todas las firmas y solo habrá que dejar de usar el valor por
 * defecto.
 */

import { pedir } from './api.js';
import { hoyISO } from '../utils/fechas.js';
import { numeroDeReserva } from '../utils/idReserva.js';

/**
 * @typedef {Object} CambioReserva
 * @property {'nombre'|'telefono'|'menu'|'medio'|'pago'} campo
 * @property {string} antes
 * @property {string} despues
 */

/**
 * @typedef {Object} AsientoHistorial
 * @property {'creacion'|'modificacion'|'cancelacion'} tipo
 * @property {string} timestamp
 * @property {CambioReserva[]} cambios  vacío en el asiento de creación
 */

/**
 * @typedef {Object} Reserva
 * @property {string} id        '01-260823-001'
 * @property {string} numero    los 3 últimos dígitos: '001'
 * @property {string} nombre
 * @property {string} telefono   diez dígitos, sin separadores
 * @property {string} cafeteriaId
 * @property {string} fecha
 * @property {string} menuId
 * @property {string} menuNombre
 * @property {'presencial'|'telefono'} medio   cómo se hizo la reserva
 * @property {'pagado'|'debe'} pago
 * @property {'activa'|'cancelada'} estado
 * @property {string} timestamp
 * @property {AsientoHistorial[]} historial  del más antiguo al más reciente
 */

/** @returns {Reserva} */
function normalizar(fila) {
  return {
    id: fila.id,
    // Se deriva una vez aquí y no en cada vista: la tabla enseña el número
    // corto y el modal el identificador entero, pero los dos salen del id.
    numero: numeroDeReserva(fila.id),
    nombre: fila.nombre,
    telefono: fila.telefono,
    cafeteriaId: fila.cafeteria_id,
    fecha: fila.fecha,
    menuId: fila.menu_id,
    menuNombre: fila.menu_nombre,
    // Una reserva anterior a estos campos llega sin ellos: se deja vacío y
    // la interfaz lo muestra como «—» en vez de inventarse un valor.
    medio: fila.medio ?? '',
    pago: fila.pago ?? '',
    // Una fila de la hoja sin la columna todavía se da por activa.
    estado: fila.estado ?? 'activa',
    timestamp: fila.timestamp,
    // Una reserva vieja de la hoja puede no traer la columna todavía.
    historial: Array.isArray(fila.historial) ? fila.historial : [],
  };
}

/** Reservas de hoy de una cafetería, en orden de llegada. @returns {Promise<Reserva[]>} */
export async function getReservasDelDia(cafeteriaId, fecha = hoyISO()) {
  const filas = await pedir('reservas.delDia', { cafeteria_id: cafeteriaId, fecha });
  return filas.map(normalizar);
}

/**
 * Crea una reserva. Lanza ErrorServicio con códigos de negocio conocidos:
 * RESERVA_DUPLICADA · MENU_INVALIDO · DATOS_INCOMPLETOS.
 *
 * @param {{nombre: string, telefono: string, cafeteriaId: string, menuId: string,
 *          medio: string, pago: string, fecha?: string}} datos
 * @returns {Promise<Reserva>}
 */
export async function crearReserva(datos) {
  const fila = await pedir('reservas.crear', {
    nombre: datos.nombre,
    telefono: datos.telefono,
    cafeteria_id: datos.cafeteriaId,
    fecha: datos.fecha ?? hoyISO(),
    menu_id: datos.menuId,
    medio: datos.medio,
    pago: datos.pago,
  });
  return normalizar(fila);
}

/**
 * Modifica una reserva existente y devuelve la versión ya actualizada, con el
 * nuevo asiento añadido a su historial.
 *
 * La cafetería y la fecha no se pasan: no son editables, y dejarlas fuera de
 * la firma evita que una pantalla futura las cambie por descuido.
 *
 * Códigos de negocio: RESERVA_NO_ENCONTRADA · RESERVA_DUPLICADA ·
 * MENU_INVALIDO · SIN_CAMBIOS.
 *
 * @param {string} id
 * @param {{nombre: string, telefono: string, menuId: string, medio: string, pago: string}} datos
 * @returns {Promise<Reserva>}
 */
export async function actualizarReserva(id, datos) {
  const fila = await pedir('reservas.actualizar', {
    id,
    nombre: datos.nombre,
    telefono: datos.telefono,
    menu_id: datos.menuId,
    medio: datos.medio,
    pago: datos.pago,
  });
  return normalizar(fila);
}

/**
 * Cancela una reserva. Es un borrado lógico: la reserva deja de aparecer en
 * `getReservasDelDia`, pero la fila y su historial se conservan, con un
 * asiento de tipo 'cancelacion' añadido.
 *
 * Códigos de negocio: RESERVA_NO_ENCONTRADA · RESERVA_CANCELADA.
 *
 * @param {string} id
 * @returns {Promise<Reserva>} la reserva ya cancelada
 */
export async function cancelarReserva(id) {
  const fila = await pedir('reservas.cancelar', { id });
  return normalizar(fila);
}

/**
 * @typedef {Object} ResumenReservas
 * @property {{total: number, activas: number, canceladas: number,
 *             diasConServicio: number, promedioDiario: number}} totales
 * @property {{fecha: string, activas: number, canceladas: number}[]} porDia
 * @property {{cafeteriaId: string, nombre: string, activas: number, canceladas: number}[]} porCafeteria
 * @property {{nombre: string, total: number}[]} porPlato
 */

function normalizarResumen(resumen) {
  return {
    totales: {
      total: resumen.totales.total,
      activas: resumen.totales.activas,
      canceladas: resumen.totales.canceladas,
      diasConServicio: resumen.totales.dias_con_servicio,
      promedioDiario: resumen.totales.promedio_diario,
    },
    porDia: resumen.por_dia,
    porCafeteria: resumen.por_cafeteria.map((f) => ({
      cafeteriaId: f.cafeteria_id,
      nombre: f.nombre,
      activas: f.activas,
      canceladas: f.canceladas,
    })),
    porPlato: resumen.por_plato,
  };
}

/**
 * Búsqueda con filtros para la pantalla de administración.
 *
 * `total` es cuántas casan con el filtro; `reservas` puede traer menos si el
 * `limite` recorta. El `resumen` se calcula SIEMPRE sobre todas, no sobre la
 * página devuelta. Para exportar, pasar `limite: 0`.
 *
 * @param {{desde: string, hasta: string, cafeteriaId?: string,
 *          estado?: 'activa'|'cancelada', texto?: string, limite?: number}} filtros
 * @returns {Promise<{total: number, reservas: Reserva[], resumen: ResumenReservas}>}
 */
export async function buscarReservas(filtros) {
  const datos = await pedir('reservas.buscar', {
    desde: filtros.desde,
    hasta: filtros.hasta,
    cafeteria_id: filtros.cafeteriaId ?? '',
    estado: filtros.estado ?? '',
    texto: filtros.texto ?? '',
    limite: filtros.limite ?? 500,
  });

  return {
    total: datos.total,
    reservas: datos.reservas.map(normalizar),
    resumen: normalizarResumen(datos.resumen),
  };
}
