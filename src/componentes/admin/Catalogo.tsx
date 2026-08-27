/**
 * El catálogo: las cafeterías y la carta de la semana.
 *
 * Son las dos cosas que se administran y no se consultan, y están juntas
 * porque se tocan a la vez —se abre una sede nueva y se le ponen sus platos
 * fijos— y porque las dos son semanales o menos: nadie entra aquí a diario.
 */

import { useCallback, useState, type FormEvent } from 'react';
import {
  actualizarCafeteria, archivarCafeteria, crearCafeteria, getCafeterias,
  reactivarCafeteria, type Cafeteria,
} from '../../servicios/cafeteriasServicio.js';
import { getMenuSemana, guardarMenuSemana } from '../../servicios/menuServicio.js';
import { usePeticion } from '../../utiles/usePeticion.js';
import {
  esDiaDeServicio, formatearFechaCorta, formatearFechaLarga,
  lunesDeSemana, nombreDiaCorto, sumarDias,
} from '../../utiles/fechas.js';
import { BloqueEstado } from '../BloqueEstado.js';
import type { PeticionConfirmacion } from '../ModalConfirmacion.js';

interface Props {
  hoy: string;
  permitirFinDeSemana: boolean;
  pedirConfirmacion: (peticion: PeticionConfirmacion) => void;
  /** Para que la pantalla de reservas se entere de un alta o un archivado. */
  alCambiarCafeterias: () => void;
}

export function Catalogo({ hoy, permitirFinDeSemana, pedirConfirmacion, alCambiarCafeterias }: Props) {
  return (
    <div className="catalogo">
      <SeccionCafeterias
        pedirConfirmacion={pedirConfirmacion}
        alCambiar={alCambiarCafeterias}
      />
      <SeccionCarta hoy={hoy} permitirFinDeSemana={permitirFinDeSemana} />
    </div>
  );
}

/* ── Cafeterías ─────────────────────────────────────────────────────────── */

