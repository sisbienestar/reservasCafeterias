/**
 * Servicio de proveedores del módulo de pedidos.
 *
 * Misma frontera que en cafeterías: la API habla snake_case —viene de
 * Postgres— y la interfaz camelCase. Si mañana cambia una columna, se arregla
 * en `normalizar` y ni una vista se entera.
 */

import { pedir } from './api.js';

/** Las dos plantillas institucionales. Deciden qué columnas tiene el pedido. */
export type TipoDocumento = 'FBE.04' | 'FBE.34';

export interface Proveedor {
  id: string;
  nombre: string;
  tipoDocumento: TipoDocumento;
  /** La casilla marcable del FBE.04. Vacía en los FBE.34, que no la tienen. */
  categoriaFija: string;
  /** Ruta dentro de public/. Vacía = la tarjeta usa las iniciales. */
  imagen: string;
  activo: boolean;
}

export interface Producto {
  id: number;
  /** El de la plantilla. No alfabético: es el orden en que se recorre la hoja. */
  orden: number;
  codigo: string;
  nombre: string;
  /** El encabezado de sección: GALLETAS, LACTEOS… Vacía si no agrupa. */
  categoria: string;
  unidadMedida: string;
  /** Solo lo mira el panel: el formulario de pedido ya los recibe filtrados. */
  activo: boolean;
}

export interface ProveedorConCatalogo extends Proveedor {
  productos: Producto[];
}

interface FilaProveedor {
  id: string; nombre: string; tipo_documento?: string;
  categoria_fija?: string; imagen?: string; activo?: boolean;
}

interface FilaProducto {
  id: number; orden: number; codigo?: string;
  nombre: string; categoria?: string; unidad_medida: string;
  activo?: boolean;
}

function normalizar(fila: FilaProveedor): Proveedor {
  return {
    id: fila.id,
    nombre: fila.nombre,
    // FBE.34 por defecto: es el formato más simple de los dos, así que un
    // proveedor con el tipo corrupto pinta un formulario de menos columnas en
    // vez de pedirle al almacén casillas que no le corresponden.
    tipoDocumento: fila.tipo_documento === 'FBE.04' ? 'FBE.04' : 'FBE.34',
    categoriaFija: fila.categoria_fija ?? '',
    imagen: fila.imagen ?? '',
    // Una fila sin la columna todavía se da por activa.
    activo: fila.activo !== false,
  };
}

function normalizarProducto(fila: FilaProducto): Producto {
  return {
    id: fila.id,
    orden: fila.orden,
    codigo: fila.codigo ?? '',
    nombre: fila.nombre,
    categoria: fila.categoria ?? '',
    unidadMedida: fila.unidad_medida,
    activo: fila.activo !== false,
  };
}

/**
 * Proveedores en servicio. Con `incluirInactivos` devuelve también los dados
 * de baja, que es lo que necesitará la pantalla de administración.
 */
export async function getProveedores({ incluirInactivos = false } = {}): Promise<Proveedor[]> {
  const filas = await pedir<FilaProveedor[]>('proveedores.listar', {
    incluir_inactivos: incluirInactivos,
  });
  return filas.map(normalizar);
}

/**
 * Un proveedor CON su catálogo, en una sola llamada.
 *
 * La pantalla de pedido necesita las dos cosas a la vez para dibujar el
 * formulario; pedirlas por separado serían dos viajes para lo mismo.
 * Lanza ErrorServicio con PROVEEDOR_NO_ENCONTRADO si no existe.
 */
export async function getProveedor(id: string): Promise<ProveedorConCatalogo> {
  const fila = await pedir<FilaProveedor & { productos?: FilaProducto[] }>(
    'proveedores.obtener', { id },
  );
  return {
    ...normalizar(fila),
    productos: (fila.productos ?? []).map(normalizarProducto),
  };
}

/**
 * Los productos de un catálogo, partidos en las secciones de la plantilla.
 *
 * Devuelve una sola sección con la etiqueta vacía cuando el proveedor no
 * agrupa —Vicky, Coca-Cola—, para que la pantalla no tenga que preguntarse si
 * hay categorías: recorre secciones y ya está.
 *
 * Respeta el orden de aparición y NO ordena las secciones: el orden de la
 * hoja es el que tiene memorizado quien pide.
 */
export function porCategoria(productos: Producto[]): { categoria: string; productos: Producto[] }[] {
  const secciones: { categoria: string; productos: Producto[] }[] = [];

  for (const producto of productos) {
    const ultima = secciones[secciones.length - 1];
    if (ultima && ultima.categoria === producto.categoria) {
      ultima.productos.push(producto);
    } else {
      secciones.push({ categoria: producto.categoria, productos: [producto] });
    }
  }

  return secciones;
}

