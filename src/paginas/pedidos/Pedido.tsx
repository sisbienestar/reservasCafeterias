/**
 * El formulario de pedido de UN proveedor.
 *
 * Sustituye a una plantilla de Excel con macros, y de ella hereda la forma:
 * la hoja entera del catálogo delante, y se rellenan las casillas de lo que
 * hace falta. No hay «añadir producto», porque en la plantilla tampoco lo
 * había — se recorre la lista con el dedo, en el orden de siempre.
 *
 * Las columnas cambian según `tipoDocumento`, que lo dice el PROVEEDOR y no
 * esta pantalla. Ver `CONTRATO.md` §3.
 *
 * Tampoco hay «limpiar»: cada pedido nuevo parte de un formulario en blanco,
 * así que la macro que borraba las cantidades para reutilizar la plantilla ya
 * no tiene nada que hacer.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getProveedor, porCategoria } from '../../servicios/proveedoresServicio.js';
import { getCafeterias } from '../../servicios/cafeteriasServicio.js';
import {
  crearPedido, actualizarPedido, getPedido, type LineaNueva,
} from '../../servicios/pedidosServicio.js';
import { usePeticion } from '../../utiles/usePeticion.js';
import { BloqueEstado } from '../../componentes/BloqueEstado.js';
import { BarraSesion } from '../../componentes/BarraSesion.js';
import { Pie } from '../../componentes/Pie.js';
import { useHoy, useSesion } from '../../contexto/Sesion.js';
import { formatearFechaLarga } from '../../utiles/fechas.js';

/** Lo tecleado en un renglón. Cadenas, no números: es lo que hay en el input. */
interface Casillas {
  solicitada: string;
  devuelta: string;
  adicional: string;
}

const VACIO: Casillas = { solicitada: '', devuelta: '', adicional: '' };

/**
 * Una casilla vacía es `null`, no cero.
 *
 * Es la misma distinción que hace el servidor: en las columnas del almacén,
 * un cero escrito dice «se comprobó y no hubo devolución» y una casilla en
 * blanco dice «todavía no se ha mirado».
 */
