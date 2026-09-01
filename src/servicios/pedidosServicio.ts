/**
 * Servicio de pedidos.
 *
 * Misma frontera que en los demás: la API habla snake_case y la interfaz
 * camelCase.
 *
 * Las cantidades llegan de Postgres como NUMERIC, que supabase-js entrega
 * como CADENA para no perder precisión. Se convierten aquí una vez: si no,
 * `'2' + '3'` daría `'23'` en cualquier suma de la pantalla.
 */

import { pedir } from './api.js';
import type { TipoDocumento } from './proveedoresServicio.js';

export interface LineaPedido {
  productoId: number;
  codigo: string;
  nombre: string;
  categoria: string;
  unidadMedida: string;
  cantidadSolicitada: number;
  /** Solo FBE.04, y las rellena el almacén al despachar. */
  cantidadDevuelta: number | null;
  cantidadAdicional: number | null;
  /** Calculada por la base de datos. No se manda nunca. */
  cantidadTotalSalida: number | null;
}

export interface Pedido {
  id: number;
  proveedorId: string;
  proveedorNombre: string;
  cafeteriaId: string;
  cafeteriaNombre: string;
  /** El sitio, para el «Unidad de Servicio que solicita» del FBE.04. */
  cafeteriaUbicacion: string;
  tipoDocumento: TipoDocumento;
  categoriaMarcada: string;
  fechaElaboracion: string;
  fechaEntrega: string | null;
  horaEntrega: string | null;
  lugarEntrega: string;
  /**
   * Lo que va escrito en el recuadro «Observaciones» de la hoja. Vacío = el
   * recuadro sale en blanco, para escribir a mano al recibir.
   */
  observaciones: string;
  /** El nombre de quien lo elaboró. Vacío si su cuenta ya no existe. */
  elaboradoPor: string;
  /** `creado` | `enviado` | `confirmado` | `anulado`. */
  estado: string;
  /** Cuándo salió hacia administración. Vacío mientras esté solo creado. */
  enviadoEn: string | null;
  /** Cuándo quedó confirmado y cerrado. Vacío hasta entonces. */
  confirmadoEn: string | null;
  lineas: LineaPedido[];
  /** Qué le ha pasado al pedido, del último al primero. */
  eventos: EventoPedido[];
}

/** Un asiento del historial del pedido. */
export interface EventoPedido {
  ocurridoEn: string;
  accion: 'creado' | 'editado' | 'enviado' | 'confirmado' | 'anulado';
  /** Vacío en los asientos reconstruidos de la carga histórica. */
  autorNombre: string;
  autorRol: string;
  /** En las ediciones, desde qué estado y cuántos renglones quedaron. */
  detalle: { estado?: string; renglones?: number; desde?: string; reconstruido?: boolean };
}

/**
 * Los tres pasos del pedido.
 *
 * `estado` es LA MISMA palabra que guarda la base, y eso ahora es una promesa
 * y no una casualidad: hubo tres días en que no coincidían —la base decía
 * `confirmado` donde la pantalla decía «Enviado», y `definitivo` donde decía
 * «Confirmado»— y la primera petición que llegó ya fue ambigua. Lo unificó
 * `supabase/16-unificar-estados.sql`.
 *
 * Si algún día vuelven a separarse, aquí es donde se traduce. Mientras
 * coincidan, `nombre` es solo la mayúscula.
 */
export interface PasoPedido {
  /** El estado tal como lo guarda la base. */
  estado: string;
  /** Cómo se llama en pantalla. */
  nombre: string;
  /** Qué hay que hacer ahora. Solo se enseña la del paso actual. */
  queSigue: string;
}

export const PASOS_PEDIDO: PasoPedido[] = [
  { estado: 'creado', nombre: 'Creado', queSigue: 'Revisa y envía a administración' },
  { estado: 'enviado', nombre: 'Enviado', queSigue: 'Valida y confirma el pedido' },
  { estado: 'confirmado', nombre: 'Confirmado', queSigue: 'Pedido definitivo' },
];

/** El anulado no es un paso: se salió del camino. Se nombra aparte. */
export const ANULADO = { nombre: 'Anulado', queSigue: 'Se conserva solo para el historial' };

/** El nombre visible de un estado, venga de donde venga. */
export function nombreDeEstado(estado: string): string {
  if (estado === 'anulado') return ANULADO.nombre;
  return PASOS_PEDIDO.find((p) => p.estado === estado)?.nombre ?? estado;
}


/** Lo que la pantalla manda por cada renglón que tiene cantidad. */
export interface LineaNueva {
  productoId: number;
  cantidadSolicitada: number;
  cantidadDevuelta?: number | null;
  cantidadAdicional?: number | null;
}

export interface PedidoNuevo {
  proveedorId: string;
  cafeteriaId: string;
  fechaElaboracion: string;
  /** Solo FBE.34. En un FBE.04 el servidor las descarta. */
  fechaEntrega?: string | null;
  horaEntrega?: string | null;
  lugarEntrega?: string;
  /** El recuadro «Observaciones» de la hoja. Vacío lo deja en blanco. */
  observaciones?: string;
  lineas: LineaNueva[];
}

