/**
 * Las rutas, y la puerta.
 *
 * La aplicación se divide en MÓDULOS y cada uno cuelga de su propio prefijo:
 * reservas de `/reservas`, y el que venga del suyo. La portada es la lista de
 * módulos, y es la ÚNICA pantalla pública: enseña qué hay sin pedir nada, y a
 * partir de ahí hay que entrar. Los dos módulos piden lo mismo en el mismo
 * sitio — pulsar su tarjeta abre el acceso.
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
import { Modulos } from './paginas/Modulos.js';
import { Inicio } from './paginas/reservas/Inicio.js';
import { Reserva } from './paginas/reservas/Reserva.js';
import { Admin } from './paginas/reservas/Admin.js';
import { Inicio as PedidosInicio } from './paginas/pedidos/Inicio.js';
import { Pedido } from './paginas/pedidos/Pedido.js';
import { Documento } from './paginas/pedidos/Documento.js';
import { Historial } from './paginas/pedidos/Historial.js';
import { Admin as PedidosAdmin } from './paginas/pedidos/Admin.js';
import { AdminGeneral } from './paginas/AdminGeneral.js';

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
        <Route path="/" element={<Modulos />} />

        {/* La administración de la APLICACIÓN, no la de un módulo. Por eso
            cuelga de la raíz y no de ningún prefijo. */}
        <Route
          path="/admin"
          element={<ExigeSesion rol="admin"><AdminGeneral /></ExigeSesion>}
        />

        {/* ── Módulo: reservas de almuerzos ──────────────────────────── */}

        {/*
          Exige sesión, igual que la portada de pedidos. Antes era pública —la
          lista de cafeterías no dice nada de nadie— pero eso dejaba los dos
          módulos pidiendo cosas distintas en el mismo sitio: uno entraba
          directo y el otro no. Ahora la puerta es la misma para los dos, y
          está en la lista de módulos.
        */}
        <Route
          path="/reservas"
          element={
            <ExigeModulo modulo="reservas">
              <ExigeSesion portada="/"><Inicio /></ExigeSesion>
            </ExigeModulo>
          }
        />

        {/*
          `/reservas/admin` va ANTES por orden de lectura, pero no por eso
          gana: React Router ordena por especificidad y un tramo literal pesa
          más que uno con parámetro. La consecuencia a recordar es que una
          cafetería cuyo identificador fuera «admin» quedaría inalcanzable.
        */}
        <Route
          path="/reservas/admin"
          element={<ExigeModulo modulo="reservas"><ExigeSesion rol="admin" portada="/"><Admin /></ExigeSesion></ExigeModulo>}
        />

        <Route
          path="/reservas/:cafeteriaId"
          element={
            <ExigeModulo modulo="reservas">
              <ExigeSesion portada="/">
                <SoloSuSede><Reserva /></SoloSuSede>
              </ExigeSesion>
            </ExigeModulo>
          }
        />

        {/* ── Módulo: pedidos a proveedores ──────────────────────────── */}

        {/* Igual que la de reservas: sesión, y el acceso en la portada. */}
        <Route
          path="/pedidos"
          element={<ExigeModulo modulo="pedidos"><ExigeSesion portada="/"><PedidosInicio /></ExigeSesion></ExigeModulo>}
        />

        {/*
          `historial` es un tramo LITERAL y `:proveedorId` uno con parámetro,
          así que React Router se queda con el primero aunque los dos midan lo
          mismo. La consecuencia a recordar es la de siempre: un proveedor cuyo
          identificador fuera «historial» quedaría inalcanzable.
        */}
        <Route
          path="/pedidos/historial"
          element={<ExigeModulo modulo="pedidos"><ExigeSesion portada="/"><Historial /></ExigeSesion></ExigeModulo>}
        />

        {/* Como `historial`: tramo literal, gana a `:proveedorId`. */}
        <Route
          path="/pedidos/admin"
          element={
            <ExigeModulo modulo="pedidos">
              <ExigeSesion rol="admin" portada="/"><PedidosAdmin /></ExigeSesion>
            </ExigeModulo>
          }
        />

        {/*
          Tres tramos, así que no compite con `/pedidos/:proveedorId`, que
          tiene dos. Un proveedor llamado «documento» tampoco chocaría.
        */}
        <Route
          path="/pedidos/documento/:pedidoId"
          element={<ExigeModulo modulo="pedidos"><ExigeSesion portada="/"><Documento /></ExigeSesion></ExigeModulo>}
        />

        {/* El mismo formulario que `/pedidos/:proveedorId`, con un borrador
            cargado dentro. Ver el comentario de `Pedido`. */}
        <Route
          path="/pedidos/editar/:pedidoId"
          element={<ExigeModulo modulo="pedidos"><ExigeSesion portada="/"><Pedido /></ExigeSesion></ExigeModulo>}
        />

        <Route
          path="/pedidos/:proveedorId"
          element={<ExigeModulo modulo="pedidos"><ExigeSesion portada="/"><Pedido /></ExigeSesion></ExigeModulo>}
        />

        {/*
          La dirección de antes de que reservas fuera un módulo.

          `/admin` YA NO redirige aquí: desde que existe el panel de la
          aplicación, esa dirección es suya. Un enlace guardado del prototipo
          aterriza ahora en el panel general, que es un sitio razonable — y a
          quien no sea admin lo devuelve a la portada.

          Se quedan porque el mostrador tiene la suya guardada en el navegador
          y perderla significa una llamada preguntando por qué no abre. No
          cuestan nada: redirigen y no pintan pantalla.
        */}
        <Route path="/reserva/:cafeteriaId" element={<ReservaAntigua />} />

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
 *
 * `portada` es la del MÓDULO, no la de la aplicación: el acceso vive en la
 * portada de cada módulo, y devolver a quien iba a una sede hasta la lista de
 * módulos le haría recorrer dos pantallas para volver donde estaba.
 */
