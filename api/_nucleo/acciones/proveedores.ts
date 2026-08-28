/**
 * Las acciones de proveedores del módulo de pedidos.
 *
 * `listar` da la rejilla del selector; `obtener` da el proveedor CON su
 * catálogo, en una sola llamada. Eso último es deliberado y es la misma
 * disciplina que `reservas.buscar`: la pantalla de pedido necesita las dos
 * cosas a la vez y pedirlas por separado serían dos viajes para dibujar un
 * formulario.
 *
 * Ninguna es pública. Ver la nota en `sesion.ts`.
 */

import { servicio, desempaquetar } from '../supabase.js';
import { romper } from '../sobre.js';
import { aSlug } from '../dominio.js';
import type { Sesion } from '../sesion.js';

export interface ProductoContrato {
  id: number;
  orden: number;
  codigo: string;
  nombre: string;
  categoria: string;
  unidad_medida: string;
  /** Solo lo mira el panel: el formulario de pedido ya recibe filtrados. */
  activo: boolean;
  proveedor_id?: string;
}

export interface ProveedorContrato {
  id: string;
  nombre: string;
  tipo_documento: string;
  categoria_fija: string;
  activo: boolean;
}

export interface ProveedorConCatalogo extends ProveedorContrato {
  productos: ProductoContrato[];
}

const COLUMNAS = 'id, nombre, tipo_documento, categoria_fija, activo';
const COLUMNAS_PRODUCTO = 'id, orden, codigo, nombre, categoria, unidad_medida';

interface FilaProveedor {
  id: string; nombre: string; tipo_documento: string;
  categoria_fija: string | null; activo: boolean;
}

interface FilaProducto {
  id: number; orden: number; codigo: string | null;
  nombre: string; categoria: string | null; unidad_medida: string;
  activo?: boolean; proveedor_id?: string;
}

/*
 * Los nulos se aplanan a cadena vacía antes de salir, igual que en
 * cafeterías: el frontend no tiene que preguntarse si `categoria` es null o
 * '' para decidir si agrupa.
 */
function aContrato(fila: FilaProveedor): ProveedorContrato {
  return {
    id: fila.id,
    nombre: fila.nombre,
    tipo_documento: fila.tipo_documento,
    categoria_fija: fila.categoria_fija ?? '',
    // Como en cafeterías: booleano de verdad, porque la cadena 'FALSE' es
    // *truthy* y un proveedor dado de baja aparecería activo.
    activo: fila.activo !== false,
  };
}

function aContratoProducto(fila: FilaProducto): ProductoContrato {
  return {
    id: fila.id,
    orden: fila.orden,
    codigo: fila.codigo ?? '',
    nombre: fila.nombre,
    categoria: fila.categoria ?? '',
    unidad_medida: fila.unidad_medida,
    activo: fila.activo !== false,
    ...(fila.proveedor_id ? { proveedor_id: fila.proveedor_id } : {}),
  };
}

/**
 * Sin `incluir_inactivos`, solo los que están en servicio.
 *
 * Mismo reparto que en cafeterías: quien elabora un pedido no debe ver un
 * proveedor dado de baja —pedirle sería un documento que nadie va a atender—
 * y administración sí, para volver a darlo de alta. Y por lo mismo, el
 * parámetro solo lo obedece un `admin`: fiarse de él bastaría para sacarlos.
 */
export async function listar(params: Record<string, unknown>, sesion: Sesion | null) {
  const puedeVerInactivos = sesion?.rol === 'admin' && Boolean(params.incluir_inactivos);

  let consulta = servicio().from('proveedor').select(COLUMNAS).order('nombre');
  if (!puedeVerInactivos) consulta = consulta.eq('activo', true);
  return desempaquetar<FilaProveedor[]>(await consulta).map(aContrato);
}

