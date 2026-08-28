/**
 * Las tres secciones del panel de pedidos: proveedores, productos y cuentas.
 *
 * Van juntas en un archivo como `componentes/admin/Catalogo.tsx` hace con
 * cafeterías y carta: son las pestañas de una misma pantalla y comparten la
 * forma —formulario arriba, tabla debajo, archivar en vez de borrar—.
 *
 * NADA de aquí decide un permiso. La pantalla entera solo se sirve a `admin`
 * porque lo dicen la ruta y, sobre todo, `PERMISOS` en el servidor.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  actualizarProducto, actualizarProveedor, archivarProducto, archivarProveedor,
  crearProductos, crearProveedor, getProductos, getProveedores, moverProducto,
  reactivarProducto, reactivarProveedor,
  type DatosProducto, type Producto, type Proveedor, type TipoDocumento,
} from '../../servicios/proveedoresServicio.js';
import { getCuentas } from '../../servicios/cuentasServicio.js';
import { usePeticion } from '../../utiles/usePeticion.js';
import { BloqueEstado } from '../BloqueEstado.js';
import { aCSV, descargarTexto } from '../../utiles/csv.js';
import type { PeticionConfirmacion } from '../ModalConfirmacion.js';

/** Las tres casillas del encabezado FBE.04. Las mismas que valida el servidor. */
const CATEGORIAS_FIJAS = ['Alimentos y bebidas', 'Aseo y productos químicos', 'Desechables'];

const QUE_ES: Record<string, string> = {
  'FBE.04': 'Almacén interno',
  'FBE.34': 'Proveedor externo',
};

interface Props {
  pedirConfirmacion: (peticion: PeticionConfirmacion) => void;
}

/* ── Proveedores ────────────────────────────────────────────────────── */

