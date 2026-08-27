/**
 * Servicio de menú.
 *
 * El menú cambia cada semana, así que nunca se escribe en el HTML: la vista
 * lo pide aquí y pinta lo que llegue, sean dos opciones o tres.
 *
 * **La carta es del día, no de la cafetería**: las cuatro sedes sirven lo
 * mismo, así que ninguna de estas funciones recibe un id de cafetería. Si
 * algún día las cartas vuelven a divergir por sede, es aquí y en `menu.*`
 * del backend donde vuelve a entrar ese parámetro; la interfaz no cambia,
 * porque pide la carta y pinta lo que le devuelvan.
 */

import { pedir } from './api.js';
import { hoyISO } from '../utils/fechas.js';

/**
 * @typedef {Object} OpcionMenu
 * @property {string} id
 * @property {string} nombre
 */

function normalizarOpcion(opcion) {
  // `fijo` distingue los productos permanentes de la sede —Mini Lunch, los
  // especiales— de los platos del día. El formulario los agrupa por separado.
  return { id: opcion.id, nombre: opcion.nombre, fijo: opcion.fijo === true };
}

/**
 * Lo que se puede pedir ese día en esa cafetería: la carta común del campus
 * más los platos fijos de la sede (Mini Lunch, los especiales…).
 *
 * Sin `cafeteriaId` devuelve solo la carta común, que es lo que administra el
 * editor semanal.
 *
 * Devuelve [] si no hay nada disponible: es un caso válido, no un error.
 * @returns {Promise<OpcionMenu[]>}
 */
export async function getMenuDelDia(cafeteriaId, fecha = hoyISO()) {
  const registro = await pedir('menu.delDia', { fecha, cafeteria_id: cafeteriaId ?? '' });
  return (registro?.opciones ?? []).map(normalizarOpcion);
}

/**
 * La carta de los siete días de una semana, para administrarla de una vez.
 * Devuelve siempre siete entradas, con `opciones: []` en los días sin carta.
 *
 * @param {string} lunes  fecha ISO del lunes de la semana
 * @returns {Promise<{fecha: string, opciones: OpcionMenu[]}[]>}
 */
export async function getMenuSemana(lunes) {
  const datos = await pedir('menu.semana', { lunes });
  return datos.dias.map((dia) => ({
    fecha: dia.fecha,
    opciones: (dia.opciones ?? []).map(normalizarOpcion),
  }));
}

/**
 * Guarda la carta de una semana entera. Los platos son nombres escritos a
 * mano; el id lo asigna el servidor. Un día con la lista vacía se queda sin
 * carta: es la forma de decir «ese día no hay servicio».
 *
 * La escritura es atómica: o entran los siete días o no entra ninguno.
 * Lanza MENU_DUPLICADO si dos platos del mismo día tienen el mismo nombre.
 *
 * @param {string} lunes
 * @param {{fecha: string, platos: string[]}[]} dias
 * @returns {Promise<{fecha: string, opciones: OpcionMenu[]}[]>}
 */
export async function guardarMenuSemana(lunes, dias) {
  const datos = await pedir('menu.guardarSemana', { lunes, dias });
  return datos.dias.map((dia) => ({
    fecha: dia.fecha,
    opciones: (dia.opciones ?? []).map(normalizarOpcion),
  }));
}
