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

import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ES_USUARIO, useSesion } from '../contexto/Sesion.js';
import { Cabecera } from '../componentes/Cabecera.js';
import { Pie } from '../componentes/Pie.js';

export function Entrar() {
  const { entrar, contexto } = useSesion();
  const donde = useLocation();
  const navegar = useNavigate();

  const [identificador, setIdentificador] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  /**
   * A dónde volver al entrar.
   *
   * Lo deja `ExigeSesion` al desviar aquí. Sin esto, quien pulsa una
   * cafetería y tiene que identificarse aparecería después en la portada y
   * tendría que volver a buscarla — un paso de más cada mañana.
   */
  const volverA = (donde.state as { volverA?: string } | null)?.volverA ?? '/';

  // Con sesión ya abierta esta pantalla no pinta nada. Pasa al recargar con
  // la sesión guardada, o al llegar con el botón de atrás.
  useEffect(() => {
    if (contexto?.perfil) navegar(volverA, { replace: true });
  }, [contexto, navegar, volverA]);

  if (contexto?.perfil) return <Navigate to={volverA} replace />;

  async function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;

    const limpio = identificador.trim();
    // Una sola palabra o un correo: cualquier otra cosa —dos palabras, un
    // espacio en medio— se avisa aquí y no se manda, porque el servidor solo
    // podría contestar «credenciales incorrectas» y eso no explica nada.
    if (!limpio.includes('@') && !ES_USUARIO.test(limpio)) {
      setError('El usuario es una sola palabra, sin espacios. O escribe tu correo completo.');
      return;
    }

    setError(null);
    setEnviando(true);
    try {
      await entrar(limpio, clave);
      navegar(volverA, { replace: true });
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
            <label className="campo__etiqueta" htmlFor="campo-usuario">
              Usuario o correo
            </label>
            <input
              className="campo__control"
              id="campo-usuario"
              /* `text` y no `email`: con `email` el navegador rechaza «gloria»
                 por su cuenta, antes de que llegue aquí, y con un mensaje suyo
                 que dice que falta una arroba. */
              type="text"
              name="usuario"
              value={identificador}
              onChange={(e) => setIdentificador(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              disabled={enviando}
              placeholder="gloria"
              /* El foco arranca aquí: es el primer campo y quien llega a esta
                 pantalla siempre viene a escribir. */
              autoFocus
            />
            <span className="campo__ayuda">
              Tu nombre de usuario, en una sola palabra. También sirve el
              correo completo.
            </span>
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

          {/* La portada es pública: se puede mirar el campus sin entrar. */}
          <Link className="acceso__salida" to="/">← Ver las cafeterías</Link>
        </form>
      </main>
      <Pie />
    </>
  );
}
