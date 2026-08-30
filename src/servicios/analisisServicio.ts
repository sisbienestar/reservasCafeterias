/**
 * Servicio del análisis de pedidos.
 *
 * Misma frontera que en los demás: la API habla snake_case y la interfaz
 * camelCase. Lo que llega ya viene sumado por `analisis_pedidos`; aquí no se
 * agrega nada, solo se traduce y se marca lo que es un juicio de la pantalla
 * —estable o variable— y no un dato del servidor.
 *
 * Una sola llamada trae las seis vistas. Los filtros son comunes a todas, así
 * que partirlo en seis acciones habría hecho seis viajes por cada vez que la
 * administradora cambia una fecha.
 */

import { pedir } from './api.js';

/* ── Los filtros ──────────────────────────────────────────────────────── */

export type Granularidad = 'mes' | 'semana';

export interface FiltrosAnalisis {
  desde: string;
  hasta: string;
  cafeteriaId: string;
  proveedorId: string;
  categoria: string;
  /** 0 = sin filtrar por producto. */
  productoId: number;
  top: number;
  diasDesuso: number;
  granularidad: Granularidad;
}

/** Las tres casillas del FBE.04, que es lo que guarda `categoria_marcada`. */
export const CATEGORIAS = [
  'Alimentos y bebidas',
  'Aseo y productos químicos',
  'Desechables',
] as const;

/* ── Lo que devuelve ──────────────────────────────────────────────────── */

export interface Resumen {
  pedidos: number; lineas: number; productos: number;
  sedes: number; proveedores: number;
  /** Cuántas unidades de medida distintas hay en el conjunto filtrado. Con
   *  más de una, sumar cantidades entre productos deja de significar algo. */
  unidades: number;
}

export interface ProductoDisponible {
  id: number; nombre: string; unidad: string;
  proveedorId: string; proveedorNombre: string;
}

export interface SedeCategoria {
  cafeteriaId: string; cafeteriaNombre: string; categoria: string;
  cantidad: number; lineas: number; pedidos: number;
}

export interface SedeProducto {
  cafeteriaId: string; cafeteriaNombre: string;
  productoId: number; productoNombre: string; unidad: string;
  cantidad: number; lineas: number;
}

export interface PuntoTendencia {
  periodo: string; proveedorId: string; proveedorNombre: string;
  cantidad: number; lineas: number; pedidos: number;
}

export interface ResumenProveedor {
  proveedorId: string; proveedorNombre: string;
  cantidad: number; lineas: number; pedidos: number;
  cantidadPrevia: number; pedidosPrevios: number;
  /** Variación de cantidad contra el periodo anterior. `null` cuando no hubo
   *  periodo anterior: dividir entre cero daría un infinito, y «subió un
   *  infinito por ciento» no es una lectura, es un artefacto. */
  variacion: number | null;
}

export interface ProductoTop {
  productoId: number; productoNombre: string; unidad: string;
  proveedorId: string; proveedorNombre: string;
  cantidad: number; lineas: number; pedidos: number; ultima: string | null;
}

export interface ProductoEnDesuso {
  productoId: number; productoNombre: string; unidad: string;
  proveedorId: string; proveedorNombre: string;
  /** Última vez que se pidió en TODO el histórico, no en el rango. */
  ultima: string | null;
  dias: number | null;
}

export interface PorDiaSemana {
  /** ISO: 1 = lunes … 7 = domingo. */
  dia: number; cantidad: number; lineas: number; pedidos: number;
}

export interface PorPeriodo {
  periodo: string; cantidad: number; lineas: number; pedidos: number;
}

export interface PorPeriodoSede extends PorPeriodo {
  cafeteriaId: string; cafeteriaNombre: string;
}

export interface PorCategoria {
  categoria: string; cantidad: number; lineas: number; pedidos: number;
}

export interface CategoriaSede {
  cafeteriaId: string; cafeteriaNombre: string; categoria: string;
  cantidad: number; lineas: number;
}

export interface PorProveedor {
  proveedorId: string; proveedorNombre: string;
  cantidad: number; lineas: number; pedidos: number;
}

export interface Consistencia {
  productoId: number; productoNombre: string; unidad: string;
  proveedorNombre: string;
  cafeteriaId: string; cafeteriaNombre: string;
  veces: number; promedio: number; minimo: number; maximo: number;
  desviacion: number;
  /** Desviación entre media. Sin unidad, así que compara productos de
   *  escalas distintas: 3 de desviación es enorme en algo que se pide de a 2
   *  y despreciable en algo que se pide de a 200. */
  coeficiente: number;
  estable: boolean;
}