/**
 * El proveedor y su catálogo.
 *
 * Los productos van en el orden de la PLANTILLA, no alfabético: quien pide
 * recorre la hoja con el dedo en el mismo orden de siempre, y reordenarla
 * convertiría un gesto memorizado en una búsqueda.
 *
 * Se piden en dos consultas y no con un `select` anidado a propósito: son dos
 * consultas dentro de la misma función de Vercel —no dos viajes desde el
 * navegador, que es lo que cuesta caro— y a cambio el filtro de `activo`
 * sobre los productos queda a la vista en vez de escondido en la sintaxis de
 * los recursos incrustados.
 */
export async function obtener(params: Record<string, unknown>): Promise<ProveedorConCatalogo> {
  const id = String(params.id ?? '');

  const fila = desempaquetar<FilaProveedor | null>(
    await servicio().from('proveedor').select(COLUMNAS).eq('id', id).maybeSingle(),
  );
  if (!fila) romper('PROVEEDOR_NO_ENCONTRADO', `No existe el proveedor «${id}».`);

  const productos = desempaquetar<FilaProducto[]>(
    await servicio().from('producto').select(COLUMNAS_PRODUCTO)
      .eq('proveedor_id', id).eq('activo', true).order('orden'),
  );

  return { ...aContrato(fila), productos: productos.map(aContratoProducto) };
}

/* ══ El catálogo, desde el panel de administración ═══════════════════════
 *
 * Todo lo de aquí abajo es SOLO para `admin`: lo impone `PERMISOS` en
 * `sesion.ts`, no estas funciones. Aquí lo que se comprueba son las reglas
 * del dato, no quién llama.
 */

/** Los dos formatos institucionales. Un tercero no existe. */
const TIPOS = ['FBE.04', 'FBE.34'] as const;

/**
 * Las tres casillas del encabezado FBE.04.
 *
 * Se valida contra esta lista y no se acepta texto libre porque la casilla es
 * una MARCA sobre tres opciones impresas: una categoría que no esté entre
 * ellas no tendría dónde pintarse en el papel.
 */
const CATEGORIAS_FIJAS = ['Alimentos y bebidas', 'Aseo y productos químicos', 'Desechables'];

/**
 * Lee y valida lo que llega para un proveedor.
 *
 * El emparejamiento entre tipo y categoría se comprueba aquí además de en el
 * esquema: el CHECK impide guardarlo, pero saltaría como ERROR_INTERNO, y
 * «Coca-Cola no puede llevar categoría» se entiende y «error interno» no.
 */
function leerProveedor(params: Record<string, unknown>) {
  const nombre = String(params.nombre ?? '').trim();
  if (!nombre) romper('DATOS_INCOMPLETOS', 'El proveedor necesita al menos un nombre.');

  const tipo = String(params.tipo_documento ?? '').trim();
  if (!TIPOS.includes(tipo as (typeof TIPOS)[number])) {
    romper('DATOS_INCOMPLETOS', 'El tipo de documento tiene que ser FBE.04 o FBE.34.');
  }

  const categoria = String(params.categoria_fija ?? '').trim();

  if (tipo === 'FBE.34' && categoria) {
    romper('DATOS_INCOMPLETOS',
      'Un proveedor externo (FBE.34) no lleva categoría: su plantilla no tiene esa casilla.');
  }
  if (tipo === 'FBE.04' && categoria && !CATEGORIAS_FIJAS.includes(categoria)) {
    romper('DATOS_INCOMPLETOS',
      `«${categoria}» no es una de las tres casillas del FBE.04.`);
  }

  return { nombre, tipo_documento: tipo, categoria_fija: categoria || null };
}

/**
 * Da de alta un proveedor.
 *
 * El `id` sale del nombre, así que dos proveedores con el mismo nombre
 * chocan. Se comprueba antes para dar un mensaje decente, pero quien lo
 * IMPIDE de verdad es la clave primaria: entre la consulta y el INSERT cabe
 * otra petición, y la clave primaria no tiene esa ventana. Es la misma
 * decisión que en `cafeterias.crear`.
 */
