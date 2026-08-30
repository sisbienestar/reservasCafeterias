/**
 * Las piezas que comparten las seis vistas del análisis.
 *
 * Aquí vive la decisión más importante de toda la sección, y conviene leerla
 * antes que el código:
 *
 * ── SUMAR CANTIDADES ENTRE PRODUCTOS DISTINTOS NO SIGNIFICA NADA ─────────
 *
 * Coca-Cola se pide en BANDEJA, Neofrut en LIBRAS y Rapifritos en UNIDAD.
 * «340» de la suma de las tres no es una magnitud: es la suma de tres cosas
 * que no comparten unidad, y presentarla como un total invita a decidir sobre
 * un número que no existe.
 *
 * Por eso cada vista elige su medida a conciencia:
 *
 *   · dentro de UN producto  → `cantidad`, que sí tiene unidad y es la que
 *                              contesta «¿cuánto pedimos de esto?»
 *   · cruzando productos     → `lineas` y `pedidos`, que no tienen unidad
 *   · cuando cantidad se ofrece igualmente (tendencia, estacionalidad) va con
 *     un selector de medida y, si en el filtro hay más de una unidad, con el
 *     aviso de abajo. No se esconde el número: se dice qué es.
 */

import type { ReactNode } from 'react';

/**
 * Bloque con título, nota y contenido. Mismo formato que `Consolidado.tsx`.
 *
 * `ancho` decide si el bloque comparte fila con otro o se queda la fila
 * entera. Por defecto comparte —que es lo que mete más información en
 * pantalla— y se marca «completo» solo cuando el contenido lo pide de verdad:
 * una tabla de ocho columnas o un mapa de calor a media pantalla no se leen,
 * se desplazan, y un dato al que hay que arrastrar para llegar es un dato que
 * no se mira.
 */
export function Bloque({ titulo, nota, acciones, ancho = 'medio', children }: {
  titulo: string;
  nota?: ReactNode;
  /** Controles del propio bloque: el selector de medida, el top N… */
  acciones?: ReactNode;
  ancho?: 'medio' | 'completo';
  children: ReactNode;
}) {
  return (
    <section className={ancho === 'completo'
      ? 'bloque-consolidado bloque-consolidado--completo'
      : 'bloque-consolidado'}>
      <div className="bloque-consolidado__cabecera">
        <h3 className="bloque-consolidado__titulo">{titulo}</h3>
        {acciones && <div className="bloque-consolidado__acciones">{acciones}</div>}
      </div>
      {nota && <p className="bloque-consolidado__nota">{nota}</p>}
      {children}
    </section>
  );
}

/** La pregunta que contesta la vista, en la cabecera de la pestaña. */
export function Pregunta({ children }: { children: ReactNode }) {
  return <p className="analisis__pregunta">{children}</p>;
}

/**
 * Las tres medidas posibles. `cantidad` es la única con unidad, y por eso la
 * única que puede quedar mal al cruzar productos.
 */
export type Medida = 'cantidad' | 'lineas' | 'pedidos';

export const ROTULO_MEDIDA: Record<Medida, string> = {
  cantidad: 'Cantidad pedida',
  lineas: 'Renglones',
  pedidos: 'Pedidos',
};

export function SelectorMedida({ id, valor, alCambiar }: {
  id: string; valor: Medida; alCambiar: (m: Medida) => void;
}) {
  return (
    <div className="campo campo--enlinea">
      <label className="campo__etiqueta" htmlFor={id}>Medida</label>
      <select id={id} className="campo__control campo__control--sm" value={valor}
              onChange={(e) => alCambiar(e.target.value as Medida)}>
        {(Object.keys(ROTULO_MEDIDA) as Medida[]).map((m) => (
          <option key={m} value={m}>{ROTULO_MEDIDA[m]}</option>
        ))}
      </select>
    </div>
  );
}

