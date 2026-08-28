/**
 * Administración: histórico, consolidados y catálogo.
 *
 * Las pestañas «Reservas» y «Consolidado» comparten UNA sola respuesta. Es la
 * decisión que da forma a esta pantalla: son dos maneras de mirar el mismo
 * filtro —el detalle y las sumas—, y `reservas.buscar` devuelve las dos cosas
 * juntas. Pedirlas por separado costaría un viaje entero cada vez que alguien
 * cambia de pestaña, para enseñar lo que ya estaba descargado.
 *
 * Lo que cambió con la migración: el pestillo. Antes, llegar aquí era pasar un
 * SHA-256 comparado en el navegador, y quien lo saltara con las herramientas
 * de desarrollo tenía acceso a todo el campus. Ahora esta ruta ni siquiera se
 * ofrece a un perfil de mostrador, y —lo que de verdad cuenta— las acciones
 * que usa no están en su lista de permisos del servidor.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  actualizarReserva, buscarReservas, cancelarReserva,
  type EstadoReserva, type Reserva, type ResumenReservas,
} from '../servicios/reservasServicio.js';
import { getCafeterias } from '../servicios/cafeteriasServicio.js';
import { getMenuDelDia, type OpcionMenu } from '../servicios/menuServicio.js';
import { usePeticion } from '../utiles/usePeticion.js';
import { useSesion } from '../contexto/Sesion.js';
import { aCSV, descargarTexto } from '../utiles/csv.js';
import { formatearTelefono } from '../utiles/telefono.js';
import { lunesDeSemana, sumarDias } from '../utiles/fechas.js';

import { BloqueEstado } from '../componentes/BloqueEstado.js';
import { ModalReserva, type DatosReserva } from '../componentes/ModalReserva.js';
import { ModalConfirmacion, type PeticionConfirmacion } from '../componentes/ModalConfirmacion.js';
import { ModalTicket } from '../componentes/ModalTicket.js';
import { TablaAdminReservas } from '../componentes/admin/TablaAdminReservas.js';
import { Consolidado } from '../componentes/admin/Consolidado.js';
import { Catalogo } from '../componentes/admin/Catalogo.js';
import { BarraSesion } from '../componentes/BarraSesion.js';
import { Pie } from '../componentes/Pie.js';

const ETIQUETAS: Record<string, string> = {
  presencial: 'Presencial',
  telefono: 'Teléfono',
  pagado: 'Pagado',
  debe: 'Debe',
};

type Pestana = 'reservas' | 'consolidado' | 'catalogo';

interface Filtros {
  desde: string;
  hasta: string;
  cafeteriaId: string;
  estado: EstadoReserva | '';
  texto: string;
}

/** Primer día del mes al que pertenece una fecha ISO. */
const primeroDelMes = (fechaISO: string) => `${fechaISO.slice(0, 8)}01`;

/** Traduce el desplegable de periodo a un par de fechas. */
function rangoDePeriodo(periodo: string, hoy: string): [string, string] | null {
  const lunes = lunesDeSemana(hoy);
  switch (periodo) {
    case 'hoy': return [hoy, hoy];
    case 'semana': return [lunes, sumarDias(lunes, 6)];
    case 'semana-pasada': {
      const lunesPasado = sumarDias(lunes, -7);
      return [lunesPasado, sumarDias(lunesPasado, 6)];
    }
    case '30': return [sumarDias(hoy, -29), hoy];
    case 'mes': return [primeroDelMes(hoy), hoy];
    case 'mes-pasado': {
      const finMesPasado = sumarDias(primeroDelMes(hoy), -1);
      return [primeroDelMes(finMesPasado), finMesPasado];
    }
    /**
     * «Todo el histórico» son seis meses, no todo.
     *
     * El servidor rechaza rangos de más de 366 días con RANGO_INVALIDO, así
     * que un «todo» literal fallaría siempre. Seis meses cubre cualquier
     * consulta que se haga de verdad, y es lo que hacía el original.
     */
    case 'todo': return [sumarDias(hoy, -180), hoy];
    default: return null; // personalizado: mandan las fechas escritas
  }
}

