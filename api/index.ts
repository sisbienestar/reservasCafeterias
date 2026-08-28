/**
 * El endpoint único. Una sola función de Vercel para las 15 acciones.
 *
 * Sigue siendo un único endpoint aunque ya nada obligue a ello. En Apps
 * Script era forzoso —solo existían doGet y doPost—; aquí es una elección, y
 * la razón es que `pruebas/contrato.mjs`, las 75 comprobaciones que dicen si
 * un backend cumple, están escritas contra esta forma. Cambiar a REST habría
 * significado reescribir la prueba justo el día en que hace falta confiar en
 * ella. Cuando la migración esté asentada, pasar a rutas es un cambio de este
 * archivo y de `httpClient.ts`, y el contrato de acciones sigue mandando.
 *
 * Lo que sí cambia respecto al backend anterior: aquí hay CORS de verdad. La
 * petición lleva `Authorization`, así que deja de ser «simple» y el navegador
 * manda antes un OPTIONS. Apps Script no sabía responderlo —de ahí el
 * `Content-Type: text/plain` del cliente viejo—; una función de Vercel sí.
 */

import { manejar } from './_nucleo/enrutador.js';

/**
 * Quién puede llamar a esta API desde un navegador.
 *
 * `ORIGENES_PERMITIDOS` es una lista separada por comas en las variables de
 * entorno. Sin ella no se responde a nadie con credenciales: un `*` aquí
 * dejaría que cualquier página abierta en el mismo navegador hiciera
 * peticiones con la sesión de quien atiende el mostrador.
 */
function origenPermitido(origen: string | undefined): string | null {
  const lista = (process.env.ORIGENES_PERMITIDOS ?? '')
    .split(',').map((o) => o.trim()).filter(Boolean);
  if (!origen) return null;
  return lista.includes(origen) ? origen : null;
}

function cabeceras(origen: string | undefined): Record<string, string> {
  const permitido = origenPermitido(origen);
  const base: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    // Una respuesta que depende del origen y no lo declara puede quedarse
    // cacheada para el origen equivocado en cualquier intermediario.
    Vary: 'Origin',
  };
  if (permitido) {
    base['Access-Control-Allow-Origin'] = permitido;
    base['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    base['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    base['Access-Control-Max-Age'] = '86400';
  }
  return base;
}

export const config = { runtime: 'edge' };

export default async function handler(peticion: Request): Promise<Response> {
  const origen = peticion.headers.get('origin') ?? undefined;
  const cabecerasSalida = cabeceras(origen);

  // El preflight. Sin cuerpo y sin tocar la base de datos.
  if (peticion.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cabecerasSalida });
  }

  // Un GET a mano, para comprobar de un vistazo que el despliegue responde.
  // No dice nada de la base de datos ni exige sesión a propósito: es para
  // saber si la función está viva, no para saber si los datos están bien.
  if (peticion.method === 'GET') {
    return new Response(
      JSON.stringify({ ok: true, data: { servicio: 'reservasCafeterias', estado: 'en marcha' } }),
      { status: 200, headers: cabecerasSalida },
    );
  }

  if (peticion.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, error: { codigo: 'PETICION_INVALIDA', mensaje: 'Se espera POST.' } }),
      { status: 405, headers: cabecerasSalida },
    );
  }

  let cuerpo: { accion?: string; params?: Record<string, unknown> };
  try {
    cuerpo = await peticion.json();
  } catch {
    // 200 y no 400: el contrato reserva los códigos HTTP para los fallos de
    // transporte, y esto es una respuesta del servidor diciendo que no.
    return new Response(
      JSON.stringify({
        ok: false,
        error: { codigo: 'PETICION_INVALIDA', mensaje: 'El cuerpo de la petición no es JSON válido.' },
      }),
      { status: 200, headers: cabecerasSalida },
    );
  }

  const sobre = await manejar(
    String(cuerpo?.accion ?? ''),
    cuerpo?.params ?? {},
    peticion.headers.get('authorization'),
  );

  // SIEMPRE 200. Un error de negocio no es un fallo de transporte, y el
  // cliente ya distingue las dos cosas leyendo `ok`.
  return new Response(JSON.stringify(sobre), { status: 200, headers: cabecerasSalida });
}
