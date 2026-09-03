/**
 * El cierre de UN día: todas las sedes juntas, sede por producto.
 *
 * Es el control de verdad — mirar una sede sola no contrasta nada; lo que se
 * revisa es el conjunto. Por eso cruza sedes, y por eso el servidor solo se
 * lo sirve a quien no atiende una en concreto.
 *
 * ── Aquí NO hay pestañas, y es a propósito ─────────────────────────────────
 *
 * Las tuvo, junto con un selector de periodo, y era el sitio equivocado: esta
 * pantalla se llama «del día» y se llega a ella desde una fila del historial.
 * Estudiar un RANGO —consolidados, día a día, análisis— es lo que se hace en
 * `/salidas/historial`, que es donde viven ahora. Aquí solo se cambia de día.
 *
 * La dirección sigue llevando la fecha porque este día concreto es lo que se
 * comparte y lo que se imprime: tiene que poder enlazarse.
 */

import { useNavigate, useParams } from 'react-router-dom';
import { BarraVolver } from '../../componentes/BarraVolver.js';
import { NavSalidas } from '../../componentes/salidas/NavSalidas.js';
import { VistaConsolidado } from '../../componentes/salidas/VistaConsolidado.js';
import { Pie } from '../../componentes/Pie.js';
import { useHoy } from '../../contexto/Sesion.js';
import { formatearFechaLarga } from '../../utiles/fechas.js';

export function Dia() {
  const hoy = useHoy();
  const { fecha = hoy } = useParams();
  const navegar = useNavigate();

  return (
    <>
      <main className="contenedor pagina">
        <BarraVolver volver={{ a: '/salidas/historial', texto: '← Historial' }} />

        <section className="encabezado-reserva">
          <div className="encabezado-reserva__texto">
            <div className="encabezado-reserva__linea">
              <h1 className="encabezado-reserva__titulo">Cierre del día</h1>
              <p className="encabezado-reserva__meta">{formatearFechaLarga(fecha)}</p>
            </div>
          </div>

          <div className="filtros__acciones">
            <div className="campo campo--dia">
              <label className="campo__etiqueta" htmlFor="fecha-dia">Día</label>
              <input
                id="fecha-dia"
                className="campo__control"
                type="date"
                value={fecha}
                /* `replace` para no llenar el historial del navegador de días
                   al mover el calendario. */
                onChange={(e) => navegar(`/salidas/dia/${e.target.value}`, { replace: true })}
              />
            </div>
            <NavSalidas />
          </div>
        </section>

        {/* Un día es un rango de uno: la misma vista que usa el historial para
            un periodo, con las dos fechas iguales. */}
        <VistaConsolidado desde={fecha} hasta={fecha} />
      </main>

      <Pie />
    </>
  );
}