export async function crear(params: Record<string, unknown>) {
  const datos = leerProveedor(params);

  const id = aSlug(datos.nombre);
  if (!id) romper('DATOS_INCOMPLETOS', 'Ese nombre no produce un identificador válido.');

  const { data, error } = await servicio()
    .from('proveedor').insert({ id, ...datos }).select(COLUMNAS).maybeSingle();

  if (error) {
    if (error.code === '23505') {
      romper('PROVEEDOR_DUPLICADO', `Ya existe un proveedor llamado «${datos.nombre}».`);
    }
    throw error;
  }
  return aContrato(data as FilaProveedor);
}

/**
 * Cambia nombre, tipo y categoría. El `id` NO se toca: es la clave con la que
 * los pedidos históricos apuntan aquí, y renombrarlo los dejaría huérfanos.
 *
 * El tipo SÍ es editable, y no rompe nada hacia atrás: cada pedido guarda una
 * copia del suyo, así que un documento de hace tres meses se sigue imprimiendo
 * con la plantilla que tenía entonces. Lo que cambia es de qué forma serán los
 * pedidos nuevos.
 */
export async function actualizar(params: Record<string, unknown>) {
  const id = String(params.id ?? '').trim();
  const datos = leerProveedor(params);

  const fila = desempaquetar<FilaProveedor | null>(
    await servicio().from('proveedor').update(datos)
      .eq('id', id).select(COLUMNAS).maybeSingle(),
  );
  if (!fila) romper('PROVEEDOR_NO_ENCONTRADO', `No existe el proveedor «${id}».`);
  return aContrato(fila);
}

/**
 * Archivar y reactivar son el mismo gesto con distinto valor.
 *
 * Archivar es un borrado lógico, y no hay borrado de verdad: los pedidos
 * históricos apuntan aquí con una clave foránea, así que borrar un proveedor
 * al que ya se le pidió algo dejaría documentos sin emisor. Deja de ofrecerse
 * y ya está.
 */
async function cambiarActivo(id: string, activo: boolean) {
  const fila = desempaquetar<FilaProveedor | null>(
    await servicio().from('proveedor').update({ activo })
      .eq('id', id).select(COLUMNAS).maybeSingle(),
  );
  if (!fila) romper('PROVEEDOR_NO_ENCONTRADO', `No existe el proveedor «${id}».`);
  return aContrato(fila);
}

export const archivar = (p: Record<string, unknown>) => cambiarActivo(String(p.id ?? ''), false);
export const reactivar = (p: Record<string, unknown>) => cambiarActivo(String(p.id ?? ''), true);

/* ── Productos ──────────────────────────────────────────────────────── */

/**
 * El catálogo COMPLETO de un proveedor, archivados incluidos.
 *
 * Se diferencia de `proveedores.obtener` en eso: aquella sirve el formulario
 * de pedido y solo puede enseñar lo que se puede pedir; esta sirve el panel,
 * donde hay que ver lo archivado para poder reactivarlo.
 */
export async function listarProductos(params: Record<string, unknown>) {
  const proveedorId = String(params.proveedor_id ?? '').trim();
  if (!proveedorId) romper('DATOS_INCOMPLETOS', 'Hay que indicar el proveedor.');

  const filas = desempaquetar<FilaProducto[]>(
    await servicio().from('producto').select(COLUMNAS_PRODUCTO + ', activo')
      .eq('proveedor_id', proveedorId).order('orden'),
  );
  return filas.map(aContratoProducto);
}

/** Lee y valida un producto que llega del panel. */
function leerProducto(bruto: unknown, indice: number) {
  const fila = (bruto ?? {}) as Record<string, unknown>;

  const nombre = String(fila.nombre ?? '').trim();
  const unidad = String(fila.unidad_medida ?? '').trim();

  if (!nombre) {
    romper('DATOS_INCOMPLETOS', `El producto ${indice + 1} no tiene nombre.`);
  }
  if (!unidad) {
    romper('DATOS_INCOMPLETOS', `«${nombre}» no tiene unidad de medida.`);
  }

  return {
    codigo: String(fila.codigo ?? '').trim() || null,
    nombre,
    categoria: String(fila.categoria ?? '').trim() || null,
    unidad_medida: unidad,
  };
}

