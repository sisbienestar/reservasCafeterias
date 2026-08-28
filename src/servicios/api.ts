/**
 * El transporte, y el único punto del frontend que sabe cómo se habla con el
 * servidor.
 *
 * Es el heredero de `js/services/httpClient.js` y `js/services/api.js`
 * juntos. Ya no hay selector de mock: la carpeta `js/mock/` cumplió su papel
 * —sostener la interfaz mientras no había backend— y el día de la migración
 * era el día de borrarla.
 *
 * Sigue mandando `{ accion, params }` por POST a un único endpoint. Ver el
 * comentario de `api/index.ts` sobre por qué se conservó esa forma.
 */

import { tokenActual } from './supabase.js';

const URL_API = import.meta.env.VITE_API_URL || '/api';

/**
 * Milisegundos antes de abortar una petición.
 *
 * Mucho más corto que los 25 s que hacía falta dar a Apps Script. Allí el
 * cliente tenía que esperar más que el bloqueo de script del servidor (20 s),
 * porque rendirse antes dejaba el trabajo ejecutándose en Google mientras
 * aquí se veía un error de red — y quien atendía volvía a pulsar «Registrar
 * reserva», creando la reserva dos veces.
 *
 * Ese riesgo desapareció con el backend nuevo, y no por ser más rápido: los
 * candados de Postgres son por cafetería y día y duran milisegundos, y sobre
 * todo el índice único impide de raíz que un doble envío cree dos reservas.
 */
const TIEMPO_LIMITE_MS = 12_000;

export interface ErrorSobre { codigo: string; mensaje: string }
export type Sobre<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: ErrorSobre };

/** Error de negocio o de transporte, ya normalizado para la interfaz. */
export class ErrorServicio extends Error {
  codigo: string;
  constructor({ codigo, mensaje }: Partial<ErrorSobre>) {
    super(mensaje || 'Ocurrió un error inesperado.');
    this.name = 'ErrorServicio';
    this.codigo = codigo || 'DESCONOCIDO';
  }
}

/**
 * Manda una acción y devuelve el sobre.
 *
 * Traduce cualquier fallo de transporte —red caída, tiempo agotado, una
 * página de error en vez de JSON— al MISMO sobre, para que quien llama no
 * tenga que distinguir entre «no hubo respuesta» y «la respuesta dijo que
 * no».
 */
export async function enviar<T = unknown>(
  accion: string,
  params: Record<string, unknown> = {},
): Promise<Sobre<T>> {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), TIEMPO_LIMITE_MS);

  try {
    const token = await tokenActual();

    const respuesta = await fetch(URL_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ accion, params }),
      signal: control.signal,
    });

    if (!respuesta.ok) {
      return {
        ok: false,
        error: {
          codigo: `HTTP_${respuesta.status}`,
          mensaje: `El servidor respondió ${respuesta.status}.`,
        },
      };
    }

    const cuerpo = (await respuesta.json()) as unknown;

    // Un backend que no respeta el sobre es un error de integración, no de red.
    if (typeof cuerpo !== 'object' || cuerpo === null || !('ok' in cuerpo)) {
      return {
        ok: false,
        error: { codigo: 'RESPUESTA_INVALIDA', mensaje: 'El servidor devolvió un formato inesperado.' },
      };
    }

    return cuerpo as Sobre<T>;
  } catch (error) {
    const esTiempo = (error as Error)?.name === 'AbortError';
    return {
      ok: false,
      error: {
        codigo: esTiempo ? 'TIMEOUT' : 'SIN_CONEXION',
        mensaje: esTiempo
          ? 'El servidor tardó demasiado en responder.'
          : 'No se pudo conectar con el servidor.',
      },
    };
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * Ejecuta una acción y devuelve `data`, o lanza ErrorServicio.
 *
 * Los servicios llaman a esto en vez de a `enviar` directamente, para que las
 * pantallas puedan usar un try/catch normal en lugar de inspeccionar sobres.
 */
export async function pedir<T = unknown>(
  accion: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const respuesta = await enviar<T>(accion, params);
  if (!respuesta.ok) throw new ErrorServicio(respuesta.error ?? {});
  return respuesta.data;
}
