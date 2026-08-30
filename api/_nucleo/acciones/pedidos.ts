/**
 * Las acciones de pedidos.
 *
 * Lo que aquí se valida NO es cortesía para dar buenos mensajes: la pantalla
 * repite estas reglas para avisar antes, pero la que manda es esta. Un
 * navegador con las herramientas de desarrollo abiertas puede mandar
 * cualquier cosa, y este archivo es lo único que hay entre eso y la base.
 *
 * La escritura en sí la hace `crear_pedido` en SQL, que es donde puede ser
 * atómica y donde el texto del documento se copia del catálogo en vez de
 * creerse el que llega por el cable.
 */

import { servicio, desempaquetar } from '../supabase.js';
import { romper } from '../sobre.js';
import { ES_FECHA, LIMITE_DETALLE, MAX_DIAS_RANGO, diasEntre } from '../dominio.js';
import { sedePermitida, type Rol, type Sesion } from '../sesion.js';
import { notificarPedido, type PedidoNotificable } from '../notificaciones.js';

/** Lo que la pantalla manda por cada renglón con cantidad. */
interface LineaEntrante {
  producto_id: number;
  cantidad_solicitada: number;
  cantidad_devuelta: number | null;
  cantidad_adicional: number | null;
}

/** Hasta dos decimales, como la columna. Más sería un redondeo silencioso. */
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Los cuatro estados, en el orden en que le pasan a un pedido.
 *
 * El mismo CHECK que `pedido_estado_valido`. En una lista y no repetidos en
 * cada sitio que los nombra, para que añadir el quinto —si algún día lo hay—
 * no deje un filtro rechazándolo mientras el resto lo acepta.
 */
const ESTADOS = ['creado', 'enviado', 'confirmado', 'anulado'] as const;

/**
 * Una cantidad del formulario.
 *
 * Vacío es `null` y no cero: en un pedido, «no pedí nada de esto» y «pedí
 * cero» son lo mismo de cara al papel, pero en las casillas del almacén
 * —devuelta, adicional— un cero escrito a mano SÍ dice algo distinto de una
 * casilla en blanco: dice que se comprobó y no hubo devolución.
 */
function aCantidad(valor: unknown, campo: string): number | null {
  if (valor === null || valor === undefined || valor === '') return null;

  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) {
    romper('PEDIDO_INVALIDO', `«${campo}» tiene que ser un número de cero para arriba.`);
  }
  return Math.round(numero * 100) / 100;
}

/**
 * Crea un pedido con sus líneas.
 *
 * Las columnas que se aceptan dependen del tipo de documento del PROVEEDOR,
 * no de lo que diga el cliente: `tipo_documento` no es un parámetro. Mandarlo
 * habría permitido pedirle a Coca-Cola con la plantilla del almacén.
 */
