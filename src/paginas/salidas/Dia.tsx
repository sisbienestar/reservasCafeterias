/**
 * El cierre de un periodo: todas las sedes juntas, un día o un rango, en dos
 * pestañas.
 *
 * Es el control de verdad — mirar una sede sola no contrasta nada; lo que se
 * revisa es el conjunto. Por eso cruza sedes, y por eso el servidor solo se
 * lo sirve a quien no atiende una en concreto.
 *
 * ── Dos pestañas, dos preguntas, dos peticiones ───────────────────────────
 *
 * «Consolidado» suma cada producto por sede en todo el periodo —la pregunta
 * es «¿cuadró la sede en general?»—. «Detallado del día» enseña la diferencia
 * día a día —la pregunta es «¿qué día exacto se descuadró?»—. Son datos
 * distintos (`VistaConsolidado`/`VistaDetallado`, cada una con su propia
 * petición) y esta pantalla solo decide CUÁL mostrar: montar la pestaña activa
 * nada más es lo que hace que abrir «Consolidado» no pague por el detallado
 * que nadie pidió, ni al revés. Una tercera pestaña, «Análisis», se sumará
 * el día que exista.
 *
 * ── Un día es un rango de uno ─────────────────────────────────────────────
 *
 * La ruta sigue siendo `/salidas/dia/:fecha` —`fecha` es el «desde»— y
 * `hasta` y `vista` son parámetros de consulta opcionales que por defecto
 * valen «lo mismo que fecha» y «consolidado»: así todo lo que ya enlaza
 * aquí —el historial, por ejemplo— sigue abriendo exactamente el mismo día de
 * siempre, en la misma pestaña de siempre. El desplegable de periodo es el
 * mismo que el del historial (`utiles/periodos.ts`), y se lee de la URL en
 * vez de guardar su propio estado — igual que la pestaña activa.
 */

import { useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BarraVolver } from '../../componentes/BarraVolver.js';
import { NavSalidas } from '../../componentes/salidas/NavSalidas.js';
import { VistaConsolidado } from '../../componentes/salidas/VistaConsolidado.js';
import { VistaDetallado } from '../../componentes/salidas/VistaDetallado.js';
import { Pie } from '../../componentes/Pie.js';
import { useHoy } from '../../contexto/Sesion.js';
import { formatearFechaLarga } from '../../utiles/fechas.js';
import { PERIODOS, rangoDePeriodo } from '../../utiles/periodos.js';

type Pestana = 'consolidado' | 'detallado';

const PESTANAS: { id: Pestana; texto: string }[] = [
  { id: 'consolidado', texto: 'Consolidado' },
  { id: 'detallado', texto: 'Detallado del día' },
];