export function Admin() {
  const { contexto, salir } = useSesion();
  const hoy = contexto?.hoy ?? '';
  const permitirFinDeSemana = contexto?.permitirFinDeSemana ?? false;

  const [pestana, setPestana] = useState<Pestana>('reservas');

  const [periodo, setPeriodo] = useState('30');
  const [filtros, setFiltros] = useState<Filtros>(() => {
    const rango = rangoDePeriodo('30', hoy) ?? [hoy, hoy];
    return { desde: rango[0], hasta: rango[1], cafeteriaId: '', estado: '', texto: '' };
  });
  /** Los filtros que de verdad se consultaron. Separarlos de lo que hay
   *  escrito en la caja es lo que hace que la tabla no se rehaga con cada
   *  tecla y que «Aplicar» signifique algo. */
  const [aplicados, setAplicados] = useState<Filtros>(filtros);

  const [aviso, setAviso] = useState<{ tipo: string; mensaje: string } | null>(null);
  const [exportando, setExportando] = useState(false);

  const [enEdicion, setEnEdicion] = useState<Reserva | null>(null);
  const [menuDeLaReserva, setMenuDeLaReserva] = useState<OpcionMenu[]>([]);
  const [confirmacion, setConfirmacion] = useState<PeticionConfirmacion | null>(null);
  const [ticket, setTicket] = useState<Reserva | null>(null);
  const [versionCafeterias, setVersionCafeterias] = useState(0);

  /* ── Datos ────────────────────────────────────────────────────────────── */

  const consultarCafeterias = useCallback(
    () => getCafeterias({ incluirInactivas: true }), []);
  const { datos: cafeterias } = usePeticion(consultarCafeterias, [versionCafeterias]);

  const nombreCafeteria = useCallback(
    (id: string) => cafeterias?.find((c) => c.id === id)?.nombre ?? id,
    [cafeterias],
  );

  const consultarReservas = useCallback(
    () => buscarReservas(aplicados),
    [aplicados],
  );
  const { datos: resultado, cargando, error, recargar } = usePeticion<{
    total: number; reservas: Reserva[]; resumen: ResumenReservas;
  }>(consultarReservas, [aplicados]);

  /* ── Filtros ──────────────────────────────────────────────────────────── */

  function cambiarPeriodo(nuevo: string) {
    setPeriodo(nuevo);
    const rango = rangoDePeriodo(nuevo, hoy);
    if (rango) setFiltros((f) => ({ ...f, desde: rango[0], hasta: rango[1] }));
  }

  function aplicar() {
    if (!filtros.desde || !filtros.hasta) {
      setAviso({ tipo: 'aviso', mensaje: 'Indica las dos fechas del rango.' });
      return;
    }
    if (filtros.desde > filtros.hasta) {
      setAviso({ tipo: 'aviso', mensaje: 'La fecha inicial es posterior a la final.' });
      return;
    }
    setAviso(null);
    setAplicados(filtros);
  }

  function limpiar() {
    setPeriodo('30');
    const rango = rangoDePeriodo('30', hoy) ?? [hoy, hoy];
    const limpios: Filtros = {
      desde: rango[0], hasta: rango[1], cafeteriaId: '', estado: '', texto: '',
    };
    setFiltros(limpios);
    setAplicados(limpios);
    setAviso(null);
  }

  async function exportar() {
    if (exportando) return;
    setAviso(null);
    setExportando(true);
    try {
      // `limite: 0` para llevarse TODAS las filas del filtro, no las 500 que
      // se muestran: exportar una página en vez del reporte completo sería la
      // peor clase de error, porque el archivo parece correcto.
      const todo = await buscarReservas({ ...aplicados, limite: 0 });

      const csv = aCSV(
        ['N.º de reserva', 'Fecha', 'Cafetería', 'Nombre', 'Móvil', 'Menú del día',
         'Medio', 'Pago', 'Estado', 'Registrada'],
        todo.reservas.map((r) => [
          r.id,
          r.fecha,
          nombreCafeteria(r.cafeteriaId),
          r.nombre,
          formatearTelefono(r.telefono),
          r.menuNombre,
          // Etiqueta legible y no el valor interno: el CSV lo abre una persona
          // en Excel, no un programa.
          ETIQUETAS[r.medio] ?? '—',
          ETIQUETAS[r.pago] ?? '—',
          r.estado === 'activa' ? 'Activa' : 'Cancelada',
          new Date(r.timestamp).toLocaleString('es-CO'),
        ]),
      );

      descargarTexto(`reservas_${aplicados.desde}_a_${aplicados.hasta}.csv`, csv);
      setAviso({ tipo: 'exito', mensaje: `Exportadas ${todo.total} reservas.` });
    } catch (e) {
      setAviso({ tipo: 'error', mensaje: `No se pudo exportar: ${(e as Error).message}` });
    } finally {
      setExportando(false);
    }
  }

  /* ── Edición y cancelación ────────────────────────────────────────────── */

  /**
   * Abrir una reserva del histórico pide la carta DE SU DÍA y SU SEDE, no la
   * de hoy: editar una reserva del martes pasado solo puede ofrecer lo que
   * había en la carta de aquel martes, que es lo mismo que validará el
   * servidor.
   */
  async function abrirEdicion(reserva: Reserva) {
    try {
      setMenuDeLaReserva(await getMenuDelDia(reserva.cafeteriaId, reserva.fecha));
      setEnEdicion(reserva);
    } catch (e) {
      setAviso({ tipo: 'error', mensaje: `No se pudo abrir la reserva: ${(e as Error).message}` });
    }
  }

  async function guardar(datos: DatosReserva, reserva: Reserva | null) {
    if (!reserva) return;
    await actualizarReserva(reserva.id, datos);
    setAviso({ tipo: 'exito', mensaje: `Reserva de ${datos.nombre} actualizada.` });
    recargar();
  }

  /**
   * Cancelar SÍ se puede desde aquí: es la diferencia entre esta pantalla y la
   * de mostrador, y la razón de que administración exista.
   *
   * Devuelve una promesa que el modal espera: resuelve `true` si se canceló y
   * `false` si se dijo que no, y solo en el primer caso el modal se cierra.
   */
  function pedirCancelacion(reserva: Reserva): Promise<boolean> {
    return new Promise((resolver) => {
      setConfirmacion({
        titulo: `¿Cancelar la reserva de ${reserva.nombre}?`,
        detalle:
          `Reserva n.º ${reserva.id}, del ${reserva.fecha}. La reserva se marca como ` +
          'cancelada y deja de contar para la cocina. No se puede deshacer desde ninguna pantalla.',
        textoConfirmar: 'Cancelar la reserva',
        alConfirmar: async () => {
          try {
            await cancelarReserva(reserva.id);
            setAviso({ tipo: 'exito', mensaje: `Reserva de ${reserva.nombre} cancelada.` });
            recargar();
            resolver(true);
          } catch (e) {
            setAviso({ tipo: 'error', mensaje: (e as Error).message });
            resolver(false);
          }
        },
      });
      // Cerrar el diálogo sin confirmar también tiene que resolver, o el modal
      // de reserva se quedaría bloqueado esperando para siempre.
      setCerrarConfirmacion(() => () => { setConfirmacion(null); resolver(false); });
    });
  }

  const [cerrarConfirmacion, setCerrarConfirmacion] =
    useState<() => void>(() => () => setConfirmacion(null));

  /* ── Pintado ──────────────────────────────────────────────────────────── */

  const pestanas: { id: Pestana; texto: string }[] = useMemo(() => [
    { id: 'reservas', texto: 'Reservas' },
    { id: 'consolidado', texto: 'Consolidado' },
    { id: 'catalogo', texto: 'Catálogo' },
  ], []);

  return (
    <>
    <main className="contenedor pagina" id="contenido">
      {contexto?.perfil && (
        <BarraSesion
          perfil={contexto.perfil}
          alSalir={salir}
          volver={{ a: '/', texto: '← Ir a la pantalla de mostrador' }}
        />
      )}

      <section className="encabezado-admin">
        <h1 className="encabezado-admin__titulo">Administración</h1>
      </section>

      {/*
        El patrón nativo de ARIA: <nav> por fuera y role="tablist" en la lista
        de dentro, no en el <nav>. No es decoración — es lo que hace que un
        lector de pantalla anuncie cuántas pestañas hay y cuál está activa.
      */}
      <nav className="pestanas" aria-label="Secciones de administración">
        <div className="pestanas__lista" role="tablist">
        {pestanas.map((p) => (
          <button
            key={p.id}
            role="tab"
            type="button"
            id={`pestana-${p.id}`}
            aria-selected={pestana === p.id}
            aria-controls={`vista-${p.id}`}
            className={pestana === p.id ? 'pestana pestana--activa' : 'pestana'}
            onClick={() => setPestana(p.id)}
            /* Flechas para moverse entre pestañas: es lo que espera quien
               navega con teclado en un tablist, y sin esto el patrón ARIA
               queda a medias. */
            onKeyDown={(e) => {
              const i = pestanas.findIndex((x) => x.id === pestana);
              if (e.key === 'ArrowRight') {
                setPestana(pestanas[(i + 1) % pestanas.length]!.id);
              } else if (e.key === 'ArrowLeft') {
                setPestana(pestanas[(i - 1 + pestanas.length) % pestanas.length]!.id);
              }
            }}
          >
            {p.texto}
          </button>
        ))}
        </div>
      </nav>

      {/* Los filtros mandan sobre las dos primeras pestañas y no pintan nada
          en el catálogo, así que ahí se retiran en vez de quedarse inertes. */}
      {pestana !== 'catalogo' && (
        <form
          className="filtros"
          onSubmit={(e) => { e.preventDefault(); aplicar(); }}
        >
          <div className="filtros__campo filtros__campo--ancho">
            <label className="campo__etiqueta" htmlFor="filtro-periodo">Periodo</label>
            <select className="campo__control" id="filtro-periodo" value={periodo}
                    onChange={(e) => cambiarPeriodo(e.target.value)}>
              <option value="hoy">Hoy</option>
              <option value="semana">Esta semana</option>
              <option value="semana-pasada">Semana pasada</option>
              <option value="30">Últimos 30 días</option>
              <option value="mes">Este mes</option>
              <option value="mes-pasado">Mes pasado</option>
              <option value="todo">Todo el histórico</option>
              <option value="personalizado">Personalizado</option>
            </select>
          </div>

          <div className="filtros__campo">
            <label className="campo__etiqueta" htmlFor="filtro-desde">Desde</label>
            <input className="campo__control" id="filtro-desde" type="date" value={filtros.desde}
                   onChange={(e) => {
                     setPeriodo('personalizado');
                     setFiltros({ ...filtros, desde: e.target.value });
                   }} />
          </div>

          <div className="filtros__campo">
            <label className="campo__etiqueta" htmlFor="filtro-hasta">Hasta</label>
            <input className="campo__control" id="filtro-hasta" type="date" value={filtros.hasta}
                   onChange={(e) => {
                     setPeriodo('personalizado');
                     setFiltros({ ...filtros, hasta: e.target.value });
                   }} />
          </div>

          <div className="filtros__campo filtros__campo--ancho">
            <label className="campo__etiqueta" htmlFor="filtro-cafeteria">Cafetería</label>
            <select className="campo__control" id="filtro-cafeteria" value={filtros.cafeteriaId}
                    onChange={(e) => setFiltros({ ...filtros, cafeteriaId: e.target.value })}>
              <option value="">Todas</option>
              {cafeterias?.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>

          <div className="filtros__campo">
            <label className="campo__etiqueta" htmlFor="filtro-estado">Estado</label>
            <select className="campo__control" id="filtro-estado" value={filtros.estado}
                    onChange={(e) => setFiltros({ ...filtros, estado: e.target.value as EstadoReserva | '' })}>
              <option value="">Todos</option>
              <option value="activa">Activas</option>
              <option value="cancelada">Canceladas</option>
            </select>
          </div>

          <div className="filtros__campo filtros__campo--ancho">
            <label className="campo__etiqueta" htmlFor="filtro-texto">Nombre o móvil</label>
            <input className="campo__control" id="filtro-texto" type="search"
                   autoComplete="off" placeholder="Buscar…" value={filtros.texto}
                   onChange={(e) => setFiltros({ ...filtros, texto: e.target.value })} />
          </div>

          <div className="filtros__acciones">
            <button className="boton boton--primario" type="submit">Aplicar</button>
            <button className="boton boton--secundario" type="button" onClick={limpiar}>
              Limpiar
            </button>
            <button className="boton boton--secundario" type="button"
                    onClick={() => void exportar()} disabled={exportando}>
              {exportando ? 'Preparando…' : 'Exportar CSV'}
            </button>
          </div>
        </form>
      )}

      {aviso && <p className={`aviso aviso--${aviso.tipo}`} role="status">{aviso.mensaje}</p>}

      {pestana === 'reservas' && (
        <section id="vista-reservas" role="tabpanel" aria-labelledby="pestana-reservas">
          {cargando && <BloqueEstado tipo="cargando" titulo="Buscando reservas…" />}
          {error && (
            <BloqueEstado tipo="error" titulo="No se pudo completar la búsqueda"
                          detalle={error} accion={{ texto: 'Reintentar', alPulsar: recargar }} />
          )}
          {resultado && resultado.reservas.length === 0 && !cargando && (
            <BloqueEstado
              tipo="vacio"
              titulo="Ninguna reserva coincide con el filtro"
              detalle="Prueba a ampliar el rango de fechas o a quitar alguna condición."
            />
          )}
          {resultado && resultado.reservas.length > 0 && (
            <TablaAdminReservas
              reservas={resultado.reservas}
              total={resultado.total}
              nombreCafeteria={nombreCafeteria}
              alEditar={(r) => void abrirEdicion(r)}
              alVerTicket={(r) => setTicket(r)}
            />
          )}
        </section>
      )}

      {pestana === 'consolidado' && (
        <section id="vista-consolidado" role="tabpanel" aria-labelledby="pestana-consolidado">
          {cargando && <BloqueEstado tipo="cargando" titulo="Buscando reservas…" />}
          {error && (
            <BloqueEstado tipo="error" titulo="No se pudo completar la búsqueda"
                          detalle={error} accion={{ texto: 'Reintentar', alPulsar: recargar }} />
          )}
          {/* Se pinta con la MISMA respuesta que la tabla: cambiar de pestaña
              no cuesta un viaje. */}
          {resultado && !cargando && <Consolidado resumen={resultado.resumen} />}
        </section>
      )}

      {pestana === 'catalogo' && (
        <section id="vista-catalogo" role="tabpanel" aria-labelledby="pestana-catalogo">
          <Catalogo
            hoy={hoy}
            permitirFinDeSemana={permitirFinDeSemana}
            pedirConfirmacion={(p) => {
              setConfirmacion(p);
              setCerrarConfirmacion(() => () => setConfirmacion(null));
            }}
            alCambiarCafeterias={() => setVersionCafeterias((n) => n + 1)}
          />
        </section>
      )}

      <ModalReserva
        abierto={enEdicion !== null}
        menu={menuDeLaReserva}
        reserva={enEdicion}
        alCerrar={() => setEnEdicion(null)}
        alGuardar={guardar}
        alCancelar={pedirCancelacion}
      />

      <ModalConfirmacion peticion={confirmacion} alCerrar={cerrarConfirmacion} />

      {/* La sede sale del propio identificador de la reserva, no de la
          pantalla: aquí conviven cinco, y el ticket tiene que llevar el
          nombre de la suya. */}
      <ModalTicket
        reserva={ticket}
        cafeteria={ticket ? { nombre: nombreCafeteria(ticket.cafeteriaId) } : null}
        alCerrar={() => setTicket(null)}
      />
    </main>
    <Pie />
    </>
  );
}
