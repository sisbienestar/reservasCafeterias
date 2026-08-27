import { PERMITIR_FIN_DE_SEMANA } from '../config.js';

/**
 * Utilidades de fecha.
 *
 * Todas las fechas del sistema viajan como cadena ISO corta 'YYYY-MM-DD' en
 * hora local. No se usa Date#toISOString(): convierte a UTC y en Colombia
 * (UTC-5) devuelve el día anterior para cualquier hora antes de las 7 p. m.
 */

/** Convierte un Date a 'YYYY-MM-DD' usando la hora local del navegador. */
export function aISO(fecha) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/** Fecha de hoy en formato 'YYYY-MM-DD'. */
export function hoyISO() {
  return aISO(new Date());
}

/** Suma (o resta, con n negativo) días a una fecha ISO y devuelve otra ISO. */
export function sumarDias(fechaISO, n) {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  return aISO(new Date(anio, mes - 1, dia + n));
}

/** Lunes de la semana a la que pertenece una fecha ISO. */
export function lunesDeSemana(fechaISO) {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  const diaSemana = new Date(anio, mes - 1, dia).getDay(); // 0 = domingo
  return sumarDias(fechaISO, diaSemana === 0 ? -6 : 1 - diaSemana);
}

/** Lunes de la semana en curso, en formato ISO. */
export function lunesDeEstaSemana() {
  return lunesDeSemana(hoyISO());
}

/** Índice de día con la semana empezando en lunes: 0 = lunes … 6 = domingo. */
export function indiceDiaSemana(fechaISO) {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  const diaSemana = new Date(anio, mes - 1, dia).getDay();
  return diaSemana === 0 ? 6 : diaSemana - 1;
}

/**
 * Días de la semana sin servicio de almuerzo: sábado (5) y domingo (6).
 *
 * Es la única definición de la regla en todo el proyecto. Si algún día se
 * abre los sábados, se quita el 5 de aquí y se acabó: lo usan el generador de
 * datos, la API simulada, el editor de la carta y la pantalla de mostrador.
 */
export const DIAS_SIN_SERVICIO = [5, 6];

/**
 * ¿Ese día hay servicio de almuerzo?
 *
 * `PERMITIR_FIN_DE_SEMANA` es un interruptor de pruebas que vive en
 * config.js y debe estar apagado en uso real. Ver el comentario de allí.
 */
export function esDiaDeServicio(fechaISO) {
  if (PERMITIR_FIN_DE_SEMANA) return true;
  return !DIAS_SIN_SERVICIO.includes(indiceDiaSemana(fechaISO));
}

/** Cuántos días cubre un rango, ambos extremos incluidos. */
export function diasEntre(desdeISO, hastaISO) {
  const [a1, m1, d1] = desdeISO.split('-').map(Number);
  const [a2, m2, d2] = hastaISO.split('-').map(Number);
  const desde = new Date(a1, m1 - 1, d1);
  const hasta = new Date(a2, m2 - 1, d2);
  return Math.round((hasta - desde) / 86400000) + 1;
}

/** Todas las fechas ISO entre dos extremos, ambos incluidos. */
export function rangoDias(desdeISO, hastaISO) {
  const dias = [];
  let cursor = desdeISO;
  // Tope de seguridad: un rango mal formado (desde > hasta) no debe colgar la
  // pestaña con un bucle infinito.
  while (cursor <= hastaISO && dias.length < 1000) {
    dias.push(cursor);
    cursor = sumarDias(cursor, 1);
  }
  return dias;
}

/** '2025-08-23' → '23 ago'. Para ejes de gráficas y tablas apretadas. */
export function formatearFechaCorta(fechaISO) {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  return new Date(anio, mes - 1, dia)
    .toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
    .replace('.', '');
}

/** '2025-08-23' → 'sáb'. */
export function nombreDiaCorto(fechaISO) {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  return new Date(anio, mes - 1, dia)
    .toLocaleDateString('es-CO', { weekday: 'short' })
    .replace('.', '');
}

/** 'Lunes 25 de agosto de 2025', con la primera letra en mayúscula. */
export function formatearFechaLarga(fechaISO) {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  const texto = new Date(anio, mes - 1, dia).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Hora de una marca ISO completa: '9:14 a. m.' */
export function formatearHora(marcaISO) {
  return new Date(marcaISO).toLocaleTimeString('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Marca de tiempo legible para el historial: '23 de agosto, 9:14 a. m.'
 * Lleva el día porque una reserva creada hoy puede editarse pasada la
 * medianoche y ver solo la hora sería confuso.
 */
export function formatearMarcaTemporal(marcaISO) {
  const fecha = new Date(marcaISO);
  const dia = fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });
  return `${dia}, ${formatearHora(marcaISO)}`;
}
