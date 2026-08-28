/**
 * Servicio de reservas.
 *
 * La fecha ya no la pone el navegador por su cuenta: llega de `app.contexto`,
 * que la calcula en el servidor y en la zona de Colombia. Por eso todas las
 * firmas la piden explícitamente en vez de tener un valor por defecto — un
 * `hoyISO()` escondido dentro del servicio es justo lo que hacía que un
 * equipo con la hora mal puesta registrara el día equivocado sin avisar.
 */

import { pedir } from './api.js';
import { numeroDeReserva } from '../utiles/idReserva.js';

export type Medio = 'presencial' | 'telefono' | '';
export type Pago = 'pagado' | 'debe' | '';
export type EstadoReserva = 'activa' | 'cancelada';

export interface CambioReserva {
  campo: 'nombre' | 'telefono' | 'menu' | 'medio' | 'pago';
  antes: string;
  despues: string;
}

export interface AsientoHistorial {
  tipo: 'creacion' | 'modificacion' | 'cancelacion';
  timestamp: string;
  /** Vacío en el asiento de creación. */
  cambios: CambioReserva[];
}

export interface Reserva {
  /** '01-260823-001' */
  id: string;
  /** Los tres últimos dígitos: '001'. Derivado del id. */
  numero: string;
  nombre: string;
  /** Diez dígitos, sin separadores. SIEMPRE cadena. */
  telefono: string;
  cafeteriaId: string;
  fecha: string;
  menuId: string;
  menuNombre: string;
  medio: Medio;
  pago: Pago;
  estado: EstadoReserva;
  timestamp: string;
  /** Del más antiguo al más reciente. */
  historial: AsientoHistorial[];
}

interface FilaReserva {
  id: string; nombre: string; telefono: string; cafeteria_id: string;
  fecha: string; menu_id: string; menu_nombre: string;
  medio?: string; pago?: string; estado?: string;
  timestamp: string; historial?: AsientoHistorial[];
}

function normalizar(fila: FilaReserva): Reserva {
  return {
    id: fila.id,
    // Se deriva una vez aquí y no en cada vista: la tabla enseña el número
    // corto y el modal el identificador entero, pero los dos salen del id.
    numero: numeroDeReserva(fila.id),
    nombre: fila.nombre,
    telefono: fila.telefono,
    cafeteriaId: fila.cafeteria_id,
    fecha: fila.fecha,
    menuId: fila.menu_id,
    menuNombre: fila.menu_nombre,
    // Una reserva anterior a estos campos llega sin ellos: se deja vacío y la
    // interfaz lo muestra como «—» en vez de inventarse un valor.
    medio: (fila.medio ?? '') as Medio,
    pago: (fila.pago ?? '') as Pago,
    estado: (fila.estado ?? 'activa') as EstadoReserva,
    timestamp: fila.timestamp,
    historial: Array.isArray(fila.historial) ? fila.historial : [],
  };
}

/** Reservas activas de una cafetería ese día, en orden de llegada. */
export async function getReservasDelDia(cafeteriaId: string, fecha: string): Promise<Reserva[]> {
  const filas = await pedir<FilaReserva[]>('reservas.delDia', {
    cafeteria_id: cafeteriaId, fecha,
  });
  return filas.map(normalizar);
}

/**
 * Crea una reserva. Lanza ErrorServicio con códigos de negocio conocidos:
 * RESERVA_DUPLICADA · MENU_INVALIDO · DATOS_INCOMPLETOS · SIN_SERVICIO.
 */
export async function crearReserva(datos: {
  nombre: string; telefono: string; cafeteriaId: string;
  menuId: string; medio: string; pago: string; fecha: string;
}): Promise<Reserva> {
  return normalizar(await pedir<FilaReserva>('reservas.crear', {
    nombre: datos.nombre,
    telefono: datos.telefono,
    cafeteria_id: datos.cafeteriaId,
    fecha: datos.fecha,
    menu_id: datos.menuId,
    medio: datos.medio,
    pago: datos.pago,
  }));
}

