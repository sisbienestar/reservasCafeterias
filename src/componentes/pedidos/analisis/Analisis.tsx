/**
 * La sección de análisis del panel de pedidos.
 *
 * Seis lecturas de lo mismo, un solo juego de filtros y una sola consulta.
 *
 * ── Por qué los filtros viven aquí y no en cada vista ────────────────────
 *
 * Porque cambiar de vista NO debe recortar de nuevo. La administradora fija
 * un rango y un proveedor y luego mira el mismo recorte por sedes, por
 * tiempo, por producto… Si cada vista guardara sus filtros, cambiar de
 * pestaña los perdería y la comparación entre vistas dejaría de ser válida:
 * se estaría comparando marzo de una con el semestre de otra.
 *
 * Y por eso también las vistas se montan y desmontan pero los datos NO se
 * vuelven a pedir: `usePeticion` depende de los filtros, no de la pestaña.
 * Es lo contrario de lo que hace el resto del panel —donde cada sección
 * vuelve a consultar al entrar, porque administrar es corregir y volver a
 * mirar— y es a propósito: aquí no se corrige nada, se lee.
 *
 * La consulta trae las seis vistas de golpe. Ver la cabecera de
 * `13-analisis-pedidos.sql`: los agregados son pequeños aunque el detalle del
 * que salen sean miles de renglones, y partirlo en seis acciones habría hecho
 * seis viajes por cada fecha que se toca.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCafeterias } from '../../../servicios/cafeteriasServicio.js';
import { getProveedores } from '../../../servicios/proveedoresServicio.js';
import {
  analizarPedidos, type FiltrosAnalisis, type Granularidad,
} from '../../../servicios/analisisServicio.js';
import { hoyISO, sumarDias } from '../../../utiles/fechas.js';
import { usePeticion } from '../../../utiles/usePeticion.js';
import { Indicador } from '../../graficas/index.js';
import { Filtros } from './Filtros.js';
import { VistaSedes } from './VistaSedes.js';
import { VistaTendencia, DIAS_PARA_SEMANA } from './VistaTendencia.js';
import { VistaProductos } from './VistaProductos.js';
import { VistaEstacionalidad } from './VistaEstacionalidad.js';
import { VistaComposicion } from './VistaComposicion.js';
import { VistaConsistencia } from './VistaConsistencia.js';
import { numero, type Medida } from './comunes.js';

type Vista = 'sedes' | 'tendencia' | 'productos' | 'estacionalidad' | 'composicion' | 'consistencia';

const VISTAS: { id: Vista; texto: string }[] = [
  { id: 'sedes', texto: 'Por cafetería' },
  { id: 'tendencia', texto: 'Tendencia' },
  { id: 'productos', texto: 'Productos' },
  { id: 'estacionalidad', texto: 'Estacionalidad' },
  { id: 'composicion', texto: 'Composición' },
  { id: 'consistencia', texto: 'Consistencia' },
];

/** Medio año hacia atrás: cubre un semestre académico entero, que es la
 *  unidad en la que se piensa el consumo de las cafeterías. */
const DIAS_POR_DEFECTO = 180;

function filtrosIniciales(): FiltrosAnalisis {
  const hasta = hoyISO();
  return {
    desde: sumarDias(hasta, -DIAS_POR_DEFECTO),
    hasta,
    cafeteriaId: '',
    proveedorId: '',
    categoria: '',
    productoId: 0,
    top: 20,
    diasDesuso: 90,
    granularidad: 'mes',
  };
}

