/**
 * Las seis acciones de cafeterías.
 *
 * Traducen entre la fila de Postgres y la forma del contrato. Es poco código
 * porque casi todo es lectura directa: la única regla de verdad —el reparto
 * del `codigo`— está en `crear_cafeteria`, donde puede ser atómica.
 */

import { servicio, desempaquetar } from '../supabase.js';
import { romper } from '../sobre.js';
import { aSlug, limpiarPlatosFijos } from '../dominio.js';
import type { Sesion } from '../sesion.js';

/** La forma que espera el frontend. `activa` es un booleano de verdad: la
 *  cadena 'FALSE' es *truthy* y una cafetería cerrada aparecería abierta. */
export interface CafeteriaContrato {
  id: string;
  codigo: string;
  nombre: string;
  ubicacion: string;
  imagen: string;
  activa: boolean;
  platos_fijos: string[];
}

const COLUMNAS = 'id, codigo, nombre, ubicacion, imagen, activa, platos_fijos';

interface FilaCafeteria {
  id: string; codigo: string; nombre: string; ubicacion: string | null;
  imagen: string | null; activa: boolean; platos_fijos: string[] | null;
}

function aContrato(fila: FilaCafeteria): CafeteriaContrato {
  return {
    id: fila.id,
    codigo: fila.codigo ?? '',
    nombre: fila.nombre,
    ubicacion: fila.ubicacion ?? '',
    imagen: fila.imagen ?? '',
    activa: fila.activa !== false,
    platos_fijos: Array.isArray(fila.platos_fijos) ? fila.platos_fijos : [],
  };
}

/** Sin `incluir_inactivas`, solo las que están en servicio. El mostrador nunca
 *  debe ver una sede cerrada; administración sí, para reabrirla. */
export async function listar(params: Record<string, unknown>) {
  let consulta = servicio().from('cafeteria').select(COLUMNAS).order('codigo');
  if (!params.incluir_inactivas) consulta = consulta.eq('activa', true);
  return desempaquetar<FilaCafeteria[]>(await consulta).map(aContrato);
}

export async function obtener(params: Record<string, unknown>) {
  const fila = desempaquetar<FilaCafeteria | null>(
    await servicio().from('cafeteria').select(COLUMNAS)
      .eq('id', String(params.id ?? '')).maybeSingle(),
  );
  if (!fila) romper('CAFETERIA_NO_ENCONTRADA', `No existe la cafetería «${params.id}».`);
  return aContrato(fila);
}

/**
 * El `id` sale del nombre, así que dos cafeterías con el mismo nombre chocan.
 * Se comprueba aquí para dar un mensaje decente, pero quien lo IMPIDE de
 * verdad es la clave primaria: entre esta consulta y el INSERT cabe otra
 * petición, y la clave primaria no tiene esa ventana.
 */
export async function crear(params: Record<string, unknown>) {
  const nombre = String(params.nombre ?? '').trim();
  if (!nombre) romper('DATOS_INCOMPLETOS', 'La cafetería necesita al menos un nombre.');

  const id = aSlug(nombre);
  if (!id) romper('DATOS_INCOMPLETOS', 'Ese nombre no produce un identificador válido.');

  const fila = desempaquetar(
    await servicio().rpc('crear_cafeteria', {
      p_id: id,
      p_nombre: nombre,
      p_ubicacion: String(params.ubicacion ?? '').trim(),
      p_platos_fijos: limpiarPlatosFijos(params.platos_fijos),
    }),
  );
  return aContrato(fila as FilaCafeteria);
}

/**
 * Cambia nombre, ubicación y platos fijos. El `id` NO se toca: es la clave
 * con la que las reservas históricas apuntan a esta sede, y renombrarlo las
 * dejaría huérfanas. El `codigo` tampoco, por lo mismo con los identificadores.
 */
export async function actualizar(params: Record<string, unknown>) {
  const nombre = String(params.nombre ?? '').trim();
  if (!nombre) romper('DATOS_INCOMPLETOS', 'La cafetería necesita al menos un nombre.');

  const fila = desempaquetar<FilaCafeteria | null>(
    await servicio().from('cafeteria').update({
      nombre,
      ubicacion: String(params.ubicacion ?? '').trim(),
      platos_fijos: limpiarPlatosFijos(params.platos_fijos),
    }).eq('id', String(params.id ?? '')).select(COLUMNAS).maybeSingle(),
  );
  if (!fila) romper('CAFETERIA_NO_ENCONTRADA', `No existe la cafetería «${params.id}».`);
  return aContrato(fila);
}

/**
 * Archivar y reactivar son el mismo gesto con distinto valor. Archivar es un
 * borrado lógico: la sede deja de ofrecerse, pero sus reservas siguen
 * intactas y sus consolidados históricos siguen cuadrando.
 */
async function cambiarActiva(id: string, activa: boolean) {
  const fila = desempaquetar<FilaCafeteria | null>(
    await servicio().from('cafeteria').update({ activa })
      .eq('id', id).select(COLUMNAS).maybeSingle(),
  );
  if (!fila) romper('CAFETERIA_NO_ENCONTRADA', `No existe la cafetería «${id}».`);
  return aContrato(fila);
}

export const archivar = (p: Record<string, unknown>) => cambiarActiva(String(p.id ?? ''), false);
export const reactivar = (p: Record<string, unknown>) => cambiarActiva(String(p.id ?? ''), true);

/** La fila cruda, para quien necesita `codigo` o `platos_fijos` por dentro. */
export async function filaDe(id: string): Promise<CafeteriaContrato | null> {
  const fila = desempaquetar<FilaCafeteria | null>(
    await servicio().from('cafeteria').select(COLUMNAS).eq('id', id).maybeSingle(),
  );
  return fila ? aContrato(fila) : null;
}

export type { Sesion };
