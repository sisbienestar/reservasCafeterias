/**
 * Servicio de cafeterías.
 *
 * Aquí vive la traducción entre la forma de la API (snake_case, como venía de
 * una hoja de cálculo y como sigue siendo en Postgres) y la forma que consume
 * la interfaz (camelCase). Esa frontera es deliberada: si mañana el backend
 * renombra una columna, se arregla en `normalizar` y ni una vista se entera.
 */

import { pedir } from './api.js';

export interface Cafeteria {
  id: string;
  /** Dos dígitos, prefijo del id de sus reservas. */
  codigo: string;
  nombre: string;
  ubicacion: string;
  imagen: string;
  activa: boolean;
  /** Productos que ofrece todos los días, independientes de la carta. */
  platosFijos: string[];
}

interface FilaCafeteria {
  id: string; codigo?: string; nombre: string; ubicacion?: string;
  imagen?: string; activa?: boolean; platos_fijos?: string[];
}

function normalizar(fila: FilaCafeteria): Cafeteria {
  return {
    id: fila.id,
    codigo: fila.codigo ?? '',
    nombre: fila.nombre,
    ubicacion: fila.ubicacion ?? '',
    imagen: fila.imagen ?? '',
    // Una fila sin la columna todavía se da por activa.
    activa: fila.activa !== false,
    platosFijos: Array.isArray(fila.platos_fijos) ? fila.platos_fijos : [],
  };
}

/**
 * Cafeterías en servicio. Con `incluirInactivas` devuelve también las
 * cerradas, que es lo que necesita la pantalla de administración.
 */
export async function getCafeterias({ incluirInactivas = false } = {}): Promise<Cafeteria[]> {
  const filas = await pedir<FilaCafeteria[]>('cafeterias.listar', {
    incluir_inactivas: incluirInactivas,
  });
  return filas.map(normalizar);
}

/** Una cafetería por id. Lanza ErrorServicio si no existe. */
export async function getCafeteria(id: string): Promise<Cafeteria> {
  return normalizar(await pedir<FilaCafeteria>('cafeterias.obtener', { id }));
}

/**
 * Crea una cafetería. El id sale del nombre, así que dos cafeterías con el
 * mismo nombre chocan: devuelve CAFETERIA_DUPLICADA.
 */
export async function crearCafeteria(datos: {
  nombre: string; ubicacion?: string; platosFijos?: string[];
}): Promise<Cafeteria> {
  return normalizar(await pedir<FilaCafeteria>('cafeterias.crear', {
    nombre: datos.nombre,
    ubicacion: datos.ubicacion,
    platos_fijos: datos.platosFijos ?? [],
  }));
}

/**
 * Modifica nombre, ubicación y platos fijos. El `id` no es editable: es la
 * clave con la que las reservas históricas apuntan a esta cafetería.
 */
export async function actualizarCafeteria(id: string, datos: {
  nombre: string; ubicacion?: string; platosFijos?: string[];
}): Promise<Cafeteria> {
  return normalizar(await pedir<FilaCafeteria>('cafeterias.actualizar', {
    id,
    nombre: datos.nombre,
    ubicacion: datos.ubicacion,
    platos_fijos: datos.platosFijos ?? [],
  }));
}

/** Cierra una cafetería: deja de ofrecerse, pero sus reservas siguen intactas. */
export async function archivarCafeteria(id: string): Promise<Cafeteria> {
  return normalizar(await pedir<FilaCafeteria>('cafeterias.archivar', { id }));
}

/** Vuelve a poner en servicio una cafetería cerrada. */
export async function reactivarCafeteria(id: string): Promise<Cafeteria> {
  return normalizar(await pedir<FilaCafeteria>('cafeterias.reactivar', { id }));
}