export function SeccionProveedores({ pedirConfirmacion }: Props) {
  const consultar = useCallback(() => getProveedores({ incluirInactivos: true }), []);
  const { datos: proveedores, cargando, error, recargar } = usePeticion(consultar, []);

  const [editando, setEditando] = useState<Proveedor | null>(null);
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoDocumento>('FBE.34');
  const [categoria, setCategoria] = useState('');
  const [imagen, setImagen] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null);

  /*
   * Un FBE.34 no tiene casilla de categoría, así que al cambiar el tipo se
   * limpia. Sin esto, quien rellena la categoría y luego cambia a externo
   * mandaría un valor que el servidor rechaza, y el error hablaría de algo que
   * ya no se ve en pantalla.
   */
  useEffect(() => {
    if (tipo === 'FBE.34') setCategoria('');
  }, [tipo]);

  function limpiar() {
    setEditando(null);
    setNombre('');
    setTipo('FBE.34');
    setCategoria('');
    setImagen('');
  }

  function editar(proveedor: Proveedor) {
    setEditando(proveedor);
    setNombre(proveedor.nombre);
    setTipo(proveedor.tipoDocumento);
    setCategoria(proveedor.categoriaFija);
    setImagen(proveedor.imagen);
    setAviso(null);
  }

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setAviso(null);
    try {
      const datos = { nombre, tipoDocumento: tipo, categoriaFija: categoria, imagen };
      if (editando) await actualizarProveedor(editando.id, datos);
      else await crearProveedor(datos);

      limpiar();
      recargar();
      setAviso({ tipo: 'exito', mensaje: editando ? 'Proveedor actualizado.' : 'Proveedor creado.' });
    } catch (fallo) {
      setAviso({ tipo: 'error', mensaje: (fallo as Error).message });
    } finally {
      setGuardando(false);
    }
  }

  function archivar(proveedor: Proveedor) {
    pedirConfirmacion({
      titulo: `¿Dar de baja «${proveedor.nombre}»?`,
      detalle: 'Dejará de aparecer al elaborar pedidos. Los pedidos que ya se le hicieron se conservan enteros y se puede reactivar cuando haga falta.',
      textoConfirmar: 'Dar de baja',
      alConfirmar: () => {
        void archivarProveedor(proveedor.id)
          .then(() => recargar())
          .catch((fallo: Error) => setAviso({ tipo: 'error', mensaje: fallo.message }));
      },
    });
  }

  return (
    <section className="bloque-admin" aria-label="Proveedores">
      <form className="formulario-catalogo" onSubmit={guardar} noValidate>
        <div className="campo filtros__campo filtros__campo--ancho">
          <label className="campo__etiqueta" htmlFor="prov-nombre">Nombre</label>
          <input
            id="prov-nombre"
            className="campo__control"
            value={nombre}
            required
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>

        <div className="campo filtros__campo">
          <label className="campo__etiqueta" htmlFor="prov-tipo">Tipo</label>
          <select
            id="prov-tipo"
            className="campo__control"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoDocumento)}
          >
            <option value="FBE.34">FBE.34 · Proveedor externo</option>
            <option value="FBE.04">FBE.04 · Almacén interno</option>
          </select>
        </div>

        {/* La categoría solo existe en el FBE.04: su casilla no está en la
            otra plantilla, así que ofrecerla sería prometer algo que no se
            puede imprimir. */}
        {tipo === 'FBE.04' && (
          <div className="campo filtros__campo filtros__campo--ancho">
            <label className="campo__etiqueta" htmlFor="prov-categoria">Categoría (se marca con X)</label>
            <select
              id="prov-categoria"
              className="campo__control"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            >
              <option value="">Sin marcar</option>
              {CATEGORIAS_FIJAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}

        {/* Solo el NOMBRE del archivo: se sube al repositorio en
            public/assets/img/ y aquí se escribe cómo se llama. La carpeta la
            pone la aplicación. Vacío deja las iniciales. */}
        <div className="campo filtros__campo filtros__campo--ancho">
          <label className="campo__etiqueta" htmlFor="prov-imagen">Imagen</label>
          <input
            id="prov-imagen"
            className="campo__control"
            value={imagen}
            placeholder="nutresa.png"
            onChange={(e) => setImagen(e.target.value)}
          />
        </div>

        <div className="filtros__acciones">
          {editando && (
            <button type="button" className="boton boton--secundario" onClick={limpiar}>
              Cancelar
            </button>
          )}
          <button type="submit" className="boton boton--primario" disabled={guardando}>
            {editando ? 'Guardar cambios' : 'Añadir proveedor'}
          </button>
        </div>
      </form>

      {aviso && <p className={`aviso aviso--${aviso.tipo}`} role="status">{aviso.mensaje}</p>}

      {cargando && <BloqueEstado tipo="cargando" titulo="Cargando proveedores…" />}
      {error && (
        <BloqueEstado
          tipo="error"
          titulo="No se pudieron cargar los proveedores"
          detalle={error}
          accion={{ texto: 'Reintentar', alPulsar: recargar }}
        />
      )}

      {proveedores && proveedores.length > 0 && (
        <div className="tabla-envoltorio">
          <table className="tabla tabla--admin">
            <thead>
              <tr>
                <th scope="col">Proveedor</th>
                <th scope="col">Tipo</th>
                <th scope="col">Categoría</th>
                <th scope="col">Estado</th>
                <th className="tabla__acciones" scope="col">
                  <span className="visualmente-oculto">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {proveedores.map((proveedor) => (
                <tr
                  key={proveedor.id}
                  className={proveedor.activo ? undefined : 'tabla__fila--apagada'}
                >
                  <td className="tabla__nombre">{proveedor.nombre}</td>
                  <td className="tabla__menu">
                    {proveedor.tipoDocumento}
                    <span className="tabla__detalle">{QUE_ES[proveedor.tipoDocumento]}</span>
                  </td>
                  <td className="tabla__menu">{proveedor.categoriaFija || '—'}</td>
                  <td>
                    <span className={`marca-estado marca-estado--${proveedor.activo ? 'activa' : 'cancelada'}`}>
                      {proveedor.activo ? 'En servicio' : 'De baja'}
                    </span>
                  </td>
                  <td className="tabla__acciones">
                    <button
                      type="button"
                      className="boton boton--secundario boton--sm"
                      onClick={() => editar(proveedor)}
                    >
                      Editar
                    </button>
                    {proveedor.activo ? (
                      <button
                        type="button"
                        className="boton boton--peligro-plano boton--sm"
                        onClick={() => archivar(proveedor)}
                      >
                        Dar de baja
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="boton boton--secundario boton--sm"
                        onClick={() => void reactivarProveedor(proveedor.id).then(() => recargar())}
                      >
                        Reactivar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ── Productos ──────────────────────────────────────────────────────── */

/**
 * Una línea de la carga en lote.
 *
 * El formato es el de una hoja de cálculo copiada: columnas separadas por
 * tabulador o por punto y coma. Se eligió así porque el catálogo llega en
 * Excel, y pedirle a quien lo tiene delante que lo reescriba en otro formato
 * sería sustituir un trabajo manual por otro.
 *
 *     NOMBRE                  [TAB] UNIDAD [TAB] CATEGORÍA [TAB] CÓDIGO
 */
function leerLote(texto: string): DatosProducto[] {
  const filas: DatosProducto[] = [];

  for (const linea of texto.split(/\r?\n/)) {
    if (!linea.trim()) continue;
    const [nombre = '', unidad = '', categoria = '', codigo = ''] =
      linea.split(/\t|;/).map((c) => c.trim());
    if (!nombre) continue;
    filas.push({ nombre, unidadMedida: unidad, categoria, codigo });
  }

  return filas;
}

export function SeccionProductos({ pedirConfirmacion }: Props) {
  const consultarProveedores = useCallback(() => getProveedores({ incluirInactivos: true }), []);
  const { datos: proveedores } = usePeticion(consultarProveedores, []);

  const [proveedorId, setProveedorId] = useState('');

  const consultar = useCallback(
    () => (proveedorId ? getProductos(proveedorId) : Promise.resolve([])),
    [proveedorId],
  );
  const { datos: productos, cargando, error, recargar } = usePeticion(consultar, [proveedorId]);

  const [editando, setEditando] = useState<Producto | null>(null);
  const [nombre, setNombre] = useState('');
  const [unidad, setUnidad] = useState('');
  const [categoria, setCategoria] = useState('');
  const [codigo, setCodigo] = useState('');
  const [lote, setLote] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null);

  const proveedor = (proveedores ?? []).find((p) => p.id === proveedorId);

  function limpiar() {
    setEditando(null);
    setNombre('');
    setUnidad('');
    setCategoria('');
    setCodigo('');
  }

  function editar(producto: Producto) {
    setEditando(producto);
    setNombre(producto.nombre);
    setUnidad(producto.unidadMedida);
    setCategoria(producto.categoria);
    setCodigo(producto.codigo);
    setAviso(null);
  }

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    if (!proveedorId) return;

    setGuardando(true);
    setAviso(null);
    try {
      const datos = { nombre, unidadMedida: unidad, categoria, codigo };
      if (editando) await actualizarProducto(editando.id, datos);
      else await crearProductos(proveedorId, [datos]);

      limpiar();
      recargar();
      setAviso({ tipo: 'exito', mensaje: editando ? 'Producto actualizado.' : 'Producto añadido al final.' });
    } catch (fallo) {
      setAviso({ tipo: 'error', mensaje: (fallo as Error).message });
    } finally {
      setGuardando(false);
    }
  }

  async function cargarLote() {
    const filas = leerLote(lote);
    if (filas.length === 0) {
      setAviso({ tipo: 'error', mensaje: 'No se reconoció ninguna línea con nombre.' });
      return;
    }

    setGuardando(true);
    setAviso(null);
    try {
      const creados = await crearProductos(proveedorId, filas);
      setLote('');
      recargar();
      setAviso({
        tipo: 'exito',
        mensaje: `Se añadieron ${creados.length} ${creados.length === 1 ? 'producto' : 'productos'} al final del catálogo.`,
      });
    } catch (fallo) {
      setAviso({ tipo: 'error', mensaje: (fallo as Error).message });
    } finally {
      setGuardando(false);
    }
  }

  function exportar() {
    if (!productos || !proveedor) return;
    /*
     * Las mismas columnas que acepta la carga en lote, y en el mismo orden:
     * lo que sale se puede volver a pegar. Un exportado que no se pueda
     * reimportar solo sirve para mirarlo.
     */
    const csv = aCSV(
      ['Orden', 'Nombre', 'Unidad', 'Categoría', 'Código', 'Estado'],
      productos.map((p) => [
        String(p.orden), p.nombre, p.unidadMedida, p.categoria, p.codigo,
        p.activo ? 'activo' : 'de baja',
      ]),
    );
    descargarTexto(`catalogo-${proveedor.id}.csv`, csv);
  }

  function archivar(producto: Producto) {
    pedirConfirmacion({
      titulo: `¿Dar de baja «${producto.nombre}»?`,
      detalle: 'Dejará de aparecer en el formulario de pedido. Los pedidos donde ya se pidió lo siguen mostrando: su nombre está copiado en la línea.',
      textoConfirmar: 'Dar de baja',
      alConfirmar: () => {
        void archivarProducto(producto.id)
          .then(() => recargar())
          .catch((fallo: Error) => setAviso({ tipo: 'error', mensaje: fallo.message }));
      },
    });
  }

  const mover = (producto: Producto, direccion: 'subir' | 'bajar') => {
    void moverProducto(producto.id, direccion)
      .then(() => recargar())
      .catch((fallo: Error) => setAviso({ tipo: 'error', mensaje: fallo.message }));
  };

  return (
    <section className="bloque-admin" aria-label="Productos">
      <div className="filtros">
        <div className="campo filtros__campo filtros__campo--ancho">
          <label className="campo__etiqueta" htmlFor="prod-proveedor">Proveedor</label>
          <select
            id="prod-proveedor"
            className="campo__control"
            value={proveedorId}
            onChange={(e) => { setProveedorId(e.target.value); limpiar(); setAviso(null); }}
          >
            <option value="">Elige un proveedor…</option>
            {(proveedores ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}{p.activo ? '' : ' (de baja)'}
              </option>
            ))}
          </select>
        </div>

        {productos && productos.length > 0 && (
          <div className="filtros__acciones">
            <button type="button" className="boton boton--secundario" onClick={exportar}>
              Exportar a CSV
            </button>
          </div>
        )}
      </div>

      {!proveedorId && (
        <BloqueEstado
          tipo="vacio"
          titulo="Elige un proveedor"
          detalle="Cada catálogo es de un proveedor: sus productos y su orden son los de su plantilla."
        />
      )}

      {proveedorId && (
        <>
          <form className="formulario-catalogo" onSubmit={guardar} noValidate>
            <div className="campo filtros__campo filtros__campo--ancho">
              <label className="campo__etiqueta" htmlFor="prod-nombre">Nombre del producto</label>
              <input
                id="prod-nombre"
                className="campo__control"
                value={nombre}
                required
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>

            <div className="campo filtros__campo">
              <label className="campo__etiqueta" htmlFor="prod-unidad">Unidad</label>
              <input
                id="prod-unidad"
                className="campo__control"
                value={unidad}
                required
                placeholder="BOLSA, LIBRAS…"
                onChange={(e) => setUnidad(e.target.value)}
              />
            </div>

            <div className="campo filtros__campo">
              <label className="campo__etiqueta" htmlFor="prod-categoria">Sección</label>
              <input
                id="prod-categoria"
                className="campo__control"
                value={categoria}
                placeholder="GALLETAS…"
                onChange={(e) => setCategoria(e.target.value)}
              />
            </div>

            <div className="campo filtros__campo">
              <label className="campo__etiqueta" htmlFor="prod-codigo">Código</label>
              <input
                id="prod-codigo"
                className="campo__control"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
              />
            </div>

            <div className="filtros__acciones">
              {editando && (
                <button type="button" className="boton boton--secundario" onClick={limpiar}>
                  Cancelar
                </button>
              )}
              <button type="submit" className="boton boton--primario" disabled={guardando}>
                {editando ? 'Guardar cambios' : 'Añadir producto'}
              </button>
            </div>
          </form>

          {/* La carga en lote solo se ofrece al AÑADIR. Editando, un cuadro de
              texto para pegar veinte productos al lado del formulario del que
              se está corrigiendo invita a confundir las dos cosas. */}
          {!editando && (
            <form
              className="formulario-catalogo"
              onSubmit={(e) => { e.preventDefault(); void cargarLote(); }}
            >
              <div className="campo filtros__campo filtros__campo--ancho" style={{ flexBasis: '100%' }}>
                <label className="campo__etiqueta" htmlFor="prod-lote">
                  Cargar varios · una línea por producto
                </label>
                <textarea
                  id="prod-lote"
                  className="campo__control"
                  rows={4}
                  value={lote}
                  placeholder={'ALCOHOL\tGALON\nBIOVARSOL\tGALON\nGTA. TOSH MIEL\tBOLSA\tGALLETAS\t1064996'}
                  onChange={(e) => setLote(e.target.value)}
                />
                <p className="tabla__nota">
                  Nombre, unidad, sección y código, separados por tabulador o punto y coma.
                  Pegar directamente desde Excel funciona: solo hacen falta las dos primeras.
                </p>
              </div>

              <div className="filtros__acciones">
                <button
                  type="submit"
                  className="boton boton--secundario"
                  disabled={guardando || !lote.trim()}
                >
                  Añadir {leerLote(lote).length || ''} al final
                </button>
              </div>
            </form>
          )}

          {aviso && <p className={`aviso aviso--${aviso.tipo}`} role="status">{aviso.mensaje}</p>}

          {cargando && <BloqueEstado tipo="cargando" titulo="Cargando el catálogo…" />}
          {error && (
            <BloqueEstado
              tipo="error"
              titulo="No se pudo cargar el catálogo"
              detalle={error}
              accion={{ texto: 'Reintentar', alPulsar: recargar }}
            />
          )}

          {productos?.length === 0 && !cargando && (
            <BloqueEstado
              tipo="vacio"
              titulo="Este proveedor no tiene productos"
              detalle="Añádelos de uno en uno o pega el catálogo entero arriba."
            />
          )}

          {productos && productos.length > 0 && (
            <div className="tabla-envoltorio">
              <table className="tabla tabla--admin">
                <caption className="tabla__caption">
                  {productos.length} productos, en el orden de la plantilla.
                </caption>
                <thead>
                  <tr>
                    <th className="tabla__numero" scope="col">N.º</th>
                    <th scope="col">Producto</th>
                    <th scope="col">Unidad</th>
                    <th scope="col">Sección</th>
                    <th scope="col">Código</th>
                    <th className="tabla__acciones" scope="col">
                      <span className="visualmente-oculto">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {productos.map((producto) => (
                    <tr
                      key={producto.id}
                      className={producto.activo ? undefined : 'tabla__fila--apagada'}
                    >
                      <td className="tabla__numero">{producto.orden}</td>
                      <td className="tabla__nombre">{producto.nombre}</td>
                      <td className="tabla__menu">{producto.unidadMedida}</td>
                      <td className="tabla__menu">{producto.categoria || '—'}</td>
                      <td className="tabla__menu">{producto.codigo || '—'}</td>
                      <td className="tabla__acciones">
                        {/*
                          Los botones de mover se ofrecen SIEMPRE, también en
                          el primero y el último: el servidor devuelve el
                          producto sin tocarlo cuando ya está en el extremo, y
                          así la pantalla no tiene que llevar la cuenta de
                          dónde empieza y acaba la lista.
                        */}
                        <button
                          type="button"
                          className="boton boton--secundario boton--sm"
                          aria-label={`Subir ${producto.nombre}`}
                          onClick={() => mover(producto, 'subir')}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="boton boton--secundario boton--sm"
                          aria-label={`Bajar ${producto.nombre}`}
                          onClick={() => mover(producto, 'bajar')}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="boton boton--secundario boton--sm"
                          onClick={() => editar(producto)}
                        >
                          Editar
                        </button>
                        {producto.activo ? (
                          <button
                            type="button"
                            className="boton boton--peligro-plano boton--sm"
                            onClick={() => archivar(producto)}
                          >
                            Baja
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="boton boton--secundario boton--sm"
                            onClick={() => void reactivarProducto(producto.id).then(() => recargar())}
                          >
                            Reactivar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ── Cuentas ────────────────────────────────────────────────────────── */

const NOMBRE_ROL: Record<string, string> = {
  mostrador: 'Mostrador',
  admin: 'Administración',
};

/**
 * Quién puede usar la aplicación. Solo de consulta, y a propósito.
 *
 * Crear cuentas y cambiar contraseñas se sigue haciendo en Supabase: son
 * operaciones sobre credenciales, y meterlas aquí habría convertido esta
 * pantalla en una segunda puerta a la identidad de todo el campus.
 */
export function SeccionCuentas() {
  const consultar = useCallback(() => getCuentas(), []);
  const { datos: cuentas, cargando, error, recargar } = usePeticion(consultar, []);

  return (
    <section className="bloque-admin" aria-label="Cuentas">
      {cargando && <BloqueEstado tipo="cargando" titulo="Cargando cuentas…" />}
      {error && (
        <BloqueEstado
          tipo="error"
          titulo="No se pudieron cargar las cuentas"
          detalle={error}
          accion={{ texto: 'Reintentar', alPulsar: recargar }}
        />
      )}

      {cuentas && cuentas.length > 0 && (
        <div className="tabla-envoltorio">
          <table className="tabla tabla--admin">
            <caption className="tabla__caption">
              Las cuentas con permisos. Crearlas, cambiar contraseñas y asignar
              roles se hace en el panel de Supabase, no aquí.
            </caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Rol</th>
                <th scope="col">Cafetería</th>
              </tr>
            </thead>
            <tbody>
              {cuentas.map((cuenta) => (
                <tr key={cuenta.nombre + cuenta.rol + cuenta.cafeteriaId}>
                  <td className="tabla__nombre">{cuenta.nombre || '(sin nombre)'}</td>
                  <td>
                    <span className="marca-estado marca-estado--activa">
                      {NOMBRE_ROL[cuenta.rol] ?? cuenta.rol}
                    </span>
                  </td>
                  {/* Administración no tiene sede, y eso no es un hueco: es la
                      diferencia entre los dos roles. */}
                  <td className="tabla__menu">{cuenta.cafeteriaNombre || 'Todas'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