export async function crear(params: Record<string, unknown>, sesion: Sesion) {
  const proveedorId = String(params.proveedor_id ?? '').trim();
  if (!proveedorId) romper('DATOS_INCOMPLETOS', 'Hay que indicar el proveedor.');

  /*
   * El mostrador NO elige sede: se le impone la suya, se haya pedido la que
   * se haya pedido. Es la misma guarda que en reservas, y por lo mismo:
   * filtrar por el `cafeteria_id` que llega en los parámetros sería confiar
   * en el cliente para decidir un permiso.
   */
  const cafeteriaId = sedePermitida(sesion, params.cafeteria_id);
  if (!cafeteriaId) romper('DATOS_INCOMPLETOS', 'Hay que indicar la cafetería.');

  const fechaElaboracion = String(params.fecha_elaboracion ?? '');
  if (!ES_FECHA.test(fechaElaboracion)) {
    romper('DATOS_INCOMPLETOS', '«fecha_elaboracion» tiene que ser AAAA-MM-DD.');
  }

  // El proveedor manda: de él salen el tipo de documento y la categoría que
  // va marcada en el encabezado.
  const proveedor = desempaquetar<{
    id: string; nombre: string; tipo_documento: string;
    categoria_fija: string | null; activo: boolean;
  } | null>(
    await servicio().from('proveedor')
      .select('id, nombre, tipo_documento, categoria_fija, activo')
      .eq('id', proveedorId).maybeSingle(),
  );

  if (!proveedor) romper('PROVEEDOR_NO_ENCONTRADO', `No existe el proveedor «${proveedorId}».`);
  if (!proveedor.activo) {
    romper('PEDIDO_INVALIDO',
      `«${proveedor.nombre}» está dado de baja: no se le pueden hacer pedidos nuevos.`);
  }

  /*
   * La sede tiene que estar EN SERVICIO. Es la regla que no puede vivir en el
   * esquema —una sede puede cerrar después, y sus pedidos de antes tienen que
   * seguir siendo válidos—, así que vive aquí, que es donde se decide si nace
   * uno nuevo.
   */
  const cafeteria = desempaquetar<{ nombre: string; activa: boolean } | null>(
    await servicio().from('cafeteria').select('nombre, activa')
      .eq('id', cafeteriaId).maybeSingle(),
  );
  if (!cafeteria) romper('CAFETERIA_NO_ENCONTRADA', `No existe la cafetería «${cafeteriaId}».`);
  if (!cafeteria.activa) {
    romper('PEDIDO_INVALIDO', `«${cafeteria.nombre}» está cerrada: no puede hacer pedidos.`);
  }

  const esAlmacen = proveedor.tipo_documento === 'FBE.04';

  /*
   * Las casillas que existen en una plantilla y no en la otra. El esquema
   * también lo impide, pero un CHECK que salta sale como ERROR_INTERNO: aquí
   * se convierte en una frase que dice qué pasó.
   */
  let fechaEntrega: string | null = null;
  let horaEntrega: string | null = null;

  if (!esAlmacen) {
    const fe = String(params.fecha_entrega ?? '').trim();
    const he = String(params.hora_entrega ?? '').trim();
    if (fe && !ES_FECHA.test(fe)) {
      romper('DATOS_INCOMPLETOS', '«fecha_entrega» tiene que ser AAAA-MM-DD.');
    }
    if (he && !HORA.test(he)) {
      romper('DATOS_INCOMPLETOS', '«hora_entrega» tiene que ser HH:MM.');
    }
    fechaEntrega = fe || null;
    horaEntrega = he || null;
  }

  const lineas = leerLineas(params.lineas, esAlmacen);
  if (lineas.length === 0) {
    romper('PEDIDO_INVALIDO', 'El pedido no lleva ningún producto con cantidad.');
  }

  const { data, error } = await servicio().rpc('crear_pedido', {
    p_proveedor_id: proveedor.id,
    p_cafeteria_id: cafeteriaId,
    p_tipo_documento: proveedor.tipo_documento,
    // Copia del encabezado, no una consulta futura a `proveedor`: mismo
    // motivo que `reserva.menu_nombre`.
    p_categoria_marcada: esAlmacen ? proveedor.categoria_fija : null,
    p_fecha_elaboracion: fechaElaboracion,
    p_fecha_entrega: fechaEntrega,
    p_hora_entrega: horaEntrega,
    p_lugar_entrega: String(params.lugar_entrega ?? '').trim() || cafeteria.nombre,
    p_creado_por: sesion.usuarioId,
    p_lineas: lineas,
  });

  if (error) {
    /*
     * Las dos guardas de `crear_pedido` salen con el SQLSTATE por defecto de
     * plpgsql y se reconocen por el texto. No deberían saltar nunca desde
     * nuestra pantalla —lo de arriba ya lo comprueba— pero son la cerradura
     * de verdad, y un mensaje decente cuesta estas cuatro líneas.
     */
    const texto = String(error.message ?? '');
    if (texto.includes('PEDIDO_VACIO')) {
      romper('PEDIDO_INVALIDO', 'El pedido no lleva ningún producto con cantidad.');
    }
    if (texto.includes('PRODUCTO_AJENO')) {
      romper('PEDIDO_INVALIDO',
        `Alguno de los productos no es de «${proveedor.nombre}» o está dado de baja.`);
    }
    throw error;
  }

  return data;
}

/**
 * El historial: los pedidos de un rango de fechas.
 *
 * Devuelve la FICHA de cada pedido, no su contenido: fecha, proveedor, sede,
 * estado y cuántos renglones lleva. Las líneas se piden con `pedidos.obtener`
 * al abrir uno, porque un listado de treinta pedidos con todos sus productos
 * dentro sería un cuarto de megabyte para pintar treinta filas.
 *
 * La consulta usa recursos INCRUSTADOS —`proveedor(nombre)`,
 * `pedido_linea(count)`— y no un join a mano. Es lo que la deja abierta al
 * módulo de reportes: sacar también los renglones es añadir
 * `pedido_linea(producto_nombre, cantidad_solicitada)` a la lista de columnas,
 * sin tocar filtros, permisos ni paginación.
 */
