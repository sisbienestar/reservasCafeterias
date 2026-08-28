/**
 * El acceso, en un modal.
 *
 * Va aquí y no en una pantalla propia porque una pantalla propia tiene que
 * pintar su cabecera y su pie, y entonces el logo institucional aparece dos
 * veces: una del armazón y otra suya. Además obliga a salir de la portada
 * para volver a ella, cuando lo único que hacía falta era una contraseña.
 *
 * Se abre al pulsar una cafetería o «Admin» sin sesión. Guarda a dónde se
 * iba y lleva allí al entrar.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ES_USUARIO, useSesion } from '../contexto/Sesion.js';

interface Props {
  abierto: boolean;
  alCerrar: () => void;
  /** Se llama cuando la sesión ya está abierta y el perfil ha llegado. */
  alEntrar: () => void;
}

export function ModalAcceso({ abierto, alCerrar, alEntrar }: Props) {
  const { entrar, contexto } = useSesion();
  const dialogo = useRef<HTMLDialogElement>(null);
  const refUsuario = useRef<HTMLInputElement>(null);

  const [identificador, setIdentificador] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const nodo = dialogo.current;
    if (!nodo) return;
    if (abierto && !nodo.open) {
      setError(null);
      nodo.showModal();
      refUsuario.current?.focus();
    } else if (!abierto && nodo.open) {
      nodo.close();
    }
  }, [abierto]);

  /**
   * Se avisa cuando el PERFIL ha llegado, no cuando la contraseña fue buena.
   *
   * Entre las dos cosas hay una petición: `signInWithPassword` resuelve y el
   * contexto todavía tarda en traer el rol. Navegar antes manda a una ruta
   * protegida que aún no ve la sesión, y esa ruta rebota a la portada — el
   * acceso parecería no haber funcionado.
   */
  useEffect(() => {
    if (enviando && contexto?.perfil) {
      setEnviando(false);
      setIdentificador('');
      setClave('');
      alEntrar();
    }
  }, [enviando, contexto, alEntrar]);

  async function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;

    const limpio = identificador.trim();
    // Una sola palabra o un correo. Cualquier otra cosa se avisa aquí: el
    // servidor solo podría contestar «credenciales incorrectas».
    if (!limpio.includes('@') && !ES_USUARIO.test(limpio)) {
      setError('El usuario es una sola palabra, sin espacios.');
      return;
    }

    setError(null);
    setEnviando(true);
    try {
      await entrar(limpio, clave);
      // No se cierra aquí: se espera al perfil, arriba.
    } catch (e) {
      setEnviando(false);
      setError((e as Error).message);
    }
  }

  /*
   * Aquí NO hay `onClose`, y es deliberado.
   *
   * El evento `close` se dispara siempre que el diálogo se cierra, también
   * cuando lo cerramos nosotros al terminar de entrar. Y como cerrar navega a
   * la portada, eso pisaba la navegación a la cafetería que acababa de
   * hacerse: se entraba bien y se acababa en la portada igualmente, como si
   * el acceso no hubiera servido de nada.
   *
   * Las tres salidas de verdad quedan cubiertas sin él: Escape por `cancel`,
   * la × por su propio `onClick` y el fondo por el `onClick` del diálogo.
   */
  return (
    <dialog
      className="modal modal--confirmacion"
      ref={dialogo}
      onCancel={(e) => { if (enviando) e.preventDefault(); else alCerrar(); }}
      onClick={(e) => { if (e.target === dialogo.current && !enviando) alCerrar(); }}
      aria-labelledby="titulo-acceso"
    >
      <form className="modal__panel" onSubmit={alEnviar} noValidate>
        <header className="modal__cabecera">
          <h2 className="modal__titulo" id="titulo-acceso">Ingresar</h2>
          <button type="button" className="modal__cerrar" onClick={alCerrar}
                  disabled={enviando} aria-label="Cerrar">
            ×
          </button>
        </header>

        {/* Dice de dónde salen las credenciales, que es lo único que no se
            deduce del formulario: aquí no hay registro, las cuentas se dan. */}
        <p className="modal__nota">
          Ingresa tus datos de acceso. Si no los tienes solicita al administrador.
        </p>

        {error && <p className="modal__error" role="alert">{error}</p>}

        <div className="campo">
          <label className="campo__etiqueta" htmlFor="campo-usuario">Usuario o correo</label>
          <input
            ref={refUsuario}
            className="campo__control"
            id="campo-usuario"
            /* `text` y no `email`: con `email` el navegador rechaza «gloria»
               por su cuenta, con un mensaje suyo que pide una arroba. */
            type="text"
            name="usuario"
            value={identificador}
            onChange={(e) => setIdentificador(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={enviando}
          />
        </div>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor="campo-clave">Contraseña</label>
          <input
            className="campo__control"
            id="campo-clave"
            type="password"
            name="clave"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            autoComplete="current-password"
            disabled={enviando}
          />
        </div>

        <footer className="modal__pie">
          <button type="submit" className="boton boton--primario"
                  disabled={enviando} aria-busy={enviando || undefined}>
            {enviando && <span className="boton__girador" aria-hidden="true" />}
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