function SeccionCafeterias({ pedirConfirmacion, alCambiar }: {
  pedirConfirmacion: (p: PeticionConfirmacion) => void;
  alCambiar: () => void;
}) {
  const consultar = useCallback(() => getCafeterias({ incluirInactivas: true }), []);
  const { datos: cafeterias, cargando, error, recargar } = usePeticion(consultar, []);

  /** `null` = el formulario está en modo alta. */
  const [editando, setEditando] = useState<Cafeteria | null>(null);
  const [nombre, setNombre] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  /** Un plato fijo por línea. Es la forma más directa de editar una lista
   *  corta de texto libre, y no hace falta enseñar a usarla. */
  const [platosFijos, setPlatosFijos] = useState('');
  const [aviso, setAviso] = useState<{ tipo: string; mensaje: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  function empezarEdicion(cafeteria: Cafeteria) {
    setEditando(cafeteria);
    setNombre(cafeteria.nombre);
    setUbicacion(cafeteria.ubicacion);
    setPlatosFijos(cafeteria.platosFijos.join('\n'));
    setAviso(null);
  }

  function terminarEdicion() {
    setEditando(null);
    setNombre('');
    setUbicacion('');
    setPlatosFijos('');
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    if (guardando) return;

    setAviso(null);
    setGuardando(true);
    const datos = {
      nombre: nombre.trim(),
      ubicacion: ubicacion.trim(),
      platosFijos: platosFijos.split('\n').map((p) => p.trim()).filter(Boolean),
    };

    try {
      if (editando) {
        await actualizarCafeteria(editando.id, datos);
        setAviso({ tipo: 'exito', mensaje: `«${datos.nombre}» actualizada.` });
      } else {
        const nueva = await crearCafeteria(datos);
        setAviso({
          tipo: 'exito',
          mensaje: `«${nueva.nombre}» creada con el código ${nueva.codigo}.`,
        });
      }
      terminarEdicion();
      recargar();
      alCambiar();
    } catch (e) {
      setAviso({ tipo: 'error', mensaje: (e as Error).message });
    } finally {
      setGuardando(false);
    }
  }

  /**
   * Archivar es un borrado lógico y aun así se confirma: la sede desaparece
   * del inicio y del mostrador, y quien la archive por error puede tardar en
   * enterarse. Reactivar no se confirma — no destruye nada.
   */
  function pedirArchivar(cafeteria: Cafeteria) {
    pedirConfirmacion({
      titulo: `¿Archivar «${cafeteria.nombre}»?`,
      detalle:
        'Dejará de aparecer en el inicio y no se podrán registrar reservas en ella. ' +
        'Sus reservas históricas se conservan y se puede reactivar cuando haga falta.',
      textoConfirmar: 'Archivar',
      alConfirmar: async () => {
        try {
          await archivarCafeteria(cafeteria.id);
          setAviso({ tipo: 'exito', mensaje: `«${cafeteria.nombre}» archivada.` });
          recargar();
          alCambiar();
        } catch (e) {
          setAviso({ tipo: 'error', mensaje: (e as Error).message });
        }
      },
    });
  }

  async function reactivar(cafeteria: Cafeteria) {
    try {
      await reactivarCafeteria(cafeteria.id);
      setAviso({ tipo: 'exito', mensaje: `«${cafeteria.nombre}» vuelve a estar en servicio.` });
      recargar();
      alCambiar();
    } catch (e) {
      setAviso({ tipo: 'error', mensaje: (e as Error).message });
    }
  }

  return (
    <section className="bloque-admin">
      <h2 className="seccion__titulo">Cafeterías</h2>

      {aviso && <p className={`aviso aviso--${aviso.tipo}`} role="status">{aviso.mensaje}</p>}

      <form className="formulario-catalogo" onSubmit={guardar} noValidate>
        <div className="filtros__campo filtros__campo--ancho">
          <label className="campo__etiqueta" htmlFor="cafeteria-nombre">Nombre</label>
          <input className="campo__control" id="cafeteria-nombre" type="text"
                 autoComplete="off" placeholder="Cafetería de Salud"
                 value={nombre} onChange={(e) => setNombre(e.target.value)}
                 required disabled={guardando} />
        </div>

        <div className="filtros__campo filtros__campo--ancho">
          <label className="campo__etiqueta" htmlFor="cafeteria-ubicacion">Ubicación</label>
          <input className="campo__control" id="cafeteria-ubicacion" type="text"
                 autoComplete="off" placeholder="Facultad de Salud · Primer piso"
                 value={ubicacion} onChange={(e) => setUbicacion(e.target.value)}
                 disabled={guardando} />
        </div>

        <div className="filtros__campo filtros__campo--ancho">
          <label className="campo__etiqueta" htmlFor="cafeteria-fijos">Platos fijos</label>
          <textarea className="campo__control" id="cafeteria-fijos" rows={3} spellCheck={false}
                    placeholder="Uno por línea. Se ofrecen todos los días."
                    value={platosFijos} onChange={(e) => setPlatosFijos(e.target.value)}
                    disabled={guardando} />
        </div>

        {/* El identificador y el código no se editan, y se dice por qué: son
            la clave con la que las reservas históricas apuntan aquí. */}
        {editando && (
          <p className="campo__ayuda">
            Identificador <code>{editando.id}</code> · código <code>{editando.codigo}</code>.
            No se pueden cambiar: las reservas ya registradas apuntan a ellos.
          </p>
        )}

        <div className="filtros__acciones">
          <button type="submit" className="boton boton--primario" disabled={guardando}>
            {editando ? 'Guardar cambios' : 'Añadir cafetería'}
          </button>
          {editando && (
            <button type="button" className="boton boton--secundario"
                    onClick={terminarEdicion} disabled={guardando}>
              Cancelar edición
            </button>
          )}
        </div>
      </form>

      {cargando && <BloqueEstado tipo="cargando" titulo="Cargando cafeterías…" />}
      {error && (
        <BloqueEstado tipo="error" titulo="No se pudo cargar el catálogo"
                      detalle={error} accion={{ texto: 'Reintentar', alPulsar: recargar }} />
      )}

      {cafeterias && (
        <div className="tabla-envoltorio">
          <table className="tabla tabla--admin">
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Nombre</th>
                <th scope="col">Ubicación</th>
                <th scope="col">Platos fijos</th>
                <th scope="col">Estado</th>
                <th scope="col"><span className="visualmente-oculto">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {cafeterias.map((cafeteria) => (
                <tr key={cafeteria.id}
                    className={cafeteria.activa ? 'tabla__fila' : 'tabla__fila tabla__fila--apagada'}>
                  <td><code>{cafeteria.codigo}</code></td>
                  <td className="tabla__nombre">{cafeteria.nombre}</td>
                  <td>{cafeteria.ubicacion || <span className="tabla__vacio">—</span>}</td>
                  <td>{cafeteria.platosFijos.length}</td>
                  <td>
                    <span className={`marca-estado marca-estado--${cafeteria.activa ? 'activa' : 'cancelada'}`}>
                      {cafeteria.activa ? 'En servicio' : 'Archivada'}
                    </span>
                  </td>
                  <td className="tabla__acciones">
                    <button type="button" className="boton boton--secundario boton--sm"
                            onClick={() => empezarEdicion(cafeteria)}>
                      Editar
                    </button>
                    {cafeteria.activa ? (
                      <button type="button" className="boton boton--secundario boton--sm"
                              onClick={() => pedirArchivar(cafeteria)}>
                        Archivar
                      </button>
                    ) : (
                      <button type="button" className="boton boton--secundario boton--sm"
                              onClick={() => void reactivar(cafeteria)}>
                        Reactivar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
