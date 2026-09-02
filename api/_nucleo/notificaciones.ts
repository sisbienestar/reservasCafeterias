/**
 * El aviso de que hay un pedido confirmado esperando a administración.
 *
 * DOS REGLAS QUE NO SE NEGOCIAN, y las dos son la misma idea:
 *
 *   1. Esto NUNCA lanza. Un pedido que no se puede confirmar porque el
 *      servidor de correo está caído sería peor que un correo perdido: la
 *      cafetería se quedaría sin poder hacer su trabajo por un fallo que no
 *      es suyo.
 *   2. Se llama DESPUÉS de cambiar el estado, nunca antes. Si se invirtiera,
 *      un aviso enviado y una confirmación fallida dejarían a administración
 *      buscando un pedido que no existe.
 *
 * Los canales son una lista. Añadir Slack, Telegram o WhatsApp es escribir
 * otra función con esta misma firma y meterla en `CANALES`; no se toca
 * `pedidos.confirmar` ni esta función.
 */

import { servicio, desempaquetar } from './supabase.js';

/** Lo que un canal necesita saber para redactar el aviso. */
export interface PedidoNotificable {
  id: number;
  proveedor_nombre: string;
  cafeteria_nombre: string;
  fecha_elaboracion: string;
  elaborado_por: string;
  lineas: unknown[];
}

type Canal = (pedido: PedidoNotificable, destinos: string[]) => Promise<void>;

/**
 * A quién avisar: las cuentas con rol `admin`.
 *
 * Se resuelve en cada aviso y no se guarda en una variable de entorno a
 * propósito. Quien administra cambia —una baja, una persona nueva— y una
 * dirección fija en el entorno seguiría apuntando a la anterior sin que nada
 * lo delatara: los correos se enviarían «bien» a un buzón que ya no lee nadie.
 *
 * El correo vive en `auth.users`, que Supabase gestiona y no expone por REST,
 * así que hay que pasar por la API de administración.
 */
async function destinatarios(): Promise<string[]> {
  const perfiles = desempaquetar<{ usuario_id: string }[]>(
    await servicio().from('perfil').select('usuario_id').eq('rol', 'admin'),
  );
  if (perfiles.length === 0) return [];

  const ids = new Set(perfiles.map((p) => p.usuario_id));
  const { data, error } = await servicio().auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;

  return (data?.users ?? [])
    .filter((u) => ids.has(u.id) && u.email)
    .map((u) => u.email as string);
}

/** El texto del aviso. Va aparte porque lo comparten todos los canales. */
function redactar(pedido: PedidoNotificable) {
  const asunto =
    `Pedido n.º ${pedido.id} · ${pedido.proveedor_nombre} · ${pedido.cafeteria_nombre}`;

  const base = urlBase();

  const cuerpo = [
    `${pedido.cafeteria_nombre} confirmó un pedido y está listo para imprimir y firmar.`,
    '',
    `Proveedor:   ${pedido.proveedor_nombre}`,
    `Fecha:       ${pedido.fecha_elaboracion}`,
    `Elaborado por: ${pedido.elaborado_por || '—'}`,
    `Productos:   ${pedido.lineas.length}`,
    '',
    /*
     * Sin dirección, NO se inventa un enlace.
     *
     * Un enlace roto es peor que ninguno: quien lo pulsa acaba en una página
     * de error y se queda sin saber si el problema es el pedido o el correo.
     * Sin él, el aviso sigue diciendo lo esencial —hay un pedido n.º tal que
     * imprimir— y quien lo lea entra por donde entra siempre.
     */
    base
      ? `${base}/pedidos/documento/${pedido.id}`
      : `Búscalo en la aplicación: pedido n.º ${pedido.id}.`,
  ].join('\n');

  return { asunto, cuerpo };
}

