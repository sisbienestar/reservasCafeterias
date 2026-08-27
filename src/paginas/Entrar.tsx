/**
 * El formulario de acceso.
 *
 * Reutiliza el marcado de la pantalla de acceso que tenía `admin.html`
 * —`.acceso`, `.acceso__panel`, `.acceso__titulo`…—, pero lo que hay detrás
 * es otra cosa. Allí era un pestillo: un SHA-256 comparado en el navegador,
 * que se saltaba con las herramientas de desarrollo, y `reserva.html` no
 * pedía nada. Aquí es una sesión que valida el servidor, y la piden las tres
 * pantallas.
 *
 * No hay registro ni «he olvidado mi contraseña», y es deliberado: las
 * cuentas de esto no se piden, se dan. Son las del personal de cafetería, las
 * crea administración y llevan asociado un perfil con su sede.
 */

import { useState, type FormEvent } from 'react';
import { useSesion } from '../contexto/Sesion.js';
import { Cabecera } from '../componentes/Cabecera.js';
import { Pie } from '../componentes/Pie.js';

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
      // pintar esta pantalla por su cuenta. Redirigir aquí sería decidir dos
      // veces lo mismo, y las dos podrían discrepar.
    } catch (e) {
      setError((e as Error).message);
      setEnviando(false);
    }
  }

  return (
    <>
      <Cabecera />
      <main className="contenedor pagina acceso">
        <form className="acceso__panel" onSubmit={alEnviar} noValidate>
          <h1 className="acceso__titulo">Entrar</h1>
          <p className="acceso__nota">
            Usa la cuenta que te dio administración. Si no tienes una, pídela:
            no hay registro abierto.
          </p>

          {/* `alert` y no `status`: es la respuesta directa a algo que la
              persona acaba de hacer, y esperar a que termine de leerse otra
              cosa dejaría el fallo sin anunciar. */}
          {error && <p className="acceso__error" role="alert">{error}</p>}

          <div className="campo">
            <label className="campo__etiqueta" htmlFor="campo-correo">Correo</label>
            <input
              className="campo__control"
              id="campo-correo"
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
          </div>

          <div className="campo">
            <label className="campo__etiqueta" htmlFor="campo-clave">Clave</label>
            <input
              className="campo__control"
              id="campo-clave"
              type="password"
              name="clave"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              required
              disabled={enviando}
            />
          </div>

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
      <Pie />
    </>
  );
}
