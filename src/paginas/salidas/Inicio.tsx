/**
 * La portada del control de salidas ES el cierre del día.
 *
 * Hubo una rejilla de tarjetas antes, copiada de las otras dos portadas, y
 * sobraba: allí hay que elegir a QUIÉN se le pide o DÓNDE se reserva, y aquí
 * no hay nada que elegir — el cierre del día son las cuatro cafeterías a la
 * vez, y verlas juntas es justamente el trabajo. Una pantalla de por medio
 * solo añadía un clic para llegar a lo mismo.
 *
 * ── Un viaje, no cuatro ───────────────────────────────────────────────────
 *
 * Quien ve el día entero lo pide con `salidas.dia`, que trae las cuatro sedes
 * con sus cifras de una vez. El mostrador no tiene esa acción —cruza sedes— y
 * además solo le toca la suya, así que pide `salidas.obtener` de su cafetería.
 * Los dos caminos acaban en el mismo mapa y el resto de la pantalla no
 * distingue cuál se usó.
 *
 * ── Al mostrador se le enseña SOLO la suya ────────────────────────────────
 *
 * Y no es cosmética: `sedePermitida` le impone su sede al guardar, así que un
 * bloque de otra cafetería habría guardado sus cifras en la propia, en
 * silencio y con pinta de correcto. La pantalla no lo ofrece y el servidor lo
 * rechaza — ver `exigirSede` en `acciones/salidas.ts`.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  getCierre, getDia, getProductosSalida,
} from '../../servicios/salidasServicio.js';
import { getCafeterias } from '../../servicios/cafeteriasServicio.js';
import { usePeticion } from '../../utiles/usePeticion.js';
import { CierreSede, type DatosSede } from '../../componentes/salidas/CierreSede.js';
import { NavSalidas } from '../../componentes/salidas/NavSalidas.js';
import { SelectorDia } from '../../componentes/salidas/SelectorDia.js';
import { BloqueEstado } from '../../componentes/BloqueEstado.js';
import { BarraVolver } from '../../componentes/BarraVolver.js';
import { Pie } from '../../componentes/Pie.js';
import { useHoy, useSesion } from '../../contexto/Sesion.js';
import { puede } from '../../servicios/capacidades.js';

export function Inicio() {
  const hoy = useHoy();
  const { contexto } = useSesion();
  const perfil = contexto?.perfil ?? null;
  const suSede = perfil?.cafeteriaId ?? null;
  const verTodas = puede(perfil?.rol, 'verDiaSalidas');

  const [fecha, setFecha] = useState(hoy);
  /** Sube al guardar cualquier bloque, para releer el día una sola vez. */
  const [version, setVersion] = useState(0);

  const consultarSedes = useCallback(() => getCafeterias(), []);
  const { datos: todasLasSedes, error: errorSedes } = usePeticion(consultarSedes, []);

  const consultarProductos = useCallback(
    () => getProductosSalida({ soloActivos: true }), [],
  );
  const { datos: productos, cargando, error, recargar } = usePeticion(consultarProductos, []);

  /*
   * Lo guardado de ese día, en un mapa por sede. Los dos caminos —el día
   * entero o el cierre de una sola— se normalizan aquí para que abajo no haya
   * que preguntar por el rol otra vez.
   */
  const consultarDatos = useCallback(async (): Promise<Record<string, DatosSede>> => {
    if (verTodas) {
      const dia = await getDia(fecha);
      return Object.fromEntries(dia.cafeterias.map((c) => [c.cafeteriaId, {
        cerrado: c.cerrado,
        responsableNombre: c.responsableNombre,
        lineas: c.lineas,
      }]));
    }
    if (!suSede) return {};
    const cierre = await getCierre(fecha, suSede);
    return cierre
      ? { [suSede]: { cerrado: true, responsableNombre: cierre.responsableNombre, lineas: cierre.lineas } }
      : {};
  }, [verTodas, suSede, fecha]);

  const { datos: guardado, recargar: recargarDatos } = usePeticion(
    consultarDatos, [verTodas, suSede, fecha, version],
  );

  /* Quien atiende una sede ve la suya y nada más. Se filtra por la sede del
     perfil y no por el rol: un rol nuevo sin sede las vería todas, que es lo
     correcto, sin tocar esta línea. */
  const sedes = useMemo(
    () => (todasLasSedes ?? []).filter((c) => !suSede || c.id === suSede),
    [todasLasSedes, suSede],
  );

  const alGuardar = useCallback(() => setVersion((n) => n + 1), []);

  const sinCerrar = sedes.filter((c) => !guardado?.[c.id]?.cerrado);

  return (
    <>
      <main className="contenedor pagina">
        <BarraVolver volver={{ a: '/', texto: '← Módulos' }} />

        <section className="encabezado-reserva">
          <div className="encabezado-reserva__texto">
            <div className="encabezado-reserva__linea">
              <h1 className="encabezado-reserva__titulo">Control de salidas</h1>
              {/* Sin la fecha larga: la dice el selector de abajo, y decirla
                  dos veces —una en cristiano y otra en el formato del
                  navegador— era lo que hacía leer «09/02/2026» como 9 de
                  febrero justo debajo de «2 de septiembre». */}
              <p className="encabezado-reserva__meta">
                {suSede ? 'Tu cafetería' : `${sedes.length} cafeterías`}
              </p>
            </div>
          </div>

          {/*
            El día va EN LA CABECERA, junto a los enlaces.

            Tuvo su propia `.filtros`, que es la caja blanca de los filtros del
            historial — pensada para cuatro o cinco campos. Con uno solo dentro
            se llevaba media pantalla para pedir una fecha, y empujaba las
            cuatro cafeterías por debajo del pliegue. Es la misma solución que
            ya usa `/salidas/dia/:fecha`.
          */}
          {/*
            Solo el día. Los enlaces del módulo los pone `NavSalidas`, que va
            en las cuatro pantallas.

            «Ver el día junto» ya no está aquí: ese nombre es el del formato de
            IMPRESIÓN, que sale del cierre del día y del historial, no de una
            barra de navegación. El resumen del día se abre pulsando su fila en
            el historial.
          */}
          <div className="filtros__acciones">
            <SelectorDia fecha={fecha} alCambiar={setFecha} />
            <NavSalidas />
          </div>
        </section>

        {cargando && <BloqueEstado tipo="cargando" titulo="Cargando…" />}

        {(error || errorSedes) && (
          <BloqueEstado
            tipo="error"
            titulo="No se pudo cargar el control"
            detalle={error ?? errorSedes ?? ''}
            accion={{ texto: 'Reintentar', alPulsar: recargar }}
          />
        )}

        {productos?.length === 0 && (
          <BloqueEstado
            tipo="vacio"
            titulo="No hay productos que controlar"
            detalle="Administración los da de alta en «Productos»."
          />
        )}

        {/* Lo que falta va arriba: un día con una sede sin cerrar no se puede
            dar por revisado, y eso se lee antes de mirar cifras. */}
        {guardado && sinCerrar.length > 0 && sedes.length > 1 && (
          <p className="aviso aviso--aviso" role="status">
            {sinCerrar.length === 1
              ? `Falta cerrar ${sinCerrar[0]!.nombre}.`
              : `Faltan ${sinCerrar.length}: ${sinCerrar.map((c) => c.nombre).join(', ')}.`}
          </p>
        )}

        {productos && productos.length > 0 && sedes.map((cafeteria) => (
          <CierreSede
            key={cafeteria.id}
            fecha={fecha}
            cafeteria={cafeteria}
            productos={productos}
            datos={guardado?.[cafeteria.id] ?? null}
            alGuardar={() => { alGuardar(); recargarDatos(); }}
          />
        ))}

        {sedes.length === 0 && todasLasSedes && (
          <BloqueEstado
            tipo="vacio"
            titulo="Tu cuenta no tiene una cafetería asignada"
            detalle="Un cierre de caja siempre es de una sede. Habla con administración."
          />
        )}
      </main>

      <Pie />
    </>
  );
}
