/**
 * El sobre de respuesta, y nada más.
 *
 * Toda respuesta de la API tiene esta forma, también cuando algo falla:
 *
 *   { ok: true,  data: … }
 *   { ok: false, error: { codigo, mensaje } }
 *
 * Y un error de negocio sale con HTTP 200. Los códigos HTTP se reservan para
 * fallos de transporte, porque el cliente ya distingue las dos cosas: «el
 * servidor no contestó» y «el servidor contestó que no» se atienden de forma
 * distinta en el mostrador.
 */

/** Códigos de negocio del contrato. Es la lista cerrada: la interfaz decide
 *  qué hacer mirando `codigo`, así que inventarse uno nuevo aquí sin darlo de
 *  alta en el frontend equivale a no decir nada. */
export type CodigoError =
  | 'RESERVA_DUPLICADA'
  | 'RESERVA_NO_ENCONTRADA'
  | 'RESERVA_CANCELADA'
  | 'MENU_INVALIDO'
  | 'MENU_DUPLICADO'
  | 'CAFETERIA_DUPLICADA'
  | 'CAFETERIA_NO_ENCONTRADA'
  | 'SIN_SERVICIO'
  | 'SIN_CAMBIOS'
  | 'RANGO_INVALIDO'
  | 'DATOS_INCOMPLETOS'
  | 'ACCION_DESCONOCIDA'
  | 'PETICION_INVALIDA'
  | 'NO_AUTENTICADO'
  | 'NO_AUTORIZADO'
  | 'ERROR_INTERNO';

export interface SobreExito<T> { ok: true; data: T }
export interface SobreFallo { ok: false; error: { codigo: CodigoError; mensaje: string } }
export type Sobre<T = unknown> = SobreExito<T> | SobreFallo;

export const exito = <T>(data: T): SobreExito<T> => ({ ok: true, data });

export const fallo = (codigo: CodigoError, mensaje: string): SobreFallo =>
  ({ ok: false, error: { codigo, mensaje } });

/**
 * Un fallo de negocio lanzado desde dentro de una acción.
 *
 * Existe para no tener que ir devolviendo sobres a mano por seis niveles de
 * llamadas. El enrutador lo captura y lo convierte en el sobre; cualquier
 * OTRA excepción es un fallo inesperado y sale como ERROR_INTERNO, que es la
 * distinción que importa: un error de negocio es información para quien
 * atiende, y un error interno es un aviso para quien mantiene.
 */
export class ErrorNegocio extends Error {
  constructor(public codigo: CodigoError, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorNegocio';
  }
}

/**
 * La anotación de tipo en la VARIABLE, y no solo en el retorno, es lo que
 * hace que TypeScript entienda que después de `romper(...)` no se sigue
 * ejecutando. Sin ella, cada `if (!fila) romper(...)` de las acciones tendría
 * que llevar detrás un `return` o un `!` que no significan nada, y el
 * compilador dejaría de avisar de los nulos de verdad entre tanto ruido.
 */
export const romper: (codigo: CodigoError, mensaje: string) => never =
  (codigo, mensaje) => {
    throw new ErrorNegocio(codigo, mensaje);
  };
