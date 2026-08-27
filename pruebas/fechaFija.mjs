/**
 * Congela «hoy» antes de que se cargue nada del proyecto.
 *
 * Hace falta porque los datos simulados se generan al importar el módulo, a
 * partir de `new Date()`: sin fijar la fecha, la misma prueba se comporta de
 * una manera de lunes a viernes y de otra el fin de semana, cuando no hay
 * servicio. Un test que pasa o falla según el día en que se ejecute no sirve.
 *
 * Se importa PRIMERO en cada suite; los módulos ES se evalúan en el orden en
 * que se importan, así que esto corre antes que cualquier `hoyISO()`.
 *
 * La fecha se puede cambiar con la variable de entorno FECHA_PRUEBA, que es
 * como la suite del fin de semana se sitúa en domingo.
 */

const FECHA = process.env.FECHA_PRUEBA || '2026-08-19T10:30:00'; // miércoles
const AHORA = new Date(FECHA).getTime();
const DateReal = Date;

globalThis.Date = class extends DateReal {
  constructor(...args) {
    super(...(args.length === 0 ? [AHORA] : args));
  }
  static now() {
    return AHORA;
  }
};

export const HOY_FIJADO = FECHA.slice(0, 10);
