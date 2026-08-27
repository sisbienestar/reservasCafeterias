/**
 * La pantalla de mostrador. Registra, corrige y enseña el ticket.
 *
 * Es la que se usa todos los días, y toda su forma viene de una sola
 * restricción: hay alguien esperando al otro lado del mostrador. De ahí las
 * tres decisiones que la explican:
 *
 *  · Las consultas del arranque salen A LA VEZ. Antes iban en fila —la
 *    cafetería, luego la tabla, y la carta solo al pulsar el botón— y como
 *    cada una costaba un viaje entero, la página tardaba lo que suman las
 *    tres. Ninguna depende del resultado de las otras.
 *  · Abrir el formulario NO consulta nada: la carta ya está en memoria desde
 *    que cargó la pantalla. Ese era el retraso que se notaba al pulsar
 *    «Registrar reserva».
 *  · Al guardar, la tabla se actualiza con lo que DEVOLVIÓ el servidor, sin
 *    volver a pedirla. La relectura va por detrás, para recoger lo que hayan
 *    hecho otros.
 *
 * Que la carta pueda ser de hace unos minutos no abre ningún agujero: el
 * servidor valida el plato al guardar y responde MENU_INVALIDO si ya no está.
 * La pantalla puede ir un momento por detrás; los datos, nunca.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { getCafeteria, type Cafeteria } from '../servicios/cafeteriasServicio.js';
import { getMenuDelDia, type OpcionMenu } from '../servicios/menuServicio.js';
import {
  actualizarReserva, crearReserva, getReservasDelDia, type Reserva,
} from '../servicios/reservasServicio.js';

import { useSesion } from '../contexto/Sesion.js';
import { esDiaDeServicio, formatearFechaLarga } from '../utiles/fechas.js';
import { BloqueEstado } from '../componentes/BloqueEstado.js';
import { ResumenDelDia } from '../componentes/ResumenDelDia.js';
import { TablaReservas } from '../componentes/TablaReservas.js';
import { ModalReserva, type DatosReserva } from '../componentes/ModalReserva.js';
import { ModalTicket } from '../componentes/ModalTicket.js';
import { BarraSesion } from '../componentes/BarraSesion.js';
import { Pie } from '../componentes/Pie.js';

interface Aviso {
  tipo: 'exito' | 'aviso';
  mensaje: string;
  accion?: { texto: string; alPulsar: () => void };
}

export function Reserva() {
  const { cafeteriaId = '' } = useParams();
  const { contexto, salir } = useSesion();
  const hoy = contexto?.hoy ?? '';
  const permitirFinDeSemana = contexto?.permitirFinDeSemana ?? false;
  const diaHabil = hoy ? esDiaDeServicio(hoy, permitirFinDeSemana) : false;

  const [cafeteria, setCafeteria] = useState<Cafeteria | null>(null);
  const [menu, setMenu] = useState<OpcionMenu[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);

  const [cargando, setCargando] = useState(true);
  /** Fallo del que la pantalla no se recupera: no existe esa cafetería. */
  const [falloDePagina, setFalloDePagina] = useState<string | null>(null);
  /** Fallo solo de la tabla: la cabecera sigue siendo válida. */
  const [falloDeTabla, setFalloDeTabla] = useState<string | null>(null);

  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [ultimaReservaId, setUltimaReservaId] = useState<string | null>(null);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [enEdicion, setEnEdicion] = useState<Reserva | null>(null);
  const [ticket, setTicket] = useState<Reserva | null>(null);

  /**
   * Cuántas veces ha escrito esta pantalla desde que cargó.
   *
   * Resuelve una carrera concreta: se registra una reserva, sale el refresco
   * de fondo, y antes de que vuelva se registra otra. Ese refresco pidió la
   * tabla cuando la segunda todavía no existía, así que al llegar la
   * borraría de la pantalla. Comparando el sello de antes y el de después se
   * sabe que llega tarde y se descarta.
   */
  const escrituras = useRef(0);

  const anotarEscritura = useCallback((nuevas: Reserva[]) => {
    escrituras.current += 1;
    setReservas(nuevas);
  }, []);

  /* ── Arranque ───────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!cafeteriaId || !hoy) return;
    let vigente = true;

    setCargando(true);
    setFalloDePagina(null);
    setFalloDeTabla(null);

    // Las tres a la vez. `allSettled` y no `all` porque un fallo en la tabla
    // no debe impedir pintar la cabecera: son informaciones distintas y una
    // de ellas puede seguir sirviendo.
    Promise.allSettled([
      getCafeteria(cafeteriaId),
      diaHabil ? getReservasDelDia(cafeteriaId, hoy) : Promise.resolve([] as Reserva[]),
      diaHabil ? getMenuDelDia(cafeteriaId, hoy) : Promise.resolve([] as OpcionMenu[]),
    ]).then(([resCafeteria, resReservas, resMenu]) => {
      if (!vigente) return;

      if (resCafeteria.status === 'rejected') {
        setFalloDePagina((resCafeteria.reason as Error).message);
        setCargando(false);
        return;
      }
      setCafeteria(resCafeteria.value);
      document.title = `${resCafeteria.value.nombre} · Reservas UIS`;

      if (resReservas.status === 'fulfilled') setReservas(resReservas.value);
      else setFalloDeTabla((resReservas.reason as Error).message);

      if (resMenu.status === 'fulfilled') setMenu(resMenu.value);

      setCargando(false);
    });

    return () => { vigente = false; };
  }, [cafeteriaId, hoy, diaHabil]);

  /**
   * Vuelve a pedir la tabla y la carta, las dos a la vez.
   *
   * Van juntas porque tardan lo mismo en paralelo que una sola en serie, y así
   * la carta nunca envejece más de un refresco: si el administrador publica
   * un plato nuevo a media mañana, el mostrador lo tiene tras la siguiente
   * reserva sin haber pagado un viaje extra por ello.
   *
   * En segundo plano no muestra el «cargando» ni el error: la pantalla ya
   * enseña algo correcto y taparlo sería peor que no refrescar.
   */
  const refrescar = useCallback(async ({ enSegundoPlano = false } = {}) => {
    if (!cafeteriaId || !hoy) return;
    if (!enSegundoPlano) { setCargando(true); setFalloDeTabla(null); }

    const sello = escrituras.current;
    try {
      const [nuevasReservas, nuevoMenu] = await Promise.all([
        getReservasDelDia(cafeteriaId, hoy),
        getMenuDelDia(cafeteriaId, hoy),
      ]);

      // La carta se acepta siempre: no hay nada local con lo que pueda chocar.
      setMenu(nuevoMenu);

      // La tabla no, si mientras tanto se escribió: esta respuesta se pidió
      // antes de ese cambio y no lo incluye. Se queda la versión local, que sí
      // lo tiene, y el siguiente refresco pondrá todo de acuerdo.
      if (enSegundoPlano && sello !== escrituras.current) return;
      setReservas(nuevasReservas);
      setFalloDeTabla(null);
    } catch (error) {
      if (!enSegundoPlano) setFalloDeTabla((error as Error).message);
    } finally {
      if (!enSegundoPlano) setCargando(false);
    }
  }, [cafeteriaId, hoy]);

  /* ── Formulario ─────────────────────────────────────────────────────── */

  function abrirFormulario(reserva: Reserva | null) {
    setAviso(null);

    if (menu.length === 0) {
      setAviso({
        tipo: 'aviso',
        mensaje: 'Hoy no hay carta publicada, así que todavía no se pueden registrar reservas.',
      });
      return;
    }
    setEnEdicion(reserva);
    setModalAbierto(true);
  }

  /**
   * Se pasa al modal. Si lanza, el modal se queda abierto y muestra el
   * mensaje; si resuelve, el modal se cierra solo.
   */
  async function guardar(datos: DatosReserva, reserva: Reserva | null) {
    if (!cafeteria) return;

    if (reserva) {
      const actualizada = await actualizarReserva(reserva.id, datos);
      setUltimaReservaId(actualizada.id);

      const ultimo = actualizada.historial[actualizada.historial.length - 1];
      const cambios = ultimo?.cambios.length ?? 0;
      setAviso({
        tipo: 'exito',
        mensaje:
          `Reserva de ${actualizada.nombre} actualizada · ` +
          `${cambios} ${cambios === 1 ? 'cambio registrado' : 'cambios registrados'}.`,
      });

      // La fila se sustituye por la que devolvió el servidor —no por lo que el
      // formulario creía haber enviado—, así que la tabla sigue reflejando el
      // servidor sin pagar un viaje más.
      anotarEscritura(reservas.map((r) => (r.id === actualizada.id ? actualizada : r)));
    } else {
      const nueva = await crearReserva({ ...datos, cafeteriaId: cafeteria.id, fecha: hoy });
      setUltimaReservaId(nueva.id);
      anotarEscritura([...reservas, nueva]);

      // El ticket se OFRECE, no se impone: un diálogo que apareciera solo tras
      // cada reserva habría que cerrarlo veinte veces por servicio, y eso
      // deshace el trabajo que se hizo para que registrar fuese inmediato.
      setAviso({
        tipo: 'exito',
        mensaje: `Reserva registrada · ${nueva.nombre} · ${nueva.menuNombre}.`,
        accion: { texto: 'Ver ticket', alPulsar: () => setTicket(nueva) },
      });
    }

    void refrescar({ enSegundoPlano: true });
  }

  /* ── Pintado ────────────────────────────────────────────────────────── */

  if (falloDePagina) {
    return (
      <>
        <main className="contenedor pagina" id="contenido">
          <BloqueEstado tipo="error" titulo="No se encontró esa cafetería" detalle={falloDePagina}>
            <Link className="boton boton--secundario boton--sm" to="/">Volver al inicio</Link>
          </BloqueEstado>
        </main>
        <Pie />
      </>
    );
  }

  return (
    <>
    <main className="contenedor pagina" id="contenido">
      {/* El enlace de vuelta solo tiene sentido para quien puede elegir sede.
          Al mostrador, con una sola, lo llevaría a una lista de un elemento. */}
      {contexto && (
        <BarraSesion
          perfil={contexto.perfil}
          alSalir={salir}
          sede={cafeteria?.nombre}
          volver={contexto.perfil.rol === 'admin'
            ? { a: '/', texto: '← Todas las cafeterías' }
            : undefined}
        />
      )}

      {/*
        El orden es ubicación, nombre y fecha, y el botón va DENTRO de esta
        sección. `.encabezado-reserva` es una fila: el texto a la izquierda y
        la acción a la derecha. Sacar el botón a una franja de debajo lo
        dejaba suelto y descolocaba el bloque entero.
      */}
      <section className="encabezado-reserva">
        <div className="encabezado-reserva__texto">
          <p className="encabezado-reserva__ubicacion">{cafeteria?.ubicacion}</p>
          <h1 className="encabezado-reserva__titulo">{cafeteria?.nombre ?? '…'}</h1>
          <p className="encabezado-reserva__meta">{hoy && formatearFechaLarga(hoy)}</p>
        </div>
        {diaHabil && (
          <button
            type="button"
            className="boton boton--primario"
            onClick={() => abrirFormulario(null)}
            disabled={cargando || !cafeteria}
          >
            Registrar reserva
          </button>
        )}
      </section>

      {/*
        El interruptor de pruebas se anuncia en pantalla, y no solo en un
        comentario del código: si se queda encendido, el personal registraría
        reservas de fin de semana que la cocina no va a ver nunca. Ahora el
        valor viene del servidor, así que el aviso no puede desincronizarse de
        la regla que de verdad se aplica.
      */}
      {permitirFinDeSemana && (
        <p className="aviso aviso--aviso" role="status">
          MODO PRUEBAS: la regla de fin de semana está desactivada en el servidor.
          Pon PERMITIR_FIN_DE_SEMANA en «false» antes de usarlo de verdad.
        </p>
      )}

      {aviso && (
        <p className={`aviso aviso--${aviso.tipo}`} role="status">
          {aviso.mensaje}
          {aviso.accion && (
            <button type="button" className="aviso__accion" onClick={aviso.accion.alPulsar}>
              {aviso.accion.texto}
            </button>
          )}
        </p>
      )}

      {/*
        Fin de semana: en vez de una tabla vacía, la explicación. Sin esto
        quedaría un «Todavía no hay reservas para hoy · Usa Registrar reserva
        para anotar la primera», que invita a hacer algo que el servidor va a
        rechazar de todos modos.
      */}
      {!diaHabil && hoy ? (
        <BloqueEstado
          tipo="vacio"
          titulo="Hoy no hay servicio de almuerzo"
          detalle="Los sábados y domingos las cafeterías no prestan servicio, así que no se registran reservas."
        />
      ) : (
        <section className="bloque-tabla" aria-labelledby="titulo-tabla">
          <h2 className="seccion__titulo" id="titulo-tabla">Reservas de hoy</h2>

          {/*
            El consolidado va DENTRO de esta sección, no en una propia: habla
            de las mismas reservas que la tabla y lo cubre su mismo título.
          */}
          <ResumenDelDia reservas={reservas} />

          {cargando && <BloqueEstado tipo="cargando" titulo="Cargando reservas…" />}

          {!cargando && falloDeTabla && (
            <BloqueEstado
              tipo="error"
              titulo="No se pudieron cargar las reservas"
              detalle={falloDeTabla}
              accion={{ texto: 'Reintentar', alPulsar: () => void refrescar() }}
            />
          )}

          {!cargando && !falloDeTabla && reservas.length === 0 && (
            <BloqueEstado
              tipo="vacio"
              titulo="Todavía no hay reservas para hoy"
              detalle="Usa «Registrar reserva» para anotar la primera."
            />
          )}

          {!cargando && !falloDeTabla && reservas.length > 0 && (
            <TablaReservas
              reservas={reservas}
              idDestacado={ultimaReservaId}
              alEditar={(reserva) => abrirFormulario(reserva)}
              /* Desde la fila: es donde está cada reserva y donde se la busca
                 cuando alguien vuelve a pedir su comprobante. El aviso de
                 «reserva registrada» solo lo ofrece la primera vez. */
              alVerTicket={(reserva) => setTicket(reserva)}
            />
          )}
        </section>
      )}

      {/*
        Sin `alCancelar`: desde el mostrador NO se cancela. Aquí se corrige lo
        que se escuchó mal, pero anular una reserva es una decisión
        administrativa. Al no pasar el callback, el modal esconde el botón —y
        el servidor lo rechazaría igual, porque el rol `mostrador` no tiene
        `reservas.cancelar` entre sus permisos.
      */}
      <ModalReserva
        abierto={modalAbierto}
        menu={menu}
        reserva={enEdicion}
        alCerrar={() => setModalAbierto(false)}
        alGuardar={guardar}
      />

      <ModalTicket reserva={ticket} cafeteria={cafeteria} alCerrar={() => setTicket(null)} />
    </main>
    <Pie />
    </>
  );
}
