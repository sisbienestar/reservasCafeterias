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

import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getPedido, confirmarPedido, type Pedido as PedidoGuardado,
} from '../../servicios/pedidosServicio.js';
import type { TipoDocumento } from '../../servicios/proveedoresServicio.js';
import { usePeticion } from '../../utiles/usePeticion.js';
import { BloqueEstado } from '../../componentes/BloqueEstado.js';
import { BarraSesion } from '../../componentes/BarraSesion.js';
import { useSesion } from '../../contexto/Sesion.js';
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
  'Hace referencia los servicios: Comedores Desayuno, Comedores Almuerzo, ' +
  'Comedores Cena, Combo Saludable Almuerzo, Cafetería Humanitas, Cafetería ' +
  'Alakonia, Cafetería Bienestar Bien, Cafetería Campestre, La Cafetería ' +
  'Bienestar Almuerzos, Bandeja, Desayuno, Mostrador, Servicios Especiales, etc.';

/** Sin decimales cuando no los hay: «3», no «3.00». En una hoja de pedido cansa. */
const cantidad = (valor: number | null): string =>
  valor === null ? '' : String(Number(valor));

/** «2026-08-28» → ['28', '08', '2026'], para la casilla de día, mes y año. */
function partesDeFecha(fechaISO: string): [string, string, string] {
  const [anio = '', mes = '', dia = ''] = fechaISO.split('-');
  return [dia, mes, anio];
}

/** Lo que dice cada estado en pantalla. */
const ESTADOS: Record<string, string> = {
  borrador: 'Borrador',
  confirmado: 'Confirmado',
  anulado: 'Anulado',
};

export function Documento() {
  const { pedidoId = '' } = useParams();
  const { contexto, salir } = useSesion();
  const perfil = contexto?.perfil ?? null;

  const consultar = useCallback(() => getPedido(Number(pedidoId)), [pedidoId]);
  const { datos: pedido, cargando, error, recargar } = usePeticion(consultar, [pedidoId]);

  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null);

  const esBorrador = pedido?.estado === 'borrador';

  /**
   * Confirmar recarga el pedido en vez de retocar el estado en local.
   *
   * Lo que devuelve el servidor es la verdad —incluida la hora de
   * confirmación, que la pone la base— y `recargar` deja la pantalla contando
   * exactamente lo que hay guardado. Adivinarlo aquí abriría la puerta a que
   * la pantalla dijera «confirmado» sobre algo que no llegó a guardarse.
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
        mensaje: 'Pedido confirmado. Se avisó a administración para imprimirlo y firmarlo.',
      });
    } catch (fallo) {
      setAviso({ tipo: 'error', mensaje: (fallo as Error).message });
    } finally {
      setTrabajando(false);
    }
  }, [pedido, recargar]);

  return (
    <>
      <main className="contenedor pagina">
        {perfil && (
          <BarraSesion
            perfil={perfil}
            alSalir={salir}
            sede={pedido?.cafeteriaNombre}
            volver={{ a: '/pedidos', texto: '← Todos los proveedores' }}
          />
        )}

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
              <div>
                <p className="encabezado-reserva__ubicacion">
                  Pedido n.º {pedido.id}
                  <span className="separador" aria-hidden="true">·</span>
                  {ESTADOS[pedido.estado] ?? pedido.estado}
                </p>
                <h1 className="encabezado-reserva__titulo">{pedido.proveedorNombre}</h1>
                <p className="encabezado-reserva__meta">
                  {pedido.cafeteriaNombre}
                  <span className="separador" aria-hidden="true">·</span>
                  {formatearFechaLarga(pedido.fechaElaboracion)}
                </p>
              </div>

              {/* `.filtros__acciones` y no `.tabla__acciones`: el segundo es
                  un ayudante de CELDA —`width: 1%` y `white-space: nowrap`— y
                  ese nowrap impedía que los botones se envolvieran, así que en
                  una ventana estrecha se salían de la página. */}
              <div className="filtros__acciones">
                {/*
                  Un borrador ofrece corregir y confirmar; uno confirmado, solo
                  imprimir. Los botones que no aplican no se enseñan
                  deshabilitados: un botón apagado invita a preguntarse qué
                  falta para encenderlo, y aquí no falta nada — es que ya no
                  toca.
                */}
                {esBorrador && (
                  <Link
                    className="boton boton--secundario"
                    to={`/pedidos/editar/${pedido.id}`}
                  >
                    Editar
                  </Link>
                )}

                <button
                  type="button"
                  className={`boton ${esBorrador ? 'boton--secundario' : 'boton--primario'}`}
                  onClick={() => window.print()}
                >
                  Imprimir o guardar PDF
                </button>

                {esBorrador && (
                  <button
                    type="button"
                    className="boton boton--primario"
                    onClick={confirmar}
                    disabled={trabajando}
                    aria-busy={trabajando}
                  >
                    {trabajando ? 'Confirmando…' : 'Confirmar pedido'}
                  </button>
                )}
              </div>
            </section>

            {/*
              El aviso de que esto todavía no ha salido de la cafetería. Va
              fuera del documento y con `.no-imprimir`: en el papel no pinta
              nada, y de hecho un borrador impreso con un cartel de «borrador»
              encima sería confuso — el papel es justo lo que se usa para
              revisarlo.
            */}
            {esBorrador && (
              <p className="aviso aviso--aviso no-imprimir" role="status">
                Este pedido es un borrador: todavía no le ha llegado a
                administración. Imprímelo o revísalo en pantalla, corrígelo si
                hace falta, y confírmalo cuando esté bien.
              </p>
            )}

            {pedido.estado === 'anulado' && (
              <p className="aviso aviso--error no-imprimir" role="status">
                Este pedido está anulado. Se conserva para el historial, pero no
                hay que atenderlo.
              </p>
            )}

            {aviso && (
              <p className={`aviso aviso--${aviso.tipo} no-imprimir`} role="status">
                {aviso.mensaje}
              </p>
            )}

            <Hoja pedido={pedido} />
          </>
        )}
      </main>

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
 * Los rótulos son «Día», «Mes» y «Año», no «dd/mm/aaaa». En la plantilla de
 * papel esas abreviaturas decían el FORMATO en el que había que escribir a
 * mano; aquí la fecha la pone la aplicación ya formateada, así que lo único
 * que queda por decir es qué es cada número.
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
        <tr>
          <th scope="col">Día</th>
          <th scope="col">Mes</th>
          <th scope="col">Año</th>
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
      {/* Sin contenido a propósito: en las dos plantillas es el hueco donde se
          escribe a mano al recibir, y ese momento pasa fuera de la app. */}
      <div className="documento__observaciones">Observaciones:</div>

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
