/**
 * El pedido como documento institucional, listo para imprimir o guardar en PDF.
 *
 * Reproduce la plantilla de Excel que sustituye: el membrete de la UIS a la
 * izquierda, el proceso en el centro, y el código y la versión a la derecha.
 * Lo que cambia entre las dos plantillas —el título, las casillas del
 * encabezado y las columnas de la tabla— lo decide `tipoDocumento`.
 *
 * El PDF lo hace el NAVEGADOR, con `window.print()` y la hoja de impresión de
 * `documento.css`. No hay ninguna biblioteca de PDF ni ninguna función de
 * servidor: el que ya está en cada equipo del mostrador sabe hacerlo, guarda
 * en PDF desde el mismo diálogo, y no añade un megabyte de JavaScript ni un
 * tiempo de arranque a una función de Vercel.
 */

import { useCallback, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getPedido, enviarPedido, confirmarPedido,
  PASOS_PEDIDO, ANULADO, nombreDeEstado,
  type Pedido as PedidoGuardado, type EventoPedido,
} from '../../servicios/pedidosServicio.js';
import type { TipoDocumento } from '../../servicios/proveedoresServicio.js';
import { usePeticion } from '../../utiles/usePeticion.js';
import { BloqueEstado } from '../../componentes/BloqueEstado.js';
import { BarraVolver } from '../../componentes/BarraVolver.js';
import {
  ModalConfirmacion, type PeticionConfirmacion,
} from '../../componentes/ModalConfirmacion.js';
import { useSesion } from '../../contexto/Sesion.js';
import { puede } from '../../servicios/capacidades.js';
import { formatearFechaLarga } from '../../utiles/fechas.js';

/**
 * Lo que va impreso en el membrete.
 *
 * El proceso y el subproceso son los mismos en las dos plantillas; lo que
 * cambia es el título y el código. Los cuatro están comprobados contra las
 * capturas de las dos hojas: la versión es 04 en ambas.
 */
const PROCESO = 'PROCESO BIENESTAR ESTUDIANTIL';
const SUBPROCESO = 'SUBPROCESO ATENCIÓN SOCIOECONÓMICA';

const FORMATOS: Record<TipoDocumento, { titulo: string; version: string }> = {
  'FBE.04': {
    titulo: 'CONTROL DE PEDIDO Y SALIDAS DE ALMACÉN (BODEGAS)',
    version: '04',
  },
  'FBE.34': {
    titulo: 'PEDIDO DIARIO ADICIONAL DE INSUMOS Y PRODUCTOS',
    version: '04',
  },
};

/** Las tres casillas marcables del encabezado FBE.04, en el orden de la hoja. */
const CATEGORIAS = ['Alimentos y bebidas', 'Aseo y productos químicos', 'Desechables'];

/**
 * La nota en cursiva bajo «Unidad de Servicio que solicita».
 *
 * Va literal de la plantilla. No es un dato: es texto impreso que explica qué
 * cabe en esa casilla, y quitarlo cambiaría el formato.
 */
const SERVICIOS =
  'Hace referencia a los servicios: Comedores Desayuno, Comedores Almuerzo, ' +
  'Comedores Cena, Combo Saludable Almuerzo, Cafetería Humanitas, Cafetería ' +
  'Akademia, Cafetería Bien estar Bien, Cafetería Campestre, La Cafetería ' +
  'Bienestar Almuerzos, Bandejas, Desayuno, Mostrador, Servicios Especiales, etc.';

/** Sin decimales cuando no los hay: «3», no «3.00». En una hoja de pedido cansa. */
const cantidad = (valor: number | null): string =>
  valor === null ? '' : String(Number(valor));

/** «2026-08-28» → ['28', '08', '2026'], para la casilla de día, mes y año. */
function partesDeFecha(fechaISO: string): [string, string, string] {
  const [anio = '', mes = '', dia = ''] = fechaISO.split('-');
  return [dia, mes, anio];
}

/**
 * Cada asiento del historial, en una frase.
 *
 * En pasado y en tercera persona, como se lee un registro. Las palabras son
 * las mismas que las de la base desde que se unificaron: ver .
 *
 * «Editado» se dice distinto según desde dónde: corregir un pedido recién
 * creado es rutina y tocar uno ya enviado no lo es, y el historial existe
 * justamente para que esa diferencia se note.
 */
