/**
 * Módulos, ajustes y registro: lo que administra la APLICACIÓN, no un módulo.
 *
 * Las tres cosas vivían fuera de la base y por eso no se podían cambiar sin
 * desplegar: los módulos eran una constante, el interruptor de fin de semana
 * una variable de entorno, y el registro no existía.
 */

import { servicio, desempaquetar } from '../supabase.js';
import { romper } from '../sobre.js';
import type { Sesion } from '../sesion.js';

export interface ModuloContrato {
  id: string;
  nombre: string;
  etiqueta: string;
  inicial: string;
  ruta: string;
  orden: number;
  activo: boolean;
}

interface FilaModulo {
  id: string; nombre: string; etiqueta: string | null; inicial: string | null;
  ruta: string | null; orden: number; activo: boolean;
}

const COLUMNAS_MODULO = 'id, nombre, etiqueta, inicial, ruta, orden, activo';

function aContratoModulo(fila: FilaModulo): ModuloContrato {
  return {
    id: fila.id,
    nombre: fila.nombre,
    etiqueta: fila.etiqueta ?? '',
    inicial: fila.inicial ?? '',
    ruta: fila.ruta ?? '',
    orden: fila.orden,
    activo: fila.activo !== false,
  };
}

/**
 * Los módulos, en el orden en que salen en la portada.
 *
 * Administración los ve TODOS, incluidos los apagados, porque tiene que poder
 * probar uno antes de publicarlo. Los demás solo ven los que están en
 * servicio: enseñar una tarjeta que al pulsarla rebota sería peor que no
 * enseñarla.
 */
export async function modulos(sesion: Sesion | null): Promise<ModuloContrato[]> {
  let consulta = servicio().from('modulo').select(COLUMNAS_MODULO).order('orden');
  if (sesion?.rol !== 'admin') consulta = consulta.eq('activo', true);
  return desempaquetar<FilaModulo[]>(await consulta).map(aContratoModulo);
}

/**
 * Enciende o apaga un módulo, y corrige sus textos.
 *
 * El `id` NO se toca: es el prefijo de sus rutas y de sus acciones, o sea lo
 * que une esta fila con el código que la sirve. Cambiarlo dejaría un módulo
 * que la aplicación no sabe servir.
 */
export async function actualizarModulo(params: Record<string, unknown>, sesion: Sesion) {
  const id = String(params.id ?? '').trim();
  if (!id) romper('DATOS_INCOMPLETOS', 'Hay que indicar el módulo.');

  const antes = desempaquetar<FilaModulo | null>(
    await servicio().from('modulo').select(COLUMNAS_MODULO).eq('id', id).maybeSingle(),
  );
  if (!antes) romper('MODULO_NO_ENCONTRADO', `No existe el módulo «${id}».`);

  const nombre = String(params.nombre ?? '').trim();
  if (!nombre) romper('DATOS_INCOMPLETOS', 'El módulo necesita al menos un nombre.');

  const activo = Boolean(params.activo);

  const fila = desempaquetar<FilaModulo | null>(
    await servicio().from('modulo').update({
      nombre,
      etiqueta: String(params.etiqueta ?? '').trim(),
      inicial: String(params.inicial ?? '').trim(),
      activo,
    }).eq('id', id).select(COLUMNAS_MODULO).maybeSingle(),
  );
  if (!fila) romper('MODULO_NO_ENCONTRADO', `No existe el módulo «${id}».`);

  // Solo se registra el encendido y el apagado. Corregir una etiqueta no es un
  // gesto que nadie vaya a auditar; cerrar un módulo al campus entero, sí.
  if (antes.activo !== activo) {
    await registrar(sesion, 'modulos.actualizar', id, {
      activo_antes: antes.activo, activo_despues: activo,
    });
  }

  return aContratoModulo(fila);
}

/* ── Ajustes ────────────────────────────────────────────────────────── */

export interface AjusteContrato {
  clave: string;
  valor: string;
  descripcion: string;
}

