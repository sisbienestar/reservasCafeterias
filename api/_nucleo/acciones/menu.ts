/**
 * Las tres acciones del menú.
 *
 * La carta se indexa SOLO por fecha: las cinco sedes sirven lo mismo. Lo que
 * varía por sede son los platos fijos —Mini Lunch, los especiales—, que no
 * dependen del día y por eso viven en la cafetería.
 *
 * De ahí que `menu.delDia` tenga dos caras: con `cafeteria_id` devuelve lo
 * que se puede pedir HOY AHÍ (carta + fijos), que es lo que necesita el
 * formulario del mostrador; sin él devuelve solo la carta común, que es lo
 * que edita el administrador. Mezclar las dos dejaría al editor semanal
 * guardando los platos fijos dentro de la carta del lunes.
 */

import { servicio, desempaquetar } from '../supabase.js';
import { romper } from '../sobre.js';
import { aSlug, esDiaDeServicio, sumarDias, rangoDias, ES_FECHA } from '../dominio.js';
import { filaDe } from './cafeterias.js';

export interface OpcionContrato { id: string; nombre: string; fijo?: boolean }

function exigirFecha(fecha: unknown, campo = 'fecha'): string {
  const texto = String(fecha ?? '');
  if (!ES_FECHA.test(texto)) {
    romper('DATOS_INCOMPLETOS', `«${campo}» tiene que ser una fecha AAAA-MM-DD.`);
  }
  return texto;
}

/** La carta común publicada ese día. Lista vacía si no hay ninguna. */
async function cartaComun(fecha: string): Promise<OpcionContrato[]> {
  return desempaquetar(
    await servicio().rpc('carta_del_dia', { p_fecha: fecha }),
  ) as OpcionContrato[];
}

/**
 * Lo que se puede pedir ese día en esa sede: la carta del campus más los
 * platos fijos de la cafetería.
 *
 * Los fijos se ofrecen todos los días CON SERVICIO, haya carta publicada o
 * no: son productos permanentes, no platos del día. En sábado y domingo no se
 * ofrece nada, ni siquiera ellos.
 *
 * Si un fijo coincide con un plato de la carta, gana el de la carta y el fijo
 * se descarta: dos opciones con el mismo id dejarían la reserva sin saber a
 * cuál de las dos apunta.
 */
export async function ofertaDelDia(cafeteriaId: string, fecha: string): Promise<OpcionContrato[]> {
  if (!esDiaDeServicio(fecha)) return [];

  const [opciones, cafeteria] = await Promise.all([cartaComun(fecha), filaDe(cafeteriaId)]);
  const resultado: OpcionContrato[] = [...opciones];
  const vistos = new Set(resultado.map((o) => o.id));

  for (const bruto of cafeteria?.platos_fijos ?? []) {
    const nombre = String(bruto).trim();
    const id = aSlug(nombre);
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    resultado.push({ id, nombre, fijo: true });
  }
  return resultado;
}

export async function delDia(params: Record<string, unknown>) {
  const fecha = exigirFecha(params.fecha);
  const cafeteriaId = String(params.cafeteria_id ?? '').trim();

  return {
    fecha,
    opciones: cafeteriaId ? await ofertaDelDia(cafeteriaId, fecha) : await cartaComun(fecha),
  };
}

export async function semana(params: Record<string, unknown>) {
  const lunes = exigirFecha(params.lunes, 'lunes');
  const dias = desempaquetar(await servicio().rpc('carta_de_la_semana', { p_lunes: lunes }));
  return { lunes, dias };
}

/**
 * Guarda la carta de una semana entera.
 *
 * Se valida TODO antes de escribir nada. Es la diferencia entre «el jueves
 * tenía un plato repetido» y «el jueves tenía un plato repetido y encima
 * lunes, martes y miércoles ya están publicados»: no puede quedar media
 * semana en pie. La escritura en sí es una única llamada a
 * `guardar_carta_semana`, que corre entera dentro de una transacción.
 */
export async function guardarSemana(params: Record<string, unknown>) {
  const lunes = exigirFecha(params.lunes, 'lunes');
  if (!Array.isArray(params.dias)) {
    romper('DATOS_INCOMPLETOS', 'Falta la lista de días de la carta.');
  }

  const validas = new Set(rangoDias(lunes, sumarDias(lunes, 6)));
  const preparados: { fecha: string; opciones: OpcionContrato[] }[] = [];

  for (const dia of params.dias as { fecha?: string; platos?: unknown[] }[]) {
    const fecha = String(dia?.fecha ?? '');
    if (!validas.has(fecha)) {
      romper('RANGO_INVALIDO', `El día ${fecha} no pertenece a esa semana.`);
    }

    const conTexto = (Array.isArray(dia.platos) ? dia.platos : [])
      .filter((p) => String(p).trim());

    // Un fin de semana con platos es un descuido de quien edita, no una
    // excepción que conceder: la cocina no abre y esa carta no la vería nadie.
    if (!esDiaDeServicio(fecha) && conTexto.length > 0) {
      romper('SIN_SERVICIO', 'Los sábados y domingos no hay servicio: no llevan carta.');
    }

    const opciones: OpcionContrato[] = [];
    const vistos = new Set<string>();
    for (const bruto of conTexto) {
      const nombre = String(bruto).trim();
      const id = aSlug(nombre);
      if (!id) continue;
      if (vistos.has(id)) {
        romper('MENU_DUPLICADO', `«${nombre}» está repetido en la carta de ese día.`);
      }
      vistos.add(id);
      opciones.push({ id, nombre });
    }
    preparados.push({ fecha, opciones });
  }

  desempaquetar(await servicio().rpc('guardar_carta_semana', { p_dias: preparados }));
  return { lunes, dias: preparados };
}
