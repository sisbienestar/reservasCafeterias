/**
 * Las acciones del control de salidas.
 *
 * El cierre de caja: por sede y por día, lo que la caja registró frente a lo
 * que de verdad salió. Ver `supabase/19-control-salidas.sql`, que explica por
 * qué «salida» significa aquí algo distinto que en el FBE.04 de pedidos.
 *
 * NO cruza con pedidos: ninguna consulta de este archivo toca `pedido`,
 * `producto` ni `proveedor`. Lo único compartido es `cafeteria`.
 *
 * Como en el resto, lo que se valida aquí no es cortesía: la pantalla lo
 * repite para avisar antes, pero la que manda es esta.
 */

import { servicio, desempaquetar } from '../supabase.js';
import { romper } from '../sobre.js';
import { ES_FECHA, MAX_DIAS_RANGO, diasEntre } from '../dominio.js';
import { sedePermitida, exigirSede, type Sesion } from '../sesion.js';

/** Lo que la pantalla manda por cada producto con algo escrito. */
interface LineaEntrante {
  producto_id: number;
  ventas_registradas: number | null;
  salidas: number | null;
}

/**
 * Una casilla del formulario.
 *
 * Vacío es `null` y no cero, y aquí la distinción es el punto entero del
 * control: cero dice «se contó y no hubo ninguno» y vacío dice «no se contó».
 * Colapsarlas convertiría un hueco en un dato.
 *
 * Entero, porque se cuentan ventas y platos. Medio desayuno no existe, y el
 * esquema lo impone además con `INT`.
 */
function aCuenta(valor: unknown, campo: string): number | null {
  if (valor === null || valor === undefined || valor === '') return null;

  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 0) {
    romper('SALIDA_INVALIDA', `«${campo}» tiene que ser un número entero de cero para arriba.`);
  }
  return numero;
}

function fechaDe(params: Record<string, unknown>, campo = 'fecha'): string {
  const fecha = String(params[campo] ?? '');
  if (!ES_FECHA.test(fecha)) {
    romper('DATOS_INCOMPLETOS', `«${campo}» tiene que ser AAAA-MM-DD.`);
  }
  return fecha;
}

/**
 * Guarda —o corrige— el cierre de una sede en un día.
 *
 * Una sola acción para las dos cosas, porque para quien cierra la caja son la
 * misma: se rellena la hoja y se guarda. Que sea la primera vez o la tercera
 * lo sabe la base, con el índice único de (fecha, sede).
 */
export async function guardar(params: Record<string, unknown>, sesion: Sesion) {
  const fecha = fechaDe(params);

  /*
   * El mostrador NO elige sede: se le impone la suya. La misma guarda de
   * reservas y pedidos, y por lo mismo — filtrar por el `cafeteria_id` que
   * llega en los parámetros sería dejar que el cliente decida un permiso.
   */
  const cafeteriaId = sedePermitida(sesion, params.cafeteria_id);
  if (!cafeteriaId) romper('DATOS_INCOMPLETOS', 'Hay que indicar la cafetería.');

  /*
   * Y además se EXIGE, que no es lo mismo.
   *
   * `sedePermitida` le impone la suya al mostrador en silencio, y para las
   * reservas eso está bien: allí solo hay una pantalla y no puede pedir otra
   * cosa. Aquí sí puede — el cierre del día enseña varias cafeterías — y
   * sustituir sin decir nada guardaría en la sede equivocada unas cifras que
   * parecerían correctas.
   *
   * Con esto, pedir una sede ajena falla en vez de escribir donde no toca. La
   * pantalla ya no se lo ofrece; esto es lo que lo hace cierto.
   */
  const pedida = String(params.cafeteria_id ?? '').trim();
  if (pedida) exigirSede(sesion, pedida);

  const cafeteria = desempaquetar<{
    nombre: string; activa: boolean; responsable_usuario_id: string | null;
  } | null>(
    await servicio().from('cafeteria')
      .select('nombre, activa, responsable_usuario_id')
      .eq('id', cafeteriaId).maybeSingle(),
  );

  if (!cafeteria) romper('CAFETERIA_NO_ENCONTRADA', `No existe la cafetería «${cafeteriaId}».`);
  if (!cafeteria.activa) {
    romper('SALIDA_INVALIDA', `«${cafeteria.nombre}» está cerrada: no tiene caja que cuadrar.`);
  }

  /*
   * El nombre del responsable se resuelve AQUÍ y se copia dentro del cierre.
   *
   * Sale de la asignación de la cafetería, no de la sesión: quien teclea puede
   * ser administración corrigiendo un cierre ajeno, y entonces poner su propio
   * nombre diría que estuvo en un mostrador donde no estuvo. Quién tecleó se
   * guarda aparte, en `guardado_por`.
   *
   * Una sede sin responsable asignado guarda igual, con el nombre vacío: el
   * cierre existió aunque nadie lo hubiera asignado todavía, y negarse a
   * guardarlo perdería el dato por un motivo administrativo.
   */
  let responsable = '';
  if (cafeteria.responsable_usuario_id) {
    const perfil = desempaquetar<{ nombre: string } | null>(
      await servicio().from('perfil').select('nombre')
        .eq('usuario_id', cafeteria.responsable_usuario_id).maybeSingle(),
    );
    responsable = perfil?.nombre ?? '';
  }

  const { data, error } = await servicio().rpc('guardar_cierre_salidas', {
    p_fecha: fecha,
    p_cafeteria_id: cafeteriaId,
    p_responsable_nombre: responsable,
    p_guardado_por: sesion.usuarioId,
    p_guardado_nombre: sesion.nombre,
    p_lineas: leerLineas(params.lineas),
  });

  if (error) {
    if (String(error.message ?? '').includes('PRODUCTO_AJENO')) {
      romper('SALIDA_INVALIDA',
        'Alguno de los productos no existe o está dado de baja.');
    }
    throw error;
  }

  return data;
}