/** Todos los ajustes, con su descripción para que el panel sepa qué son. */
export async function ajustes(): Promise<AjusteContrato[]> {
  return desempaquetar<AjusteContrato[]>(
    await servicio().from('ajuste').select('clave, valor, descripcion').order('clave'),
  );
}

/**
 * Lee UN ajuste, con valor por defecto.
 *
 * Lo usan las acciones que dependen de un interruptor —`reservas.crear` mira
 * `permitir_fin_de_semana`— y por eso devuelve el defecto en vez de fallar: si
 * la fila no está, la regla tiene que seguir siendo la estricta, no ninguna.
 */
export async function ajuste(clave: string, porDefecto = ''): Promise<string> {
  const fila = desempaquetar<{ valor: string } | null>(
    await servicio().from('ajuste').select('valor').eq('clave', clave).maybeSingle(),
  );
  return fila?.valor ?? porDefecto;
}

/** Un ajuste booleano. Solo 'true' es verdadero: cualquier otra cosa, no. */
export const ajusteSiNo = async (clave: string) => (await ajuste(clave, 'false')) === 'true';

/**
 * Guarda un ajuste. Solo se pueden tocar los que YA existen.
 *
 * Sin esa regla, una clave mal escrita crearía un ajuste nuevo que nadie lee,
 * y el interruptor que se creía haber cambiado seguiría como estaba. Los
 * ajustes los declara `09-admin-general.sql`, no la pantalla.
 */
export async function guardarAjuste(params: Record<string, unknown>, sesion: Sesion) {
  const clave = String(params.clave ?? '').trim();
  if (!clave) romper('DATOS_INCOMPLETOS', 'Hay que indicar qué ajuste se cambia.');

  const antes = desempaquetar<{ valor: string } | null>(
    await servicio().from('ajuste').select('valor').eq('clave', clave).maybeSingle(),
  );
  if (!antes) romper('AJUSTE_NO_ENCONTRADO', `No existe el ajuste «${clave}».`);

  const valor = String(params.valor ?? '');

  const fila = desempaquetar<AjusteContrato | null>(
    await servicio().from('ajuste').update({
      valor,
      actualizado_en: new Date().toISOString(),
      actualizado_por: sesion.usuarioId,
    }).eq('clave', clave).select('clave, valor, descripcion').maybeSingle(),
  );

  if (antes.valor !== valor) {
    await registrar(sesion, 'ajustes.guardar', clave, { antes: antes.valor, despues: valor });
  }

  return fila;
}

/* ── Registro ───────────────────────────────────────────────────────── */

/**
 * Anota un gesto administrativo.
 *
 * NUNCA lanza, por lo mismo que las notificaciones: si el asiento no se puede
 * escribir, el cambio ya está hecho y deshacerlo por no poder anotarlo sería
 * peor. El fallo va al registro del servidor, que es donde alguien lo verá.
 *
 * `autor_nombre` va copiado y no consultado: borrar la cuenta después dejaría
 * un registro de acciones sin nadie a quien atribuirlas.
 */
export async function registrar(
  sesion: Sesion,
  accion: string,
  objeto: string,
  detalle: Record<string, unknown> = {},
): Promise<void> {
  try {
    await servicio().from('registro').insert({
      autor: sesion.usuarioId,
      autor_nombre: sesion.nombre,
      accion,
      objeto,
      detalle,
    });
  } catch (error) {
    console.error('[registro] no se pudo anotar', accion, objeto, error);
  }
}

/** Lo último que pasó, lo más reciente primero. */
export async function listarRegistro(params: Record<string, unknown>) {
  const limite = Math.min(Math.max(Number(params.limite ?? 100) || 100, 1), 500);

  return desempaquetar(
    await servicio().from('registro')
      .select('id, ocurrido_en, autor_nombre, accion, objeto, detalle')
      .order('ocurrido_en', { ascending: false })
      .order('id', { ascending: false })
      .limit(limite),
  );
}
