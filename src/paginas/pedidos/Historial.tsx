/**
 * El historial de pedidos.
 *
 * Es la pantalla que la plantilla de Excel no podía tener: allí cada pedido
 * era un archivo suelto en una carpeta de Drive con un nombre inventado por
 * una macro, y responder «¿cuánto pedimos a Coca-Cola en agosto?» era abrirlos
 * de uno en uno.
 *
 * Enseña la FICHA de cada pedido —fecha, proveedor, sede, cuántos renglones—
 * y no su contenido. Los productos se piden al abrir uno: un listado de
 * treinta pedidos con todos sus productos dentro sería un cuarto de megabyte
 * para pintar treinta filas.
 *
 * Lo que ve cada quien lo decide el SERVIDOR: administración ve todas las
 * sedes y puede filtrar; al mostrador se le impone la suya, pida la que pida.
 * El desplegable de sede solo se dibuja para administración porque para el
 * mostrador no habría nada que elegir.
 */

import { useCallback, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  buscarPedidos, PASOS_PEDIDO, ANULADO, nombreDeEstado, type FichaPedido,
} from '../../servicios/pedidosServicio.js';
import { getProveedores } from '../../servicios/proveedoresServicio.js';
import { getCafeterias } from '../../servicios/cafeteriasServicio.js';
import { usePeticion } from '../../utiles/usePeticion.js';
import { BloqueEstado } from '../../componentes/BloqueEstado.js';
import { BarraVolver } from '../../componentes/BarraVolver.js';
import { Pie } from '../../componentes/Pie.js';
import { useHoy, useSesion } from '../../contexto/Sesion.js';
import { formatearFechaCorta, sumarDias } from '../../utiles/fechas.js';
import { puede } from '../../servicios/capacidades.js';

/*
 * Los nombres de estado los pone `pedidosServicio`, no esta pantalla.
 *
 * Estaban duplicados aquí y en `Documento.tsx`, y al cambiar el vocabulario
 * del proceso el historial se quedó diciendo «Confirmado» donde el documento
 * ya decía «Enviado». Dos listas para lo mismo siempre acaban así.
 */

