/**
 * El historial: los CIERRES DIARIOS, uno por fila.
 *
 * Listó un rato una fila por (fecha, sede), y con cuatro cafeterías un mes
 * eran ciento veinte renglones para responder a una pregunta que se hace por
 * días: «¿cómo cerró el martes?». Ahora cada fila es un día con el consolidado
 * de las cuatro, y el detalle sede por sede está a un clic — en el resumen
 * diario, que es a donde lleva la fila.
 *
 * A quien atiende una sede el servidor le devuelve SUS días con sus propias
 * cifras, así que la pantalla es la misma para los dos alcances y no pregunta
 * por el rol en ninguna parte.
 *
 * ── El periodo son atajos, no un grano ────────────────────────────────────
 *
 * «Día», «Semana» y «Mes» solo mueven las dos fechas del rango; las filas
 * siguen siendo días. Agrupar por semanas —una fila con los totales de la
 * semana— sería otra cosa, y entonces habría que decidir a dónde lleva pulsar
 * una fila que no es un día. No se ha hecho.
 */

import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getDiasCierre } from '../../servicios/salidasServicio.js';
import { usePeticion } from '../../utiles/usePeticion.js';
import { BloqueEstado } from '../../componentes/BloqueEstado.js';
import { BarraVolver } from '../../componentes/BarraVolver.js';
import { NavSalidas } from '../../componentes/salidas/NavSalidas.js';
import { Pie } from '../../componentes/Pie.js';
import { useHoy, useSesion } from '../../contexto/Sesion.js';
import { formatearFechaLarga, nombreDiaCorto } from '../../utiles/fechas.js';
import { PERIODOS, rangoDePeriodo } from '../../utiles/periodos.js';

