/**
 * La carta de la semana.
 *
 * Compartió pestaña con las cafeterías hasta que hubo tres módulos usando las
 * sedes: una cafetería no es de reservas, así que se mudó al panel de la
 * aplicación —`componentes/admin/SeccionCafeterias.tsx`—. La carta sí es de
 * reservas y se queda.
 *
 * El nombre del archivo se conserva: la pestaña sigue llamándose «Catálogo» y
 * renombrarlo obligaría a tocar cinco importaciones para no ganar nada.
 */

import { useCallback, useState, type FormEvent } from 'react';
import { getMenuSemana, guardarMenuSemana } from '../../servicios/menuServicio.js';
import { usePeticion } from '../../utiles/usePeticion.js';
import {
  esDiaDeServicio, formatearFechaCorta, formatearFechaLarga,
  lunesDeSemana, nombreDiaCorto, sumarDias,
} from '../../utiles/fechas.js';
import { BloqueEstado } from '../BloqueEstado.js';

interface Props {
  hoy: string;
  permitirFinDeSemana: boolean;
}

export function Catalogo({ hoy, permitirFinDeSemana }: Props) {
  return (
    <div className="catalogo">
      <SeccionCarta hoy={hoy} permitirFinDeSemana={permitirFinDeSemana} />
    </div>
  );
}

/* ── La carta de la semana ──────────────────────────────────────────────── */

function SeccionCarta({ hoy, permitirFinDeSemana }: { hoy: string; permitirFinDeSemana: boolean }) {
  const [lunes, setLunes] = useState(() => lunesDeSemana(hoy));
  const consultar = useCallback(() => getMenuSemana(lunes), [lunes]);
  const { datos: semana, cargando, error, recargar } = usePeticion(consultar, [lunes]);

  /** Lo escrito por día, un plato por línea. Se llena al llegar la semana. */
  const [borrador, setBorrador] = useState<Record<string, string>>({});
  const [tocado, setTocado] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: string; mensaje: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  // El borrador se rehace cuando llega otra semana. `tocado` evita pisar lo
  // que se esté escribiendo si la consulta vuelve tarde.
  const claveSemana = semana?.map((d) => d.fecha).join('|') ?? '';
  const [claveCargada, setClaveCargada] = useState('');
  if (semana && claveSemana !== claveCargada) {
    setClaveCargada(claveSemana);
    setBorrador(Object.fromEntries(
      semana.map((dia) => [dia.fecha, dia.opciones.map((o) => o.nombre).join('\n')]),
    ));
    setTocado(false);
    setAviso(null);
  }

  async function guardar() {
    if (guardando || !semana) return;
    setAviso(null);
    setGuardando(true);
    try {
      await guardarMenuSemana(lunes, semana.map((dia) => ({
        fecha: dia.fecha,
        platos: (borrador[dia.fecha] ?? '').split('\n').map((p) => p.trim()).filter(Boolean),
      })));
      setAviso({ tipo: 'exito', mensaje: 'Carta de la semana publicada.' });
      setTocado(false);
      recargar();
    } catch (e) {
      // La escritura es atómica: si algo falló, NO se publicó ningún día. Se
      // dice explícitamente, porque lo contrario —media semana publicada— es
      // lo que quien lee un error da por hecho.
      setAviso({
        tipo: 'error',
        mensaje: `${(e as Error).message} No se publicó ningún día: la semana entra o no entra completa.`,
      });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="bloque-admin">
      <h2 className="seccion__titulo">Carta semanal</h2>

      <p className="nota-bloque">
        La carta es la misma para todas las cafeterías. Escribe un plato por
        línea y guarda la semana entera de una vez.
      </p>

      <div className="barra-semana">
        <div className="barra-semana__navegacion">
          <button type="button" className="boton boton--secundario boton--sm"
                  onClick={() => setLunes(sumarDias(lunes, -7))}
                  aria-label="Semana anterior">←</button>
          {/* aria-live: al cambiar de semana con las flechas, el rótulo es lo
              único que dice dónde se ha ido a parar. */}
          <p className="barra-semana__rotulo" aria-live="polite">
            {formatearFechaLarga(lunes)} — {formatearFechaLarga(sumarDias(lunes, 6))}
          </p>
          <button type="button" className="boton boton--secundario boton--sm"
                  onClick={() => setLunes(sumarDias(lunes, 7))}
                  aria-label="Semana siguiente">→</button>
          <button type="button" className="boton boton--secundario boton--sm"
                  onClick={() => setLunes(lunesDeSemana(hoy))}>
            Esta semana
          </button>
        </div>
        <div className="barra-semana__acciones">
          <button type="button" className="boton boton--primario"
                  onClick={() => void guardar()} disabled={guardando || !tocado}>
            {guardando ? 'Guardando…' : 'Guardar semana'}
          </button>
        </div>
      </div>

      {aviso && <p className={`aviso aviso--${aviso.tipo}`} role="status">{aviso.mensaje}</p>}

      {cargando && <BloqueEstado tipo="cargando" titulo="Cargando la carta…" />}
      {error && (
        <BloqueEstado tipo="error" titulo="No se pudo cargar la carta"
                      detalle={error} accion={{ texto: 'Reintentar', alPulsar: recargar }} />
      )}

      {semana && (
        <>
          <div className="rejilla-carta">
            {semana.map((dia) => {
              const habil = esDiaDeServicio(dia.fecha, permitirFinDeSemana);
              const clases = ['dia-carta'];
              if (dia.fecha === hoy) clases.push('dia-carta--hoy');
              if (!habil) clases.push('dia-carta--sin-servicio');
              return (
                <article className={clases.join(' ')} key={dia.fecha}>
                  <header className="dia-carta__cabecera">
                    <p className="dia-carta__dia">{nombreDiaCorto(dia.fecha)}</p>
                    <p className="dia-carta__fecha">
                      {formatearFechaCorta(dia.fecha)}{dia.fecha === hoy ? ' · hoy' : ''}
                    </p>
                  </header>
                  <textarea
                    className="campo__control dia-carta__area"
                    rows={5}
                    value={borrador[dia.fecha] ?? ''}
                    onChange={(e) => {
                      setBorrador({ ...borrador, [dia.fecha]: e.target.value });
                      setTocado(true);
                    }}
                    /* Sábado y domingo no llevan carta: el servidor devuelve
                       SIN_SERVICIO si se le manda una. Deshabilitarlo evita
                       escribir algo que no se va a poder guardar. */
                    disabled={!habil || guardando}
                    placeholder={habil ? 'Un plato por línea' : 'Sin servicio'}
                    aria-label={`Carta del ${formatearFechaLarga(dia.fecha)}`}
                  />
                </article>
              );
            })}
          </div>

          {tocado && (
            <p className="nota-bloque">Hay cambios sin guardar en esta semana.</p>
          )}
        </>
      )}
    </section>
  );
}
