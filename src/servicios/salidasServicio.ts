/**
 * Servicio del control de salidas.
 *
 * Misma frontera que en los demás: la API habla snake_case y la interfaz
 * camelCase.
 *
 * NO tiene nada que ver con `pedidosServicio`. En pedidos, la «Cant. Total
 * Salida de almacén» del FBE.04 es lo que sale del ALMACÉN hacia la
 * cafetería; este módulo sigue llamándose «salidas» en general, pero la
 * cifra que mide cada renglón es la PRODUCCIÓN de la sede ese día, contra lo
 * que la caja registró vendido. Son dos cosas distintas y ninguna consulta
 * las cruza.
 */

import { pedir } from './api.js';

/** Un producto del catálogo del control. No es un producto de proveedor. */
export interface ProductoSalida {
  id: number;
  nombre: string;
  orden: number;
  activo: boolean;
}

/**
 * Las dos cifras de un producto en un cierre.
 *
 * `null` NO es cero, y es el punto entero de este control: cero dice «se contó
 * y no hubo ninguno» y vacío dice «no se contó». Colapsarlas convertiría un
 * hueco en un dato.
 */
export interface LineaSalida {
  productoId: number;
  nombre: string;
  ventasRegistradas: number | null;
  produccion: number | null;
  /** La calcula la base: producción − ventas. Positiva = se perdió producto. */
  diferencia: number | null;
}

/** El cierre de una sede en un día. */
export interface Cierre {
  id: number;
  fecha: string;
  cafeteriaId: string;
  cafeteriaNombre: string;
  /** Quién responde por la sede, copiado al guardar. Vacío si no había nadie. */
  responsableNombre: string;
  /** Quién tecleó. Puede no ser el responsable: administración corrige. */
  guardadoPorNombre: string;
  guardadoEn: string;
  actualizadoEn: string;
  lineas: LineaSalida[];
}

/** Una sede dentro del día completo. `cerrado` en falso es el hueco. */
export interface SedeDelDia {
  cafeteriaId: string;
  cafeteriaNombre: string;
  cerrado: boolean;
  responsableNombre: string;
  lineas: LineaSalida[];
}

/** El día entero, que es lo que se imprime. */
export interface DiaSalidas {
  fecha: string;
  /** Las columnas del impreso las manda el catálogo, no lo que se rellenó. */
  productos: { productoId: number; nombre: string }[];
  cafeterias: SedeDelDia[];
}

/** La ficha de un cierre en el historial: lo justo para pintar una fila. */
export interface FichaCierre {
  id: number;
  fecha: string;
  cafeteriaId: string;
  cafeteriaNombre: string;
  responsableNombre: string;
  renglones: number;
  totalVentas: number;
  totalProduccion: number;
  totalDiferencia: number;
}

/**
 * Un DÍA con cierre, con los totales de todas las sedes juntas.
 *
 * Es lo que lista el historial. `cerradas` de `sedes` se lee «3 de 4»: las
 * que cerraron caja ese día frente a las cafeterías en servicio.
 */
export interface DiaCierre {
  fecha: string;
  cerradas: number;
  sedes: number;
  renglones: number;
  totalVentas: number;
  totalProduccion: number;
  totalDiferencia: number;
}

/**
 * El consolidado de un rango: la matriz que se imprime.
 *
 * `celdas` viene PLANA —(día, sede, producto) → cifras— y no anidada en tres
 * niveles: la hoja la vuelca en un índice y busca por las tres claves a la vez
 * mientras dibuja. Anidada habría que recorrer dos arreglos por casilla.
 */
export interface Consolidado {
  desde: string;
  hasta: string;
  productos: { productoId: number; nombre: string }[];
  cafeterias: { cafeteriaId: string; nombre: string }[];
  /** Solo los días CON cierre: un mes de columnas vacías no dice nada. */
  dias: string[];
  celdas: {
    fecha: string; cafeteriaId: string; productoId: number;
    ventasRegistradas: number | null; produccion: number;
    /** NULL si faltó alguna de las dos cifras ese día — vacío no es cero. */
    diferencia: number | null;
  }[];
}