export function Dia() {
  const hoy = useHoy();
  const { fecha = hoy } = useParams();
  const [parametros] = useSearchParams();
  const navegar = useNavigate();

  const desde = fecha;
  const hasta = parametros.get('hasta') || fecha;
  const soloUnDia = desde === hasta;
  const pestana: Pestana = parametros.get('vista') === 'detallado' ? 'detallado' : 'consolidado';

  /* El desplegable no guarda su propio estado: se lee de `desde`/`hasta`, que
     ya viven en la URL. Así un enlace compartido —o el botón «atrás»— siempre
     enseña el periodo que de verdad corresponde a esas fechas. */
  const periodoActual = useMemo(() => {
    const coincide = PERIODOS.find((p) => {
      const r = rangoDePeriodo(p.id, hoy);
      return r !== null && r[0] === desde && r[1] === hasta;
    });
    return coincide?.id ?? 'personalizado';
  }, [desde, hasta, hoy]);

  function irA(nuevoDesde: string, nuevoHasta: string, nuevaPestana: Pestana) {
    const destino = new URLSearchParams();
    if (nuevoDesde !== nuevoHasta) destino.set('hasta', nuevoHasta);
    if (nuevaPestana !== 'consolidado') destino.set('vista', nuevaPestana);
    const cadena = destino.toString();
    /* `replace` para no llenar el historial del navegador de fechas al mover
       el desplegable, el calendario o la pestaña. */
    navegar(`/salidas/dia/${nuevoDesde}${cadena ? `?${cadena}` : ''}`, { replace: true });
  }

  function cambiarPeriodo(nuevo: string) {
    const calculado = rangoDePeriodo(nuevo, hoy);
    if (calculado) irA(calculado[0], calculado[1], pestana);
  }

  function cambiarFecha(cual: 0 | 1, valor: string) {
    irA(cual === 0 ? valor : desde, cual === 1 ? valor : hasta, pestana);
  }

  function cambiarPestana(nueva: Pestana) {
    irA(desde, hasta, nueva);
  }

  return (
    <>
      <main className="contenedor pagina">
        <BarraVolver volver={{ a: '/salidas', texto: '← Control de salidas' }} />

        <section className="encabezado-reserva">
          <div className="encabezado-reserva__texto">
            <div className="encabezado-reserva__linea">
              <h1 className="encabezado-reserva__titulo">
                {soloUnDia ? 'Cierre del día' : 'Consolidado de cierres'}
              </h1>
              <p className="encabezado-reserva__meta">
                {soloUnDia
                  ? formatearFechaLarga(desde)
                  : `Del ${formatearFechaLarga(desde)} al ${formatearFechaLarga(hasta)}`}
              </p>
            </div>
          </div>

          <div className="filtros__acciones">
            <NavSalidas />
          </div>
        </section>

        {/* El mismo filtro que en el historial: el periodo manda y las dos
            fechas se rellenan solas, salvo que se toquen. Manda sobre las dos
            pestañas por igual. */}
        <form className="filtros" onSubmit={(e) => e.preventDefault()}>
          <div className="filtros__campo filtros__campo--ancho">
            <label className="campo__etiqueta" htmlFor="periodo-dia">Periodo</label>
            <select className="campo__control" id="periodo-dia" value={periodoActual}
                    onChange={(e) => cambiarPeriodo(e.target.value)}>
              {PERIODOS.map((p) => (
                <option key={p.id} value={p.id}>{p.texto}</option>
              ))}
            </select>
          </div>

          <div className="filtros__campo">
            <label className="campo__etiqueta" htmlFor="desde-dia">Desde</label>
            <input className="campo__control" id="desde-dia" type="date" value={desde}
                   onChange={(e) => cambiarFecha(0, e.target.value)} />
          </div>

          <div className="filtros__campo">
            <label className="campo__etiqueta" htmlFor="hasta-dia">Hasta</label>
            <input className="campo__control" id="hasta-dia" type="date" value={hasta}
                   onChange={(e) => cambiarFecha(1, e.target.value)} />
          </div>
        </form>

        {/* El mismo patrón ARIA que ya usa `paginas/reservas/Admin.tsx`:
            <nav> por fuera, role="tablist" en la lista de dentro. */}
        <nav className="pestanas" aria-label="Vistas del cierre">
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
                onClick={() => cambiarPestana(p.id)}
                onKeyDown={(e) => {
                  const i = PESTANAS.findIndex((x) => x.id === pestana);
                  if (e.key === 'ArrowRight') {
                    cambiarPestana(PESTANAS[(i + 1) % PESTANAS.length]!.id);
                  } else if (e.key === 'ArrowLeft') {
                    cambiarPestana(PESTANAS[(i - 1 + PESTANAS.length) % PESTANAS.length]!.id);
                  }
                }}
              >
                {p.texto}
              </button>
            ))}
          </div>
        </nav>

        {/* Montaje condicional a propósito: es lo que hace que cambiar de
            pestaña dispare la petición de la otra vista, y no antes. */}
        {pestana === 'consolidado' && (
          <section id="vista-consolidado" role="tabpanel" aria-labelledby="pestana-consolidado">
            <VistaConsolidado desde={desde} hasta={hasta} />
          </section>
        )}

        {pestana === 'detallado' && (
          <section id="vista-detallado" role="tabpanel" aria-labelledby="pestana-detallado">
            <VistaDetallado desde={desde} hasta={hasta} />
          </section>
        )}
      </main>

      <Pie />
    </>
  );
}
