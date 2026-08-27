/**
 * Las rutas, y la puerta.
 *
 * Antes eran tres archivos HTML sueltos: index, reserva y admin. La división
 * era la misma que hay aquí, pero la imponía el enlace por el que se llegaba
 * — y `admin.html` solo estaba protegido por un pestillo de navegador.
 *
 * Ahora el reparto lo decide `rol`, y el servidor lo vuelve a comprobar en
 * cada petición. Esconder una ruta no es protegerla; lo que se hace aquí es
 * no ofrecer lo que no se puede usar.
 */

import { Navigate, Route, Routes } from 'react-router-dom';
import { useSesion } from './contexto/Sesion.js';
import { Cabecera } from './componentes/Cabecera.js';
import { Pie } from './componentes/Pie.js';
import { BloqueEstado } from './componentes/BloqueEstado.js';
import { Entrar } from './paginas/Entrar.js';
import { Inicio } from './paginas/Inicio.js';
import { Reserva } from './paginas/Reserva.js';
import { Admin } from './paginas/Admin.js';

export function App() {
  const { cargando, sesion, contexto, error, salir } = useSesion();

  // Mientras se comprueba si había sesión guardada no se pinta nada más. Sin
  // esto, quien ya estaba dentro vería asomar el formulario de acceso en cada
  // recarga antes de que la sesión se restaure.
  if (cargando) {
    return (
      <>
        <Cabecera />
        <main className="contenedor pagina">
          <BloqueEstado tipo="cargando" titulo="Comprobando la sesión…" />
        </main>
      </>
    );
  }

  if (!sesion) return <Entrar />;

  /**
   * Hay sesión pero no contexto: la cuenta es válida y aun así no se pudo
   * empezar. Casi siempre es una cuenta sin fila en `perfil` —el permiso lo
   * da administración a mano, no el registro— y por eso la salida que se
   * ofrece es cerrar sesión, no reintentar.
   */
  if (!contexto) {
    return (
      <>
        <Cabecera />
        <main className="contenedor pagina">
          <BloqueEstado
            tipo="error"
            titulo="No se pudo abrir la aplicación"
            detalle={error ?? 'El servidor no devolvió el perfil de esta cuenta.'}
            accion={{ texto: 'Cerrar sesión', alPulsar: salir }}
          />
        </main>
        <Pie />
      </>
    );
  }

  const { perfil } = contexto;
  const esAdmin = perfil.rol === 'admin';

  return (
    <>
      <Cabecera />
      <Routes>
        {/*
          El mostrador no elige cafetería: tiene la suya. Mandarlo al inicio
          para que pulse su propia sede sería un clic diario sin ninguna
          decisión detrás, así que se le lleva directo a su pantalla.
        */}
        <Route
          path="/"
          element={
            esAdmin
              ? <Inicio />
              : <Navigate to={`/reserva/${perfil.cafeteriaId ?? ''}`} replace />
          }
        />
        <Route path="/reserva/:cafeteriaId" element={<Reserva />} />
        <Route
          path="/admin"
          element={esAdmin ? <Admin /> : <Navigate to="/" replace />}
        />
        {/* Cualquier otra cosa, a la raíz: no hay nada que buscar aquí. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