/**
 * La dirección pública de la aplicación, para que el aviso lleve el enlace al
 * documento.
 *
 * ── Aquí NO hay ninguna URL escrita ──────────────────────────────────────
 *
 * La hubo, y por eso existe este comentario. `https://reservas-kappa-ten
 * .vercel.app` estaba puesta como valor por defecto; el día que el despliegue
 * cambió de nombre, ese dominio pasó a responder DEPLOYMENT_NOT_FOUND y todos
 * los avisos siguieron saliendo con un enlace muerto —sin fallar, sin avisar,
 * y sin que nada en el código lo delatara—.
 *
 * Ahora se pregunta, en este orden:
 *
 *   1. `URL_PUBLICA`      · para un dominio propio. Manda sobre todo lo demás.
 *   2. `VERCEL_PROJECT_PRODUCTION_URL` · el dominio de producción del
 *      proyecto. Lo pone Vercel solo y SIGUE al proyecto: si mañana se llama
 *      de otra forma, esto se entera sin que nadie toque nada.
 *   3. `VERCEL_URL`       · la de ESTE despliegue. Es la red de seguridad para
 *      una vista previa, donde el enlace correcto es el de la propia rama.
 *
 * Las dos de Vercel vienen sin esquema —`cafeteriasuis.vercel.app`—, así que
 * se les pone. Y son siempre https: Vercel no sirve por http.
 */
// Se exporta SOLO para poder probarla: `pruebas/urlpublica.mjs` la ejercita
// caso por caso. Es la línea que dejó todos los avisos con un enlace muerto
// durante quién sabe cuánto, así que conviene que esté sujeta.
export function urlBase(): string {
  const bruta = process.env.URL_PUBLICA
    || process.env.VERCEL_PROJECT_PRODUCTION_URL
    || process.env.VERCEL_URL
    || '';

  const limpia = bruta.trim().replace(/\/+$/, '');
  if (!limpia) return '';
  return /^https?:\/\//i.test(limpia) ? limpia : `https://${limpia}`;
}

/**
 * Canal: correo, por la API HTTPS de Resend.
 *
 * Sin biblioteca: es un POST con una clave, y un `fetch` pesa menos que una
 * dependencia que hay que mantener. Si falta `RESEND_API_KEY` no se envía y no
 * se falla — es exactamente el caso de un despliegue donde todavía no se ha
 * configurado el correo, y no tiene por qué impedir confirmar pedidos.
 */
const correo: Canal = async (pedido, destinos) => {
  const clave = process.env.RESEND_API_KEY;
  const remitente = process.env.RESEND_REMITENTE;

  if (!clave || !remitente) {
    console.info(`[notificaciones] pedido ${pedido.id}: correo sin configurar, no se envía.`);
    return;
  }
  if (destinos.length === 0) {
    console.warn(`[notificaciones] pedido ${pedido.id}: no hay ninguna cuenta admin con correo.`);
    return;
  }

  const { asunto, cuerpo } = redactar(pedido);

  const respuesta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${clave}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: remitente, to: destinos, subject: asunto, text: cuerpo }),
  });

  if (!respuesta.ok) {
    throw new Error(`Resend respondió ${respuesta.status}: ${await respuesta.text()}`);
  }
};

/*
 * Los canales activos.
 *
 * Para añadir Telegram, Slack o WhatsApp: otra constante con la firma `Canal`
 * —recibe el pedido y los destinos, y lanza si falla— y su nombre en esta
 * lista. `Promise.allSettled` los lanza a la vez y ninguno puede tumbar a los
 * demás, así que un webhook de Slack caído no impide que salga el correo.
 */
const CANALES: Canal[] = [correo];

/**
 * Avisa de un pedido confirmado. No lanza nunca: los fallos se registran.
 */
export async function notificarPedido(pedido: PedidoNotificable): Promise<void> {
  try {
    const destinos = await destinatarios();
    const resultados = await Promise.allSettled(
      CANALES.map((canal) => canal(pedido, destinos)),
    );

    for (const resultado of resultados) {
      if (resultado.status === 'rejected') {
        console.error(`[notificaciones] pedido ${pedido.id}:`, resultado.reason);
      }
    }
  } catch (error) {
    // Ni siquiera se pudo averiguar a quién avisar. Se registra y se sigue: el
    // pedido ya está confirmado y eso es lo que no puede deshacerse.
    console.error(`[notificaciones] pedido ${pedido.id}: no se pudo avisar.`, error);
  }
}
