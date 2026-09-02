/**
 * Los cierres ya hechos, por rango de fechas.
 *
 * Enseña la FICHA de cada uno —fecha, sede, responsable y los tres totales—,
 * no sus renglones: las cifras por producto se ven abriendo el cierre. Es la
 * misma disciplina de un viaje por gesto que sigue el historial de pedidos.
 *
 * El filtro de sede solo se pinta para quien no tiene una asignada. Al
 * mostrador el servidor le impone la suya, mande lo que mande, así que un
 * desplegable ahí sería un adorno que no cambia nada.
 */

import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { buscarCierres } from '../../servicios/salidasServicio.js';
import { getCafeterias } from '../../servicios/cafeteriasServicio.js';
import { usePeticion } from '../../utiles/usePeticion.js';
import { BloqueEstado } from '../../componentes/BloqueEstado.js';
import { BarraVolver } from '../../componentes/BarraVolver.js';
import { Pie } from '../../componentes/Pie.js';
import { useHoy, useSesion } from '../../contexto/Sesion.js';
import { puede } from '../../servicios/capacidades.js';
import { formatearFechaCorta, sumarDias } from '../../utiles/fechas.js';

export function Historial() {
  const hoy = useHoy();
  const { contexto } = useSesion();
  const perfil = contexto?.perfil ?? null;

  /* Quién ve TODAS las sedes: quien no tiene ninguna asignada. Se pregunta por
     la sede y no por el rol, que es la regla de siempre. */
  const todasLasSedes = !perfil?.cafeteriaId;

  const [desde, setDesde] = useState(() => sumarDias(hoy, -30));
  const [hasta, setHasta] = useState(hoy);
  const [sede, setSede] = useState('');

  const consultar = useCallback(
    () => buscarCierres({ desde, hasta, cafeteriaId: sede }),
    [desde, hasta, sede],
  );
  const { datos, cargando, error, recargar } = usePeticion(consultar, [desde, hasta, sede]);

  const consultarSedes = useCallback(
    () => (todasLasSedes ? getCafeterias({ incluirInactivas: true }) : Promise.resolve([])),
    [todasLasSedes],
  );
  const { datos: sedes } = usePeticion(consultarSedes, [todasLasSedes]);

  const cierres = datos ?? [];

  return (
    <>
      <main className="contenedor pagina">
        <BarraVolver volver={{ a: '/salidas', texto: '← Control de salidas' }} />

        <section className="encabezado-reserva">
          <div className="encabezado-reserva__texto">
            <div className="encabezado-reserva__linea">
              <h1 className="encabezado-reserva__titulo">Historial de cierres</h1>
              <p className="encabezado-reserva__meta">
                {todasLasSedes ? 'Todas las cafeterías' : 'Los cierres de tu sede'}
              </p>
            </div>
          </div>
        </section>

        <section className="filtros" aria-label="Filtros del historial">
          <div className="campo filtros__campo">
            <label className="campo__etiqueta" htmlFor="desde">Desde</label>
            <input id="desde" className="campo__control" type="date"
                   value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>

          <div className="campo filtros__campo">
            <label className="campo__etiqueta" htmlFor="hasta">Hasta</label>
            <input id="hasta" className="campo__control" type="date"
                   value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>

          {todasLasSedes && (
            <div className="campo filtros__campo filtros__campo--ancho">
              <label className="campo__etiqueta" htmlFor="sede">Cafetería</label>
              <select id="sede" className="campo__control" value={sede}
                      onChange={(e) => setSede(e.target.value)}>
                <option value="">Todas</option>
                {(sedes ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>
          )}
        </section>

        {cargando && <BloqueEstado tipo="cargando" titulo="Cargando cierres…" />}

        {error && (
          <BloqueEstado
            tipo="error"
            titulo="No se pudo cargar el historial"
            detalle={error}
            accion={{ texto: 'Reintentar', alPulsar: recargar }}
          />
        )}

        {datos && cierres.length === 0 && (
          <BloqueEstado
            tipo="vacio"
            titulo="No hay cierres en ese rango"
            detalle="Cambia las fechas, o registra el cierre desde la cafetería."
          />
        )}

        {cierres.length > 0 && (
          <div className="tabla-envoltorio bloque-tabla">
            <table className="tabla tabla--compacta">
              <caption className="tabla__caption">
                {cierres.length} {cierres.length === 1 ? 'cierre' : 'cierres'}.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Cafetería</th>
                  <th scope="col">Responsable</th>
                  <th scope="col">Ventas</th>
                  <th scope="col">Salidas</th>
                  <th scope="col">Diferencia</th>
                  <th scope="col"><span className="visualmente-oculto">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {cierres.map((c) => (
                  <tr key={c.id}>
                    <td className="tabla__fecha">{formatearFechaCorta(c.fecha)}</td>
                    <td className="tabla__nombre">{c.cafeteriaNombre}</td>
                    {/* Vacío y no un guion: no es que falte el dato, es que esa
                        sede no tenía responsable asignado cuando se cerró. */}
                    <td className="tabla__menu">
                      {c.responsableNombre || <span className="tabla__detalle">sin asignar</span>}
                    </td>
                    <td className="tabla__numero">{c.totalVentas}</td>
                    <td className="tabla__numero">{c.totalSalidas}</td>
                    <td className={`tabla__numero${c.totalDiferencia ? ' salidas__descuadre' : ''}`}>
                      {c.totalDiferencia > 0 ? `+${c.totalDiferencia}` : c.totalDiferencia}
                    </td>
                    <td className="tabla__acciones">
                      {/*
                        Al formulario de esa sede, no a una pantalla de solo
                        lectura: corregir un cierre es rellenar la misma hoja,
                        y son la misma acción. La fecha se elige dentro, así
                        que se llega al día de hoy y hay que moverla — se
                        arregla cuando el enlace pueda llevarla.
                      */}
                      <Link className="boton boton--sm boton--secundario"
                            to={`/salidas/${c.cafeteriaId}`}>
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {puede(perfil?.rol, 'verDiaSalidas') && (
          <p className="campo__ayuda">
            Para ver un día con todas las cafeterías juntas —que es lo que se
            imprime— entra por «Ver el día junto» en la portada del módulo.
          </p>
        )}
      </main>

      <Pie />
    </>
  );
}
