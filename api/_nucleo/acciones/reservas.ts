/**
 * Las cinco acciones de reservas. Es donde están las reglas que importan.
 *
 * Reparto de responsabilidades, y conviene tenerlo claro antes de tocar nada:
 *
 *   AQUÍ            lo que produce un código de error del contrato y hay que
 *                   poder explicarle a quien está en el mostrador —falta un
 *                   dato, ese plato no está en la carta, hoy no hay servicio—.
 *   EN POSTGRES     lo que solo la base de datos puede garantizar: que dos
 *                   mostradores a la vez no repitan un consecutivo ni cuelen
 *                   dos reservas del mismo móvil, y que la reserva y su
 *                   asiento de historial entren o no entren juntos.
 *
 * La regla del duplicado, en concreto, NO se comprueba aquí con un SELECT
 * previo. Podría, y daría el mismo mensaje, pero entre ese SELECT y el INSERT
 * cabe otra petición: es exactamente la carrera que en Apps Script tapaba un
 * bloqueo global. Se deja que la imponga el índice `reserva_sin_duplicado` y
 * se traduce el error que devuelve. Así no hay ventana.
 */

import { servicio, desempaquetar } from '../supabase.js';
import { romper } from '../sobre.js';
import {
  ES_FECHA, LIMITE_DETALLE, MAX_DIAS_RANGO, VALORES_MEDIO, VALORES_PAGO,
  diasEntre, esDiaDeServicio, normalizarBusqueda,
} from '../dominio.js';
import { ofertaDelDia } from './menu.js';
import { exigirSede, sedePermitida, type Sesion } from '../sesion.js';

/**
 * Lo poco que hace falta leer de una reserva antes de editarla: la sede, para
 * saber si quien edita puede, y la fecha, para saber contra qué carta validar
 * el plato. El resto lo resuelve `actualizar_reserva` con la fila ya tomada.
 */
interface FilaReservaPrevia {
  id: string;
  cafeteria_id: string;
  fecha: string;
  estado: string;
}

/* ── Validaciones ────────────────────────────────────────────────────── */

/**
 * `medio` y `pago` se validan en el servidor además de en el formulario, y no
 * por desconfiar del navegador: «pagado» o «debe» es dinero, y un valor
 * inventado por una petición hecha a mano dejaría la contabilidad en un
 * estado que ninguna pantalla sabe pintar.
 *
 * Ninguno tiene valor por defecto. Uno preseleccionado en `pago` acabaría
 * marcando como pagado lo que no lo está.
 */
function exigirOpciones(medio: unknown, pago: unknown): { medio: string; pago: string } {
  const revisar: [string, unknown, readonly string[]][] = [
    ['medio', medio, VALORES_MEDIO],
    ['pago', pago, VALORES_PAGO],
  ];
  for (const [campo, valor, admitidos] of revisar) {
    if (!valor) romper('DATOS_INCOMPLETOS', `Falta indicar «${campo}» en la reserva.`);
    if (!admitidos.includes(String(valor))) {
      romper('DATOS_INCOMPLETOS',
        `«${valor}» no es un valor válido para «${campo}»: se espera ${admitidos.join(' o ')}.`);
    }
  }
  return { medio: String(medio), pago: String(pago) };
}

/** El plato tiene que estar en la carta DE ESA FECHA y esa sede. */
async function exigirPlato(cafeteriaId: string, fecha: string, menuId: unknown) {
  const plato = (await ofertaDelDia(cafeteriaId, fecha)).find((o) => o.id === String(menuId));
  if (!plato) romper('MENU_INVALIDO', 'Ese plato no está en la carta de ese día.');
  return plato;
}

/** Escapa los comodines de LIKE. Sin esto, buscar «100%» devolvería a todo el
 *  mundo, y un guion bajo casaría con cualquier carácter. */
const escaparLike = (t: string) => t.replace(/[\\%_]/g, (c) => `\\${c}`);

/* ── Acciones ────────────────────────────────────────────────────────── */

export async function delDia(params: Record<string, unknown>, sesion: Sesion) {
  const fecha = String(params.fecha ?? '');
  if (!ES_FECHA.test(fecha)) romper('DATOS_INCOMPLETOS', '«fecha» tiene que ser AAAA-MM-DD.');

  // El mostrador consulta SIEMPRE su sede, pida la que pida.
  const cafeteriaId = sedePermitida(sesion, params.cafeteria_id);
  if (!cafeteriaId) romper('DATOS_INCOMPLETOS', 'Hay que indicar la cafetería.');

  return desempaquetar(await servicio().rpc('reservas_del_dia', {
    p_cafeteria_id: cafeteriaId,
    p_fecha: fecha,
  }));
}

export async function crear(params: Record<string, unknown>, sesion: Sesion) {
  const fecha = String(params.fecha ?? '');
  if (!ES_FECHA.test(fecha)) romper('DATOS_INCOMPLETOS', '«fecha» tiene que ser AAAA-MM-DD.');

  const cafeteriaId = sedePermitida(sesion, params.cafeteria_id);
  if (!cafeteriaId) romper('DATOS_INCOMPLETOS', 'Hay que indicar la cafetería.');

  const nombre = String(params.nombre ?? '').trim();
  const telefono = String(params.telefono ?? '').trim();
  if (!nombre || !telefono || !params.menu_id) {
    romper('DATOS_INCOMPLETOS', 'Faltan datos obligatorios en la reserva.');
  }

  const { medio, pago } = exigirOpciones(params.medio, params.pago);

  if (!esDiaDeServicio(fecha)) {
    romper('SIN_SERVICIO', 'Los sábados y domingos no hay servicio de almuerzo.');
  }

  const plato = await exigirPlato(cafeteriaId, fecha, params.menu_id);

  // El identificador lo asigna el servidor, nunca el cliente: el consecutivo
  // depende de lo que ya hay en la base, y dos mostradores registrando a la
  // vez calcularían el mismo número.
  return desempaquetar(await servicio().rpc('crear_reserva', {
    p_cafeteria_id: cafeteriaId,
    p_fecha: fecha,
    p_nombre: nombre,
    p_telefono: telefono,
    p_menu_id: plato.id,
    p_menu_nombre: plato.nombre,
    p_medio: medio,
    p_pago: pago,
    p_autor: sesion.usuarioId,
  }));
}