export async function buscar(params: Record<string, unknown>, sesion: Sesion) {
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

  /*
   * El mostrador ve SU sede y nada más, se pida la que se pida. Es la misma
   * guarda de siempre, y aquí importa igual que al escribir: el historial de
   * pedidos dice qué compra cada cafetería y cuánto.
   */
  const cafeteriaId = sedePermitida(sesion, params.cafeteria_id);

  let consulta = servicio()
    .from('pedido')
    .select(
      'id, fecha_elaboracion, fecha_entrega, estado, tipo_documento,' +
      ' proveedor_id, cafeteria_id, proveedor(nombre), cafeteria(nombre),' +
      ' pedido_linea(count)',
      { count: 'exact' },
    )
    .gte('fecha_elaboracion', desde)
    .lte('fecha_elaboracion', hasta);

  if (cafeteriaId) consulta = consulta.eq('cafeteria_id', cafeteriaId);

  const proveedorId = String(params.proveedor_id ?? '').trim();
  if (proveedorId) consulta = consulta.eq('proveedor_id', proveedorId);

  const estado = String(params.estado ?? '').trim();
  if (estado) {
    if (!(ESTADOS as readonly string[]).includes(estado)) {
      romper('DATOS_INCOMPLETOS',
        `«estado» solo puede ser ${ESTADOS.map((e) => `«${e}»`).join(', ')}.`);
    }
    consulta = consulta.eq('estado', estado);
  }

  const limite = Number(params.limite ?? LIMITE_DETALLE) || LIMITE_DETALLE;

  /*
   * El más reciente primero, y `id` como desempate: varios pedidos del mismo
   * día son lo normal —uno por proveedor— y sin segundo criterio el orden
   * entre ellos lo decidiría Postgres, que puede cambiarlo entre consultas.
   */
  const { data, error, count } = await consulta
    .order('fecha_elaboracion', { ascending: false })
    .order('id', { ascending: false })
    .limit(Math.min(Math.max(limite, 1), LIMITE_DETALLE));

  if (error) throw error;

  const filas = (data ?? []) as unknown as FilaHistorial[];

  return {
    // El total del RANGO, no el de la página: es lo que permite decir «se
    // enseñan 500 de 812» en vez de mentir con el número de filas devueltas.
    total: count ?? filas.length,
    pedidos: filas.map(aFicha),
  };
}

interface FilaHistorial {
  id: number;
  fecha_elaboracion: string;
  fecha_entrega: string | null;
  estado: string;
  tipo_documento: string;
  proveedor_id: string;
  cafeteria_id: string;
  proveedor: { nombre: string } | null;
  cafeteria: { nombre: string } | null;
  pedido_linea: { count: number }[] | null;
}

/** La fila del listado, ya plana: la pantalla no navega objetos anidados. */
function aFicha(fila: FilaHistorial) {
  return {
    id: fila.id,
    fecha_elaboracion: fila.fecha_elaboracion,
    fecha_entrega: fila.fecha_entrega,
    estado: fila.estado,
    tipo_documento: fila.tipo_documento,
    proveedor_id: fila.proveedor_id,
    proveedor_nombre: fila.proveedor?.nombre ?? '',
    cafeteria_id: fila.cafeteria_id,
    cafeteria_nombre: fila.cafeteria?.nombre ?? '',
    renglones: fila.pedido_linea?.[0]?.count ?? 0,
  };
}

/** Un pedido con sus líneas, para verlo o imprimirlo. */
export async function obtener(params: Record<string, unknown>) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    romper('DATOS_INCOMPLETOS', '«id» tiene que ser el número del pedido.');
  }

  const pedido = desempaquetar(await servicio().rpc('detalle_pedido', { p_id: id }));
  if (!pedido) romper('PEDIDO_NO_ENCONTRADO', `No existe el pedido ${id}.`);
  return pedido;
}

/**
 * Se quedan SOLO los renglones con cantidad solicitada.
 *
 * El formulario tiene una casilla por producto —221 en el catálogo más
 * grande— y casi todas se mandan vacías. Filtrarlas aquí es lo que hace que
 * el documento salga con los ocho renglones que se pidieron y no con
 * doscientos, la mayoría a cero.
 */