function aNumero(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (!limpio) return null;
  const numero = Number(limpio);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

export function Pedido() {
  /*
   * Dos rutas entran aquí: `/pedidos/:proveedorId` para elaborar uno nuevo y
   * `/pedidos/editar/:pedidoId` para corregir un borrador. Es el mismo
   * formulario porque es el mismo gesto —rellenar la hoja del catálogo—, y
   * duplicarlo habría dejado dos pantallas que se van separando sin que nadie
   * se dé cuenta.
   */
  const { proveedorId = '', pedidoId } = useParams();
  const editando = Boolean(pedidoId);
  const navegar = useNavigate();
  const hoy = useHoy();
  const { contexto, salir } = useSesion();
  const perfil = contexto?.perfil ?? null;

  // Editando, el proveedor NO viene en la dirección: lo dice el pedido. Por
  // eso son dos consultas encadenadas y no una.
  const consultarPedido = useCallback(
    () => (pedidoId ? getPedido(Number(pedidoId)) : Promise.resolve(null)),
    [pedidoId],
  );
  const { datos: original, error: errorPedido } = usePeticion(consultarPedido, [pedidoId]);

  const idProveedor = original?.proveedorId ?? proveedorId;

  const consultar = useCallback(
    () => (idProveedor ? getProveedor(idProveedor) : Promise.resolve(null)),
    [idProveedor],
  );
  const { datos: proveedor, cargando, error, recargar } = usePeticion(consultar, [idProveedor]);

  const esAlmacen = proveedor?.tipoDocumento === 'FBE.04';
  const esAdmin = perfil?.rol === 'admin';

  /*
   * Las sedes, SOLO para administración.
   *
   * El mostrador no las necesita: su cuenta atiende una y el servidor se la
   * impone, así que pedirlas sería un viaje para dibujar un desplegable de
   * una sola opción que además no puede cambiar. Administración sí elige, y
   * por eso para ella la lista es necesaria.
   *
   * `getCafeterias()` sin argumentos trae únicamente las ACTIVAS, que es
   * exactamente la regla: a una sede cerrada no se le hacen pedidos.
   */
  const consultarSedes = useCallback(
    () => (esAdmin ? getCafeterias() : Promise.resolve([])),
    [esAdmin],
  );
  const { datos: sedes } = usePeticion(consultarSedes, [esAdmin]);

  /*
   * Un solo objeto para las 221 casillas posibles, y solo entran las que se
   * tocan. Un estado por producto habría hecho que la pantalla tuviera que
   * saber cuántos productos hay antes de poder existir.
   */
  const [casillas, setCasillas] = useState<Record<number, Casillas>>({});
  /** La sede que elige administración. En el mostrador no se usa: manda la suya. */
  const [sedeElegida, setSedeElegida] = useState('');
  const [lugarEntrega, setLugarEntrega] = useState('');
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [horaEntrega, setHoraEntrega] = useState('');

  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null);

  /*
   * Al abrir un borrador, sus cantidades vuelven a las casillas.
   *
   * Depende de `original` y no de `pedidoId` a propósito: se ejecuta cuando
   * llegan los datos, no cuando cambia la dirección. Con la segunda, la
   * pantalla se pintaría vacía un instante y luego daría un salto al
   * rellenarse.
   */
  useEffect(() => {
    if (!original) return;

    setCasillas(Object.fromEntries(original.lineas.map((linea) => [
      linea.productoId,
      {
        solicitada: String(linea.cantidadSolicitada),
        devuelta: linea.cantidadDevuelta === null ? '' : String(linea.cantidadDevuelta),
        adicional: linea.cantidadAdicional === null ? '' : String(linea.cantidadAdicional),
      },
    ])));

    setLugarEntrega(original.lugarEntrega);
    setFechaEntrega(original.fechaEntrega ?? '');
    setHoraEntrega(original.horaEntrega ?? '');
    setSedeElegida(original.cafeteriaId);
  }, [original]);

  const escribir = useCallback((productoId: number, campo: keyof Casillas, valor: string) => {
    setCasillas((antes) => ({
      ...antes,
      [productoId]: { ...(antes[productoId] ?? VACIO), [campo]: valor },
    }));
  }, []);

  const secciones = useMemo(
    () => (proveedor ? porCategoria(proveedor.productos) : []),
    [proveedor],
  );

  /** Los renglones que de verdad van al pedido: los que tienen cantidad. */
  const lineas = useMemo<LineaNueva[]>(() => {
    const salida: LineaNueva[] = [];
    for (const [id, valores] of Object.entries(casillas)) {
      const solicitada = aNumero(valores.solicitada);
      if (solicitada === null || solicitada === 0) continue;
      salida.push({
        productoId: Number(id),
        cantidadSolicitada: solicitada,
        cantidadDevuelta: esAlmacen ? aNumero(valores.devuelta) : null,
        cantidadAdicional: esAlmacen ? aNumero(valores.adicional) : null,
      });
    }
    return salida;
  }, [casillas, esAlmacen]);

  /**
   * De qué sede es el pedido.
   *
   * El mostrador no decide: manda la suya y el servidor se la impone de todas
   * formas —`sedePermitida`—, así que aquí solo se manda para que el pedido
   * salga completo. Administración sí elige, y hasta que elija no hay sede.
   */
  const sedeDelPedido = esAdmin ? sedeElegida : (perfil?.cafeteriaId ?? '');

  /** El nombre de esa sede, cuando se conoce. Solo administración carga la lista. */
  const nombreDeSede = (sedes ?? []).find((s) => s.id === sedeDelPedido)?.nombre;

  const guardar = useCallback(async () => {
    if (!proveedor || !perfil) return;

    if (!sedeDelPedido) {
      setAviso({
        tipo: 'error',
        mensaje: esAdmin
          ? 'Elige para qué cafetería es el pedido.'
          : 'Tu cuenta no tiene una sede asignada, y un pedido siempre es de una sede.',
      });
      return;
    }

    setGuardando(true);
    setAviso(null);
    try {
      /*
       * Editando no se manda ni el proveedor ni la sede: no son editables, y
       * `pedidos.actualizar` ni siquiera los acepta. Cambiar el proveedor
       * invalidaría todos los renglones de golpe, y eso no es corregir un
       * pedido, es hacer otro.
       */
      const pedido = original
        ? await actualizarPedido(original.id, {
          fechaEntrega: esAlmacen ? null : (fechaEntrega || null),
          horaEntrega: esAlmacen ? null : (horaEntrega || null),
          lugarEntrega,
          lineas,
        })
        : await crearPedido({
          proveedorId: proveedor.id,
          cafeteriaId: sedeDelPedido,
          fechaElaboracion: hoy,
          fechaEntrega: esAlmacen ? null : (fechaEntrega || null),
          horaEntrega: esAlmacen ? null : (horaEntrega || null),
          lugarEntrega,
          lineas,
        });
      /*
       * Directo al documento. `replace` para que el botón de atrás lleve al
       * catálogo y no a este formulario con las cantidades todavía escritas:
       * volver ahí invitaría a pulsar «Guardar» otra vez y a duplicar el
       * pedido que se acaba de hacer.
       */
      navegar(`/pedidos/documento/${pedido.id}`, { replace: true });
    } catch (fallo) {
      setAviso({ tipo: 'error', mensaje: (fallo as Error).message });
      setGuardando(false);
    }
  }, [proveedor, perfil, original, esAdmin, sedeDelPedido, hoy, esAlmacen,
      fechaEntrega, horaEntrega, lugarEntrega, lineas, navegar]);

  return (
    <>
      <main className="contenedor pagina">
        {perfil && (
          <BarraSesion
            perfil={perfil}
            alSalir={salir}
            // La sede DEL PEDIDO, que en administración es la elegida y cambia
            // con el desplegable. Sin elegir no se pone nada: mejor un hueco
            // que un nombre que no es el que se va a guardar.
            sede={nombreDeSede}
            volver={{ a: '/pedidos', texto: '← Todos los proveedores' }}
          />
        )}

        {cargando && <BloqueEstado tipo="cargando" titulo="Cargando el catálogo…" />}

        {(error || errorPedido) && (
          <BloqueEstado
            tipo="error"
            titulo={errorPedido ? 'No se pudo cargar el pedido' : 'No se pudo cargar el proveedor'}
            detalle={errorPedido ?? error ?? ''}
            accion={{ texto: 'Reintentar', alPulsar: recargar }}
          />
        )}

        {proveedor && (
          <>
            <section className="encabezado-reserva">
              <div>
                <p className="encabezado-reserva__ubicacion">
                  {editando && original
                    ? `Corrigiendo el borrador n.º ${original.id}`
                    : `${esAlmacen ? 'Almacén interno' : 'Proveedor externo'} · Código ${proveedor.tipoDocumento}`}
                </p>
                <h1 className="encabezado-reserva__titulo">{proveedor.nombre}</h1>
                <p className="encabezado-reserva__meta">
                  {formatearFechaLarga(hoy)}
                  {proveedor.categoriaFija && (
                    <>
                      <span className="separador" aria-hidden="true">·</span>
                      {proveedor.categoriaFija}
                    </>
                  )}
                </p>
              </div>

              <button
                  type="button"
                  className="boton boton--primario"
                  onClick={guardar}
                  disabled={guardando || lineas.length === 0 || !sedeDelPedido}
                  aria-busy={guardando}
                >
                  {guardando
                    ? 'Guardando…'
                    : `${editando ? 'Guardar cambios' : 'Guardar pedido'}${lineas.length ? ` (${lineas.length})` : ''}`}
              </button>
            </section>

            {aviso && (
              <p className={`aviso aviso--${aviso.tipo}`} role="status">{aviso.mensaje}</p>
            )}

            {/*
              El encabezado del documento. Solo el FBE.34 pide cuándo se
              entrega: la plantilla del almacén no tiene esas casillas, y el
              servidor descarta esos campos si llegan.
            */}
            <section className="filtros" aria-label="Datos del pedido">
              {/*
                Solo administración elige sede, y va la PRIMERA: es lo que
                decide de quién es el pedido, y contestarlo después de teclear
                cuarenta cantidades sería descubrir al final que faltaba algo.

                El mostrador no ve este desplegable porque no tiene nada que
                elegir: su cuenta atiende una sede y el servidor se la impone
                aunque la pantalla mandara otra.
              */}
              {esAdmin && !editando && (
                <div className="campo filtros__campo filtros__campo--ancho">
                  <label className="campo__etiqueta" htmlFor="sede-pedido">Cafetería que pide</label>
                  <select
                    id="sede-pedido"
                    className="campo__control"
                    value={sedeElegida}
                    disabled={guardando}
                    aria-invalid={!sedeElegida}
                    onChange={(e) => setSedeElegida(e.target.value)}
                  >
                    <option value="">Elige una cafetería…</option>
                    {(sedes ?? []).map((sede) => (
                      <option key={sede.id} value={sede.id}>{sede.nombre}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="campo filtros__campo filtros__campo--ancho">
                <label className="campo__etiqueta" htmlFor="lugar-entrega">Lugar de entrega</label>
                <input
                  id="lugar-entrega"
                  className="campo__control"
                  type="text"
                  value={lugarEntrega}
                  disabled={guardando}
                  // Vacío el servidor pone el nombre de la sede, así que el
                  // marcador dice exactamente lo que va a pasar si no se toca.
                  placeholder={nombreDeSede ?? 'La cafetería del pedido'}
                  onChange={(e) => setLugarEntrega(e.target.value)}
                />
              </div>

              {!esAlmacen && (
                <>
                  <div className="campo filtros__campo">
                    <label className="campo__etiqueta" htmlFor="fecha-entrega">Fecha de entrega</label>
                    <input
                      id="fecha-entrega"
                      className="campo__control"
                      type="date"
                      value={fechaEntrega}
                      disabled={guardando}
                      onChange={(e) => setFechaEntrega(e.target.value)}
                    />
                  </div>

                  <div className="campo filtros__campo">
                    <label className="campo__etiqueta" htmlFor="hora-entrega">Hora de entrega</label>
                    <input
                      id="hora-entrega"
                      className="campo__control"
                      type="time"
                      value={horaEntrega}
                      disabled={guardando}
                      onChange={(e) => setHoraEntrega(e.target.value)}
                    />
                  </div>
                </>
              )}
            </section>

            <div className="tabla-envoltorio bloque-tabla">
              <table className="tabla tabla--pedido">
                <caption className="tabla__caption">
                  {proveedor.productos.length} productos en el catálogo.
                  Deja en blanco lo que no pidas.
                </caption>

                <thead>
                  <tr>
                    <th scope="col" className="tabla__numero">N.º</th>
                    {esAlmacen && <th scope="col">Código</th>}
                    <th scope="col">{esAlmacen ? 'Nombre del producto' : 'Descripción del producto'}</th>
                    <th scope="col">Unidad</th>
                    <th scope="col">{esAlmacen ? 'Cant. solicitada' : 'Cant. pedida'}</th>
                    {esAlmacen && <th scope="col">Cant. devuelta</th>}
                    {esAlmacen && <th scope="col">Cant. adicional</th>}
                    {esAlmacen && <th scope="col">Total salida</th>}
                  </tr>
                </thead>

                {secciones.map((seccion) => (
                  <tbody key={seccion.categoria || '—'}>
                    {/*
                      El encabezado de sección de la plantilla. Va como una
                      fila de la tabla y no como un título aparte para que no
                      se despegue de sus productos al desplazar de lado.
                    */}
                    {seccion.categoria && (
                      <tr className="tabla__fila--seccion">
                        <th scope="colgroup" colSpan={esAlmacen ? 8 : 4}>{seccion.categoria}</th>
                      </tr>
                    )}

                    {seccion.productos.map((producto) => {
                      const valores = casillas[producto.id] ?? VACIO;
                      const solicitada = aNumero(valores.solicitada) ?? 0;
                      const devuelta = aNumero(valores.devuelta) ?? 0;
                      const adicional = aNumero(valores.adicional) ?? 0;
                      const pedido = solicitada > 0;

                      return (
                        <tr key={producto.id} className={pedido ? 'tabla__fila--nueva' : undefined}>
                          <td className="tabla__numero">{producto.orden}</td>
                          {esAlmacen && <td className="tabla__menu">{producto.codigo || '—'}</td>}
                          <td className="tabla__nombre">{producto.nombre}</td>
                          <td className="tabla__menu">{producto.unidadMedida}</td>

                          <td>
                            <input
                              className="campo__control cantidad"
                              type="number"
                              min="0"
                              step="0.01"
                              inputMode="decimal"
                              value={valores.solicitada}
                              disabled={guardando}
                              aria-label={`Cantidad de ${producto.nombre}`}
                              onChange={(e) => escribir(producto.id, 'solicitada', e.target.value)}
                            />
                          </td>

                          {esAlmacen && (
                            <td>
                              <input
                                className="campo__control cantidad"
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                value={valores.devuelta}
                                disabled={guardando}
                                aria-label={`Cantidad devuelta de ${producto.nombre}`}
                                onChange={(e) => escribir(producto.id, 'devuelta', e.target.value)}
                              />
                            </td>
                          )}

                          {esAlmacen && (
                            <td>
                              <input
                                className="campo__control cantidad"
                                type="number"
                                min="0"
                                step="0.01"
                                inputMode="decimal"
                                value={valores.adicional}
                                disabled={guardando}
                                aria-label={`Cantidad adicional de ${producto.nombre}`}
                                onChange={(e) => escribir(producto.id, 'adicional', e.target.value)}
                              />
                            </td>
                          )}

                          {/*
                            El total NO es un campo: lo calcula la base de
                            datos con una columna generada. Aquí se enseña el
                            mismo cálculo para que se vea al teclear, pero
                            escribible daría dos fuentes para un solo número.
                          */}
                          {esAlmacen && (
                            <td className="tabla__numero">
                              {pedido ? solicitada - devuelta + adicional : '—'}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                ))}
              </table>
            </div>

          </>
        )}
      </main>

      <Pie />
    </>
  );
}