export function Historial() {
  const hoy = useHoy();
  const navegar = useNavigate();
  const { contexto } = useSesion();
  const suSede = contexto?.perfil?.cafeteriaId ?? null;

  /* El mismo desplegable que la administración de reservas, y el mismo cálculo:
     `utiles/periodos.ts`. Dos listas de periodos habrían acabado diciendo cosas
     distintas por «Semana pasada» en dos pantallas de la misma aplicación. */
  const [periodo, setPeriodo] = useState('30');
  /* La tupla, escrita: sin ella `rango[0]` es `string | undefined` —el
     proyecto compila con `noUncheckedIndexedAccess`— y habría que comprobar
     dos veces algo que por construcción siempre tiene dos fechas. */
  const [rango, setRango] = useState<[string, string]>(
    () => rangoDePeriodo('30', hoy) ?? [hoy, hoy],
  );
  const [desde, hasta] = rango;

  /* Elegir un periodo rellena las dos fechas; tocar una fecha pasa a
     «Personalizado». Es el mismo par de gestos que allí, y hace que el
     desplegable nunca diga «Este mes» sobre unas fechas que no son las suyas. */
  function cambiarPeriodo(nuevo: string) {
    setPeriodo(nuevo);
    const calculado = rangoDePeriodo(nuevo, hoy);
    if (calculado) setRango(calculado);
  }

  function cambiarFecha(cual: 0 | 1, valor: string) {
    setPeriodo('personalizado');
    setRango((r) => (cual === 0 ? [valor, r[1]] : [r[0], valor]));
  }

  const consultar = useCallback(
    () => getDiasCierre({ desde, hasta }), [desde, hasta],
  );
  const { datos, cargando, error, recargar } = usePeticion(consultar, [desde, hasta]);

  const dias = datos ?? [];

  /* El consolidado del PERIODO, que es la otra pregunta que se hace mirando
     esto: «¿cómo fue el mes?». Sale de lo que ya está en pantalla, sin otro
     viaje al servidor. */
  const total = useMemo(() => dias.reduce((t, d) => ({
    ventas: t.ventas + d.totalVentas,
    salidas: t.salidas + d.totalSalidas,
    diferencia: t.diferencia + d.totalDiferencia,
  }), { ventas: 0, salidas: 0, diferencia: 0 }), [dias]);

  return (
    <>
      <main className="contenedor pagina">
        <BarraVolver volver={{ a: '/salidas', texto: '← Control de salidas' }} />

        <section className="encabezado-reserva">
          <div className="encabezado-reserva__texto">
            <div className="encabezado-reserva__linea">
              <h1 className="encabezado-reserva__titulo">Historial de cierres</h1>
              <p className="encabezado-reserva__meta">
                {suSede ? 'Tu cafetería' : 'Todas las cafeterías'}
              </p>
            </div>
          </div>

          <div className="filtros__acciones">
            {/* El consolidado del periodo que se está mirando: lleva el rango
                en la dirección, así que la hoja se puede enlazar y volver a
                abrir tal cual. */}
            <Link className="boton boton--sm boton--secundario"
                  to={`/salidas/documento/${desde}/${hasta}`}>
              Imprimir el periodo
            </Link>
            <NavSalidas />
          </div>
        </section>

        {/* El mismo filtro que en la administración de reservas: el periodo
            manda y las dos fechas se rellenan solas, salvo que se toquen. */}
        <form className="filtros" onSubmit={(e) => e.preventDefault()}>
          <div className="filtros__campo filtros__campo--ancho">
            <label className="campo__etiqueta" htmlFor="filtro-periodo">Periodo</label>
            <select className="campo__control" id="filtro-periodo" value={periodo}
                    onChange={(e) => cambiarPeriodo(e.target.value)}>
              {PERIODOS.map((p) => (
                <option key={p.id} value={p.id}>{p.texto}</option>
              ))}
            </select>
          </div>

          <div className="filtros__campo">
            <label className="campo__etiqueta" htmlFor="filtro-desde">Desde</label>
            <input className="campo__control" id="filtro-desde" type="date" value={desde}
                   onChange={(e) => cambiarFecha(0, e.target.value)} />
          </div>

          <div className="filtros__campo">
            <label className="campo__etiqueta" htmlFor="filtro-hasta">Hasta</label>
            <input className="campo__control" id="filtro-hasta" type="date" value={hasta}
                   onChange={(e) => cambiarFecha(1, e.target.value)} />
          </div>
        </form>

        {cargando && <BloqueEstado tipo="cargando" titulo="Cargando cierres…" />}

        {error && (
          <BloqueEstado
            tipo="error"
            titulo="No se pudo cargar el historial"
            detalle={error}
            accion={{ texto: 'Reintentar', alPulsar: recargar }}
          />
        )}

        {datos && dias.length === 0 && (
          <BloqueEstado
            tipo="vacio"
            titulo="No hay cierres en ese periodo"
            detalle={periodo === 'hoy'
              ? 'Hoy todavía no se ha cerrado ninguna caja.'
              : 'Prueba con un periodo más amplio, o registra el cierre desde el módulo.'}
          />
        )}

        {dias.length > 0 && (
          <div className="tabla-envoltorio bloque-tabla">
            <table className="tabla">
              <caption className="tabla__caption">
                {desde === hasta
                  ? formatearFechaLarga(desde)
                  : `Del ${formatearFechaLarga(desde)} al ${formatearFechaLarga(hasta)}`}
                {' · '}
                {dias.length} {dias.length === 1 ? 'día' : 'días'} con cierre
              </caption>

              <thead>
                <tr>
                  <th scope="col">Día</th>
                  {/* Solo tiene sentido con varias sedes: para el mostrador
                      sería siempre «1 de 1». */}
                  {!suSede && <th scope="col">Cerradas</th>}
                  <th scope="col">Ventas</th>
                  <th scope="col">Salidas</th>
                  <th scope="col">Diferencia</th>
                  <th scope="col"><span className="visualmente-oculto">Acciones</span></th>
                </tr>
              </thead>

              <tbody>
                {dias.map((d) => {
                  const completo = d.cerradas >= d.sedes;
                  return (
                    <tr
                      key={d.fecha}
                      /* La fila entera lleva al resumen del día. El botón de la
                         derecha se queda igualmente: es lo que se ve, y es lo
                         que funciona con el teclado — una fila no se enfoca. */
                      className="tabla__fila--pulsable"
                      onClick={() => navegar(`/salidas/dia/${d.fecha}`)}
                    >
                      <td className="tabla__nombre">
                        {nombreDiaCorto(d.fecha)}
                        {' '}
                        {formatearFechaLarga(d.fecha).replace(/^[^,]+,\s*/, '')}
                      </td>

                      {!suSede && (
                        <td className="tabla__numero">
                          {d.cerradas} de {d.sedes}
                          {!completo && (
                            <span className="tabla__detalle salidas__descuadre">incompleto</span>
                          )}
                        </td>
                      )}

                      <td className="tabla__numero">{d.totalVentas}</td>
                      <td className="tabla__numero">{d.totalSalidas}</td>
                      <td className={`tabla__numero${d.totalDiferencia ? ' salidas__descuadre' : ''}`}>
                        {d.totalDiferencia > 0 ? `+${d.totalDiferencia}` : d.totalDiferencia}
                      </td>

                      <td className="tabla__acciones">
                        <button
                          type="button"
                          className="boton boton--sm boton--secundario"
                          /* El clic de la fila ya navega; sin frenarlo aquí se
                             llamaría dos veces al pulsar el botón. */
                          onClick={(e) => { e.stopPropagation(); navegar(`/salidas/dia/${d.fecha}`); }}
                        >
                          Ver el día
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr>
                  <th scope="row">Total del periodo</th>
                  {!suSede && <td />}
                  <td className="tabla__numero">{total.ventas}</td>
                  <td className="tabla__numero">{total.salidas}</td>
                  <td className={`tabla__numero${total.diferencia ? ' salidas__descuadre' : ''}`}>
                    {total.diferencia > 0 ? `+${total.diferencia}` : total.diferencia}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </main>

      <Pie />
    </>
  );
}