function leerLineas(bruto: unknown, esAlmacen: boolean): LineaEntrante[] {
  if (!Array.isArray(bruto)) {
    romper('DATOS_INCOMPLETOS', '«lineas» tiene que ser una lista.');
  }

  const lineas: LineaEntrante[] = [];
  const vistos = new Set<number>();

  for (const cruda of bruto) {
    const fila = (cruda ?? {}) as Record<string, unknown>;
    const productoId = Number(fila.producto_id);

    if (!Number.isInteger(productoId) || productoId <= 0) {
      romper('PEDIDO_INVALIDO', 'Hay un renglón sin producto.');
    }

    const solicitada = aCantidad(fila.cantidad_solicitada, 'cantidad_solicitada');
    // Sin cantidad no es un renglón del pedido: es una casilla que se dejó en
    // blanco, que en el catálogo grande son casi todas.
    if (solicitada === null || solicitada === 0) continue;

    // Un producto dos veces serían dos cantidades para la misma casilla del
    // papel. El índice único de `pedido_linea` también lo impide, pero aquí
    // se puede decir con palabras.
    if (vistos.has(productoId)) {
      romper('PEDIDO_INVALIDO', 'Hay un producto repetido en el pedido.');
    }
    vistos.add(productoId);

    lineas.push({
      producto_id: productoId,
      cantidad_solicitada: solicitada,
      // Las casillas del almacén solo existen en el FBE.04. En un FBE.34 se
      // descartan aunque lleguen: la plantilla no tiene dónde imprimirlas.
      cantidad_devuelta: esAlmacen ? aCantidad(fila.cantidad_devuelta, 'cantidad_devuelta') : null,
      cantidad_adicional: esAlmacen ? aCantidad(fila.cantidad_adicional, 'cantidad_adicional') : null,
    });
  }

  return lineas;
}

/**
 * Traduce las excepciones de las funciones SQL del módulo.
 *
 * Salen todas con el SQLSTATE por defecto de plpgsql y se reconocen por el
 * texto. No deberían saltar desde nuestras pantallas —lo de arriba ya lo
 * comprueba— pero son la cerradura de verdad, y un mensaje decente cuesta
 * estas líneas.
 */
function traducirDelSql(error: { message?: string }, proveedorNombre?: string): never {
  const texto = String(error.message ?? '');

  if (texto.includes('PEDIDO_VACIO')) {
    romper('PEDIDO_INVALIDO', 'El pedido no lleva ningún producto con cantidad.');
  }
  if (texto.includes('PRODUCTO_AJENO')) {
    romper('PEDIDO_INVALIDO', proveedorNombre
      ? `Alguno de los productos no es de «${proveedorNombre}» o está dado de baja.`
      : 'Alguno de los productos no es de este proveedor o está dado de baja.');
  }
  if (texto.includes('PEDIDO_NO_ENCONTRADO')) {
    romper('PEDIDO_NO_ENCONTRADO', 'Ese pedido ya no existe.');
  }
  if (texto.includes('PEDIDO_NO_EDITABLE')) {
    romper('PEDIDO_INVALIDO',
      'El pedido ya se envió y no se puede editar. Anúlalo y elabora otro.');
  }
  if (texto.includes('TRANSICION_INVALIDA')) {
    romper('PEDIDO_INVALIDO', 'Ese pedido ya no está en un estado que permita hacer eso.');
  }
  throw error;
}

/**
 * La ficha de un pedido, para decidir si esta sesión puede tocarlo.
 *
 * Se consulta ANTES de cada cambio. Podría parecer redundante —las funciones
 * SQL ya comprueban el estado— pero el estado y el PERMISO son dos cosas: la
 * base sabe en qué estado está un pedido, y no sabe si quien llama atiende esa
 * sede.
 */
async function fichaDe(id: number) {
  const fila = desempaquetar<{
    id: number; cafeteria_id: string; estado: string; tipo_documento: string;
    proveedor_id: string;
  } | null>(
    await servicio().from('pedido')
      .select('id, cafeteria_id, estado, tipo_documento, proveedor_id')
      .eq('id', id).maybeSingle(),
  );
  if (!fila) romper('PEDIDO_NO_ENCONTRADO', `No existe el pedido ${id}.`);
  return fila;
}

/** El id del pedido tal como llega por el cable. */
function idDe(params: Record<string, unknown>): number {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    romper('DATOS_INCOMPLETOS', '«id» tiene que ser el número del pedido.');
  }
  return id;
}