function frase(evento: EventoPedido): string {
  switch (evento.accion) {
    case 'creado':
      return 'Se elaboró el pedido';
    case 'enviado':
      return 'Se envió a administración';
    case 'confirmado':
      return 'Se confirmó: el pedido quedó cerrado';
    case 'anulado':
      return 'Se anuló';
    case 'editado':
      return evento.detalle.estado === 'creado'
        ? 'Se corrigió antes de enviarlo'
        : `Se modificaron las cantidades (estaba ${nombreDeEstado(evento.detalle.estado ?? '')})`;
    default:
      return evento.accion;
  }
}

/**
 * Dónde está el pedido, con los tres pasos delante.
 *
 * Sustituye a tres cajas de aviso que decían lo mismo en cuatro líneas cada
 * una. Una caja es para lo que INTERRUMPE —un error, algo que hay que leer
 * antes de seguir—; el estado no interrumpe nada, se consulta de un vistazo,
 * y en caja acababa empujando el documento fuera de la pantalla en cada visita.
 *
 * Los iconos no son decoración: marcan qué pasos ya se dieron, así que dicen a
 * la vez dónde está y cuánto queda. Y el texto va igualmente — el verde es un
 * refuerzo, no el dato: quien no distinga los tonos lee «Enviado» y su
 * instrucción exactamente igual.
 *
 * Los nombres visibles salen de `PASOS_PEDIDO`, que desde la unificación son
 * los mismos que guarda la base.
 */