/**
 * Una casilla del consolidado por rango: la SUMA de un producto para una
 * sede en todos los días del periodo, no un día suelto. Por eso no lleva
 * `nombre` — el catálogo de columnas ya lo trae `PeriodoSalidas.productos`.
 */
export interface LineaPeriodo {
  productoId: number;
  ventasRegistradas: number | null;
  produccion: number | null;
  diferencia: number | null;
}

/**
 * Una sede dentro del consolidado por rango.
 *
 * No lleva `cerrado`: en un rango de varios días eso no es sí/no, es
 * `diasCerrados` de `PeriodoSalidas.diasConCierre` — la sede pudo cerrar
 * unos días del periodo y otros no sin que sea un hueco.
 */
export interface SedeDelPeriodo {
  cafeteriaId: string;
  cafeteriaNombre: string;
  responsableNombre: string;
  diasCerrados: number;
  lineas: LineaPeriodo[];
}

/**
 * El consolidado de un RANGO, sumado por sede y producto.
 *
 * Es el hermano por periodo de `DiaSalidas` —mismo cruce de sedes, misma
 * restricción de acceso— pero sin desglose día a día: cada casilla ya es la
 * suma del rango entero. NO sustituye a `DiaSalidas`, que sigue siendo el
 * formulario de cierre de UN día en `Inicio.tsx`.
 */
export interface PeriodoSalidas {
  desde: string;
  hasta: string;
  /** Días del rango con cierre en ALGUNA sede — el «de cuántos» de cada fila. */
  diasConCierre: number;
  productos: { productoId: number; nombre: string }[];
  cafeterias: SedeDelPeriodo[];
}

/** Lo que la pantalla manda por cada producto con algo escrito. */
export interface LineaNueva {
  productoId: number;
  ventasRegistradas: number | null;
  produccion: number | null;
}

/* ── Normalización ───────────────────────────────────────────────────── */

interface FilaLinea {
  producto_id: number; nombre: string;
  ventas_registradas: number | null; produccion: number | null;
  diferencia: number | null;
}

interface FilaCierre {
  id: number; fecha: string; cafeteria_id: string; cafeteria_nombre: string;
  responsable_nombre?: string; guardado_por_nombre?: string;
  guardado_en?: string; actualizado_en?: string;
  lineas?: FilaLinea[];
}

/** Los enteros llegan como enteros, pero NULL tiene que seguir siendo null. */
const aCuenta = (v: number | null | undefined): number | null =>
  (v === null || v === undefined ? null : Number(v));

function normalizarLinea(fila: FilaLinea): LineaSalida {
  return {
    productoId: fila.producto_id,
    nombre: fila.nombre,
    ventasRegistradas: aCuenta(fila.ventas_registradas),
    produccion: aCuenta(fila.produccion),
    diferencia: aCuenta(fila.diferencia),
  };
}

function normalizar(fila: FilaCierre): Cierre {
  return {
    id: fila.id,
    fecha: fila.fecha,
    cafeteriaId: fila.cafeteria_id,
    cafeteriaNombre: fila.cafeteria_nombre,
    responsableNombre: fila.responsable_nombre ?? '',
    guardadoPorNombre: fila.guardado_por_nombre ?? '',
    guardadoEn: fila.guardado_en ?? '',
    actualizadoEn: fila.actualizado_en ?? '',
    lineas: (fila.lineas ?? []).map(normalizarLinea),
  };
}

/* ── Los cierres ─────────────────────────────────────────────────────── */

/**
 * El cierre de una sede en un día.
 *
 * Devuelve `null` cuando esa sede todavía no ha cerrado, y NO es un error: es
 * el formulario en blanco, que es con lo que empieza cada mañana. Por eso no
 * lanza y hay que mirar el resultado.
 */
export async function getCierre(fecha: string, cafeteriaId: string): Promise<Cierre | null> {
  const fila = await pedir<FilaCierre | null>('salidas.obtener', {
    fecha, cafeteria_id: cafeteriaId,
  });
  return fila ? normalizar(fila) : null;
}