/**
 * Solo se toca un pedido de la sede que se atiende.
 *
 * El mostrador, la suya. Administración y el auxiliar, cualquiera: uno imprime
 * y firma y tiene que poder anular el pedido equivocado de una cafetería que
 * llamó por teléfono, y el otro habla con un proveedor que reparte en varias.
 *
 * Se pregunta por la sede y no por el rol: quien no tiene sede las ve todas.
 */
function exigirSede(sesion: Sesion, cafeteriaId: string): void {
  if (sesion.cafeteriaId === null) return;
  if (sesion.cafeteriaId !== cafeteriaId) {
    romper('NO_AUTORIZADO', 'Ese pedido es de otra cafetería.');
  }
}

/**
 * Quién puede editar un pedido, según en qué estado esté.
 *
 * ESTA TABLA ESTÁ DOS VECES: aquí y en `puede_editar_pedido` de
 * `supabase/16-unificar-estados.sql`. No es un descuido — es la regla 4 de
 * CLAUDE.md aplicada al revés de lo habitual: la que manda es la del servidor
 * de base de datos, que es la última puerta, y esta de aquí está para poder
 * dar un mensaje que explique POR QUÉ, en vez de un `PEDIDO_NO_EDITABLE`
 * pelado. Si alguna vez hay que cambiarla, se cambian las dos.
 *
 *   estado       mostrador   auxiliar   admin
 *   creado       su sede     sí         sí
 *   enviado      NO          sí         sí
 *   confirmado   NO          NO         sí
 *   anulado      NO          NO         NO
 */
const EDITORES: Record<string, readonly Rol[]> = {
  creado: ['mostrador', 'auxiliar', 'admin'],
  enviado: ['auxiliar', 'admin'],
  confirmado: ['admin'],
  anulado: [],
};

/** El motivo, en la voz de quien lo está intentando. */
function exigirEditable(estado: string, rol: Rol): void {
  if (EDITORES[estado]?.includes(rol)) return;

  if (estado === 'anulado') {
    romper('PEDIDO_INVALIDO',
      'Ese pedido está anulado y no se puede editar. Elabora uno nuevo.');
  }
  if (estado === 'confirmado') {
    romper('PEDIDO_INVALIDO',
      'Ese pedido ya está confirmado y quedó cerrado. Solo administración puede tocarlo.');
  }
  // Solo queda «enviado» visto por un mostrador.
  romper('PEDIDO_INVALIDO',
    'El pedido ya se envió a administración. Si el proveedor no puede traerlo '
    + 'entero, modificarlo lo hace el auxiliar administrativo o administración.');
}

/**
 * Corrige un pedido: las cantidades y los datos de entrega.
 *
 * NO recibe `proveedor_id` ni `cafeteria_id`, y no es un olvido: cambiar el
 * proveedor invalidaría todos los renglones de golpe, y cambiar la sede
 * convertiría el pedido de una cafetería en el de otra. Eso no es corregir,
 * es otro pedido — se anula este y se elabora.
 */
export async function actualizar(params: Record<string, unknown>, sesion: Sesion) {
  const id = idDe(params);
  const ficha = await fichaDe(id);

  exigirSede(sesion, ficha.cafeteria_id);
  exigirEditable(ficha.estado, sesion.rol);

  const esAlmacen = ficha.tipo_documento === 'FBE.04';

  let fechaEntrega: string | null = null;
  let horaEntrega: string | null = null;

  if (!esAlmacen) {
    const fe = String(params.fecha_entrega ?? '').trim();
    const he = String(params.hora_entrega ?? '').trim();
    if (fe && !ES_FECHA.test(fe)) {
      romper('DATOS_INCOMPLETOS', '«fecha_entrega» tiene que ser AAAA-MM-DD.');
    }
    if (he && !HORA.test(he)) {
      romper('DATOS_INCOMPLETOS', '«hora_entrega» tiene que ser HH:MM.');
    }
    fechaEntrega = fe || null;
    horaEntrega = he || null;
  }

  const lineas = leerLineas(params.lineas, esAlmacen);
  if (lineas.length === 0) {
    romper('PEDIDO_INVALIDO', 'El pedido no lleva ningún producto con cantidad.');
  }

  const { data, error } = await servicio().rpc('actualizar_pedido', {
    p_id: id,
    p_fecha_entrega: fechaEntrega,
    p_hora_entrega: horaEntrega,
    p_lugar_entrega: String(params.lugar_entrega ?? '').trim(),
    p_lineas: lineas,
    // Para el asiento del historial. El rol va aparte del usuario porque la
    // función lo necesita para su propia cerradura, y no debe fiarse de
    // buscarlo ella: el que vale es el de ESTA sesión, ya validado.
    p_actor: sesion.usuarioId,
    p_rol: sesion.rol,
  });

  if (error) traducirDelSql(error);
  return data;
}

