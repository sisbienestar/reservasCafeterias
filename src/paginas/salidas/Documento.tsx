/**
 * El consolidado de un rango, listo para imprimir o guardar en PDF.
 *
 * Reproduce la plantilla «CONTROL DE PEDIDO Y SALIDAS DE ALMUERZOS, MINI LUNCH
 * Y ENSALADAS» —el título es el del formulario físico, FBE.XX, y no se toca—:
 * los productos en filas, y en columnas cada cafetería con sus días dentro.
 * Lo que va en cada casilla es la PRODUCCIÓN.
 *
 * El PDF lo hace el NAVEGADOR, con `window.print()` y las reglas de
 * `documento.css`, igual que el FBE.04 de pedidos. El membrete es el mismo
 * —misma institución, mismo proceso— y por eso se reutilizan sus clases en vez
 * de escribir otras paralelas.
 *
 * ── Las semanas ───────────────────────────────────────────────────────────
 *
 * La plantilla repite un bloque por cada tanda de días: FECHA con las fechas
 * arriba, y debajo los productos. En la muestra cada bloque lleva cuatro días
 * —14-17, 21-24, 27-30 de marzo— que son SEMANAS con sus días hábiles, no
 * grupos de cuatro: la semana del 21 al 24 salta el fin de semana igual que la
 * del 14. Así que se agrupa por semana y cada bloque lleva los días de la suya
 * que tuvieron cierre.
 *
 * ── Es una hoja ANCHA, y por eso apaisada ─────────────────────────────────
 *
 * `documento--ancho` no es cosmética: con cuatro sedes por cinco días son
 * dieciséis columnas de fecha, y a lo ancho de una carta vertical «16-mar» se
 * salía de su casilla pisando a la de al lado. La clase la ensancha en
 * pantalla y le da su propia `@page` apaisada al imprimir, sin tocar el
 * FBE.04, que comparte la hoja de estilos y sigue saliendo vertical.
 *
 * ── Dos columnas que salen en blanco ──────────────────────────────────────
 *
 * «Cant. devuelta» y «Cant. adicional» no se guardan en ninguna parte: se
 * escriben a mano sobre el papel al revisar, igual que en el FBE.04. Salen
 * impresas y vacías, que es su sitio.
 */

import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { getConsolidado } from '../../servicios/salidasServicio.js';
import { usePeticion } from '../../utiles/usePeticion.js';
import { BloqueEstado } from '../../componentes/BloqueEstado.js';
import { BarraVolver } from '../../componentes/BarraVolver.js';
import { formatearFechaLarga, lunesDeSemana } from '../../utiles/fechas.js';

/**
 * Lo que va impreso en el membrete.
 *
 * El código y la versión van como en la plantilla que llegó: `FBE.XX` y `XX`.
 * NO son un descuido — la hoja todavía no tiene número asignado, y poner uno
 * inventado sería peor que enseñar el hueco: alguien lo archivaría por él.
 * Cuando lo asignen, se cambian estas dos líneas.
 */
const PROCESO = 'PROCESO BIENESTAR ESTUDIANTIL';
const SUBPROCESO = 'SUBPROCESO ATENCIÓN SOCIOECONÓMICA';
const TITULO = 'CONTROL DE PEDIDO Y SALIDAS DE ALMUERZOS, MINI LUNCH Y ENSALADAS';
const CODIGO = 'FBE.XX';
const VERSION = 'XX';

/** '2026-03-14' → '14-mar', como en la plantilla. */
function diaCorto(fechaISO: string): string {
  const [a = '', m = '', d = ''] = fechaISO.split('-');
  const mes = new Date(Number(a), Number(m) - 1, Number(d))
    .toLocaleDateString('es-CO', { month: 'short' })
    .replace('.', '');
  return `${d}-${mes}`;
}

/** Los días agrupados por la semana a la que pertenecen, en orden. */
function porSemanas(dias: string[]): string[][] {
  const semanas = new Map<string, string[]>();
  for (const dia of [...dias].sort()) {
    const lunes = lunesDeSemana(dia);
    if (!semanas.has(lunes)) semanas.set(lunes, []);
    semanas.get(lunes)!.push(dia);
  }
  return [...semanas.values()];
}

