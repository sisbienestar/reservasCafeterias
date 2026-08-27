/**
 * Configuración global del prototipo.
 *
 * Este archivo es el interruptor de la migración: cuando el backend real esté
 * listo, se cambia FUENTE_DATOS a 'api' y se rellena API_BASE_URL. Ningún
 * archivo fuera de js/services/ necesita cambiar.
 */

/** 'mock' → datos simulados en memoria · 'api' → backend real (Apps Script). */
export const FUENTE_DATOS = 'api';

/** URL del despliegue de Google Apps Script (o del futuro backend propio). */
export const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbziYt6hJ3zhRBA1no5YpRoSDHdOwSjCLDMCBcceRDqFm7Z6G14fZ2kvQEJWYDDWadOY/exec ';

/** Latencia simulada del mock, en ms. Sirve para ejercitar los estados de carga. */
export const LATENCIA_MOCK_MS = 300;

/* ── INTERRUPTOR TEMPORAL DE PRUEBAS ────────────────────────────────────
 *
 * En `true`, se levanta la regla de «sábados y domingos no hay servicio»
 * para poder probar el sistema en fin de semana.
 *
 * DEBE VOLVER A `false` ANTES DE USARLO DE VERDAD. Si se queda encendido,
 * el personal podrá registrar reservas de sábado y domingo que la cocina no
 * va a ver nunca.
 *
 * Va acompañado de dos avisos para que no se olvide: la pantalla de
 * mostrador muestra una banda naranja mientras esté encendido, y hay una
 * constante gemela en `apps-script/Codigo.gs` que también hay que apagar
 * —el backend aplica la regla por su cuenta, que para eso está—.
 */
export const PERMITIR_FIN_DE_SEMANA = false;

/**
 * Milisegundos antes de abortar una petición HTTP real.
 *
 * Tiene que ser MAYOR que la espera del bloqueo en el servidor (20 s en
 * `apps-script/Codigo.gs`). Si el cliente se rindiera antes, el trabajo
 * seguiría ejecutándose en Google mientras aquí se ve un error de red — y
 * quien está en el mostrador volvería a pulsar «Registrar reserva», creando
 * la reserva dos veces. Además Apps Script tarda unos segundos en arrancar
 * la primera petición del día.
 */
export const TIMEOUT_HTTP_MS = 25000;

/* ── Acceso a la pantalla de administración ─────────────────────────────
 *
 * LEE ESTO ANTES DE CONFIAR EN ELLO.
 *
 * Esta clave es un PESTILLO, no una cerradura. Todo el código y todos los
 * datos viajan al navegador de quien abra la página: cualquiera con las
 * herramientas de desarrollo puede saltarse la comprobación en veinte
 * segundos. Sirve para que quien llegue por casualidad a `admin.html` no se
 * encuentre dentro, y para nada más.
 *
 * La protección de verdad solo puede vivir en el backend: cuando Apps Script
 * esté en marcha, es él quien tiene que validar la sesión y negarse a
 * devolver datos sin ella. Entonces esto se sustituye, no se complementa.
 *
 * Se guarda el SHA-256 y no la clave en claro por una razón concreta y
 * limitada: que la clave —que probablemente se reutilice en otro sitio— no
 * quede escrita literalmente en el repositorio. No hace el pestillo más
 * fuerte.
 *
 * Para cambiarla, pega esto en la consola del navegador con tu clave y
 * copia aquí el resultado:
 *
 *   crypto.subtle.digest('SHA-256', new TextEncoder().encode('MI-CLAVE'))
 *     .then(b => console.log([...new Uint8Array(b)]
 *       .map(x => x.toString(16).padStart(2, '0')).join('')));
 */

/** SHA-256 de la clave de administración. */
export const HASH_CLAVE_ADMIN =
  '0e07febd730e3a32ee327e919bdbdde265439f4dc89a1dcf56e54cccacc9ab17';