export interface Analisis {
  desde: string; hasta: string; dias: number;
  granularidad: Granularidad;
  /** Con qué grano vienen `porFecha` y `porFechaSede`: 'dia' o 'semana'. */
  granoFecha: 'dia' | 'semana';
  periodoPrevio: { desde: string; hasta: string };
  resumen: Resumen;
  productosDisponibles: ProductoDisponible[];
  porSedeCategoria: SedeCategoria[];
  porSedeProducto: SedeProducto[];
  tendencia: PuntoTendencia[];
  tendenciaResumen: ResumenProveedor[];
  topProductos: ProductoTop[];
  enDesuso: ProductoEnDesuso[];
  porDiaSemana: PorDiaSemana[];
  porFecha: PorPeriodo[];
  porFechaSede: PorPeriodoSede[];
  porCategoria: PorCategoria[];
  porCategoriaSede: CategoriaSede[];
  porProveedor: PorProveedor[];
  consistencia: Consistencia[];
}

/**
 * El umbral entre «estable» y «variable».
 *
 * Un coeficiente de variación de 0,25 quiere decir que la desviación típica
 * es la cuarta parte de la media: pedidos que rondan siempre la misma cifra,
 * con algún ajuste. Por encima, la cantidad cambia lo bastante entre pedidos
 * como para que una plantilla pre-rellenada estorbe más de lo que ayuda.
 *
 * No es una constante universal, es un corte elegido para este uso; por eso
 * la tabla enseña el coeficiente además de la etiqueta, para que quien mire
 * pueda no estar de acuerdo con el corte y juzgar por el número.
 */
export const UMBRAL_ESTABLE = 0.25;

/** El histórico se importó sin marcar la casilla en dos pedidos. */
const SIN_CATEGORIA = 'Sin categoría';

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

interface Bruto { [clave: string]: unknown }
const lista = (v: unknown): Bruto[] => (Array.isArray(v) ? (v as Bruto[]) : []);

