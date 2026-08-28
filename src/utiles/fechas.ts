/**
 * Utilidades de fecha.
 *
 * Todas las fechas del sistema viajan como cadena ISO corta 'YYYY-MM-DD' en
 * hora local. No se usa Date#toISOString(): convierte a UTC y en Colombia
 * (UTC−5) devuelve el día anterior para cualquier hora antes de las 7 p. m.
 *
 * Cambio respecto al prototipo: `hoyISO()` ya no es la única fuente del «hoy».
 * La fecha de trabajo la dice ahora el servidor, en `app.contexto`, y el
 * contexto de sesión la reparte. Esta sigue aquí porque hace falta para
 * pintar calendarios y valores por defecto antes de que llegue la respuesta,
 * pero NO debe usarse para decidir la fecha de una reserva: un equipo con la
 * hora mal puesta registraría el día equivocado sin avisar.
 */

/** Convierte un Date a 'YYYY-MM-DD' usando la hora local del navegador. */
export function aISO(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/** Fecha de hoy según el reloj del navegador. Ver el aviso de arriba. */
export function hoyISO(): string {
  return aISO(new Date());
}

const partes = (fechaISO: string): [number, number, number] => {
  const p = String(fechaISO).split('-').map(Number);
  return [p[0] ?? 0, (p[1] ?? 1) - 1, p[2] ?? 1];
};

/** Suma (o resta, con n negativo) días a una fecha ISO y devuelve otra ISO. */
export function sumarDias(fechaISO: string, n: number): string {
  const [a, m, d] = partes(fechaISO);
  return aISO(new Date(a, m, d + n));
}

/** Lunes de la semana a la que pertenece una fecha ISO. */
export function lunesDeSemana(fechaISO: string): string {
  const [a, m, d] = partes(fechaISO);
  const diaSemana = new Date(a, m, d).getDay(); // 0 = domingo
  return sumarDias(fechaISO, diaSemana === 0 ? -6 : 1 - diaSemana);
}

/** Índice de día con la semana empezando en lunes: 0 = lunes … 6 = domingo. */
export function indiceDiaSemana(fechaISO: string): number {
  const [a, m, d] = partes(fechaISO);
  const diaSemana = new Date(a, m, d).getDay();
  return diaSemana === 0 ? 6 : diaSemana - 1;
}

/**
 * Días de la semana sin servicio de almuerzo: sábado (5) y domingo (6).
 *
 * Sigue siendo la única definición de la regla EN EL NAVEGADOR, pero ya no es
 * la única del proyecto: el servidor tiene la suya y es la que manda. Esta
 * sirve para avisar antes de mandar la petición, no para decidir.
 */
export const DIAS_SIN_SERVICIO = [5, 6];

/**
 * ¿Ese día hay servicio de almuerzo?
 *
 * `permitirFinDeSemana` llega de `app.contexto`, no de una constante local.
 * En el prototipo había una copia en `js/config.js` y otra en `Codigo.gs` y
 * había que acordarse de apagar las dos; con el frontend y el backend en
 * despliegues distintos eso se habría desincronizado todavía más fácil.
 */
export function esDiaDeServicio(fechaISO: string, permitirFinDeSemana = false): boolean {
  if (permitirFinDeSemana) return true;
  return !DIAS_SIN_SERVICIO.includes(indiceDiaSemana(fechaISO));
}

/** Cuántos días cubre un rango, ambos extremos incluidos. */
export function diasEntre(desdeISO: string, hastaISO: string): number {
  const [a1, m1, d1] = partes(desdeISO);
  const [a2, m2, d2] = partes(hastaISO);
  return Math.round((+new Date(a2, m2, d2) - +new Date(a1, m1, d1)) / 86_400_000) + 1;
}

/** Todas las fechas ISO entre dos extremos, ambos incluidos. */
export function rangoDias(desdeISO: string, hastaISO: string): string[] {
  const dias: string[] = [];
  let cursor = desdeISO;
  // Tope de seguridad: un rango mal formado (desde > hasta) no debe colgar la
  // pestaña con un bucle infinito.
  while (cursor <= hastaISO && dias.length < 1000) {
    dias.push(cursor);
    cursor = sumarDias(cursor, 1);
  }
  return dias;
}

/** '2026-08-23' → '23 ago'. Para ejes de gráficas y tablas apretadas. */
export function formatearFechaCorta(fechaISO: string): string {
  const [a, m, d] = partes(fechaISO);
  return new Date(a, m, d)
    .toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
    .replace('.', '');
}

/** '2026-08-23' → 'sáb'. */
export function nombreDiaCorto(fechaISO: string): string {
  const [a, m, d] = partes(fechaISO);
  return new Date(a, m, d)
    .toLocaleDateString('es-CO', { weekday: 'short' })
    .replace('.', '');
}

/** 'Lunes 25 de agosto de 2026', con la primera letra en mayúscula. */
export function formatearFechaLarga(fechaISO: string): string {
  const [a, m, d] = partes(fechaISO);
  const texto = new Date(a, m, d).toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Hora de una marca ISO completa: '9:14 a. m.' */
export function formatearHora(marcaISO: string): string {
  return new Date(marcaISO).toLocaleTimeString('es-CO', {
    hour: 'numeric', minute: '2-digit',
  });
}

/**
 * Marca de tiempo legible para el historial: '23 de agosto, 9:14 a. m.'
 * Lleva el día porque una reserva creada hoy puede editarse pasada la
 * medianoche y ver solo la hora sería confuso.
 */
export function formatearMarcaTemporal(marcaISO: string): string {
  const fecha = new Date(marcaISO);
  const dia = fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });
  return `${dia}, ${formatearHora(marcaISO)}`;
}