interface FilaLinea {
  producto_id: number; codigo?: string; nombre: string; categoria?: string;
  unidad_medida: string;
  cantidad_solicitada: string | number;
  cantidad_devuelta?: string | number | null;
  cantidad_adicional?: string | number | null;
  cantidad_total_salida?: string | number | null;
}

interface FilaPedido {
  id: number; proveedor_id: string; proveedor_nombre: string;
  cafeteria_id: string; cafeteria_nombre: string; cafeteria_ubicacion?: string;
  tipo_documento?: string; categoria_marcada?: string;
  fecha_elaboracion: string; fecha_entrega?: string | null;
  hora_entrega?: string | null; lugar_entrega?: string;
  observaciones?: string;
  elaborado_por?: string;
  estado?: string; enviado_en?: string | null; confirmado_en?: string | null;
  lineas?: FilaLinea[];
  eventos?: FilaEvento[];
}

interface FilaEvento {
  ocurrido_en: string;
  accion: string;
  autor_nombre?: string;
  autor_rol?: string;
  detalle?: Record<string, unknown> | null;
}

/** NUMERIC llega como cadena. Vacío se queda vacío: no es cero. */
function aNumero(valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function normalizarLinea(fila: FilaLinea): LineaPedido {
  return {
    productoId: fila.producto_id,
    codigo: fila.codigo ?? '',
    nombre: fila.nombre,
    categoria: fila.categoria ?? '',
    unidadMedida: fila.unidad_medida,
    // La solicitada siempre existe: sin ella el renglón no se habría guardado.
    cantidadSolicitada: aNumero(fila.cantidad_solicitada) ?? 0,
    cantidadDevuelta: aNumero(fila.cantidad_devuelta),
    cantidadAdicional: aNumero(fila.cantidad_adicional),
    cantidadTotalSalida: aNumero(fila.cantidad_total_salida),
  };
}

function normalizar(fila: FilaPedido): Pedido {
  return {
    id: fila.id,
    proveedorId: fila.proveedor_id,
    proveedorNombre: fila.proveedor_nombre,
    cafeteriaId: fila.cafeteria_id,
    cafeteriaNombre: fila.cafeteria_nombre,
    cafeteriaUbicacion: fila.cafeteria_ubicacion ?? '',
    tipoDocumento: fila.tipo_documento === 'FBE.04' ? 'FBE.04' : 'FBE.34',
    categoriaMarcada: fila.categoria_marcada ?? '',
    fechaElaboracion: fila.fecha_elaboracion,
    fechaEntrega: fila.fecha_entrega ?? null,
    // Postgres devuelve TIME como 'HH:MM:SS'. El documento y el formulario
    // trabajan en HH:MM: los segundos de una hora de entrega no significan nada.
    horaEntrega: fila.hora_entrega ? fila.hora_entrega.slice(0, 5) : null,
    lugarEntrega: fila.lugar_entrega ?? '',
    observaciones: fila.observaciones ?? '',
    elaboradoPor: fila.elaborado_por ?? '',
    estado: fila.estado ?? 'creado',
    enviadoEn: fila.enviado_en ?? null,
    confirmadoEn: fila.confirmado_en ?? null,
    lineas: (fila.lineas ?? []).map(normalizarLinea),
    eventos: (fila.eventos ?? []).map(normalizarEvento),
  };
}

function normalizarEvento(fila: FilaEvento): EventoPedido {
  return {
    ocurridoEn: fila.ocurrido_en,
    accion: fila.accion as EventoPedido['accion'],
    autorNombre: fila.autor_nombre ?? '',
    autorRol: fila.autor_rol ?? '',
    detalle: (fila.detalle ?? {}) as EventoPedido['detalle'],
  };
}

/**
 * Guarda un pedido con sus líneas.
 *
 * Solo se mandan los renglones CON cantidad: el catálogo más grande tiene 55
 * productos y un pedido normal lleva ocho. El servidor vuelve a filtrar por
 * si acaso, pero mandar doscientos ceros por el cable no tendría sentido.
 */
export async function crearPedido(datos: PedidoNuevo): Promise<Pedido> {
  const fila = await pedir<FilaPedido>('pedidos.crear', {
    proveedor_id: datos.proveedorId,
    cafeteria_id: datos.cafeteriaId,
    fecha_elaboracion: datos.fechaElaboracion,
    fecha_entrega: datos.fechaEntrega ?? null,
    hora_entrega: datos.horaEntrega ?? null,
    lugar_entrega: datos.lugarEntrega ?? '',
    observaciones: datos.observaciones ?? '',
    lineas: datos.lineas.map((l) => ({
      producto_id: l.productoId,
      cantidad_solicitada: l.cantidadSolicitada,
      cantidad_devuelta: l.cantidadDevuelta ?? null,
      cantidad_adicional: l.cantidadAdicional ?? null,
    })),
  });
  return normalizar(fila);
}

/** Un pedido con sus líneas. Lanza ErrorServicio con PEDIDO_NO_ENCONTRADO. */
export async function getPedido(id: number): Promise<Pedido> {
  return normalizar(await pedir<FilaPedido>('pedidos.obtener', { id }));
}

/** La ficha de un pedido en el historial: lo justo para pintar una fila. */
export interface FichaPedido {
  id: number;
  fechaElaboracion: string;
  fechaEntrega: string | null;
  estado: string;
  tipoDocumento: TipoDocumento;
  proveedorId: string;
  proveedorNombre: string;
  cafeteriaId: string;
  cafeteriaNombre: string;
  /** Cuántos productos lleva. No los productos: eso es `getPedido`. */
  renglones: number;
}

export interface Historial {
  /** Los del RANGO, que pueden ser más que los devueltos si se topó el límite. */
  total: number;
  pedidos: FichaPedido[];
}

interface FilaFicha {
  id: number; fecha_elaboracion: string; fecha_entrega?: string | null;
  estado?: string; tipo_documento?: string;
  proveedor_id: string; proveedor_nombre?: string;
  cafeteria_id: string; cafeteria_nombre?: string;
  renglones?: number;
}

/**
 * El historial, filtrable por sede, proveedor, estado y rango de fechas.
 *
 * `cafeteriaId` solo lo obedece administración: a un mostrador el servidor le
 * impone la suya, mande lo que mande.
 */
export async function buscarPedidos(filtros: {
  desde: string;
  hasta: string;
  cafeteriaId?: string;
  proveedorId?: string;
  estado?: string;
}): Promise<Historial> {
  const respuesta = await pedir<{ total: number; pedidos: FilaFicha[] }>('pedidos.buscar', {
    desde: filtros.desde,
    hasta: filtros.hasta,
    cafeteria_id: filtros.cafeteriaId ?? '',
    proveedor_id: filtros.proveedorId ?? '',
    estado: filtros.estado ?? '',
  });

  return {
    total: respuesta.total ?? 0,
    pedidos: (respuesta.pedidos ?? []).map((fila) => ({
      id: fila.id,
      fechaElaboracion: fila.fecha_elaboracion,
      fechaEntrega: fila.fecha_entrega ?? null,
      estado: fila.estado ?? 'creado',
      tipoDocumento: fila.tipo_documento === 'FBE.04' ? 'FBE.04' : 'FBE.34',
      proveedorId: fila.proveedor_id,
      proveedorNombre: fila.proveedor_nombre ?? '',
      cafeteriaId: fila.cafeteria_id,
      cafeteriaNombre: fila.cafeteria_nombre ?? '',
      renglones: fila.renglones ?? 0,
    })),
  };
}

/**
 * Corrige un pedido.
 *
 * No lleva proveedor ni cafetería: no son editables, y dejarlos fuera de la
 * firma evita que una pantalla futura los cambie por descuido. Es la misma
 * decisión que en `reservas.actualizar`.
 */
export async function actualizarPedido(id: number, datos: {
  fechaEntrega?: string | null;
  horaEntrega?: string | null;
  lugarEntrega?: string;
  observaciones?: string;
  lineas: LineaNueva[];
}): Promise<Pedido> {
  const fila = await pedir<FilaPedido>('pedidos.actualizar', {
    id,
    fecha_entrega: datos.fechaEntrega ?? null,
    hora_entrega: datos.horaEntrega ?? null,
    lugar_entrega: datos.lugarEntrega ?? '',
    // Sin `?? ''`: omitirlo es «no las toques», y vaciarlo es «bórralas». El
    // formulario manda siempre el campo, así que borrar borra de verdad.
    observaciones: datos.observaciones,
    lineas: datos.lineas.map((l) => ({
      producto_id: l.productoId,
      cantidad_solicitada: l.cantidadSolicitada,
      cantidad_devuelta: l.cantidadDevuelta ?? null,
      cantidad_adicional: l.cantidadAdicional ?? null,
    })),
  });
  return normalizar(fila);
}

/** Envía a administración un pedido creado. El aviso lo manda el servidor. */
export async function enviarPedido(id: number): Promise<Pedido> {
  return normalizar(await pedir<FilaPedido>('pedidos.enviar', { id }));
}

/**
 * Confirma un pedido enviado: queda cerrado y definitivo.
 *
 * Lo hace el auxiliar administrativo o administración, y solo desde
 * `enviado`. A partir de aquí el pedido ya no se toca — salvo administración,
 * que puede en cualquier momento.
 */
export async function confirmarPedido(id: number): Promise<Pedido> {
  return normalizar(await pedir<FilaPedido>('pedidos.confirmar', { id }));
}

/**
 * Anula un pedido. Uno recién creado lo anula quien lo elabora; en cuanto se
 * envió, solo administración.
 */
export async function anularPedido(id: number): Promise<Pedido> {
  return normalizar(await pedir<FilaPedido>('pedidos.anular', { id }));
}
