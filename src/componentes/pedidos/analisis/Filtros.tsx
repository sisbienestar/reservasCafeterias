/**
 * La barra de filtros del análisis. Es UNA sola para las seis vistas.
 *
 * Que sea una sola no es ahorro de código: es lo que permite mirar la misma
 * pregunta desde seis ángulos sin volver a escribir el rango de fechas cada
 * vez. Los filtros viven en el contenedor (`Analisis.tsx`), así que cambiar
 * de vista no los toca; lo que cambia es la lectura, no el recorte.
 *
 * El buscador de productos usa `<datalist>` y no una lista desplegable
 * escrita a mano: el navegador ya sabe autocompletar, y una propia habría que
 * hacerla accesible con teclado desde cero. Sus opciones NO son el catálogo
 * entero —283 productos, la mayoría sin un solo pedido en el rango— sino los
 * que de verdad aparecen en lo filtrado, que es lo que el servidor devuelve
 * en `productosDisponibles`.
 */

import { useId, useState } from 'react';
import type { Cafeteria } from '../../../servicios/cafeteriasServicio.js';
import type { Proveedor } from '../../../servicios/proveedoresServicio.js';
import {
  CATEGORIAS, type FiltrosAnalisis, type ProductoDisponible,
} from '../../../servicios/analisisServicio.js';

export function Filtros({
  filtros, alCambiar, alLimpiar, cafeterias, proveedores, productos, cargando,
}: {
  filtros: FiltrosAnalisis;
  alCambiar: (cambio: Partial<FiltrosAnalisis>) => void;
  alLimpiar: () => void;
  cafeterias: Cafeteria[];
  proveedores: Proveedor[];
  productos: ProductoDisponible[];
  cargando: boolean;
}) {
  const idLista = useId();

  /*
   * El campo de producto enseña el NOMBRE y el filtro guarda el ID, así que
   * el texto es estado propio del campo y no se deriva del filtro.
   *
   * Derivarlo tenía un fallo feo: al escribir sobre un producto ya elegido,
   * la primera letra deja de casar con ningún nombre, el ID cae a 0 y el
   * campo se vaciaría solo a mitad de palabra. Con el texto aparte, se puede
   * escribir libremente; lo que cambia el filtro es acertar un nombre entero
   * —que es lo que hace el autocompletado del navegador al elegir— y borrarlo
   * del todo lo quita.
   */
  const nombreDe = (id: number) => productos.find((p) => p.id === id)?.nombre ?? '';
  const [texto, setTexto] = useState(() => nombreDe(filtros.productoId));

  const elegirProducto = (escrito: string) => {
    setTexto(escrito);
    const limpio = escrito.trim();
    if (!limpio) return alCambiar({ productoId: 0 });
    const hallado = productos.find((p) => p.nombre === limpio);
    // Sin coincidencia exacta no se filtra, pero tampoco se borra lo escrito:
    // se está a mitad de teclear.
    if (hallado) alCambiar({ productoId: hallado.id });
    else if (filtros.productoId !== 0) alCambiar({ productoId: 0 });
  };

  /** «Quitar filtros» vacía también el campo, que es estado de aquí. */
  const limpiarTodo = () => {
    setTexto('');
    alLimpiar();
  };

  const hayFiltro = Boolean(
    filtros.cafeteriaId || filtros.proveedorId || filtros.categoria || filtros.productoId,
  );

  return (
    <section className="filtros" aria-label="Filtros del análisis">
      <div className="campo filtros__campo">
        <label className="campo__etiqueta" htmlFor="analisis-desde">Desde</label>
        <input
          id="analisis-desde" type="date" className="campo__control"
          value={filtros.desde} max={filtros.hasta}
          onChange={(e) => alCambiar({ desde: e.target.value })}
        />
      </div>

      <div className="campo filtros__campo">
        <label className="campo__etiqueta" htmlFor="analisis-hasta">Hasta</label>
        <input
          id="analisis-hasta" type="date" className="campo__control"
          value={filtros.hasta} min={filtros.desde}
          onChange={(e) => alCambiar({ hasta: e.target.value })}
        />
      </div>

      <div className="campo filtros__campo filtros__campo--ancho">
        <label className="campo__etiqueta" htmlFor="analisis-proveedor">Proveedor</label>
        <select
          id="analisis-proveedor" className="campo__control"
          value={filtros.proveedorId}
          onChange={(e) => alCambiar({ proveedorId: e.target.value })}
        >
          <option value="">Todos</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
      </div>

      <div className="campo filtros__campo filtros__campo--ancho">
        <label className="campo__etiqueta" htmlFor="analisis-sede">Cafetería</label>
        <select
          id="analisis-sede" className="campo__control"
          value={filtros.cafeteriaId}
          onChange={(e) => alCambiar({ cafeteriaId: e.target.value })}
        >
          <option value="">Todas</option>
          {cafeterias.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      </div>

      <div className="campo filtros__campo filtros__campo--ancho">
        <label className="campo__etiqueta" htmlFor="analisis-categoria">Categoría</label>
        <select
          id="analisis-categoria" className="campo__control"
          value={filtros.categoria}
          onChange={(e) => alCambiar({ categoria: e.target.value })}
        >
          <option value="">Todas</option>
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="campo filtros__campo filtros__campo--ancho">
        <label className="campo__etiqueta" htmlFor="analisis-producto">Producto</label>
        <input
          id="analisis-producto" className="campo__control" list={idLista}
          placeholder="Todos" value={texto}
          onChange={(e) => elegirProducto(e.target.value)}
        />
        <datalist id={idLista}>
          {productos.map((p) => (
            <option key={p.id} value={p.nombre}>{p.proveedorNombre} · {p.unidad}</option>
          ))}
        </datalist>
      </div>

      <div className="filtros__acciones">
        <button
          type="button" className="boton boton--secundario"
          onClick={limpiarTodo} disabled={cargando || !hayFiltro}
        >
          Quitar filtros
        </button>
      </div>
    </section>
  );
}