/** El visto de un paso ya dado. Un solo trazo, para que se lea a 16 px. */
const Visto = () => (
  <svg className="pasos-pedido__icono" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="7" />
    <path d="M4.8,8.3 L7,10.5 L11.2,5.8" fill="none" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Lo que todavía no ha pasado: el mismo círculo, hueco y gris. */
const Pendiente = () => (
  <svg className="pasos-pedido__icono" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="7" fill="none" strokeWidth="1.5" />
  </svg>
);

function LineaEstado({ estado, acciones }: { estado: string; acciones?: ReactNode }) {
  if (estado === 'anulado') {
    /*
     * Un anulado no está en ningún paso: se salió del camino. Enseñar los tres
     * con alguno en verde diría que sigue avanzando, que es justo lo contrario.
     */
    return (
      <p className="pasos-pedido pasos-pedido--anulado no-imprimir">
        <svg className="pasos-pedido__icono" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="none" strokeWidth="1.5" />
          <path d="M5.2,5.2 L10.8,10.8 M10.8,5.2 L5.2,10.8"
                strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <strong className="pasos-pedido__nombre">{ANULADO.nombre}</strong>
        <span className="pasos-pedido__que">{ANULADO.queSigue}</span>
      </p>
    );
  }

  const actual = PASOS_PEDIDO.findIndex((p) => p.estado === estado);

  return (
    <div className="pasos-pedido no-imprimir">
      {/*
        Los pasos a la izquierda y los botones a la derecha, en la MISMA fila.
        Estaban arriba, junto al título, y ahí competían con él por el ancho:
        con un proveedor de nombre largo se caían a una fila propia. Aquí van
        justo al lado de lo que dicen que falta —«Valida y confirma el pedido»
        y el botón «Confirmar pedido»— que es donde se buscan.
      */}
      <div className="pasos-pedido__fila">
        {/*
          Los pasos y su instrucción van JUNTOS en una columna, y los botones
          al lado. La instrucción estaba fuera de la fila y por eso los botones
          se alineaban solo con los pasos, quedando la explicación descolgada
          debajo. Como una sola caja, los botones se centran contra las dos
          líneas.
        */}
        <div className="pasos-pedido__estado">
          {/*
            Los TRES pasos, siempre. Enseñar solo el actual obligaba a recordar
            cuántos quedaban; con los tres delante, dónde está el pedido se ve
            sin saberse el proceso de memoria.

            Es una lista ordenada porque eso es: una secuencia. Quien la oiga
            con un lector de pantalla necesita ese orden tanto como quien la ve.
          */}
          <ol className="pasos-pedido__lista">
            {PASOS_PEDIDO.map((paso, i) => {
              const dado = i <= actual;
              return (
                <li
                  key={paso.estado}
                  className={`pasos-pedido__paso${dado ? ' pasos-pedido__paso--dado' : ''}`
                    + (i === actual ? ' pasos-pedido__paso--aqui' : '')}
                  aria-current={i === actual ? 'step' : undefined}
                >
                  {dado ? <Visto /> : <Pendiente />}
                  <span className="pasos-pedido__nombre">{paso.nombre}</span>
                </li>
              );
            })}
          </ol>

          {/*
            Solo la del paso actual. Las tres a la vez serían tres
            instrucciones compitiendo, y dos de ellas para un momento que ya
            pasó o que todavía no toca.
          */}
          <p className="pasos-pedido__que">{PASOS_PEDIDO[actual]?.queSigue ?? ''}</p>
        </div>

        {acciones}
      </div>
    </div>
  );
}

/** El rol con el que se hizo, dicho con palabras. */
const ROLES: Record<string, string> = {
  mostrador: 'mostrador',
  auxiliar: 'auxiliar administrativo',
  admin: 'administración',
};

/**
 * El historial de modificaciones del pedido.
 *
 * Va con `.no-imprimir`: en el papel de un FBE.04 no cabe ni pinta nada — la
 * hoja es el pedido, no su biografía. Aquí abajo sí, porque es donde alguien
 * pregunta «¿y esto quién lo cambió?».
 *
 * REUTILIZA las clases `.historial*` de `componentes.css`, que ya existían
 * para el historial de una reserva. Son el mismo objeto —qué le ha pasado a
 * esto, del último cambio al primero— y por eso no se inventan clases nuevas:
 * dos sistemas paralelos para la misma idea es exactamente lo que hubo que
 * deshacer en `react.css` (regla 5 de CLAUDE.md). De ahí viene también que la
 * antigüedad se marque con el borde izquierdo y no con un punto de color.
 *
 * Los asientos sin autor son los que se reconstruyeron al cargar el histórico
 * de los Excel: se sabe CUÁNDO pasó porque la fecha estaba guardada, y no se
 * sabe quién. Se dice así en vez de dejar el hueco en blanco, que se leería
 * como un fallo de la pantalla.
 */
function Historia({ eventos }: { eventos: EventoPedido[] }) {
  if (eventos.length === 0) return null;

  return (
    <section className="historial no-imprimir">
      <h2 className="historial__titulo">Historial del pedido</h2>
      <ol className="historial__lista">
        {eventos.map((evento, i) => (
          <li key={`${evento.ocurridoEn}-${i}`} className="historial__asiento">
            <p className="historial__marca">
              {formatearFechaLarga(evento.ocurridoEn.slice(0, 10))}
              {' · '}
              {new Date(evento.ocurridoEn).toLocaleTimeString('es-CO', {
                hour: '2-digit', minute: '2-digit',
              })}
              {evento.autorNombre
                ? ` · ${evento.autorNombre}${evento.autorRol
                  ? ` (${ROLES[evento.autorRol] ?? evento.autorRol})` : ''}`
                : ' · sin registro de quién: viene del histórico importado'}
            </p>
            <p className="historial__cambio">{frase(evento)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Documento() {
  const { pedidoId = '' } = useParams();
  const { contexto, salir } = useSesion();
  const perfil = contexto?.perfil ?? null;

  const consultar = useCallback(() => getPedido(Number(pedidoId)), [pedidoId]);
  const { datos: pedido, cargando, error, recargar } = usePeticion(consultar, [pedidoId]);

  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null);

  const esCreado = pedido?.estado === 'creado';
  const rol = perfil?.rol ?? 'mostrador';

  /*
   * Las mismas dos reglas que el servidor, repetidas aquí para no ofrecer un
   * botón que va a dar error. La que manda es la de `api/`, y la de más al
   * fondo la de `puede_editar_pedido` en SQL: esto es aviso, no permiso.
   */
  const puedeEditar = pedido
    ? (pedido.estado === 'creado'
      || (pedido.estado === 'enviado' && puede(rol, 'modificarEnviados'))
      || (pedido.estado === 'confirmado' && puede(rol, 'anularEnviados')))
    : false;

  // Confirmar solo existe sobre un enviado, y solo para quien tiene el encargo
  // de hablar con el proveedor.
  const puedeConfirmar = pedido?.estado === 'enviado' && puede(rol, 'confirmarPedidos');

  /**
   * Enviar recarga el pedido en vez de retocar el estado en local.
   *
   * Lo que devuelve el servidor es la verdad —incluida la hora de envío, que
   * la pone la base— y `recargar` deja la pantalla contando exactamente lo que
   * hay guardado. Adivinarlo aquí abriría la puerta a que la pantalla dijera
   * «enviado» sobre algo que no llegó a guardarse.
   */
  const enviar = useCallback(async () => {
    if (!pedido) return;
    setTrabajando(true);
    setAviso(null);
    try {
      await enviarPedido(pedido.id);
      recargar();
      setAviso({
        tipo: 'exito',
        mensaje: 'Pedido enviado. Se avisó a administración para imprimirlo y firmarlo.',
      });
    } catch (fallo) {
      setAviso({ tipo: 'error', mensaje: (fallo as Error).message });
    } finally {
      setTrabajando(false);
    }
  }, [pedido, recargar]);

  /**
   * Confirmar. Mismo patrón que enviar: recargar, no adivinar.
   *
   * Pasa por el modal de confirmación y no por `window.confirm`, por lo mismo
   * que la cancelación de una reserva: el texto del navegador no se puede
   * redactar y el cuadro sale donde el navegador quiere, a veces lejos de
   * donde estaba mirando quien lo pidió.
   */
  const confirmar = useCallback(async () => {
    if (!pedido) return;
    setTrabajando(true);
    setAviso(null);
    try {
      await confirmarPedido(pedido.id);
      recargar();
      setAviso({
        tipo: 'exito',
        mensaje: 'Pedido confirmado. Queda cerrado y ya no se edita.',
      });
    } catch (fallo) {
      setAviso({ tipo: 'error', mensaje: (fallo as Error).message });
    } finally {
      setTrabajando(false);
    }
  }, [pedido, recargar]);

  /** Lo que el modal tiene delante. `null` mientras está cerrado. */
  const [confirmacion, setConfirmacion] = useState<PeticionConfirmacion | null>(null);

  const pedirConfirmacion = useCallback(() => {
    setConfirmacion({
      titulo: 'Confirmar el pedido',
      detalle: 'Queda cerrado con las cantidades que tiene ahora, como lo que '
        + 'el proveedor va a entregar, y a partir de aquí ya no se puede editar.',
      textoConfirmar: 'Sí, confirmarlo',
      // Primario y no peligro: no destruye nada, es el paso normal del día.
      tono: 'primario',
      alConfirmar: () => { void confirmar(); },
    });
  }, [confirmar]);

  return (
    <>
      <main className="contenedor pagina">

        {cargando && <BloqueEstado tipo="cargando" titulo="Cargando el pedido…" />}

        {error && (
          <BloqueEstado
            tipo="error"
            titulo="No se pudo cargar el pedido"
            detalle={error}
            accion={{ texto: 'Reintentar', alPulsar: recargar }}
          />
        )}

        {pedido && (
          <>
            {/*
              Los botones NO van dentro de `.documento`: son de la aplicación,
              no del papel. `.no-imprimir` los quita al imprimir, pero
              tenerlos fuera evita además que hereden sus estilos de tabla.
            */}
            <section className="encabezado-reserva no-imprimir">
              <div className="encabezado-reserva__texto">
                {/* El número comparte renglón con el enlace. Sin el estado:
                    lo dicen los tres pasos de abajo, con lo que falta. */}
                {/* Al HISTORIAL y no a la lista de proveedores: desde un
                    pedido, «volver» es a los demás pedidos. Y es el único
                    destino que sirve para los tres roles — el auxiliar no
                    tiene acceso a la lista de proveedores. */}
                <BarraVolver
                  volver={{ a: '/pedidos/historial', texto: '← Todos los pedidos' }}
                  contexto={`Pedido n.º ${pedido.id}`}
                />
                <div className="encabezado-reserva__linea">
                  <h1 className="encabezado-reserva__titulo">{pedido.proveedorNombre}</h1>
                  <p className="encabezado-reserva__meta">
                    {pedido.cafeteriaNombre}
                    <span className="separador" aria-hidden="true">·</span>
                    {formatearFechaLarga(pedido.fechaElaboracion)}
                  </p>
                </div>
              </div>
            </section>

            {/*
              El estado va fuera del documento y con `.no-imprimir`: en el
              papel no pinta nada, y de hecho un pedido impreso con un cartel de
              «creado» encima sería confuso — el papel es justo lo que se
              usa para revisarlo.
            */}
            <LineaEstado
              estado={pedido.estado}
              acciones={(
                /* `.filtros__acciones` y no `.tabla__acciones`: el segundo es
                   un ayudante de CELDA —`width: 1%` y `white-space: nowrap`— y
                   ese nowrap impedía que los botones se envolvieran, así que en
                   una ventana estrecha se salían de la página. */
                <div className="filtros__acciones">
                  {/*
                    Un pedido recién creado ofrece corregir y enviar; uno
                    enviado, modificar y confirmar. Los botones que no aplican
                    no se enseñan deshabilitados: un botón apagado invita a
                    preguntarse qué falta para encenderlo, y aquí no falta
                    nada — es que ya no toca.
                  */}
                  {puedeEditar && (
                    <Link
                      className="boton boton--secundario"
                      to={`/pedidos/editar/${pedido.id}`}
                    >
                      {esCreado ? 'Editar' : 'Modificar'}
                    </Link>
                  )}

                  {/*
                    Imprimir es la acción principal solo cuando no hay otra: en
                    un pedido creado manda «Enviar» y en uno enviado manda
                    «Confirmar». Dos botones primarios juntos no jerarquizan
                    nada — dejan al ojo eligiendo entre dos verdes iguales.
                  */}
                  <button
                    type="button"
                    className={`boton ${esCreado || puedeConfirmar
                      ? 'boton--secundario' : 'boton--primario'}`}
                    onClick={() => window.print()}
                  >
                    Imprimir o guardar PDF
                  </button>

                  {esCreado && (
                    <button
                      type="button"
                      className="boton boton--primario"
                      onClick={enviar}
                      disabled={trabajando}
                      aria-busy={trabajando}
                    >
                      {trabajando ? 'Enviando…' : 'Enviar a administración'}
                    </button>
                  )}

                  {puedeConfirmar && (
                    <button
                      type="button"
                      className="boton boton--primario"
                      onClick={pedirConfirmacion}
                      disabled={trabajando}
                      aria-busy={trabajando}
                    >
                      {trabajando ? 'Confirmando…' : 'Confirmar pedido'}
                    </button>
                  )}
                </div>
              )}
            />

            {/*
              Esto SÍ sigue siendo una caja, y a propósito: no describe el
              estado, informa del resultado de algo que se acaba de pulsar. Un
              error al confirmar tiene que interrumpir; el estado, no.
            */}
            {aviso && (
              <p className={`aviso aviso--${aviso.tipo} no-imprimir`} role="status">
                {aviso.mensaje}
              </p>
            )}

            <Hoja pedido={pedido} />

            <Historia eventos={pedido.eventos} />
          </>
        )}
      </main>

      <ModalConfirmacion
        peticion={confirmacion}
        alCerrar={() => setConfirmacion(null)}
      />

      {/* Sin `<Pie>`: el pie institucional ya está dentro del documento, y
          repetirlo debajo diría dos veces lo mismo con dos formatos. */}
    </>
  );
}

/**
 * Una casilla de fecha partida en día, mes y año, como en las dos plantillas.
 *
 * `valor` puede venir vacío: en el FBE.34, «Fecha de entrega requerida» es una
 * casilla que a veces se rellena a mano al recibir el pedido, y en la hoja
 * original está en blanco. Entonces salen los tres huecos, no un guion.
 *
 * Los rótulos NO son los mismos en las dos formas, y es deliberado. La
 * apilada del FBE.04 dice «dd», «mm» y «aaaa», literal de su plantilla: esa
 * hoja se firma y tiene que parecerse a la aprobada. La forma en línea es un
 * arreglo nuestro para el FBE.34 —esa casilla no cabía apilada— y ahí sí se
 * dicen los rótulos con palabras, porque la abreviatura pegada al número no
 * se distinguiría del número.
 */
function CasillaFecha({
  titulo,
  valor,
  enLinea = false,
}: {
  titulo: string;
  valor: string | null;
  /**
   * Cada rótulo pegado a su número, en una sola fila. Es la forma del FBE.34,
   * donde la casilla va en la columna estrecha de la derecha y apilarla
   * gastaba tres filas para tres números.
   *
   * El FBE.04 usa la forma apilada, que es la de SU plantilla: allí la
   * casilla está sola a la izquierda y tiene ancho de sobra.
   */
  enLinea?: boolean;
}) {
  const [dia, mes, anio] = valor ? partesDeFecha(valor) : ['', '', ''];

  if (enLinea) {
    return (
      <table className="documento__fecha">
        <thead>
          <tr><th colSpan={6}>{titulo}</th></tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Día</th>
            <td>{dia}</td>
            <th scope="row">Mes</th>
            <td>{mes}</td>
            <th scope="row">Año</th>
            <td>{anio}</td>
          </tr>
        </tbody>
      </table>
    );
  }

  return (
    <table className="documento__fecha">
      <thead>
        <tr><th colSpan={3}>{titulo}</th></tr>
        {/*
          «dd», «mm» y «aaaa», literal de la plantilla FBE.04.

          Estuvieron un tiempo como «Día», «Mes» y «Año», con el argumento de
          que la abreviatura decía el FORMATO en el que había que escribir a
          mano y aquí la fecha ya la pone la aplicación. El argumento era
          bueno y no manda: esta es una hoja institucional con código y
          versión, y lo que se firma tiene que parecerse a la plantilla
          aprobada, no a nuestra mejora.
        */}
        <tr>
          <th scope="col">dd</th>
          <th scope="col">mm</th>
          <th scope="col">aaaa</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>{dia}</td>
          <td>{mes}</td>
          <td>{anio}</td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * El encabezado del FBE.04: la fecha de salida a la izquierda y la casilla de
 * categoría a la derecha, y debajo la unidad de servicio.
 */
function EncabezadoAlmacen({ pedido }: { pedido: PedidoGuardado }) {
  return (
    <>
      <div className="documento__encabezado">
        <CasillaFecha titulo="Fecha de Salida de Almacén" valor={pedido.fechaElaboracion} />

        <table className="documento__categoria">
          <thead>
            <tr><th colSpan={2}>Categoría (Marque con X)</th></tr>
          </thead>
          <tbody>
            {CATEGORIAS.map((categoria) => (
              <tr key={categoria}>
                <td>{categoria}</td>
                <td className="documento__equis">
                  {categoria === pedido.categoriaMarcada ? 'X' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/*
        Dos filas y no un párrafo corrido: el rótulo en su columna y el valor
        en la suya, para que la sede se lea como un dato y no como el final de
        una frase. La nota de los servicios va debajo, a lo ancho de las dos.
      */}
      <table className="documento__solicita">
        <tbody>
          <tr>
            <th scope="row">Unidad de Servicio que solicita</th>
            <td className="documento__unidad">
              {pedido.cafeteriaNombre}
              {pedido.cafeteriaUbicacion ? ' / ' + pedido.cafeteriaUbicacion : ''}
            </td>
          </tr>
          <tr>
            <td className="documento__nota" colSpan={2}>{SERVICIOS}</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

/**
 * El encabezado del FBE.34: proveedor, lugar y hora a la izquierda; las dos
 * fechas —la de la solicitud y la de la entrega— apiladas a la derecha.
 *
 * No lleva casilla de categoría ni unidad de servicio: esta plantilla se le
 * entrega a alguien de fuera, y a un proveedor externo no le dice nada la
 * organización interna de Bienestar.
 */
function EncabezadoProveedor({ pedido }: { pedido: PedidoGuardado }) {
  /*
   * El lugar de entrega lleva la ubicación detrás SOLO si nadie escribió otro
   * sitio. El servidor rellena `lugarEntrega` con el nombre de la sede cuando
   * se deja en blanco; si alguien puso un lugar distinto, añadirle la
   * ubicación de la cafetería diría dos sitios a la vez.
   */
  const esLaSede = pedido.lugarEntrega === pedido.cafeteriaNombre;
  const lugar = pedido.lugarEntrega || pedido.cafeteriaNombre;

  return (
    <div className="documento__encabezado documento__encabezado--unido">
      <div className="documento__columna">
        <table className="documento__dato">
          <tbody>
            <tr>
              <th scope="row">Proveedor:</th>
              <td className="documento__unidad">{pedido.proveedorNombre}</td>
            </tr>
          </tbody>
        </table>

        <table className="documento__dato">
          <tbody>
            <tr>
              <th scope="row">Lugar de entrega:</th>
              <td className="documento__unidad">
                {lugar}
                {esLaSede && pedido.cafeteriaUbicacion ? ' / ' + pedido.cafeteriaUbicacion : ''}
              </td>
            </tr>
          </tbody>
        </table>

        <table className="documento__dato">
          <tbody>
            <tr>
              <th scope="row">Hora de entrega requerida:</th>
              <td>{pedido.horaEntrega ?? ''}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="documento__columna">
        <CasillaFecha
          titulo="Fecha de elaboración de la solicitud"
          valor={pedido.fechaElaboracion}
          enLinea
        />
        <CasillaFecha
          titulo="Fecha de entrega requerida"
          valor={pedido.fechaEntrega}
          enLinea
        />
      </div>
    </div>
  );
}

/**
 * El documento en sí. Todo lo de aquí dentro es lo que sale impreso.
 *
 * La estructura es la de cada plantilla, elemento por elemento. Lo único que
 * NO se reproduce son sus renglones en blanco —del 22 al 25 en Aseo, del 12 al
 * 32 en Vicky—: en papel eran el hueco para escribir a mano lo que faltara, y
 * aquí lo que falte se añade al pedido y se vuelve a imprimir.
 */
function Hoja({ pedido }: { pedido: PedidoGuardado }) {
  const esAlmacen = pedido.tipoDocumento === 'FBE.04';
  const formato = FORMATOS[pedido.tipoDocumento];

  /*
   * La columna «Código» solo aparece si algún renglón la tiene.
   *
   * La plantilla de Aseo no la lleva —sus productos no tienen código— y la de
   * Nutresa sí. Decidirlo por el CONTENIDO y no por el tipo de documento hace
   * que cada hoja salga con las columnas que de verdad usa, en vez de con una
   * franja vacía a lo largo de toda la página.
   */
  const hayCodigos = pedido.lineas.some((l) => l.codigo);
  const columnas = (esAlmacen ? 7 : 4) + (hayCodigos ? 1 : 0);

  /*
   * Las líneas ya vienen ordenadas por el `orden` del catálogo, así que
   * agrupar consecutivamente basta: los productos de una categoría llegan
   * seguidos. Ordenar aquí otra vez sería rehacer trabajo que hizo el SQL.
   */
  const secciones: { categoria: string; lineas: typeof pedido.lineas }[] = [];
  for (const linea of pedido.lineas) {
    const ultima = secciones[secciones.length - 1];
    if (ultima && ultima.categoria === linea.categoria) ultima.lineas.push(linea);
    else secciones.push({ categoria: linea.categoria, lineas: [linea] });
  }

  // El número de renglón del papel es correlativo, no el del catálogo: en la
  // hoja impresa solo están los productos que se pidieron, y saltar del 3 al
  // 47 parecería que faltan renglones.
  let numero = 0;

  return (
    <article className="documento">
      {/* ── Membrete: idéntico en las dos plantillas ─────────────────── */}
      <table className="documento__membrete">
        <tbody>
          <tr>
            <td className="documento__logo-celda" rowSpan={2}>
              <img
                className="documento__logo"
                src="/assets/img/logo-uis.webp"
                alt="Universidad Industrial de Santander"
              />
            </td>
            <td className="documento__proceso">
              <p className="documento__institucion">{PROCESO}</p>
              <p className="documento__institucion">{SUBPROCESO}</p>
            </td>
            <td className="documento__codigo-celda">
              <strong>Código:</strong> {pedido.tipoDocumento}
            </td>
          </tr>
          <tr>
            <td className="documento__proceso">
              <p className="documento__titulo">{formato.titulo}</p>
            </td>
            <td className="documento__codigo-celda">
              <strong>Versión:</strong> {formato.version}
            </td>
          </tr>
        </tbody>
      </table>

      {esAlmacen
        ? <EncabezadoAlmacen pedido={pedido} />
        : <EncabezadoProveedor pedido={pedido} />}

      {/*
        Quién lo elaboró, justo encima de lo que se pidió. Va en las dos
        plantillas y sale del pedido, no de la sesión: quien lo imprime dentro
        de un mes puede no ser quien lo hizo, y poner ahí el nombre de quien
        mira sería atribuirle un documento ajeno.

        Línea suelta y no fila con recuadro: es una atribución de una línea, y
        encajonarla le daba el peso de un dato del encabezado sin serlo.
      */}
      <p className="documento__elaborado">
        Pedido elaborado por: <strong>{pedido.elaboradoPor}</strong>
      </p>

      {/* ── Los productos ────────────────────────────────────────────── */}
      <table className="documento__tabla">
        <thead>
          <tr>
            <th className="documento__num" scope="col">No.</th>
            {hayCodigos && <th className="documento__cod" scope="col">Código</th>}
            <th scope="col">{esAlmacen ? 'NOMBRE DEL PRODUCTO' : 'DESCRIPCIÓN DEL PRODUCTO'}</th>
            <th className="documento__und" scope="col">
              {esAlmacen ? 'Unidad de medida' : 'UNID. MEDIDA'}
            </th>
            <th className="documento__cant" scope="col">
              {esAlmacen ? 'Cant. Solicitada' : 'CANT. PEDIDA'}
            </th>
            {esAlmacen && <th className="documento__cant" scope="col">Cant. devuelta</th>}
            {esAlmacen && <th className="documento__cant" scope="col">Cant. adicional</th>}
            {esAlmacen && (
              <th className="documento__cant" scope="col">Cant. Total Salida de almacén</th>
            )}
          </tr>
        </thead>

        {secciones.map((seccion) => (
          <tbody key={seccion.categoria || 'sin-seccion'}>
            {seccion.categoria && (
              <tr className="documento__seccion">
                <th scope="colgroup" colSpan={columnas}>{seccion.categoria}</th>
              </tr>
            )}

            {seccion.lineas.map((linea) => {
              numero += 1;
              return (
                <tr key={linea.productoId}>
                  <td className="documento__num">{numero}</td>
                  {hayCodigos && <td className="documento__cod">{linea.codigo}</td>}
                  <td>{linea.nombre}</td>
                  <td className="documento__und">{linea.unidadMedida}</td>
                  <td className="documento__cant">{cantidad(linea.cantidadSolicitada)}</td>
                  {esAlmacen && (
                    <td className="documento__cant">{cantidad(linea.cantidadDevuelta)}</td>
                  )}
                  {esAlmacen && (
                    <td className="documento__cant">{cantidad(linea.cantidadAdicional)}</td>
                  )}
                  {esAlmacen && (
                    <td className="documento__cant">{cantidad(linea.cantidadTotalSalida)}</td>
                  )}
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>

      {/*
        La plantilla del FBE.34 llevaba aquí «Nota: Se pueden adicionar o
        eliminar las casillas que se consideren necesarias». No se traslada:
        hablaba de las filas en blanco de la hoja de Excel, que aquí no
        existen —solo se imprimen los productos pedidos— así que sería una
        instrucción sobre algo que no está.
      */}

      {/* ── Observaciones ────────────────────────────────────────────── */}
      {/*
        El recuadro sigue siendo alto aunque venga con texto: lo que se
        escribe en la aplicación no agota su uso. Se anota lo que se sabe al
        elaborar el pedido —«el jueves es festivo»— y queda sitio para lo que
        se descubre al recibir, que se sigue escribiendo a mano encima del
        papel.

        `white-space: pre-line` en el CSS, no `<br>`: quien lo teclea puede
        separar dos avisos en dos renglones, y los saltos que puso tienen que
        salir donde los puso.
      */}
      <div className="documento__observaciones">
        Observaciones:
        {pedido.observaciones && (
          <p className="documento__observaciones-texto">{pedido.observaciones}</p>
        )}
      </div>

      {/*
        Las firmas SOLO en el FBE.04: la hoja del FBE.34 termina en
        Observaciones y no tiene espacio de firma, porque quien la recibe es el
        proveedor y la conformidad se da al entregar, no en el papel del pedido.

        `margin-top: auto` es lo que las lleva al pie de la página: dentro de
        la columna flexible de `.documento` se comen todo el espacio que sobra
        cuando el pedido es corto, y quedan detrás de la tabla cuando ocupa más
        de una hoja.
      */}
      {esAlmacen && (
        <table className="documento__firmas">
          <thead>
            <tr>
              <th>Espacio para Nombre y firma DESPACHADOR</th>
              <th>Espacio para Nombre y firma RECEPTOR</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td />
              <td />
            </tr>
          </tbody>
        </table>
      )}
    </article>
  );
}
