/**
 * Las rutas, y la puerta.
 *
 * La portada es PÚBLICA: enseña las cafeterías del campus sin pedir nada. La
 * sesión se pide al entrar en una sede o en administración, que es donde
 * empiezan a verse nombres y móviles de personas.
 *
 * Antes eran tres archivos HTML sueltos, y la división la imponía el enlace
 * por el que se llegaba. Ahora la decide `rol`, y el servidor la vuelve a
 * comprobar en cada petición: esconder una ruta no es protegerla, y lo que se
 * hace aquí es no ofrecer lo que no se puede usar.
 */

import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useSesion } from './contexto/Sesion.js';
import { Cabecera } from './componentes/Cabecera.js';
import { Pie } from './componentes/Pie.js';
import { BloqueEstado } from './componentes/BloqueEstado.js';
import { Inicio } from './paginas/Inicio.js';
import { Reserva } from './paginas/Reserva.js';
import { Admin } from './paginas/Admin.js';

export function App() {
  const { cargando, contexto, error, salir } = useSesion();

  // Mientras se comprueba si había sesión guardada no se pinta nada más. Sin
  // esto, quien ya estaba dentro vería asomar el acceso en cada recarga.
  if (cargando) {
    return (
      <>
        <Cabecera />
        <main className="contenedor pagina">
          <BloqueEstado tipo="cargando" titulo="Cargando…" />
        </main>
      </>
    );
  }

  /**
   * Sin contexto no se puede pintar nada, ni siquiera la portada: no llegó ni
   * la fecha de trabajo. O se cayó la red, o la cuenta es válida pero no
   * tiene fila en `perfil` —el permiso lo da administración a mano, no el
   * registro—, y por eso la salida que se ofrece es cerrar sesión.
   */
  if (!contexto) {
    return (
      <>
        <Cabecera />
        <main className="contenedor pagina">
          <BloqueEstado
            tipo="error"
            titulo="No se pudo abrir la aplicación"
            detalle={error ?? 'El servidor no respondió.'}
            accion={{ texto: 'Cerrar sesión', alPulsar: salir }}
          />
        </main>
        <Pie />
      </>
    );
  }

  return (
    <>
      <Cabecera />
      <Routes>
        {/* Pública. Es la puerta de la aplicación, no una pantalla más. */}
        <Route path="/" element={<Inicio />} />

        <Route
          path="/reserva/:cafeteriaId"
          element={<ExigeSesion><SoloSuSede><Reserva /></SoloSuSede></ExigeSesion>}
        />

        <Route path="/admin" element={<ExigeSesion rol="admin"><Admin /></ExigeSesion>} />

        {/* Cualquier otra cosa, a la portada: no hay nada que buscar aquí. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

/**
 * Envuelve una ruta que necesita sesión, y opcionalmente un rol.
 *
 * Cuando falta la sesión NO se manda a la portada: se manda al acceso
 * recordando a dónde se iba, para volver ahí al entrar. Perder el destino
 * obliga a repetir la navegación entera después de teclear la contraseña, y
 * eso en un mostrador se nota todos los días.
 */
function ExigeSesion({ rol, children }: { rol?: 'admin'; children: React.ReactNode }) {
  const { contexto } = useSesion();
  const donde = useLocation();
  const perfil = contexto?.perfil ?? null;

  if (!perfil) {
    /*
     * A la portada, no a una pantalla de acceso.
     *
     * El acceso es un modal que abre la portada, así que lo que se manda es
     * el destino: quien pulsó una cafetería o «Admin» sin sesión aparece en
     * la portada con el formulario delante, y al entrar va donde iba.
     */
    return <Navigate to="/" replace state={{ pedirAcceso: donde.pathname + donde.search }} />;
  }

  /**
   * Con sesión pero sin el rol: a la portada y no al acceso.
   *
   * Volver a pedir la contraseña sugeriría que con otra credencial se entra,
   * y no es eso: esta cuenta simplemente no llega. Quien de verdad necesite
   * administración tiene que pedir el permiso, no volver a teclear.
   */
  if (rol === 'admin' && perfil.rol !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

/**
 * El mostrador siempre acaba en SU sede.
 *
 * Si pulsa otra cafetería, se le lleva a la suya en vez de darle un error.
 * Eso no es tragarse una equivocación: es que aquí no hay ninguna decisión
 * que tomar. Su cuenta atiende una sola sede, el servidor le devolvería sus
 * reservas pidiera la que pidiera, y la única pantalla que puede usar es
 * exactamente esa. Un aviso solo añadiría un paso antes del mismo destino.
 *
 * Lo que sí había que evitar —y por eso existe esta guarda— es dejarle entrar
 * a la ruta ajena: el servidor le da las reservas de SU sede, así que la
 * pantalla acabaría poniendo «Autoservicio Bienestar Pro» encima de las
 * reservas de Camilo Torres. Eso sí es un error, y silencioso.
 *
 * Administración no pasa por aquí: elige sede y las ve todas.
 */
function SoloSuSede({ children }: { children: React.ReactNode }) {
  const { contexto } = useSesion();
  const { cafeteriaId = '' } = useParams();
  const perfil = contexto?.perfil;

  if (!perfil || perfil.rol === 'admin') return <>{children}</>;

  // El `&&` no es defensivo de más: un mostrador sin sede no puede existir
  // —lo impide un CHECK de la tabla— pero si alguna vez existiera, redirigir
  // a `/reserva/` daría vueltas para siempre en vez de fallar.
  if (perfil.cafeteriaId && perfil.cafeteriaId !== cafeteriaId) {
    return <Navigate to={`/reserva/${perfil.cafeteriaId}`} replace />;
  }

  return <>{children}</>;
}
