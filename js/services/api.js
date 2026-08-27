/**
 * Selector de transporte.
 *
 * ES EL ÚNICO PUNTO DEL PROYECTO QUE CONOCE LA EXISTENCIA DEL MOCK.
 * El día de la migración: cambiar FUENTE_DATOS a 'api' en config.js y borrar
 * de aquí el import de mockApi (y la carpeta js/mock/ entera). Nada más.
 */

import { FUENTE_DATOS } from '../config.js';
import { enviar as enviarMock } from '../mock/mockApi.js';
import { enviar as enviarHttp } from './httpClient.js';

/** enviar(accion, params) → Promise<{ok, data} | {ok:false, error}> */
export const enviar = FUENTE_DATOS === 'mock' ? enviarMock : enviarHttp;

/** Error de negocio o de transporte, ya normalizado para la UI. */
export class ErrorServicio extends Error {
  constructor({ codigo, mensaje }) {
    super(mensaje || 'Ocurrió un error inesperado.');
    this.name = 'ErrorServicio';
    this.codigo = codigo || 'DESCONOCIDO';
  }
}

/**
 * Ejecuta una acción y devuelve `data`, o lanza ErrorServicio.
 *
 * Los servicios llaman a esto en vez de a `enviar` directamente, para que la
 * UI pueda usar un try/catch normal en lugar de inspeccionar sobres.
 */
export async function pedir(accion, params = {}) {
  const respuesta = await enviar(accion, params);
  if (!respuesta.ok) throw new ErrorServicio(respuesta.error ?? {});
  return respuesta.data;
}