function ExigeSesion({
  rol,
  portada = '/',
  children,
}: {
  rol?: 'admin';
  portada?: string;
  children: React.ReactNode;
}) {
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
    return <Navigate to={portada} replace state={{ pedirAcceso: donde.pathname + donde.search }} />;
  }

  /**
   * Con sesión pero sin el rol: a la portada y no al acceso.
   *
   * Volver a pedir la contraseña sugeriría que con otra credencial se entra,
   * y no es eso: esta cuenta simplemente no llega. Quien de verdad necesite
   * administración tiene que pedir el permiso, no volver a teclear.
   */
  if (rol === 'admin' && perfil.rol !== 'admin') {
    return <Navigate to={portada} replace />;
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
/**
 * Cierra las rutas de un módulo apagado.
 *
 * El contexto trae los módulos YA FILTRADOS por el servidor: administración
 * recibe también los apagados —para poder probarlos— y los demás solo los
 * activos. Así que «no está en la lista» significa exactamente «este módulo no
 * es para ti», sin que la pantalla tenga que saber por qué.
 *
 * Esto NO es la protección: la de verdad está en `api/_nucleo/enrutador.ts`,
 * que rechaza las acciones del módulo apagado. Esto es no ofrecer lo que no se
 * puede usar, que es otra cosa.
 */
function ExigeModulo({ modulo, children }: { modulo: string; children: React.ReactNode }) {
  const { contexto } = useSesion();
  const abierto = (contexto?.modulos ?? []).some((m) => m.id === modulo);

  if (!abierto) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function SoloSuSede({ children }: { children: React.ReactNode }) {
  const { contexto } = useSesion();
  const { cafeteriaId = '' } = useParams();
  const perfil = contexto?.perfil;

  if (!perfil || perfil.rol === 'admin') return <>{children}</>;

  // El `&&` no es defensivo de más: un mostrador sin sede no puede existir
  // —lo impide un CHECK de la tabla— pero si alguna vez existiera, redirigir
  // a `/reservas/` daría vueltas para siempre en vez de fallar.
  if (perfil.cafeteriaId && perfil.cafeteriaId !== cafeteriaId) {
    return <Navigate to={`/reservas/${perfil.cafeteriaId}`} replace />;
  }

  return <>{children}</>;
}

/**
 * La dirección de antes, `/reserva/:cafeteriaId`, llevada a la de ahora.
 *
 * `replace` para que el atrás del navegador no devuelva a la vieja y vuelva a
 * rebotar; y conservando la sede, que es lo único que la dirección traía.
 */
function ReservaAntigua() {
  const { cafeteriaId = '' } = useParams();
  return <Navigate to={`/reservas/${cafeteriaId}`} replace />;
}