/**
 * El cierre de una sede en un día, con sus cifras.
 *
 * Devuelve `null` cuando esa sede no ha cerrado ese día, y NO es un error: es
 * el formulario en blanco. El hueco es un estado normal de esta pantalla —de
 * hecho es el estado con el que empieza cada mañana—.
 */
export async function obtener(params: Record<string, unknown>, sesion: Sesion) {
  const fecha = fechaDe(params);
  const cafeteriaId = sedePermitida(sesion, params.cafeteria_id);
  if (!cafeteriaId) romper('DATOS_INCOMPLETOS', 'Hay que indicar la cafetería.');

  return desempaquetar(
    await servicio().rpc('detalle_cierre_salidas', {
      p_fecha: fecha, p_cafeteria_id: cafeteriaId,
    }),
  );
}

/**
 * El día entero: todas las sedes en servicio, hayan cerrado o no.
 *
 * Es lo que alimenta el documento imprimible, y por eso CRUZA SEDES por
 * definición: el control consiste en verlas juntas. Solo `admin` — es el
 * mismo argumento por el que `pedidos.analisis` tampoco es del mostrador.
 */
export async function dia(params: Record<string, unknown>) {
  return desempaquetar(
    await servicio().rpc('dia_salidas', { p_fecha: fechaDe(params) }),
  );
}

/**
 * El historial: los cierres de un rango, con sus totales.
 *
 * La FICHA de cada uno, no sus líneas. Se piden al abrir uno, por la misma
 * disciplina de un viaje por gesto que sigue `pedidos.buscar`.
 */
export async function buscar(params: Record<string, unknown>, sesion: Sesion) {
  const desde = fechaDe(params, 'desde');
  const hasta = fechaDe(params, 'hasta');

  if (desde > hasta) romper('RANGO_INVALIDO', 'La fecha inicial es posterior a la final.');
  if (diasEntre(desde, hasta) > MAX_DIAS_RANGO) {
    romper('RANGO_INVALIDO', `El rango no puede pasar de ${MAX_DIAS_RANGO} días.`);
  }

  // El mostrador ve SU sede y nada más, pida la que pida. Quien no tiene sede
  // —administración, el auxiliar— recibe `null` y las ve todas.
  const cafeteriaId = sedePermitida(sesion, params.cafeteria_id);

  return desempaquetar(
    await servicio().rpc('buscar_salidas', {
      p_desde: desde, p_hasta: hasta, p_cafeteria_id: cafeteriaId ?? '',
    }),
  );
}

/**
 * Los DÍAS con cierre de un rango, con los totales consolidados.
 *
 * Es lo que lista el historial: una fila por fecha y no por (fecha, sede).
 * Con cuatro cafeterías, un mes son ciento veinte filas para responder a una
 * pregunta que se hace por días — «¿cómo cerró el martes?» — y la respuesta
 * sede por sede está a un clic, en `salidas.dia`.
 *
 * `salidas.buscar` sigue existiendo para la otra pregunta: cómo ha ido UNA
 * sede a lo largo del tiempo.
 */
export async function dias(params: Record<string, unknown>, sesion: Sesion) {
  const desde = fechaDe(params, 'desde');
  const hasta = fechaDe(params, 'hasta');

  if (desde > hasta) romper('RANGO_INVALIDO', 'La fecha inicial es posterior a la final.');
  if (diasEntre(desde, hasta) > MAX_DIAS_RANGO) {
    romper('RANGO_INVALIDO', `El rango no puede pasar de ${MAX_DIAS_RANGO} días.`);
  }

  // El mostrador ve SUS días, con sus propias cifras. Quien no tiene sede
  // —administración, el auxiliar— recibe null y ve el consolidado de todas.
  const cafeteriaId = sedePermitida(sesion, params.cafeteria_id);

  return desempaquetar(
    await servicio().rpc('dias_salidas', {
      p_desde: desde, p_hasta: hasta, p_cafeteria_id: cafeteriaId ?? '',
    }),
  );
}

