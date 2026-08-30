/**
 * El análisis del histórico de pedidos.
 *
 * Una sola acción para las seis vistas del panel. Aquí no se calcula nada: la
 * cuenta la hace `analisis_pedidos` en SQL, que es donde están las filas. Este
 * archivo valida los filtros y poco más — pero esa validación no es cortesía:
 * los parámetros entran en una función con SECURITY DEFINER, y un rango sin
 * tope es una consulta que se puede pedir del año 1900 a hoy para tumbar la
 * base.
 *
 * Solo la usa `admin`, y está en PERMISOS: el mostrador no ve el consumo de
 * las otras sedes ni en el historial ni aquí. Por eso este archivo NO llama a
 * `sedePermitida`: no hay caso «mostrador con su sede», simplemente no entra.
 */

import { servicio, desempaquetar } from '../supabase.js';
import { romper } from '../sobre.js';
import { ES_FECHA, MAX_DIAS_RANGO, diasEntre } from '../dominio.js';

/** Las tres casillas del FBE.04. Vacío = sin filtrar. */
const CATEGORIAS = ['Alimentos y bebidas', 'Aseo y productos químicos', 'Desechables'];

/** Cuántos productos puede pedir el «top». Más de 50 no cabe en una pantalla. */
const TOP_MAXIMO = 50;
const TOP_POR_DEFECTO = 20;

/** El umbral de desuso, en días. Un año es el tope: más allá, «nunca». */
const DESUSO_MAXIMO = 730;
const DESUSO_POR_DEFECTO = 90;

/**
 * Un entero de los parámetros, acotado. Fuera de rango se recorta en vez de
 * fallar: son ajustes de presentación, no datos, y romper la pantalla porque
 * alguien pidió un top de 900 sería desproporcionado.
 */
function entero(valor: unknown, porDefecto: number, minimo: number, maximo: number): number {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return porDefecto;
  return Math.min(Math.max(Math.trunc(numero), minimo), maximo);
}

export async function pedidos(params: Record<string, unknown>) {
  const desde = String(params.desde ?? '');
  const hasta = String(params.hasta ?? '');

  if (!ES_FECHA.test(desde) || !ES_FECHA.test(hasta)) {
    romper('DATOS_INCOMPLETOS', '«desde» y «hasta» tienen que ser AAAA-MM-DD.');
  }
  if (desde > hasta) {
    romper('RANGO_INVALIDO', 'La fecha inicial es posterior a la final.');
  }
  if (diasEntre(desde, hasta) > MAX_DIAS_RANGO) {
    romper('RANGO_INVALIDO', `El rango no puede pasar de ${MAX_DIAS_RANGO} días.`);
  }

  const categoria = String(params.categoria ?? '').trim();
  if (categoria && !CATEGORIAS.includes(categoria)) {
    romper('DATOS_INCOMPLETOS', `«categoria» solo puede ser ${CATEGORIAS.join(', ')}.`);
  }

  const granularidad = String(params.granularidad ?? 'mes').trim() || 'mes';
  if (!['mes', 'semana'].includes(granularidad)) {
    romper('DATOS_INCOMPLETOS', '«granularidad» solo puede ser «mes» o «semana».');
  }

  /*
   * El producto llega como número. Un 0 —o cualquier cosa que no sea un
   * entero positivo— significa «sin filtrar», que es lo que la función SQL
   * espera; no se falla por un valor raro porque el filtro es opcional.
   */
  const productoId = entero(params.producto_id, 0, 0, Number.MAX_SAFE_INTEGER);

  const datos = desempaquetar<unknown>(
    await servicio().rpc('analisis_pedidos', {
      p_desde: desde,
      p_hasta: hasta,
      p_cafeteria_id: String(params.cafeteria_id ?? '').trim(),
      p_proveedor_id: String(params.proveedor_id ?? '').trim(),
      p_categoria: categoria,
      p_producto_id: productoId,
      p_top: entero(params.top, TOP_POR_DEFECTO, 5, TOP_MAXIMO),
      p_dias_desuso: entero(params.dias_desuso, DESUSO_POR_DEFECTO, 7, DESUSO_MAXIMO),
      p_granularidad: granularidad,
    }),
  );

  return datos;
}