/**
 * El aviso de unidades mezcladas.
 *
 * Solo aparece cuando de verdad estorba: si en el filtro activo hay una sola
 * unidad de medida, sumar cantidades es perfectamente correcto y el aviso
 * sobraría. Se lo enseña la vista únicamente cuando la medida elegida es
 * `cantidad`.
 */
export function AvisoUnidades({ unidades, medida }: { unidades: number; medida: Medida }) {
  if (medida !== 'cantidad' || unidades <= 1) return null;
  return (
    <p className="aviso aviso--aviso" role="status">
      En este filtro conviven <strong>{unidades} unidades de medida</strong> distintas
      (bandejas, libras, unidades…). La suma de cantidades mezcla unidades y no
      es una magnitud comparable: para comparar entre productos o proveedores,
      cambia la medida a <em>Renglones</em> o <em>Pedidos</em>, o filtra por un
      proveedor concreto.
    </p>
  );
}

/** Una cifra con separador de miles, y sin decimales si no los tiene. */
export function numero(valor: number): string {
  return valor.toLocaleString('es-CO', { maximumFractionDigits: 2 });
}

/** Porcentaje con signo, para las variaciones. */
export function variacion(fraccion: number | null): string {
  if (fraccion === null) return '—';
  const porcentaje = fraccion * 100;
  const signo = porcentaje > 0 ? '+' : '';
  return `${signo}${porcentaje.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`;
}

/**
 * Rótulo de un periodo, según con qué grano viene.
 *
 * Un periodo es siempre la fecha del PRIMER día del tramo —el 1 del mes, el
 * lunes de la semana—, así que hay que decir de qué tramo se trata: «ago» a
 * secas sobre una serie semanal se leería como el mes entero.
 */
export function rotularPeriodo(iso: string, grano: 'dia' | 'semana' | 'mes'): string {
  // Se construye en UTC: `new Date('2026-08-01')` es medianoche UTC y en
  // Colombia (UTC−5) cae el 31 de julio, que rotularía el mes anterior.
  const fecha = new Date(`${iso}T12:00:00`);
  if (grano === 'mes') {
    return fecha.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' });
  }
  const corta = fecha.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
  return grano === 'semana' ? `sem. ${corta}` : corta;
}

/** ISO 1–7 → nombre. El servidor manda ISODOW: la semana empieza en lunes. */
export const DIAS_SEMANA = [
  '', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo',
];

/**
 * Envoltorio de tabla. Todas las gráficas de la sección van con la suya: la
 * gráfica da la forma de un vistazo y la tabla da el valor exacto, que es el
 * que se copia a un informe — y es lo que hace la pantalla utilizable con
 * lector de pantalla, donde un SVG no dice nada.
 */
export function Tabla({ children, minimo, alto }: {
  children: ReactNode;
  minimo?: string;
  /**
   * Alto máximo antes de que la tabla se desplace por dentro.
   *
   * Se le pone a las largas —172 productos sin pedir, 121 pares de
   * consistencia— porque sin él la vista mide varias pantallas y cambiar de
   * pestaña deja la página a media altura de ninguna parte. Con el tope,
   * todas las vistas miden parecido y la sección se comporta como un panel y
   * no como un documento. La cabecera se queda pegada arriba al desplazar,
   * que es lo que hace legible una tabla con scroll propio.
   */
  alto?: string;
}) {
  return (
    <div
      className={alto ? 'tabla-envoltorio tabla-envoltorio--alto' : 'tabla-envoltorio'}
      style={alto ? { maxHeight: alto } : undefined}
    >
      <table className="tabla tabla--admin" style={minimo ? { minWidth: minimo } : undefined}>
        {children}
      </table>
    </div>
  );
}

/** Cuando el filtro no deja nada. Distinto de «todavía cargando». */
export function Vacio({ children }: { children: ReactNode }) {
  return <p className="grafica__vacio">{children}</p>;
}