/**
 * Confirma un pedido enviado: queda cerrado y definitivo.
 *
 * Antes de esto, el pedido dice lo que se pidió; después, lo que va a llegar
 * — y deja de tocarse, porque a partir de ahí es lo que se recibe contra el
 * papel.
 *
 * OJO: pasar por aquí NO significa que se haya cambiado nada. Muchos pedidos
 * llegan enteros y se confirman tal cual; la modificación es opcional y ocurre
 * antes. Por eso el estado se llama por lo que ES —confirmado— y no por lo que
 * quizá se hizo.
 *
 * NO avisa por correo, al revés que `enviar`. El aviso del envío existe para
 * que administración sepa que hay algo que imprimir y firmar; esto lo hace
 * precisamente quien ya estaba mirando el pedido, así que un segundo correo
 * sería avisar a alguien de algo que acaba de hacer.
 */
export async function confirmar(params: Record<string, unknown>, sesion: Sesion) {
  const id = idDe(params);
  const ficha = await fichaDe(id);

  exigirSede(sesion, ficha.cafeteria_id);

  if (ficha.estado !== 'enviado') {
    romper('PEDIDO_INVALIDO', ficha.estado === 'creado'
      ? 'Ese pedido todavía no se ha enviado a administración.'
      : ficha.estado === 'confirmado'
        ? 'Ese pedido ya estaba confirmado.'
        : 'Ese pedido está anulado.');
  }

  const { data, error } = await servicio().rpc('cambiar_estado_pedido', {
    p_id: id,
    p_nuevo: 'confirmado',
    p_actor: sesion.usuarioId,
  });

  if (error) traducirDelSql(error);
  return data;
}

/**
 * Envía a administración un pedido recién creado, y avisa por correo.
 *
 * El aviso va DESPUÉS del cambio de estado y no puede tumbarlo: ver
 * `notificaciones.ts`. Un pedido que no se puede enviar porque el correo falla
 * dejaría a la cafetería sin poder trabajar por algo que no es suyo.
 */
export async function enviar(params: Record<string, unknown>, sesion: Sesion) {
  const id = idDe(params);
  const ficha = await fichaDe(id);

  exigirSede(sesion, ficha.cafeteria_id);

  if (ficha.estado !== 'creado') {
    romper('PEDIDO_INVALIDO', ficha.estado === 'anulado'
      ? 'Ese pedido está anulado.'
      : 'Ese pedido ya se había enviado.');
  }

  const { data, error } = await servicio().rpc('cambiar_estado_pedido', {
    p_id: id,
    p_nuevo: 'enviado',
    p_actor: sesion.usuarioId,
  });

  if (error) traducirDelSql(error);

  await notificarPedido(data as PedidoNotificable);
  return data;
}

/**
 * Anula un pedido. Es el único camino de vuelta que hay.
 *
 * Un pedido recién creado lo anula quien lo elabora: se equivocó de proveedor
 * y prefiere empezar de nuevo. Uno ya enviado, solo administración, porque a
 * esas alturas puede haber un papel impreso circulando y quien decide que ese
 * papel ya no vale es quien lo firma.
 */
export async function anular(params: Record<string, unknown>, sesion: Sesion) {
  const id = idDe(params);
  const ficha = await fichaDe(id);

  exigirSede(sesion, ficha.cafeteria_id);

  if (ficha.estado === 'anulado') {
    romper('PEDIDO_INVALIDO', 'Ese pedido ya estaba anulado.');
  }
  // Un pedido recién creado lo anula quien lo elabora. En cuanto se envió puede
  // haber papel firmado circulando, y quien decide que ese papel ya no vale es
  // quien lo firma.
  if (ficha.estado !== 'creado' && sesion.rol !== 'admin') {
    romper('NO_AUTORIZADO',
      'Un pedido que ya se envió solo lo puede anular administración.');
  }

  const { data, error } = await servicio().rpc('cambiar_estado_pedido', {
    p_id: id,
    p_nuevo: 'anulado',
    p_actor: sesion.usuarioId,
  });

  if (error) traducirDelSql(error);
  return data;
}