export function Historial() {
  const hoy = useHoy();
  const { contexto, salir } = useSesion();
  const perfil = contexto?.perfil ?? null;
  /*
   * Quién ve TODAS las sedes: quien no tiene ninguna asignada.
   *
   * Se pregunta por la sede y no por el rol porque ya son dos los que la
   * ven entera —administración y el auxiliar administrativo, que habla con
   * un proveedor que reparte en varias— y enumerarlos aquí habría dejado al
   * auxiliar viendo solo un filtro vacío.
   */
  const todasLasSedes = !perfil?.cafeteriaId;

  /*
   * El último mes, que es lo que se mira casi siempre. Abrir en «todo» sería
   * traer el histórico entero para acabar acotándolo a mano cada vez.
   */
  const [desde, setDesde] = useState(() => sumarDias(hoy, -30));
  const [hasta, setHasta] = useState(hoy);
  const [sede, setSede] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [estado, setEstado] = useState('');

  const consultar = useCallback(
    () => buscarPedidos({
      desde,
      hasta,
      cafeteriaId: sede,
      proveedorId: proveedor,
      estado,
    }),
    [desde, hasta, sede, proveedor, estado],
  );

  /*
   * Los filtros van en las dependencias, así que la consulta se repite sola
   * al cambiar cualquiera. No hay botón de «Buscar»: el rango por defecto ya
   * trae algo, y con un botón la pantalla se queda enseñando el resultado de
   * los filtros anteriores hasta que alguien lo pulsa, que es lo que hace
   * dudar de si el filtro funcionó.
   */
  const { datos, cargando, error, recargar } = usePeticion(
    consultar,
    [desde, hasta, sede, proveedor, estado],
  );

  const consultarProveedores = useCallback(() => getProveedores(), []);
  const { datos: proveedores } = usePeticion(consultarProveedores, []);

  // Las sedes solo hacen falta para el desplegable de administración.
  const consultarSedes = useCallback(
    () => (todasLasSedes ? getCafeterias() : Promise.resolve([])),
    [todasLasSedes],
  );
  const { datos: sedes } = usePeticion(consultarSedes, [todasLasSedes]);

  const pedidos = datos?.pedidos ?? [];
  const total = datos?.total ?? 0;
  const hayFiltros = Boolean(sede || proveedor || estado);

  /*
   * El aviso de algo que pasó en OTRA pantalla.
   *
   * Hoy solo lo manda el documento al eliminar un pedido, y tiene que llegar
   * así: para cuando el servidor contesta, la pantalla que lo pidió ya no se
   * está viendo —el pedido no existe, no hay documento que pintar— así que
   * decirlo allí sería escribirlo en una hoja que nadie va a leer.
   *
   * Se lee del estado de la navegación y no de un parámetro de la dirección:
   * no forma parte de la dirección del historial, y refrescar con F5 no debe
   * volver a anunciar un borrado de hace un rato.
   */
  const { state } = useLocation();
  const avisoDeLlegada = typeof (state as { aviso?: unknown })?.aviso === 'string'
    ? (state as { aviso: string }).aviso
    : null;

  return (
    <>
      <main className="contenedor pagina">
        <section className="encabezado-reserva">
          <div className="encabezado-reserva__texto">
            {/*
              El enlace solo para quien puede ir ahí. El auxiliar no elabora
              pedidos, así que `/pedidos` lo devuelve a esta misma pantalla:
              enseñarle la puerta era ofrecerle un camino que no lleva a
              ninguna parte. Para él, el historial ES su portada.

              Sin `contexto`: el sobretítulo decía «Pedidos a proveedores» y el
              enlace ya lleva ahí. Dos renglones grises para lo mismo.
            */}
            {puede(perfil?.rol, 'elaborarPedidos') && (
              <BarraVolver volver={{ a: '/pedidos', texto: '← Todos los proveedores' }} />
            )}
            <div className="encabezado-reserva__linea">
              <h1 className="encabezado-reserva__titulo">Historial</h1>
              <p className="encabezado-reserva__meta">
                {todasLasSedes ? 'Todas las cafeterías' : 'Los pedidos de tu sede'}
              </p>
            </div>
          </div>
        </section>

        {/* `role="status"` y no `alert`: informa de algo que ya terminó bien,
            no interrumpe nada. Es el mismo trato que le da el documento a sus
            avisos. */}
        {avisoDeLlegada && (
          <p className="aviso aviso--exito" role="status">{avisoDeLlegada}</p>
        )}

        <section className="filtros" aria-label="Filtros del historial">
          <div className="campo filtros__campo">
            <label className="campo__etiqueta" htmlFor="desde">Desde</label>
            <input
              id="desde"
              className="campo__control"
              type="date"
              value={desde}
              max={hasta}
              onChange={(e) => setDesde(e.target.value)}
            />
          </div>

          <div className="campo filtros__campo">
            <label className="campo__etiqueta" htmlFor="hasta">Hasta</label>
            <input
              id="hasta"
              className="campo__control"
              type="date"
              value={hasta}
              min={desde}
              onChange={(e) => setHasta(e.target.value)}
            />
          </div>

          {todasLasSedes && (
            <div className="campo filtros__campo filtros__campo--ancho">
              <label className="campo__etiqueta" htmlFor="sede">Cafetería</label>
              <select
                id="sede"
                className="campo__control"
                value={sede}
                onChange={(e) => setSede(e.target.value)}
              >
                <option value="">Todas</option>
                {(sedes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
          )}

          <div className="campo filtros__campo filtros__campo--ancho">
            <label className="campo__etiqueta" htmlFor="proveedor">Proveedor</label>
            <select
              id="proveedor"
              className="campo__control"
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
            >
              <option value="">Todos</option>
              {(proveedores ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>

          <div className="campo filtros__campo">
            <label className="campo__etiqueta" htmlFor="estado">Estado</label>
            <select
              id="estado"
              className="campo__control"
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
            >
              <option value="">Todos</option>
              {/* El valor es el de la BASE y la etiqueta la de pantalla: son
                  distintos a propósito, ver `PASOS_PEDIDO`. */}
              {PASOS_PEDIDO.map((paso) => (
                <option key={paso.estado} value={paso.estado}>{paso.nombre}</option>
              ))}
              <option value="anulado">{ANULADO.nombre}</option>
            </select>
          </div>
        </section>

        {cargando && <BloqueEstado tipo="cargando" titulo="Buscando pedidos…" />}

        {error && (
          <BloqueEstado
            tipo="error"
            titulo="No se pudo cargar el historial"
            detalle={error}
            accion={{ texto: 'Reintentar', alPulsar: recargar }}
          />
        )}

        {/*
          Vacío por el rango o vacío por los filtros son dos cosas distintas, y
          la salida también: en un caso hay que ampliar las fechas y en el otro
          quitar un filtro. Decirlo ahorra probar a ciegas.
        */}
        {!cargando && !error && pedidos.length === 0 && (
          <BloqueEstado
            tipo="vacio"
            titulo="No hay pedidos en este periodo"
            detalle={hayFiltros
              ? 'Prueba a quitar algún filtro o a ampliar el rango de fechas.'
              : 'Amplía el rango de fechas para ver pedidos anteriores.'}
          />
        )}

        {pedidos.length > 0 && (
          <div className="tabla-envoltorio bloque-tabla">
            <table className="tabla tabla--admin">
              <caption className="tabla__caption">
                {total} {total === 1 ? 'pedido' : 'pedidos'} entre el{' '}
                {formatearFechaCorta(desde)} y el {formatearFechaCorta(hasta)}
                {/* Si el servidor topó el límite, decirlo: una lista cortada
                    en silencio se lee como «no hay más». */}
                {total > pedidos.length && ` · se muestran los ${pedidos.length} más recientes`}
              </caption>

              <thead>
                <tr>
                  <th scope="col">N.º</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Proveedor</th>
                  {todasLasSedes && <th scope="col">Cafetería</th>}
                  <th scope="col">Productos</th>
                  <th scope="col">Estado</th>
                  <th className="tabla__acciones" scope="col">
                    <span className="visualmente-oculto">Acciones</span>
                  </th>
                </tr>
              </thead>

              <tbody>
                {pedidos.map((pedido) => (
                  <Fila key={pedido.id} pedido={pedido} conSede={todasLasSedes} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <Pie />
    </>
  );
}

function Fila({ pedido, conSede }: { pedido: FichaPedido; conSede: boolean }) {
  const anulado = pedido.estado === 'anulado';
  const sinEnviar = pedido.estado === 'creado';

  return (
    <tr className={anulado ? 'tabla__fila--apagada' : undefined}>
      <td className="tabla__numero">{pedido.id}</td>
      <td className="tabla__fecha">{formatearFechaCorta(pedido.fechaElaboracion)}</td>
      {/*
        Solo el nombre. Debajo iba «Almacén» o «Proveedor», sacado del tipo de
        documento, y desde que todos los pedidos se imprimen en FBE.04 esa
        línea diría «Almacén» en las 362 filas: una columna que repite la
        misma palabra no reparte nada y ocupa el sitio del nombre.
      */}
      <td className="tabla__nombre">{pedido.proveedorNombre}</td>
      {conSede && <td className="tabla__menu">{pedido.cafeteriaNombre}</td>}
      <td className="tabla__numero">{pedido.renglones}</td>
      <td>
        {/*
          Se reutilizan las marcas de estado de las reservas. Los nombres
          dicen «activa» y «cancelada» y aquí son «registrado» y «anulado»,
          pero son el mismo par —lo vigente y lo deshecho— y darles clases
          nuevas habría dejado dos sistemas de color diciendo lo mismo.
        */}
        <span className={`marca-estado marca-estado--${anulado ? 'cancelada' : 'activa'}`}>
          {nombreDeEstado(pedido.estado)}
        </span>
      </td>
      <td className="tabla__acciones">
        {/* Un pedido sin enviar no se va a mirar: se va a terminar. El botón lo
            dice: la lista es donde alguien reencuentra el pedido que dejó a
            medias y tiene que saber que le falta algo. */}
        <Link
          className={`boton boton--sm ${sinEnviar ? 'boton--primario' : 'boton--secundario'}`}
          to={`/pedidos/documento/${pedido.id}`}
        >
          {sinEnviar ? 'Revisar y enviar' : 'Ver documento'}
        </Link>
      </td>
    </tr>
  );
}