export async function analizarPedidos(filtros: FiltrosAnalisis): Promise<Analisis> {
  const r = await pedir<Bruto>('pedidos.analisis', {
    desde: filtros.desde,
    hasta: filtros.hasta,
    cafeteria_id: filtros.cafeteriaId,
    proveedor_id: filtros.proveedorId,
    categoria: filtros.categoria,
    producto_id: filtros.productoId,
    top: filtros.top,
    dias_desuso: filtros.diasDesuso,
    granularidad: filtros.granularidad,
  });

  const resumen = (r.resumen ?? {}) as Bruto;
  const previo = (r.periodo_previo ?? {}) as Bruto;

  return {
    desde: texto(r.desde),
    hasta: texto(r.hasta),
    dias: num(r.dias),
    granularidad: r.granularidad === 'semana' ? 'semana' : 'mes',
    granoFecha: r.grano_fecha === 'semana' ? 'semana' : 'dia',
    periodoPrevio: { desde: texto(previo.desde), hasta: texto(previo.hasta) },

    resumen: {
      pedidos: num(resumen.pedidos), lineas: num(resumen.lineas),
      productos: num(resumen.productos), sedes: num(resumen.sedes),
      proveedores: num(resumen.proveedores), unidades: num(resumen.unidades),
    },

    productosDisponibles: lista(r.productos_disponibles).map((f) => ({
      id: num(f.id), nombre: texto(f.nombre), unidad: texto(f.unidad),
      proveedorId: texto(f.proveedor_id), proveedorNombre: texto(f.proveedor_nombre),
    })),

    porSedeCategoria: lista(r.por_sede_categoria).map((f) => ({
      cafeteriaId: texto(f.cafeteria_id), cafeteriaNombre: texto(f.cafeteria_nombre),
      categoria: texto(f.categoria) || SIN_CATEGORIA,
      cantidad: num(f.cantidad), lineas: num(f.lineas), pedidos: num(f.pedidos),
    })),

    porSedeProducto: lista(r.por_sede_producto).map((f) => ({
      cafeteriaId: texto(f.cafeteria_id), cafeteriaNombre: texto(f.cafeteria_nombre),
      productoId: num(f.producto_id), productoNombre: texto(f.producto_nombre),
      unidad: texto(f.unidad), cantidad: num(f.cantidad), lineas: num(f.lineas),
    })),

    tendencia: lista(r.tendencia).map((f) => ({
      periodo: texto(f.periodo),
      proveedorId: texto(f.proveedor_id), proveedorNombre: texto(f.proveedor_nombre),
      cantidad: num(f.cantidad), lineas: num(f.lineas), pedidos: num(f.pedidos),
    })),

    tendenciaResumen: lista(r.tendencia_resumen).map((f) => {
      const cantidad = num(f.cantidad);
      const previa = num(f.cantidad_prev);
      return {
        proveedorId: texto(f.proveedor_id), proveedorNombre: texto(f.proveedor_nombre),
        cantidad, lineas: num(f.lineas), pedidos: num(f.pedidos),
        cantidadPrevia: previa, pedidosPrevios: num(f.pedidos_prev),
        variacion: previa > 0 ? (cantidad - previa) / previa : null,
      };
    }),

    topProductos: lista(r.top_productos).map((f) => ({
      productoId: num(f.producto_id), productoNombre: texto(f.producto_nombre),
      unidad: texto(f.unidad),
      proveedorId: texto(f.proveedor_id), proveedorNombre: texto(f.proveedor_nombre),
      cantidad: num(f.cantidad), lineas: num(f.lineas), pedidos: num(f.pedidos),
      ultima: f.ultima ? texto(f.ultima) : null,
    })),

    enDesuso: lista(r.en_desuso).map((f) => ({
      productoId: num(f.producto_id), productoNombre: texto(f.producto_nombre),
      unidad: texto(f.unidad),
      proveedorId: texto(f.proveedor_id), proveedorNombre: texto(f.proveedor_nombre),
      ultima: f.ultima ? texto(f.ultima) : null,
      dias: f.dias === null || f.dias === undefined ? null : num(f.dias),
    })),

    porDiaSemana: lista(r.por_dia_semana).map((f) => ({
      dia: num(f.dia), cantidad: num(f.cantidad),
      lineas: num(f.lineas), pedidos: num(f.pedidos),
    })),

    porFecha: lista(r.por_fecha).map((f) => ({
      periodo: texto(f.periodo), cantidad: num(f.cantidad),
      lineas: num(f.lineas), pedidos: num(f.pedidos),
    })),

    porFechaSede: lista(r.por_fecha_sede).map((f) => ({
      periodo: texto(f.periodo),
      cafeteriaId: texto(f.cafeteria_id), cafeteriaNombre: texto(f.cafeteria_nombre),
      cantidad: num(f.cantidad), lineas: num(f.lineas), pedidos: num(f.pedidos),
    })),

    porCategoria: lista(r.por_categoria).map((f) => ({
      categoria: texto(f.categoria) || SIN_CATEGORIA,
      cantidad: num(f.cantidad), lineas: num(f.lineas), pedidos: num(f.pedidos),
    })),

    porCategoriaSede: lista(r.por_categoria_sede).map((f) => ({
      cafeteriaId: texto(f.cafeteria_id), cafeteriaNombre: texto(f.cafeteria_nombre),
      categoria: texto(f.categoria) || SIN_CATEGORIA,
      cantidad: num(f.cantidad), lineas: num(f.lineas),
    })),

    porProveedor: lista(r.por_proveedor).map((f) => ({
      proveedorId: texto(f.proveedor_id), proveedorNombre: texto(f.proveedor_nombre),
      cantidad: num(f.cantidad), lineas: num(f.lineas), pedidos: num(f.pedidos),
    })),

    consistencia: lista(r.consistencia).map((f) => {
      const promedio = num(f.promedio);
      const desviacion = num(f.desviacion);
      // Media cero no puede pasar —las cantidades son > 0 por restricción—
      // pero la guarda es barata y evita un NaN que se propagaría a la tabla.
      const coeficiente = promedio > 0 ? desviacion / promedio : 0;
      return {
        productoId: num(f.producto_id), productoNombre: texto(f.producto_nombre),
        unidad: texto(f.unidad), proveedorNombre: texto(f.proveedor_nombre),
        cafeteriaId: texto(f.cafeteria_id), cafeteriaNombre: texto(f.cafeteria_nombre),
        veces: num(f.veces), promedio, minimo: num(f.minimo), maximo: num(f.maximo),
        desviacion, coeficiente,
        estable: coeficiente <= UMBRAL_ESTABLE,
      };
    }),
  };
}
