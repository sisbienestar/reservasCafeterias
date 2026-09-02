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
  /**
   * Quién RESPONDE por la sede en el control de salidas. Vacío = nadie.
   *
   * No confundir con `perfil.cafeteria_id`, que es a qué sede tiene ACCESO
   * una cuenta. Esto no abre ninguna puerta: es un dato que el cierre copia
   * dentro para saber quién estaba. Ver 19-control-salidas.sql.
   */
  responsable_usuario_id: string;
  responsable_nombre: string;
}

/*
 * El nombre del responsable viene EMBEBIDO y no en una segunda consulta: la
 * pantalla que lo enseña lista todas las sedes, y resolverlo aparte serían
 * cinco viajes para pintar cinco renglones.
 *
 * `!cafeteria_responsable_fkey` NO es decoración. Entre `cafeteria` y `perfil`
 * hay DOS caminos —este, y el `perfil.cafeteria_id` de siempre— y sin nombrar
 * la restricción PostgREST no sabe cuál se le pide y falla. La declara con ese
 * nombre `supabase/19-control-salidas.sql`, a propósito para poder escribirlo
 * aquí en vez de adivinarlo.
 */
const COLUMNAS = 'id, codigo, nombre, ubicacion, imagen, activa, platos_fijos,'
  + ' responsable_usuario_id, responsable:perfil!cafeteria_responsable_fkey(nombre)';

interface FilaCafeteria {
  id: string; codigo: string; nombre: string; ubicacion: string | null;
  imagen: string | null; activa: boolean; platos_fijos: string[] | null;
  responsable_usuario_id: string | null;
  responsable: { nombre: string } | null;
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
    responsable_usuario_id: fila.responsable_usuario_id ?? '',
    responsable_nombre: fila.responsable?.nombre ?? '',
  };
}

/**
 * Sin `incluir_inactivas`, solo las que están en servicio. El mostrador nunca
 * debe ver una sede cerrada; administración sí, para reabrirla.
 *
 * Fue la única acción de datos que se servía SIN sesión, mientras la portada
 * de reservas enseñaba las sedes del campus antes de entrar. Ya no: esa
 * pantalla también pide sesión, así que esta acción salió de
 * `ACCIONES_PUBLICAS` y `sesion` nunca llega nula.
 *
 * La comprobación de abajo se queda igual de todos modos. No es defensiva de
 * más: lo que impide es que un MOSTRADOR con sesión saque las archivadas
 * mandando el parámetro. Una sede cerrada es una decisión de administración
 * —que se cerró, y cuándo— y fiarse del parámetro habría bastado para verla.
 */
export async function listar(params: Record<string, unknown>, sesion: Sesion | null) {
  const puedeVerInactivas = sesion?.rol === 'admin' && Boolean(params.incluir_inactivas);

  let consulta = servicio().from('cafeteria').select(COLUMNAS).order('codigo');
  if (!puedeVerInactivas) consulta = consulta.eq('activa', true);
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
  const id = String(params.id ?? '');
  const nombre = String(params.nombre ?? '').trim();
  if (!nombre) romper('DATOS_INCOMPLETOS', 'La cafetería necesita al menos un nombre.');

  const fila = desempaquetar<FilaCafeteria | null>(
    await servicio().from('cafeteria').update({
      nombre,
      ubicacion: String(params.ubicacion ?? '').trim(),
      platos_fijos: limpiarPlatosFijos(params.platos_fijos),
      responsable_usuario_id: await responsableValido(params.responsable_usuario_id),
    }).eq('id', id).select(COLUMNAS).maybeSingle(),
  );
  if (!fila) romper('CAFETERIA_NO_ENCONTRADA', `No existe la cafetería «${params.id}».`);
  return aContrato(fila);
}

/**
 * El responsable tiene que ser una cuenta de MOSTRADOR.
 *
 * Y solo eso. Exigió durante un rato que además atendiera esta misma sede
 * —`perfil.cafeteria_id` igual a la cafetería— y era demasiado: con una sola
 * cuenta de mostrador dada de alta, tres de las cuatro cafeterías no podían
 * tener responsable, y el desplegable salía vacío sin que fuera un fallo.
 *
 * Responder por una sede y tener acceso a ella son dos cosas distintas, que es
 * justo lo que dice el comentario de la columna en `19-control-salidas.sql`.
 * Atarlas obligaba a crear una cuenta por sede antes de poder nombrar a nadie.
 *
 * Lo que SÍ se sigue exigiendo es el rol. Administración y el auxiliar van sin
 * sede —las ven todas—, así que ninguno «estaba» en una cafetería un día
 * concreto, y firmarles un cierre sería atribuirles un mostrador que no
 * atienden.
 *
 * Vacío borra la asignación, y es un estado legítimo: una sede recién abierta
 * todavía no tiene a nadie. El cierre saldrá sin nombre, que es la verdad.
 */
async function responsableValido(valor: unknown): Promise<string | null> {
  const usuarioId = String(valor ?? '').trim();
  if (!usuarioId) return null;

  const perfil = desempaquetar<{ nombre: string; rol: string } | null>(
    await servicio().from('perfil').select('nombre, rol')
      .eq('usuario_id', usuarioId).maybeSingle(),
  );

  if (!perfil) romper('DATOS_INCOMPLETOS', 'Esa cuenta no existe.');
  if (perfil.rol !== 'mostrador') {
    romper('DATOS_INCOMPLETOS',
      `«${perfil.nombre}» no es una cuenta de mostrador, así que no puede `
      + 'responder por una cafetería.');
  }
  return usuarioId;
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