/** Guarda o corrige el cierre. Es la misma acción: lo decide la base. */
export async function guardarCierre(datos: {
  fecha: string;
  cafeteriaId: string;
  lineas: LineaNueva[];
}): Promise<Cierre> {
  const fila = await pedir<FilaCierre>('salidas.guardar', {
    fecha: datos.fecha,
    cafeteria_id: datos.cafeteriaId,
    lineas: datos.lineas.map((l) => ({
      producto_id: l.productoId,
      ventas_registradas: l.ventasRegistradas,
      produccion: l.produccion,
    })),
  });
  return normalizar(fila);
}

/**
 * El historial, por rango de fechas y opcionalmente por sede.
 *
 * `cafeteriaId` solo lo obedece quien no tiene sede propia: a un mostrador el
 * servidor le impone la suya, mande lo que mande.
 */
export async function buscarCierres(filtros: {
  desde: string; hasta: string; cafeteriaId?: string;
}): Promise<FichaCierre[]> {
  const filas = await pedir<{
    id: number; fecha: string; cafeteria_id: string; cafeteria_nombre: string;
    responsable_nombre: string; renglones: number;
    total_ventas: number; total_produccion: number; total_diferencia: number;
  }[]>('salidas.buscar', {
    desde: filtros.desde,
    hasta: filtros.hasta,
    cafeteria_id: filtros.cafeteriaId ?? '',
  });

  return (filas ?? []).map((f) => ({
    id: f.id,
    fecha: f.fecha,
    cafeteriaId: f.cafeteria_id,
    cafeteriaNombre: f.cafeteria_nombre,
    responsableNombre: f.responsable_nombre ?? '',
    renglones: Number(f.renglones ?? 0),
    totalVentas: Number(f.total_ventas ?? 0),
    totalProduccion: Number(f.total_produccion ?? 0),
    totalDiferencia: Number(f.total_diferencia ?? 0),
  }));
}

/**
 * Los DÍAS con cierre de un rango, con el consolidado de cada uno.
 *
 * Es lo que lista el historial: una fila por fecha y no por (fecha, sede).
 * Con cuatro cafeterías, un mes serían ciento veinte filas para responder a
 * una pregunta que se hace por días. El detalle sede por sede está a un clic,
 * en `getDia`.
 *
 * A quien atiende una sede el servidor le devuelve SUS días, con sus propias
 * cifras: la misma pantalla sirve para los dos alcances.
 */
export async function getDiasCierre(filtros: {
  desde: string; hasta: string;
}): Promise<DiaCierre[]> {
  const filas = await pedir<{
    fecha: string; cerradas: number; sedes: number; renglones: number;
    total_ventas: number; total_produccion: number; total_diferencia: number;
  }[]>('salidas.dias', { desde: filtros.desde, hasta: filtros.hasta });

  return (filas ?? []).map((f) => ({
    fecha: f.fecha,
    cerradas: Number(f.cerradas ?? 0),
    sedes: Number(f.sedes ?? 0),
    renglones: Number(f.renglones ?? 0),
    totalVentas: Number(f.total_ventas ?? 0),
    totalProduccion: Number(f.total_produccion ?? 0),
    totalDiferencia: Number(f.total_diferencia ?? 0),
  }));
}

/**
 * El consolidado de un rango, para el documento imprimible.
 *
 * Cruza sedes por definición, así que el servidor solo se lo sirve a quien no
 * atiende una en concreto.
 */
export async function getConsolidado(desde: string, hasta: string): Promise<Consolidado> {
  const fila = await pedir<{
    desde: string; hasta: string;
    productos: { producto_id: number; nombre: string }[];
    cafeterias: { cafeteria_id: string; nombre: string }[];
    dias: string[];
    celdas: {
      fecha: string; cafeteria_id: string; producto_id: number;
      ventas_registradas: number | null; produccion: number;
      diferencia: number | null;
    }[];
  }>('salidas.consolidado', { desde, hasta });

  return {
    desde: fila.desde,
    hasta: fila.hasta,
    productos: (fila.productos ?? []).map((p) => ({ productoId: p.producto_id, nombre: p.nombre })),
    cafeterias: (fila.cafeterias ?? []).map((c) => ({ cafeteriaId: c.cafeteria_id, nombre: c.nombre })),
    dias: fila.dias ?? [],
    celdas: (fila.celdas ?? []).map((x) => ({
      fecha: x.fecha,
      cafeteriaId: x.cafeteria_id,
      productoId: x.producto_id,
      ventasRegistradas: aCuenta(x.ventas_registradas),
      produccion: Number(x.produccion),
      diferencia: aCuenta(x.diferencia),
    })),
  };
}

