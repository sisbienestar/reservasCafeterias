/**
 * Cliente HTTP del backend real.
 *
 * Hoy no se usa (FUENTE_DATOS === 'mock'), pero define el contrato exacto que
 * tendrá que cumplir Google Apps Script: un único endpoint que recibe
 * { accion, params } por POST y devuelve el sobre { ok, data } / { ok, error }.
 *
 * Traduce cualquier fallo de transporte (red caída, timeout, HTML de error de
 * Apps Script en vez de JSON) al MISMO sobre, para que quien llama no tenga
 * que distinguir entre "no hubo respuesta" y "la respuesta dijo que no".
 *
 * Nota para la migración: Apps Script no responde a preflight CORS, así que la
 * petición debe ser "simple". Por eso el Content-Type es text/plain y no
 * application/json; doPost(e) lee el cuerpo en e.postData.contents igual.
 */

import { API_BASE_URL, TIMEOUT_HTTP_MS } from '../config.js';

/**
 * @param {string} accion
 * @param {object} params
 * @returns {Promise<{ok: boolean, data?: any, error?: {codigo: string, mensaje: string}}>}
 */
export async function enviar(accion, params = {}) {
  if (!API_BASE_URL) {
    return {
      ok: false,
      error: {
        codigo: 'API_SIN_CONFIGURAR',
        mensaje: 'Falta definir API_BASE_URL en js/config.js.',
      },
    };
  }

  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), TIMEOUT_HTTP_MS);

  try {
    const respuesta = await fetch(API_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accion, params }),
      signal: control.signal,
      redirect: 'follow', // Apps Script redirige a googleusercontent.com
    });

    if (!respuesta.ok) {
      return {
        ok: false,
        error: {
          codigo: 'HTTP_' + respuesta.status,
          mensaje: `El servidor respondió ${respuesta.status}.`,
        },
      };
    }

    const cuerpo = await respuesta.json();

    // Un backend que no respeta el sobre es un error de integración, no de red.
    if (typeof cuerpo !== 'object' || cuerpo === null || !('ok' in cuerpo)) {
      return {
        ok: false,
        error: {
          codigo: 'RESPUESTA_INVALIDA',
          mensaje: 'El servidor devolvió un formato inesperado.',
        },
      };
    }

    return cuerpo;
  } catch (error) {
    const esTimeout = error.name === 'AbortError';
    return {
      ok: false,
      error: {
        codigo: esTimeout ? 'TIMEOUT' : 'SIN_CONEXION',
        mensaje: esTimeout
          ? 'El servidor tardó demasiado en responder.'
          : 'No se pudo conectar con el servidor.',
      },
    };
  } finally {
    clearTimeout(temporizador);
  }
}