/**
 * Modifica una reserva y devuelve la versión actualizada, con el nuevo
 * asiento ya en su historial.
 *
 * La cafetería y la fecha no se pasan: no son editables, y dejarlas fuera de
 * la firma evita que una pantalla futura las cambie por descuido.
 *
 * Códigos de negocio: RESERVA_NO_ENCONTRADA · RESERVA_DUPLICADA ·
 * MENU_INVALIDO · SIN_CAMBIOS.
 */
export async function actualizarReserva(id: string, datos: {
  nombre: string; telefono: string; menuId: string; medio: string; pago: string;
}): Promise<Reserva> {
  return normalizar(await pedir<FilaReserva>('reservas.actualizar', {
    id,
    nombre: datos.nombre,
    telefono: datos.telefono,
    menu_id: datos.menuId,
    medio: datos.medio,
    pago: datos.pago,
  }));
}

/**
 * Cancela una reserva. Es un borrado lógico: deja de aparecer en
 * `getReservasDelDia`, pero la fila y su historial se conservan, con un
 * asiento de tipo 'cancelacion' añadido.
 */
export async function cancelarReserva(id: string): Promise<Reserva> {
  return normalizar(await pedir<FilaReserva>('reservas.cancelar', { id }));
}

export interface ResumenReservas {
  totales: {
    total: number; activas: number; canceladas: number;
    diasConServicio: number; promedioDiario: number;
  };
  porDia: { fecha: string; activas: number; canceladas: number }[];
  porCafeteria: { cafeteriaId: string; nombre: string; activas: number; canceladas: number }[];
  porPlato: { nombre: string; total: number }[];
}

interface FilaResumen {
  totales: {
    total: number; activas: number; canceladas: number;
    dias_con_servicio: number; promedio_diario: number;
  };
  por_dia: { fecha: string; activas: number; canceladas: number }[];
  por_cafeteria: { cafeteria_id: string; nombre: string; activas: number; canceladas: number }[];
  por_plato: { nombre: string; total: number }[];
}

function normalizarResumen(r: FilaResumen): ResumenReservas {
  return {
    totales: {
      total: r.totales.total,
      activas: r.totales.activas,
      canceladas: r.totales.canceladas,
      diasConServicio: r.totales.dias_con_servicio,
      promedioDiario: r.totales.promedio_diario,
    },
    porDia: r.por_dia,
    porCafeteria: r.por_cafeteria.map((f) => ({
      cafeteriaId: f.cafeteria_id,
      nombre: f.nombre,
      activas: f.activas,
      canceladas: f.canceladas,
    })),
    porPlato: r.por_plato,
  };
}

/**
 * Búsqueda con filtros para la pantalla de administración.
 *
 * `total` es cuántas casan con el filtro; `reservas` puede traer menos si el
 * `limite` recorta. El `resumen` se calcula SIEMPRE sobre todas, no sobre la
 * página devuelta. Para exportar, pasar `limite: 0`.
 */
export async function buscarReservas(filtros: {
  desde: string; hasta: string; cafeteriaId?: string;
  estado?: EstadoReserva | ''; texto?: string; limite?: number;
}): Promise<{ total: number; reservas: Reserva[]; resumen: ResumenReservas }> {
  const datos = await pedir<{ total: number; reservas: FilaReserva[]; resumen: FilaResumen }>(
    'reservas.buscar', {
      desde: filtros.desde,
      hasta: filtros.hasta,
      cafeteria_id: filtros.cafeteriaId ?? '',
      estado: filtros.estado ?? '',
      texto: filtros.texto ?? '',
      limite: filtros.limite ?? 500,
    },
  );

  return {
    total: datos.total,
    reservas: datos.reservas.map(normalizar),
    resumen: normalizarResumen(datos.resumen),
  };
}
