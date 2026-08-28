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

        <Route path="/reserva/:cafeteriaId" element={<ExigeSesion><Reserva /></ExigeSesion>} />

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
 * ¿Está el mostrador abriendo una sede que no es la suya?
 *
 * El servidor ya lo impone —`sedePermitida` le devuelve la suya pida la que
 * pida— pero eso, sin avisar, produce algo peor que un error: la pantalla
 * pondría «Autoservicio Bienestar Pro» encima de las reservas de Camilo
 * Torres. Quien atiende no tendría forma de notarlo.
 *
 * Es un enganche y no un componente a propósito. Como componente habría que
 * invocarlo desde `Reserva` para leer su resultado, y llamar a un componente
 * como si fuera una función mete sus hooks en el orden de quien llama: basta
 * con que un día alguien lo ponga dentro de un `if` para romperlo de una
 * forma que no se entiende.
 */
export function useEsSedeAjena(): boolean {
  const { contexto } = useSesion();
  const { cafeteriaId = '' } = useParams();
  const perfil = contexto?.perfil;

  if (!perfil || perfil.rol === 'admin') return false;
  return perfil.cafeteriaId !== cafeteriaId;
}
