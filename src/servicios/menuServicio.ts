/**
 * Servicio de menú.
 *
 * El menú cambia cada semana, así que nunca se escribe en el código: la vista
 * lo pide aquí y pinta lo que llegue, sean dos opciones o tres.
 *
 * **La carta es del día, no de la cafetería**: las cinco sedes sirven lo
 * mismo. Lo que sí varía por sede son los platos fijos —Mini Lunch, los
 * especiales—, y por eso `getMenuDelDia` sí recibe la cafetería: pide «lo que
 * se puede pedir hoy aquí», no «la carta de hoy».
 */

import { pedir } from './api.js';

export interface OpcionMenu {
  id: string;
  nombre: string;
  /** Producto permanente de la sede, no plato del día. El formulario los
   *  agrupa por separado para que no parezcan parte de la carta. */
  fijo: boolean;
}

interface FilaOpcion { id: string; nombre: string; fijo?: boolean }

const normalizarOpcion = (o: FilaOpcion): OpcionMenu =>
  ({ id: o.id, nombre: o.nombre, fijo: o.fijo === true });

/**
 * Lo que se puede pedir ese día en esa cafetería: la carta común del campus
 * más los platos fijos de la sede.
 *
 * Sin `cafeteriaId` devuelve solo la carta común, que es lo que administra el
 * editor semanal.
 *
 * Devuelve [] si no hay nada disponible: es un caso válido, no un error.
 */
export async function getMenuDelDia(
  cafeteriaId: string | null,
  fecha: string,
): Promise<OpcionMenu[]> {
  const registro = await pedir<{ fecha: string; opciones: FilaOpcion[] }>('menu.delDia', {
    fecha,
    cafeteria_id: cafeteriaId ?? '',
  });
  return (registro?.opciones ?? []).map(normalizarOpcion);
}

export interface DiaDeCarta { fecha: string; opciones: OpcionMenu[] }

/**
 * La carta de los siete días de una semana, para administrarla de una vez.
 * Devuelve siempre siete entradas, con `opciones: []` en los días sin carta.
 */
export async function getMenuSemana(lunes: string): Promise<DiaDeCarta[]> {
  const datos = await pedir<{ lunes: string; dias: { fecha: string; opciones: FilaOpcion[] }[] }>(
    'menu.semana', { lunes },
  );
  return datos.dias.map((dia) => ({
    fecha: dia.fecha,
    opciones: (dia.opciones ?? []).map(normalizarOpcion),
  }));
}

/**
 * Guarda la carta de una semana entera. Los platos son nombres escritos a
 * mano; el id lo asigna el servidor. Un día con la lista vacía se queda sin
 * carta: es la forma de decir «ese día no hay servicio».
 *
 * La escritura es atómica: o entran los siete días o no entra ninguno.
 * Lanza MENU_DUPLICADO si dos platos del mismo día tienen el mismo nombre.
 */
export async function guardarMenuSemana(
  lunes: string,
  dias: { fecha: string; platos: string[] }[],
): Promise<DiaDeCarta[]> {
  const datos = await pedir<{ lunes: string; dias: { fecha: string; opciones: FilaOpcion[] }[] }>(
    'menu.guardarSemana', { lunes, dias },
  );
  return datos.dias.map((dia) => ({
    fecha: dia.fecha,
    opciones: (dia.opciones ?? []).map(normalizarOpcion),
  }));
}
