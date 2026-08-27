/**
 * Pestillo de la pantalla de administración.
 *
 * No es autenticación. Lo dice `config.js` y conviene repetirlo aquí: sin
 * backend, el código y los datos están en el navegador de quien abra la
 * página, y saltarse esta comprobación es cuestión de abrir las herramientas
 * de desarrollo. Su único trabajo es que quien llegue por casualidad a
 * `admin.html` no se encuentre dentro del histórico de la universidad.
 *
 * Dos decisiones que sí aportan algo real:
 *
 * - **Se compara el SHA-256, no la clave.** No hace el pestillo más fuerte,
 *   pero evita que la clave —que casi seguro se reutiliza en otro sitio—
 *   quede escrita en claro en el repositorio.
 * - **La sesión vive en `sessionStorage`, no en `localStorage`.** Se cierra
 *   al cerrar la pestaña. En un equipo compartido de oficina, dejar la sesión
 *   abierta para siempre es peor que pedir la clave cada mañana.
 */

import { HASH_CLAVE_ADMIN } from '../config.js';
import { qs } from './dom.js';

const CLAVE_SESION = 'reservasCafeterias.admin';

/** SHA-256 en hexadecimal, con la API nativa del navegador. */
async function hash(texto) {
  const datos = new TextEncoder().encode(texto);
  const resumen = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(resumen)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * `crypto.subtle` solo existe en contexto seguro: https, o http en localhost
 * y 127.0.0.1. Servido desde una IP de la red local por http, no está — y
 * conviene decirlo con esas palabras en vez de fallar con «undefined».
 */
const hayCripto = () => typeof crypto !== 'undefined' && !!crypto?.subtle;

/** Lectura tolerante: un navegador con el almacenamiento bloqueado lanza. */
function sesionAbierta() {
  try {
    return sessionStorage.getItem(CLAVE_SESION) === 'ok';
  } catch {
    return false;
  }
}

function guardarSesion() {
  try {
    sessionStorage.setItem(CLAVE_SESION, 'ok');
  } catch {
    // Sin almacenamiento se entra igual, solo que habrá que repetir la clave
    // en la siguiente carga. Es un inconveniente, no un motivo para cerrar.
  }
}

export function cerrarSesion() {
  try {
    sessionStorage.removeItem(CLAVE_SESION);
  } catch {
    // Nada que limpiar si no se pudo guardar.
  }
}

/**
 * Muestra la pantalla de acceso y resuelve cuando se entra.
 *
 * No resuelve nunca si no se acierta la clave: quien llama simplemente no
 * continúa. `#contenido` viene con `hidden` puesto desde el HTML, así que si
 * este módulo fallara al cargar, la pantalla se queda cerrada en vez de
 * abierta — que es como debe fallar un pestillo.
 *
 * @param {{acceso: HTMLElement, contenido: HTMLElement}} vista
 * @returns {Promise<void>}
 */
export function pedirAcceso(vista) {
  const formulario = qs('#formulario-acceso', vista.acceso);
  const campo = qs('#campo-clave', vista.acceso);
  const error = qs('[data-error-acceso]', vista.acceso);
  const boton = qs('[data-entrar]', vista.acceso);

  const entrar = () => {
    vista.acceso.hidden = true;
    vista.contenido.hidden = false;
  };

  if (sesionAbierta()) {
    entrar();
    return Promise.resolve();
  }

  vista.acceso.hidden = false;

  return new Promise((resolve) => {
    if (!hayCripto()) {
      error.textContent =
        'Esta pantalla necesita https, o http en localhost. Servida desde una ' +
        'dirección de red por http, el navegador no permite comprobar la clave.';
      error.hidden = false;
      boton.disabled = true;
      campo.disabled = true;
      return;
    }

    campo.focus();

    formulario.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      if (boton.disabled) return;

      error.hidden = true;
      boton.disabled = true;
      boton.textContent = 'Comprobando…';

      try {
        if ((await hash(campo.value)) === HASH_CLAVE_ADMIN) {
          guardarSesion();
          entrar();
          resolve();
          return;
        }
        // Mensaje único y sin pistas: no se dice si la clave es corta, larga
        // o parecida. Y el campo se limpia para no dejarla a la vista.
        error.textContent = 'Clave incorrecta.';
        error.hidden = false;
        campo.value = '';
        campo.focus();
      } catch (fallo) {
        error.textContent = `No se pudo comprobar la clave: ${fallo.message}`;
        error.hidden = false;
      } finally {
        boton.disabled = false;
        boton.textContent = 'Entrar';
      }
    });
  });
}