/**
 * Se quedan solo los renglones con ALGO escrito.
 *
 * Un producto con las dos casillas en blanco no es un renglón del cierre: es
 * una casilla que no se tocó. Filtrarlas aquí es lo que hace que el documento
 * salga con lo que de verdad se contó.
 *
 * Un producto con un cero SÍ entra, y esa es toda la diferencia: dice que se
 * miró y no hubo ninguno.
 */
function leerLineas(bruto: unknown): LineaEntrante[] {
  if (!Array.isArray(bruto)) {
    romper('DATOS_INCOMPLETOS', '«lineas» tiene que ser una lista.');
  }

  const lineas: LineaEntrante[] = [];
  const vistos = new Set<number>();

  for (const cruda of bruto) {
    const fila = (cruda ?? {}) as Record<string, unknown>;
    const productoId = Number(fila.producto_id);

    if (!Number.isInteger(productoId) || productoId <= 0) {
      romper('SALIDA_INVALIDA', 'Hay un renglón sin producto.');
    }

    const ventas = aCuenta(fila.ventas_registradas, 'ventas_registradas');
    const salidas = aCuenta(fila.salidas, 'salidas');
    if (ventas === null && salidas === null) continue;

    if (vistos.has(productoId)) {
      romper('SALIDA_INVALIDA', 'Hay un producto repetido en el cierre.');
    }
    vistos.add(productoId);

    lineas.push({ producto_id: productoId, ventas_registradas: ventas, salidas });
  }

  return lineas;
}

/* ── El catálogo · solo `admin` ─────────────────────────────────────── */

const COLUMNAS_PRODUCTO = 'id, nombre, orden, activo';

interface FilaProducto {
  id: number; nombre: string; orden: number; activo: boolean;
}

/**
 * El catálogo entero, archivados incluidos.
 *
 * Los archivados los necesita el panel para poder reactivarlos; el formulario
 * de cierre pide `solo_activos`. Es la misma diferencia que hay entre
 * `productos.listar` y `proveedores.obtener` en pedidos.
 */
export async function listarProductos(params: Record<string, unknown>) {
  let consulta = servicio().from('salida_producto').select(COLUMNAS_PRODUCTO).order('orden');
  if (params.solo_activos) consulta = consulta.eq('activo', true);
  return desempaquetar<FilaProducto[]>(await consulta);
}

/**
 * Añade un producto al final del catálogo.
 *
 * El `orden` lo asigna el SERVIDOR y no llega en los parámetros: calcularlo en
 * el cliente deja una ventana en la que otra alta se lleva el mismo número, y
 * `salida_producto_orden_unico` la rechazaría con un error que no dice nada.
 */
export async function crearProducto(params: Record<string, unknown>) {
  const nombre = String(params.nombre ?? '').trim();
  if (!nombre) romper('DATOS_INCOMPLETOS', 'El producto necesita un nombre.');

  const ultimo = desempaquetar<{ orden: number }[]>(
    await servicio().from('salida_producto').select('orden')
      .order('orden', { ascending: false }).limit(1),
  );

  const { data, error } = await servicio().from('salida_producto')
    .insert({ nombre, orden: (ultimo[0]?.orden ?? 0) + 1 })
    .select(COLUMNAS_PRODUCTO).maybeSingle();

  if (error) {
    if (error.code === '23505') {
      romper('SALIDA_INVALIDA', `Ya hay un producto llamado «${nombre}».`);
    }
    throw error;
  }
  return data;
}

export async function actualizarProducto(params: Record<string, unknown>) {
  const nombre = String(params.nombre ?? '').trim();
  if (!nombre) romper('DATOS_INCOMPLETOS', 'El producto necesita un nombre.');

  const fila = desempaquetar<FilaProducto | null>(
    await servicio().from('salida_producto').update({ nombre })
      .eq('id', Number(params.id)).select(COLUMNAS_PRODUCTO).maybeSingle(),
  );
  if (!fila) romper('SALIDA_INVALIDA', 'Ese producto ya no existe.');
  return fila;
}

/**
 * Archivar, nunca borrar.
 *
 * Los cierres ya escritos apuntan aquí con una clave foránea, así que borrar
 * un producto dejaría líneas sin catálogo. Y el nombre está copiado en cada
 * línea, así que archivarlo no altera ni un cierre viejo: deja de ofrecerse
 * en el formulario y ya.
 */
async function cambiarActivo(id: number, activo: boolean) {
  const fila = desempaquetar<FilaProducto | null>(
    await servicio().from('salida_producto').update({ activo })
      .eq('id', id).select(COLUMNAS_PRODUCTO).maybeSingle(),
  );
  if (!fila) romper('SALIDA_INVALIDA', 'Ese producto ya no existe.');
  return fila;
}

export const archivarProducto = (p: Record<string, unknown>) => cambiarActivo(Number(p.id), false);
export const reactivarProducto = (p: Record<string, unknown>) => cambiarActivo(Number(p.id), true);