export function Analisis() {
  const [vista, setVista] = useState<Vista>('sedes');
  const [filtros, setFiltros] = useState<FiltrosAnalisis>(filtrosIniciales);

  /*
   * La medida es una preferencia de LECTURA, no un filtro: se comparte entre
   * las vistas que la ofrecen para que cambiarla en una no obligue a
   * cambiarla en la siguiente. Arranca en renglones, que es la única medida
   * que nunca miente al cruzar productos de unidades distintas; quien quiera
   * cantidades las pide, y entonces sale el aviso si procede.
   */
  const [medida, setMedida] = useState<Medida>('lineas');

  const catalogos = usePeticion(
    () => Promise.all([getCafeterias({ incluirInactivas: true }), getProveedores({ incluirInactivos: true })]),
    [],
  );

  const analisis = usePeticion(
    () => analizarPedidos(filtros),
    [
      filtros.desde, filtros.hasta, filtros.cafeteriaId, filtros.proveedorId,
      filtros.categoria, filtros.productoId, filtros.top, filtros.diasDesuso,
      filtros.granularidad,
    ],
  );

  const cambiar = useCallback((cambio: Partial<FiltrosAnalisis>) => {
    setFiltros((previos) => {
      const nuevos = { ...previos, ...cambio };
      /* Un rango largo no se puede ver por semana: serían más columnas de las
       * que caben. Si el cambio de fechas lo alarga, la granularidad vuelve a
       * mes sola, en vez de dejar una consulta que no se puede dibujar. */
      const dias = Math.round(
        (Date.parse(`${nuevos.hasta}T12:00:00`) - Date.parse(`${nuevos.desde}T12:00:00`))
        / 86_400_000,
      ) + 1;
      if (dias > DIAS_PARA_SEMANA) nuevos.granularidad = 'mes';
      return nuevos;
    });
  }, []);

  const limpiar = useCallback(() => {
    setFiltros((previos) => ({
      ...previos, cafeteriaId: '', proveedorId: '', categoria: '', productoId: 0,
    }));
  }, []);

  /*
   * ¿Se ha ido ya el principio de la página por arriba?
   *
   * Cuando sí, la barra de cifras y pestañas —que está pegada bajo la
   * cabecera— se encoge para devolver alto a los datos. Se detecta con un
   * centinela de un píxel colocado ANTES de la barra y un IntersectionObserver
   * y no escuchando `scroll`: el evento de scroll dispara en cada píxel y
   * obligaría a leer la posición del elemento en cada uno, que es justo el
   * patrón que provoca recálculos de estilo a 60 por segundo. El observador
   * avisa dos veces: al salir y al volver a entrar.
   *
   * Si el navegador no lo trae, no pasa nada: la barra se queda en su tamaño
   * normal y sigue pegada, que es la parte que importa.
   */
  const centinela = useRef<HTMLDivElement>(null);
  const [compacta, setCompacta] = useState(false);

  useEffect(() => {
    const nodo = centinela.current;
    if (!nodo || typeof IntersectionObserver === 'undefined') return;

    const observador = new IntersectionObserver(
      ([entrada]) => setCompacta(!entrada?.isIntersecting),
      // El margen superior descuenta la cabecera: sin él la barra se
      // encogería un poco tarde, cuando el centinela ya está tapado por ella.
      { rootMargin: '-67px 0px 0px 0px', threshold: 0 },
    );
    observador.observe(nodo);
    return () => observador.disconnect();
  }, []);

  /*
   * Al cambiar de vista, volver al principio del panel.
   *
   * Es lo que más se notaba: las vistas miden cosas muy distintas —«Tendencia»
   * son siete filas y «Productos» ciento noventa— así que cambiar de pestaña
   * a media página dejaba la ventana a una altura que en la vista nueva no
   * corresponde a nada, o el navegador la recortaba de golpe al ser el
   * contenido más corto. Las dos cosas se leen como que la pantalla se rompe.
   *
   * Se sube hasta justo debajo de la barra fija, no al cero absoluto: los
   * filtros no hacen falta para leer y así la primera pantalla es ya datos.
   */
  const panel = useRef<HTMLDivElement>(null);
  const primeraVista = useRef(true);

  useEffect(() => {
    if (primeraVista.current) { primeraVista.current = false; return; }
    const nodo = panel.current;
    if (!nodo) return;

    const barra = nodo.previousElementSibling?.getBoundingClientRect().height ?? 0;
    const arriba = nodo.getBoundingClientRect().top + window.scrollY
      - barra - parseFloat(getComputedStyle(document.documentElement)
        .getPropertyValue('--alto-cabecera') || '67');

    // Solo si estamos MÁS abajo: si ya se ve el principio del panel, mover la
    // página sería un salto gratuito.
    if (window.scrollY > arriba) {
      window.scrollTo({ top: Math.max(arriba, 0), behavior: 'smooth' });
    }
  }, [vista]);

  /** Flechas entre vistas, como en las pestañas del panel. */
  const alTeclear = useCallback((evento: React.KeyboardEvent) => {
    if (evento.key !== 'ArrowRight' && evento.key !== 'ArrowLeft') return;
    evento.preventDefault();
    const i = VISTAS.findIndex((v) => v.id === vista);
    const salto = evento.key === 'ArrowRight' ? 1 : VISTAS.length - 1;
    setVista(VISTAS[(i + salto) % VISTAS.length]!.id);
  }, [vista]);

  const [cafeterias, proveedores] = catalogos.datos ?? [[], []];
  const datos = analisis.datos;

  /* Los productos del autocompletado salen de la última respuesta. Se
   * conservan mientras se recarga para que el campo no se vacíe a media
   * escritura. */
  const productos = useMemo(() => datos?.productosDisponibles ?? [], [datos]);

  return (
    <>
      <Filtros
        filtros={filtros}
        alCambiar={cambiar}
        alLimpiar={limpiar}
        cafeterias={cafeterias}
        proveedores={proveedores}
        productos={productos}
        cargando={analisis.cargando}
      />

      {analisis.error && (
        <p className="aviso aviso--error" role="alert">
          {analisis.error}{' '}
          <button type="button" className="aviso__accion" onClick={analisis.recargar}>
            Reintentar
          </button>
        </p>
      )}

      {/* El centinela: en cuanto se va por arriba, la barra se encoge. */}
      <div ref={centinela} className="analisis__centinela" aria-hidden="true" />

      {/*
        Las cifras y las pestañas van JUNTAS en la barra pegada, no solo las
        cifras. Si se fijaran únicamente los números, las pestañas se irían
        por arriba y cambiar de vista obligaría a subir del todo — que es
        justo el desplazamiento que fijar la barra venía a ahorrar.
      */}
      <div className={compacta ? 'analisis__fijo analisis__fijo--compacta' : 'analisis__fijo'}>
        {datos && (
          <div className="rejilla-indicadores">
            <Indicador rotulo="Pedidos" valor={numero(datos.resumen.pedidos)}
                       detalle="confirmados en el rango" />
            <Indicador rotulo="Renglones" valor={numero(datos.resumen.lineas)}
                       detalle="líneas de producto" />
            <Indicador rotulo="Productos" valor={numero(datos.resumen.productos)}
                       detalle="distintos pedidos" />
            <Indicador rotulo="Proveedores" valor={numero(datos.resumen.proveedores)}
                       detalle={`en ${numero(datos.resumen.sedes)} ${datos.resumen.sedes === 1 ? 'cafetería' : 'cafeterías'}`} />
          </div>
        )}

        <nav className="pestanas" aria-label="Vistas del análisis">
          <div className="pestanas__lista" role="tablist">
            {VISTAS.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                id={`vista-${v.id}`}
                aria-selected={vista === v.id}
                aria-controls={`panel-vista-${v.id}`}
                className={vista === v.id ? 'pestana pestana--activa' : 'pestana'}
                tabIndex={vista === v.id ? 0 : -1}
                onKeyDown={alTeclear}
                onClick={() => setVista(v.id)}
              >
                {v.texto}
              </button>
            ))}
          </div>
        </nav>
      </div>

      <div
        ref={panel}
        id={`panel-vista-${vista}`}
        role="tabpanel"
        aria-labelledby={`vista-${vista}`}
        aria-busy={analisis.cargando}
      >
        {analisis.cargando && !datos && (
          <p className="grafica__vacio" role="status">Consultando el histórico…</p>
        )}

        {datos && (
          /* La rejilla reparte los bloques: los que caben a media pantalla se
             emparejan y los anchos se quedan la fila entera. Ver `Bloque`. */
          <div className="analisis-rejilla">
            {vista === 'sedes' && (
              <VistaSedes datos={datos} medida={medida} alCambiarMedida={setMedida} />
            )}
            {vista === 'tendencia' && (
              <VistaTendencia
                datos={datos} medida={medida} alCambiarMedida={setMedida}
                alCambiarGranularidad={(g: Granularidad) => cambiar({ granularidad: g })}
              />
            )}
            {vista === 'productos' && (
              <VistaProductos
                datos={datos}
                top={filtros.top} alCambiarTop={(n) => cambiar({ top: n })}
                diasDesuso={filtros.diasDesuso} alCambiarDesuso={(n) => cambiar({ diasDesuso: n })}
              />
            )}
            {vista === 'estacionalidad' && (
              <VistaEstacionalidad datos={datos} medida={medida} alCambiarMedida={setMedida} />
            )}
            {vista === 'composicion' && <VistaComposicion datos={datos} />}
            {vista === 'consistencia' && <VistaConsistencia datos={datos} />}
          </div>
        )}
      </div>

      <p className="tabla__nota">
        Todas las cifras cuentan <strong>solo pedidos confirmados</strong>. Los
        borradores todavía se están escribiendo y los anulados no llegaron a
        despacharse; incluirlos inflaría el consumo con papel que nadie sirvió.
      </p>
    </>
  );
}