/* ══ El panel de administración ══════════════════════════════════════════
 *
 * Todo lo de aquí abajo exige rol `admin`. Lo impone el servidor; estas
 * funciones solo traducen la forma del dato.
 */

/** Lo que se teclea al dar de alta o corregir un proveedor. */
export interface DatosProveedor {
  nombre: string;
  tipoDocumento: TipoDocumento;
  /** Solo en FBE.04. En un FBE.34 el servidor la rechaza. */
  categoriaFija?: string;
  /** Ruta dentro de public/, como «assets/img/nutresa.png». */
  imagen?: string;
}

/** Lo que se teclea por cada producto. El `orden` lo pone el servidor. */
export interface DatosProducto {
  codigo?: string;
  nombre: string;
  categoria?: string;
  unidadMedida: string;
}

const aParametros = (datos: DatosProveedor) => ({
  nombre: datos.nombre,
  tipo_documento: datos.tipoDocumento,
  categoria_fija: datos.categoriaFija ?? '',
  imagen: datos.imagen ?? '',
});

/**
 * Da de alta un proveedor. El `id` sale del nombre, así que dos con el mismo
 * nombre chocan: devuelve PROVEEDOR_DUPLICADO.
 */
export async function crearProveedor(datos: DatosProveedor): Promise<Proveedor> {
  return normalizar(await pedir<FilaProveedor>('proveedores.crear', aParametros(datos)));
}

/**
 * Cambia nombre, tipo y categoría. El `id` no es editable: es la clave con la
 * que los pedidos históricos apuntan a este proveedor.
 */
export async function actualizarProveedor(
  id: string, datos: DatosProveedor,
): Promise<Proveedor> {
  return normalizar(await pedir<FilaProveedor>('proveedores.actualizar', {
    id, ...aParametros(datos),
  }));
}

/** Deja de ofrecerse. Sus pedidos históricos siguen intactos. */
export async function archivarProveedor(id: string): Promise<Proveedor> {
  return normalizar(await pedir<FilaProveedor>('proveedores.archivar', { id }));
}

export async function reactivarProveedor(id: string): Promise<Proveedor> {
  return normalizar(await pedir<FilaProveedor>('proveedores.reactivar', { id }));
}

/**
 * El catálogo COMPLETO de un proveedor, archivados incluidos.
 *
 * `getProveedor` sirve el formulario de pedido y solo puede enseñar lo que se
 * puede pedir; esta sirve el panel, donde hay que ver lo archivado para poder
 * reactivarlo.
 */
export async function getProductos(proveedorId: string): Promise<Producto[]> {
  const filas = await pedir<FilaProducto[]>('productos.listar', {
    proveedor_id: proveedorId,
  });
  return filas.map(normalizarProducto);
}

/**
 * Añade productos al final del catálogo. Uno o muchos: es la misma acción,
 * porque teclear un producto y pegar un catálogo entero son el mismo gesto
 * con distinto número de filas.
 */
export async function crearProductos(
  proveedorId: string, productos: DatosProducto[],
): Promise<Producto[]> {
  const filas = await pedir<FilaProducto[]>('productos.crear', {
    proveedor_id: proveedorId,
    productos: productos.map((p) => ({
      codigo: p.codigo ?? '',
      nombre: p.nombre,
      categoria: p.categoria ?? '',
      unidad_medida: p.unidadMedida,
    })),
  });
  return filas.map(normalizarProducto);
}

/** Corrige un producto. No mueve de proveedor ni cambia el orden. */
export async function actualizarProducto(
  id: number, datos: DatosProducto,
): Promise<Producto> {
  return normalizarProducto(await pedir<FilaProducto>('productos.actualizar', {
    id,
    codigo: datos.codigo ?? '',
    nombre: datos.nombre,
    categoria: datos.categoria ?? '',
    unidad_medida: datos.unidadMedida,
  }));
}

export async function archivarProducto(id: number): Promise<Producto> {
  return normalizarProducto(await pedir<FilaProducto>('productos.archivar', { id }));
}

export async function reactivarProducto(id: number): Promise<Producto> {
  return normalizarProducto(await pedir<FilaProducto>('productos.reactivar', { id }));
}

/**
 * Sube o baja un producto una posición.
 *
 * Estar ya en el extremo no es un error: devuelve el producto sin tocar. Así
 * la pantalla no tiene que saber cuál es el primero y cuál el último para
 * decidir si ofrece el botón.
 */
export async function moverProducto(
  id: number, direccion: 'subir' | 'bajar',
): Promise<Producto> {
  return normalizarProducto(await pedir<FilaProducto>('productos.mover', { id, direccion }));
}