/**
 * Edición. No recibe `cafeteria_id` ni `fecha`: no son editables, y dejarlas
 * fuera de la firma evita que una pantalla futura las cambie por descuido.
 *
 * Se lee la reserva antes de escribir, pero solo para dos cosas que no puede
 * hacer la función de Postgres: comprobar que quien edita es de esa sede, y
 * saber contra qué fecha validar el plato. El historial y la comprobación de
 * «no cambió nada» los calcula `actualizar_reserva` con la fila ya tomada,
 * porque entre esta lectura y la escritura otra persona puede guardar.
 */
export async function actualizar(params: Record<string, unknown>, sesion: Sesion) {
  const id = String(params.id ?? '');
  const previa = desempaquetar<FilaReservaPrevia | null>(
    await servicio().from('reserva').select('id, cafeteria_id, fecha, estado')
      .eq('id', id).maybeSingle(),
  );
  if (!previa) romper('RESERVA_NO_ENCONTRADA', 'Esa reserva ya no existe.');
  exigirSede(sesion, previa.cafeteria_id);
  if (previa.estado === 'cancelada') {
    romper('RESERVA_CANCELADA', 'Esa reserva está cancelada y ya no se puede editar.');
  }

  const nombre = String(params.nombre ?? '').trim();
  const telefono = String(params.telefono ?? '').trim();
  if (!nombre || !telefono || !params.menu_id) {
    romper('DATOS_INCOMPLETOS', 'Faltan datos obligatorios en la reserva.');
  }

  const { medio, pago } = exigirOpciones(params.medio, params.pago);
  const plato = await exigirPlato(previa.cafeteria_id, previa.fecha, params.menu_id);

  return desempaquetar(await servicio().rpc('actualizar_reserva', {
    p_id: id,
    p_nombre: nombre,
    p_telefono: telefono,
    p_menu_id: plato.id,
    p_menu_nombre: plato.nombre,
    p_medio: medio,
    p_pago: pago,
    p_autor: sesion.usuarioId,
  }));
}

/**
 * Cancelar es un borrado LÓGICO: la fila se marca, no se quita. Solo lo hace
 * administración —el mostrador no cancela, igual que en el prototipo—, y por
 * eso aquí no hace falta filtrar por sede.
 */
export async function cancelar(params: Record<string, unknown>, sesion: Sesion) {
  return desempaquetar(await servicio().rpc('cancelar_reserva', {
    p_id: String(params.id ?? ''),
    p_autor: sesion.usuarioId,
  }));
}

/**
 * Búsqueda con filtros más consolidado, en UNA llamada.
 *
 * El detalle y el resumen salen juntos de `buscar_reservas` a propósito. Dos
 * llamadas encadenadas —primero las filas, luego los totales— es justo lo que
 * el proyecto lleva un año quitándose de encima.
 */
export async function buscar(params: Record<string, unknown>, sesion: Sesion) {
  const desde = String(params.desde ?? '');
  const hasta = String(params.hasta ?? '');

  if (!ES_FECHA.test(desde) || !ES_FECHA.test(hasta)) {
    romper('RANGO_INVALIDO', 'Hay que indicar la fecha de inicio y la de fin.');
  }
  if (desde > hasta) {
    romper('RANGO_INVALIDO', 'La fecha de inicio es posterior a la de fin.');
  }
  // Un rango sin tope se rompe en silencio: la serie diaria se corta y
  // `por_dia` deja de cuadrar con los totales, sin ninguna pista de por qué.
  if (diasEntre(desde, hasta) > MAX_DIAS_RANGO) {
    romper('RANGO_INVALIDO',
      `El rango no puede superar ${MAX_DIAS_RANGO} días. Consulta por periodos más cortos.`);
  }

  const estado = String(params.estado ?? '').trim();
  if (estado && estado !== 'activa' && estado !== 'cancelada') {
    romper('DATOS_INCOMPLETOS', `«${estado}» no es un estado de reserva.`);
  }

  // Se busca por nombre O por móvil con el mismo cuadro de texto: quien
  // atiende no debería tener que elegir en cuál de los dos está escribiendo.
  const texto = normalizarBusqueda(params.texto);
  const digitos = texto.replace(/\D/g, '');

  const limite = params.limite === undefined ? LIMITE_DETALLE : Number(params.limite);

  return desempaquetar(await servicio().rpc('buscar_reservas', {
    p_desde: desde,
    p_hasta: hasta,
    p_cafeteria_id: sedePermitida(sesion, params.cafeteria_id),
    p_estado: estado || null,
    p_texto: texto ? escaparLike(texto) : null,
    p_digitos: digitos,
    p_limite: Number.isFinite(limite) && limite > 0 ? limite : 0,
  }));
}
