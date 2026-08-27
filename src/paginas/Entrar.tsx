/**
 * El formulario de acceso.
 *
 * Es la pantalla que el prototipo no tenía. `reserva.html` no pedía nada y
 * `admin.html` comparaba un SHA-256 en el navegador, así que cualquiera con
 * la URL veía los móviles de contacto de todo el campus. Era, escrito en el
 * propio README, «la deuda más importante del proyecto».
 *
 * No hay registro ni «he olvidado mi contraseña», y es deliberado: las
 * cuentas de esto no se piden, se dan. Son las del personal de cafetería, las
 * crea administración y llevan asociado un perfil con su sede. Un formulario
 * de alta abierto dejaría entrar a cualquiera con un correo — hasta la puerta
 * siguiente, sí, pero esa puerta no debería tener cola.
 */

import { useState, type FormEvent } from 'react';
import { useSesion } from '../contexto/Sesion.js';
import { Cabecera } from '../componentes/Cabecera.js';

export function Entrar() {
  const { entrar } = useSesion();
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;

    setError(null);
    setEnviando(true);
    try {
      await entrar(correo, clave);
      // No se navega a ninguna parte: al cambiar la sesión, `App` deja de
      // pintar esta pantalla por su cuenta. Redirigir aquí además sería
      // decidir dos veces lo mismo, y las dos podrían discrepar.
    } catch (e) {
      setError((e as Error).message);
      setEnviando(false);
    }
  }

  return (
    <>
      <Cabecera />
      <main className="contenedor pagina pagina--estrecha">
        <form className="acceso" onSubmit={alEnviar}>
          <h1 className="acceso__titulo">Entrar</h1>
          <p className="acceso__nota">
            Usa la cuenta que te dio administración. Si no tienes una, pídela:
            no hay registro abierto.
          </p>

          <label className="campo">
            <span className="campo__etiqueta">Correo</span>
            <input
              className="campo__control"
              type="email"
              name="correo"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              autoComplete="username"
              required
              disabled={enviando}
              /* El foco arranca aquí: es el primer campo y quien llega a esta
                 pantalla siempre viene a escribir. */
              autoFocus
            />
          </label>

          <label className="campo">
            <span className="campo__etiqueta">Contraseña</span>
            <input
              className="campo__control"
              type="password"
              name="clave"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              autoComplete="current-password"
              required
              disabled={enviando}
            />
          </label>

          {error && (
            /* `assertive` aquí sí: es la respuesta directa a algo que la
               persona acaba de hacer, y esperar a que termine de leerse otra
               cosa dejaría el fallo sin anunciar. */
            <p className="campo__error" role="alert" aria-live="assertive">{error}</p>
          )}

          <button
            type="submit"
            className="boton boton--primario"
            disabled={enviando}
            aria-busy={enviando || undefined}
          >
            {enviando && <span className="boton__girador" aria-hidden="true" />}
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </main>
    </>
  );
}
