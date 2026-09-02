/**
 * El catálogo del control de salidas: qué se cuenta al cerrar la caja.
 *
 * Cinco productos hoy y cualquiera mañana — el número no está escrito en
 * ninguna parte del código. Es la razón de que esto exista como pantalla en
 * vez de como una constante.
 *
 * **Nunca se borra, siempre se archiva.** Los cierres ya escritos apuntan aquí
 * con una clave foránea, así que borrar un producto dejaría renglones sin
 * catálogo; y el nombre está copiado en cada renglón, así que archivarlo no
 * altera ni un cierre viejo. Es la misma regla del catálogo de proveedores.
 */

import { useCallback, useState, type FormEvent } from 'react';
import {
  actualizarProductoSalida, archivarProductoSalida, crearProductoSalida,
  getProductosSalida, reactivarProductoSalida, type ProductoSalida,
} from '../../servicios/salidasServicio.js';
import { usePeticion } from '../../utiles/usePeticion.js';
import { BloqueEstado } from '../../componentes/BloqueEstado.js';
import { BarraVolver } from '../../componentes/BarraVolver.js';
import { ModalConfirmacion, type PeticionConfirmacion } from '../../componentes/ModalConfirmacion.js';
import { Pie } from '../../componentes/Pie.js';

export function Admin() {
  const consultar = useCallback(() => getProductosSalida(), []);
  const { datos: productos, cargando, error, recargar } = usePeticion(consultar, []);

  /** `null` = el formulario está en modo alta. */
  const [editando, setEditando] = useState<ProductoSalida | null>(null);
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null);
  const [confirmacion, setConfirmacion] = useState<PeticionConfirmacion | null>(null);

  function limpiar() {
    setEditando(null);
    setNombre('');
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setAviso(null);
    try {
      if (editando) await actualizarProductoSalida(editando.id, nombre);
      else await crearProductoSalida(nombre);
      limpiar();
      recargar();
      setAviso({
        tipo: 'exito',
        mensaje: editando ? 'Producto actualizado.' : 'Producto añadido al final de la lista.',
      });
    } catch (fallo) {
      setAviso({ tipo: 'error', mensaje: (fallo as Error).message });
    } finally {
      setGuardando(false);
    }
  }

  const pedirArchivar = useCallback((producto: ProductoSalida) => {
    setConfirmacion({
      titulo: `¿Dar de baja «${producto.nombre}»?`,
      detalle: 'Deja de aparecer en el formulario de cierre. Los cierres ya '
        + 'guardados no cambian: llevan el nombre copiado dentro. Se puede '
        + 'volver a poner en servicio cuando haga falta.',
      textoConfirmar: 'Sí, darlo de baja',
      tono: 'peligro',
      alConfirmar: () => {
        void (async () => {
          try {
            await archivarProductoSalida(producto.id);
            recargar();
            setAviso({ tipo: 'exito', mensaje: `«${producto.nombre}» dado de baja.` });
          } catch (fallo) {
            setAviso({ tipo: 'error', mensaje: (fallo as Error).message });
          }
        })();
        setConfirmacion(null);
      },
    });
  }, [recargar]);

  const reactivar = useCallback(async (producto: ProductoSalida) => {
    try {
      await reactivarProductoSalida(producto.id);
      recargar();
      setAviso({ tipo: 'exito', mensaje: `«${producto.nombre}» vuelve a estar en servicio.` });
    } catch (fallo) {
      setAviso({ tipo: 'error', mensaje: (fallo as Error).message });
    }
  }, [recargar]);

  return (
    <>
      <main className="contenedor pagina">
        <BarraVolver volver={{ a: '/salidas', texto: '← Control de salidas' }} />

        <section className="encabezado-admin">
          <h1 className="encabezado-admin__titulo">Productos del control</h1>
          <p className="encabezado-admin__bajada">
            Lo que se cuenta al cerrar la caja de cada cafetería. Son los mismos
            en todas las sedes, y el orden de esta lista es el del formulario y
            el del impreso.
          </p>
        </section>

        {aviso && (
          <p className={`aviso aviso--${aviso.tipo}`} role="status">{aviso.mensaje}</p>
        )}

        <form className="filtros" onSubmit={guardar} aria-label="Añadir o corregir un producto">
          <div className="campo filtros__campo filtros__campo--ancho">
            <label className="campo__etiqueta" htmlFor="nombre-producto">
              {editando ? `Corrigiendo «${editando.nombre}»` : 'Producto nuevo'}
            </label>
            <input
              id="nombre-producto"
              className="campo__control"
              type="text"
              value={nombre}
              disabled={guardando}
              placeholder="Desayunos, Bandeja Especial…"
              onChange={(e) => setNombre(e.target.value)}
            />
          </div>

          <div className="filtros__acciones">
            {editando && (
              <button type="button" className="boton boton--secundario"
                      onClick={limpiar} disabled={guardando}>
                Cancelar
              </button>
            )}
            <button type="submit" className="boton boton--primario"
                    disabled={guardando || !nombre.trim()}>
              {editando ? 'Guardar cambios' : 'Añadir producto'}
            </button>
          </div>
        </form>

        {cargando && <BloqueEstado tipo="cargando" titulo="Cargando productos…" />}

        {error && (
          <BloqueEstado
            tipo="error"
            titulo="No se pudo cargar el catálogo"
            detalle={error}
            accion={{ texto: 'Reintentar', alPulsar: recargar }}
          />
        )}

        {productos && productos.length > 0 && (
          <div className="tabla-envoltorio bloque-tabla">
            <table className="tabla tabla--compacta">
              <thead>
                <tr>
                  <th scope="col" className="tabla__numero">N.º</th>
                  <th scope="col">Producto</th>
                  <th scope="col">Estado</th>
                  <th scope="col"><span className="visualmente-oculto">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {productos.map((producto) => (
                  <tr key={producto.id}
                      className={producto.activo ? undefined : 'tabla__fila--apagada'}>
                    <td className="tabla__numero">{producto.orden}</td>
                    <td className="tabla__nombre">{producto.nombre}</td>
                    <td>
                      <span className={`marca-estado marca-estado--${producto.activo ? 'activa' : 'cancelada'}`}>
                        {producto.activo ? 'En servicio' : 'De baja'}
                      </span>
                    </td>
                    <td className="tabla__acciones">
                      <button type="button" className="boton boton--sm boton--secundario"
                              onClick={() => { setEditando(producto); setNombre(producto.nombre); }}>
                        Corregir
                      </button>
                      {producto.activo ? (
                        <button type="button" className="boton boton--sm boton--neutro"
                                onClick={() => pedirArchivar(producto)}>
                          Dar de baja
                        </button>
                      ) : (
                        <button type="button" className="boton boton--sm boton--secundario"
                                onClick={() => { void reactivar(producto); }}>
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
      </main>

      <Pie />

      <ModalConfirmacion peticion={confirmacion} alCerrar={() => setConfirmacion(null)} />
    </>
  );
}