/**
 * El día entero, con todas las sedes en servicio. Cruza sedes, así que el
 * servidor solo se lo sirve a quien no tiene una asignada.
 */
export async function getDia(fecha: string): Promise<DiaSalidas> {
  const fila = await pedir<{
    fecha: string;
    productos: { producto_id: number; nombre: string }[];
    cafeterias: {
      cafeteria_id: string; cafeteria_nombre: string; cerrado: boolean;
      responsable_nombre: string; lineas: FilaLinea[];
    }[];
  }>('salidas.dia', { fecha });

  return {
    fecha: fila.fecha,
    productos: (fila.productos ?? []).map((p) => ({
      productoId: p.producto_id, nombre: p.nombre,
    })),
    cafeterias: (fila.cafeterias ?? []).map((c) => ({
      cafeteriaId: c.cafeteria_id,
      cafeteriaNombre: c.cafeteria_nombre,
      cerrado: Boolean(c.cerrado),
      responsableNombre: c.responsable_nombre ?? '',
      lineas: (c.lineas ?? []).map(normalizarLinea),
    })),
  };
}

/**
 * El consolidado de un RANGO, sumado por sede y producto. Cruza sedes por
 * definición —igual que `getDia`— así que el servidor solo se lo sirve a
 * quien no tiene una asignada.
 */
export async function getPeriodoSalidas(desde: string, hasta: string): Promise<PeriodoSalidas> {
  const fila = await pedir<{
    desde: string; hasta: string; dias_con_cierre: number;
    productos: { producto_id: number; nombre: string }[];
    cafeterias: {
      cafeteria_id: string; cafeteria_nombre: string; responsable_nombre: string;
      dias_cerrados: number;
      lineas: {
        producto_id: number; ventas_registradas: number | null;
        produccion: number | null; diferencia: number | null;
      }[];
    }[];
  }>('salidas.periodo', { desde, hasta });

  return {
    desde: fila.desde,
    hasta: fila.hasta,
    diasConCierre: Number(fila.dias_con_cierre ?? 0),
    productos: (fila.productos ?? []).map((p) => ({
      productoId: p.producto_id, nombre: p.nombre,
    })),
    cafeterias: (fila.cafeterias ?? []).map((c) => ({
      cafeteriaId: c.cafeteria_id,
      cafeteriaNombre: c.cafeteria_nombre,
      responsableNombre: c.responsable_nombre ?? '',
      diasCerrados: Number(c.dias_cerrados ?? 0),
      lineas: (c.lineas ?? []).map((l) => ({
        productoId: l.producto_id,
        ventasRegistradas: aCuenta(l.ventas_registradas),
        produccion: aCuenta(l.produccion),
        diferencia: aCuenta(l.diferencia),
      })),
    })),
  };
}

/* ── El catálogo ─────────────────────────────────────────────────────── */

/**
 * Los productos del control.
 *
 * `soloActivos` es lo que pide el formulario de cierre; el panel los quiere
 * todos, porque para reactivar un archivado hay que poder verlo.
 */
export async function getProductosSalida({ soloActivos = false } = {}): Promise<ProductoSalida[]> {
  const filas = await pedir<ProductoSalida[]>('salidasProductos.listar', {
    solo_activos: soloActivos,
  });
  return filas ?? [];
}

export async function crearProductoSalida(nombre: string): Promise<ProductoSalida> {
  return pedir<ProductoSalida>('salidasProductos.crear', { nombre });
}

export async function actualizarProductoSalida(id: number, nombre: string): Promise<ProductoSalida> {
  return pedir<ProductoSalida>('salidasProductos.actualizar', { id, nombre });
}

/** Nunca se borra: los cierres ya escritos apuntan al catálogo. */
export async function archivarProductoSalida(id: number): Promise<ProductoSalida> {
  return pedir<ProductoSalida>('salidasProductos.archivar', { id });
}

export async function reactivarProductoSalida(id: number): Promise<ProductoSalida> {
  return pedir<ProductoSalida>('salidasProductos.reactivar', { id });
}