export function Documento() {
  const { desde = '', hasta = '' } = useParams();

  const consultar = useCallback(() => getConsolidado(desde, hasta), [desde, hasta]);
  const { datos, cargando, error, recargar } = usePeticion(consultar, [desde, hasta]);

  const semanas = datos ? porSemanas(datos.dias) : [];

  /*
   * El ancho de la cabecera lo manda la semana MÁS LARGA.
   *
   * Cada cafetería abarca ese número de columnas en la fila de arriba, y las
   * semanas más cortas rellenan con casillas vacías. Sin un ancho común, cada
   * bloque tendría su propia rejilla y las columnas no se alinearían entre
   * bloques — que es justo lo que permite leer la hoja de arriba abajo.
   */
  const anchoSemana = semanas.reduce((n, s) => Math.max(n, s.length), 0);

  /* Las casillas, indexadas por sus tres claves. Se arma una vez y no en cada
     celda: con 5 productos × 4 sedes × 20 días serían cuatrocientas búsquedas
     lineales sobre el mismo arreglo. */
  const porClave = new Map<string, number>();
  for (const c of datos?.celdas ?? []) {
    porClave.set(`${c.fecha}|${c.cafeteriaId}|${c.productoId}`, c.produccion);
  }

  return (
    <>
      <main className="contenedor pagina">
        <section className="encabezado-reserva no-imprimir">
          <div className="encabezado-reserva__texto">
            <BarraVolver
              volver={{ a: '/salidas/historial', texto: '← Historial' }}
              contexto="Consolidado del periodo"
            />
            <div className="encabezado-reserva__linea">
              <h1 className="encabezado-reserva__titulo">Consolidado</h1>
              <p className="encabezado-reserva__meta">
                {desde === hasta
                  ? formatearFechaLarga(desde)
                  : `Del ${formatearFechaLarga(desde)} al ${formatearFechaLarga(hasta)}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="boton boton--primario"
            onClick={() => window.print()}
          >
            Imprimir o guardar PDF
          </button>
        </section>

        {cargando && <BloqueEstado tipo="cargando" titulo="Cargando el consolidado…" />}

        {error && (
          <BloqueEstado
            tipo="error"
            titulo="No se pudo cargar el consolidado"
            detalle={error}
            accion={{ texto: 'Reintentar', alPulsar: recargar }}
          />
        )}

        {datos && datos.dias.length === 0 && (
          <BloqueEstado
            tipo="vacio"
            titulo="No hay ningún cierre en ese periodo"
            detalle="Sin días cerrados no hay nada que consolidar. Prueba con otro rango."
          />
        )}

        {datos && datos.dias.length > 0 && (
          <article className="documento documento--ancho">
            {/* ── Membrete: el mismo que el FBE.04 ─────────────────────── */}
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
                    <strong>Código:</strong> {CODIGO}
                  </td>
                </tr>
                <tr>
                  <td className="documento__proceso">
                    <p className="documento__titulo">{TITULO}</p>
                  </td>
                  <td className="documento__codigo-celda">
                    <strong>Versión:</strong> {VERSION}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* El rango, que es lo que distingue una hoja de otra. No está en
                la plantilla porque allí se escribía a mano en las casillas de
                fecha; aquí lo sabe la aplicación. */}
            <p className="documento__elaborado">
              Periodo: <strong>
                {formatearFechaLarga(datos.desde)} — {formatearFechaLarga(datos.hasta)}
              </strong>
            </p>

            <table className="documento__tabla documento__matriz">
              <thead>
                <tr>
                  <th className="documento__num" scope="col">No.</th>
                  <th scope="col">NOMBRE DEL PRODUCTO</th>
                  {datos.cafeterias.map((c) => (
                    <th key={c.cafeteriaId} scope="colgroup" colSpan={anchoSemana}>
                      {c.nombre}
                    </th>
                  ))}
                  {/* Se escriben a mano sobre el papel, como en el FBE.04. */}
                  <th className="documento__cant" scope="col">Cant. devuelta</th>
                  <th className="documento__cant" scope="col">Cant. adicional</th>
                </tr>
              </thead>

              {semanas.map((semana) => (
                <tbody key={semana[0]}>
                  {/* La fila de fechas: repite las de la semana bajo cada
                      cafetería, como la plantilla. */}
                  <tr className="documento__seccion">
                    <th colSpan={2} scope="row">FECHA</th>
                    {datos.cafeterias.map((c) => (
                      Array.from({ length: anchoSemana }, (_, i) => (
                        <th key={`${c.cafeteriaId}-${i}`} className="documento__dia" scope="col">
                          {semana[i] ? diaCorto(semana[i]!) : ''}
                        </th>
                      ))
                    ))}
                    <td />
                    <td />
                  </tr>

                  {datos.productos.map((p, i) => (
                    <tr key={p.productoId}>
                      <td className="documento__num">{i + 1}</td>
                      <td>{p.nombre}</td>

                      {datos.cafeterias.map((c) => (
                        Array.from({ length: anchoSemana }, (_, j) => {
                          const dia = semana[j];
                          const valor = dia
                            ? porClave.get(`${dia}|${c.cafeteriaId}|${p.productoId}`)
                            : undefined;
                          return (
                            <td key={`${c.cafeteriaId}-${j}`} className="documento__dia">
                              {/* Vacío y no cero: una casilla sin contar no es
                                  un cero, y en esta hoja se distingue igual que
                                  en la pantalla del cierre. */}
                              {valor === undefined ? '' : valor}
                            </td>
                          );
                        })
                      ))}

                      <td />
                      <td />
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>

            {/* Sin contenido: es el hueco donde se anota a mano al revisar, y
                ese momento pasa fuera de la aplicación. Igual que en el
                FBE.04. */}
            <div className="documento__observaciones">Observaciones:</div>

            {/* La plantilla no lleva firmas, así que aquí tampoco. Lo que no
                está en el papel no se inventa. */}
            <p className="documento__nota-columnas no-imprimir">
              «Cant. devuelta» y «Cant. adicional» salen en blanco a propósito:
              se escriben a mano al revisar, como en el FBE.04. Cada casilla es
              lo que se PRODUJO; una casilla vacía es un día que no se contó,
              que no es lo mismo que un cero.
            </p>
          </article>
        )}
      </main>
    </>
  );
}
