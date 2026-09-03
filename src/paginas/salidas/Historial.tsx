/**
 * El historial: el periodo mandado por un filtro, mirado de varias maneras.
 *
 * Es la pantalla desde la que se estudia lo ya cerrado, y por eso las pestañas
 * viven AQUÍ y no en «Ver el día»: allí se mira un día concreto, aquí se mira
 * un rango. Tenerlas en la pantalla del día dejaba dos sitios haciendo lo
 * mismo, y el selector de periodo en una pantalla que se llama «del día».
 *
 *   Consolidado        · lo del periodo sumado por sede y producto
 *   Detallado del día  · un día por fila, desplegable sede por sede
 *   Variabilidad       · un rectángulo por día, para ver rachas
 *   Análisis           · las gráficas: tendencia, rankings y el cruce
 *
 * Añadir una vista es una entrada más en `PESTANAS` y su panel: el filtro de
 * periodo ya manda sobre todas por igual.
 *
 * ── El alcance decide qué pestañas hay ─────────────────────────────────────
 *
 * «Consolidado» cruza sedes —pide `salidas.periodo`— y el mostrador no tiene
 * esa acción, así que a quien atiende una sede no se le ofrece: se le queda el
 * detallado, que el servidor ya le acota a lo suyo. Se decide por
 * `cafeteriaId` nulo o no, NUNCA enumerando roles: un rol nuevo sin sede las
 * ve las dos sin tocar esta línea.
 *
 * ── El periodo son atajos, no un grano ────────────────────────────────────
 *
 * «Día», «Semana» y «Mes» solo mueven las dos fechas del rango; las filas del
 * detallado siguen siendo días. Agrupar por semanas —una fila con los totales
 * de la semana— sería otra cosa, y entonces habría que decidir a dónde lleva
 * desplegar una fila que no es un día. No se ha hecho.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarraVolver } from '../../componentes/BarraVolver.js';
import { NavSalidas } from '../../componentes/salidas/NavSalidas.js';
import { VistaConsolidado } from '../../componentes/salidas/VistaConsolidado.js';
import { VistaDetallado } from '../../componentes/salidas/VistaDetallado.js';
import { VistaVariabilidad } from '../../componentes/salidas/VistaVariabilidad.js';
import { VistaAnalisis } from '../../componentes/salidas/VistaAnalisis.js';
import { Pie } from '../../componentes/Pie.js';
import { useHoy, useSesion } from '../../contexto/Sesion.js';
import { formatearFechaLarga } from '../../utiles/fechas.js';
import { PERIODOS, rangoDePeriodo } from '../../utiles/periodos.js';

type Pestana = 'consolidado' | 'detallado' | 'variabilidad' | 'analisis';

export function Historial() {
  const hoy = useHoy();
  const { contexto } = useSesion();
  const suSede = contexto?.perfil?.cafeteriaId ?? null;
  const verTodas = !suSede;

  /* Las que hay para quien mira. Al mostrador le falta `salidas.periodo`, así
     que ofrecerle «Consolidado» sería ofrecerle un error. */
  const PESTANAS: { id: Pestana; texto: string }[] = verTodas
    ? [
      { id: 'consolidado', texto: 'Consolidado' },
      { id: 'detallado', texto: 'Detallado del día' },
      { id: 'variabilidad', texto: 'Variabilidad' },
      { id: 'analisis', texto: 'Análisis' },
    ]
    : [{ id: 'detallado', texto: 'Detallado del día' }];

  const [pestana, setPestana] = useState<Pestana>(verTodas ? 'consolidado' : 'detallado');

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

  return (
    <>
      <main className="contenedor pagina">
        <BarraVolver volver={{ a: '/salidas', texto: '← Control de salidas' }} />

        <section className="encabezado-reserva">
          <div className="encabezado-reserva__texto">
            <div className="encabezado-reserva__linea">
              <h1 className="encabezado-reserva__titulo">Historial de cierres</h1>
              <p className="encabezado-reserva__meta">
                {desde === hasta
                  ? formatearFechaLarga(desde)
                  : `Del ${formatearFechaLarga(desde)} al ${formatearFechaLarga(hasta)}`}
                {' · '}
                {verTodas ? 'Todas las cafeterías' : 'Tu cafetería'}
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
            manda y las dos fechas se rellenan solas, salvo que se toquen.
            Manda sobre todas las pestañas por igual. */}
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

        {/* El mismo patrón ARIA que ya usa `paginas/reservas/Admin.tsx`:
            <nav> por fuera, role="tablist" en la lista de dentro. Con una sola
            pestaña no se pinta: una lista de uno no es una elección. */}
        {PESTANAS.length > 1 && (
          <nav className="pestanas" aria-label="Vistas del historial">
            <div className="pestanas__lista" role="tablist">
              {PESTANAS.map((p) => (
                <button
                  key={p.id}
                  role="tab"
                  type="button"
                  id={`pestana-${p.id}`}
                  aria-selected={pestana === p.id}
                  aria-controls={`vista-${p.id}`}
                  className={pestana === p.id ? 'pestana pestana--activa' : 'pestana'}
                  onClick={() => setPestana(p.id)}
                  onKeyDown={(e) => {
                    const i = PESTANAS.findIndex((x) => x.id === pestana);
                    if (e.key === 'ArrowRight') {
                      setPestana(PESTANAS[(i + 1) % PESTANAS.length]!.id);
                    } else if (e.key === 'ArrowLeft') {
                      setPestana(PESTANAS[(i - 1 + PESTANAS.length) % PESTANAS.length]!.id);
                    }
                  }}
                >
                  {p.texto}
                </button>
              ))}
            </div>
          </nav>
        )}

        {/* Montaje condicional a propósito: es lo que hace que cambiar de
            pestaña dispare la petición de la otra vista, y no antes. */}
        {pestana === 'consolidado' && verTodas && (
          <section id="vista-consolidado" role="tabpanel" aria-labelledby="pestana-consolidado">
            <VistaConsolidado desde={desde} hasta={hasta} />
          </section>
        )}

        {pestana === 'detallado' && (
          <section id="vista-detallado" role="tabpanel" aria-labelledby="pestana-detallado">
            <VistaDetallado desde={desde} hasta={hasta} suSede={suSede} />
          </section>
        )}

        {pestana === 'variabilidad' && verTodas && (
          <section id="vista-variabilidad" role="tabpanel" aria-labelledby="pestana-variabilidad">
            <VistaVariabilidad desde={desde} hasta={hasta} />
          </section>
        )}

        {pestana === 'analisis' && verTodas && (
          <section id="vista-analisis" role="tabpanel" aria-labelledby="pestana-analisis">
            <VistaAnalisis desde={desde} hasta={hasta} />
          </section>
        )}
      </main>

      <Pie />
    </>
  );
}
