/**
 * Módulos, ajustes, registro y cuentas: lo que administra la APLICACIÓN.
 *
 * Los módulos NO se piden aquí para pintar la portada: llegan dentro de
 * `app.contexto`, que la aplicación ya espera antes de dibujar nada. Esta
 * función existe solo para el panel, que necesita recargarlos tras un cambio.
 */

import { pedir } from './api.js';
import type { Modulo } from '../contexto/Sesion.js';

export interface Ajuste {
  clave: string;
  valor: string;
  descripcion: string;
}

export interface Asiento {
  id: number;
  ocurridoEn: string;
  autorNombre: string;
  accion: string;
  objeto: string;
  detalle: Record<string, unknown>;
}

/**
 * Enciende o apaga un módulo, y corrige sus textos.
 *
 * El `id` y la `ruta` no viajan: son lo que une la fila con el código que la
 * sirve, y cambiarlos dejaría un módulo que la aplicación no sabe servir.
 */
export async function actualizarModulo(modulo: {
  id: string; nombre: string; etiqueta: string; inicial: string; activo: boolean;
}): Promise<Modulo> {
  return pedir<Modulo>('modulos.actualizar', {
    id: modulo.id,
    nombre: modulo.nombre,
    etiqueta: modulo.etiqueta,
    inicial: modulo.inicial,
    activo: modulo.activo,
  });
}

export async function getAjustes(): Promise<Ajuste[]> {
  return pedir<Ajuste[]>('ajustes.listar', {});
}

/** Solo se pueden tocar los ajustes que ya existen: los declara el esquema. */
export async function guardarAjuste(clave: string, valor: string): Promise<Ajuste> {
  return pedir<Ajuste>('ajustes.guardar', { clave, valor });
}

interface FilaAsiento {
  id: number; ocurrido_en: string; autor_nombre?: string;
  accion: string; objeto?: string; detalle?: Record<string, unknown>;
}

/** Lo último que pasó de lo que importa, lo más reciente primero. */
export async function getRegistro(limite = 100): Promise<Asiento[]> {
  const filas = await pedir<FilaAsiento[]>('registro.listar', { limite });
  return filas.map((f) => ({
    id: f.id,
    ocurridoEn: f.ocurrido_en,
    autorNombre: f.autor_nombre ?? '',
    accion: f.accion,
    objeto: f.objeto ?? '',
    detalle: f.detalle ?? {},
  }));
}