/**
 * Añade productos al final del catálogo. Uno o muchos: es la misma acción.
 *
 * El alta suelta y la carga en lote no se separan porque no son dos cosas.
 * Pegar veinte líneas de un catálogo nuevo y teclear un producto son el mismo
 * gesto con distinto número de filas, y tener dos caminos habría dejado dos
 * sitios donde arreglar la misma validación.
 */
export async function crearProductos(params: Record<string, unknown>) {
  const proveedorId = String(params.proveedor_id ?? '').trim();
  if (!proveedorId) romper('DATOS_INCOMPLETOS', 'Hay que indicar el proveedor.');

  const bruto = params.productos;
  if (!Array.isArray(bruto) || bruto.length === 0) {
    romper('DATOS_INCOMPLETOS', 'No llegó ningún producto que añadir.');
  }

  const productos = bruto.map(leerProducto);

  const { data, error } = await servicio().rpc('crear_productos', {
    p_proveedor_id: proveedorId,
    p_productos: productos,
  });

  if (error) {
    const texto = String(error.message ?? '');
    if (texto.includes('PROVEEDOR_NO_ENCONTRADO')) {
      romper('PROVEEDOR_NO_ENCONTRADO', `No existe el proveedor «${proveedorId}».`);
    }
    if (texto.includes('SIN_PRODUCTOS')) {
      romper('DATOS_INCOMPLETOS', 'No llegó ningún producto que añadir.');
    }
    throw error;
  }
  return data;
}

/**
 * Corrige un producto del catálogo.
 *
 * NO recibe `proveedor_id` ni `orden`: mover un producto de proveedor sería
 * inventar un renglón en otra plantilla, y el orden se cambia con
 * `productos.mover`, que sabe intercambiar sin chocar contra el índice único.
 */
export async function actualizarProducto(params: Record<string, unknown>) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    romper('DATOS_INCOMPLETOS', '«id» tiene que ser el número del producto.');
  }

  const fila = desempaquetar<FilaProducto | null>(
    await servicio().from('producto').update(leerProducto(params, 0))
      .eq('id', id).select(COLUMNAS_PRODUCTO + ', activo').maybeSingle(),
  );
  if (!fila) romper('PRODUCTO_NO_ENCONTRADO', `No existe el producto ${id}.`);
  return aContratoProducto(fila);
}

/**
 * Archivar un producto lo saca del formulario de pedido y de la hoja impresa,
 * pero los pedidos donde ya se pidió lo siguen mostrando: su nombre está
 * copiado en la línea, no consultado.
 */
async function cambiarActivoProducto(id: number, activo: boolean) {
  const fila = desempaquetar<FilaProducto | null>(
    await servicio().from('producto').update({ activo })
      .eq('id', id).select(COLUMNAS_PRODUCTO + ', activo').maybeSingle(),
  );
  if (!fila) romper('PRODUCTO_NO_ENCONTRADO', `No existe el producto ${id}.`);
  return aContratoProducto(fila);
}

export const archivarProducto = (p: Record<string, unknown>) =>
  cambiarActivoProducto(Number(p.id), false);

export const reactivarProducto = (p: Record<string, unknown>) =>
  cambiarActivoProducto(Number(p.id), true);

/**
 * Sube o baja un producto una posición.
 *
 * Estar ya en el extremo NO es un error: la función devuelve el producto sin
 * tocarlo. Un error ahí obligaría a la pantalla a saber cuál es el primero y
 * cuál el último para no ofrecer el botón, y eso ya lo sabe la base.
 */
export async function moverProducto(params: Record<string, unknown>) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    romper('DATOS_INCOMPLETOS', '«id» tiene que ser el número del producto.');
  }

  const direccion = String(params.direccion ?? '') === 'subir' ? -1 : 1;

  const { data, error } = await servicio().rpc('mover_producto', {
    p_id: id,
    p_direccion: direccion,
  });

  if (error) {
    if (String(error.message ?? '').includes('PRODUCTO_NO_ENCONTRADO')) {
      romper('PRODUCTO_NO_ENCONTRADO', `No existe el producto ${id}.`);
    }
    throw error;
  }
  return data;
}
