/**
 * El cierre de UNA cafetería: sus productos con las dos casillas y su botón.
 *
 * Se usa dos veces, y por eso es un componente y no una página: en el cierre
 * del día se pinta uno por cafetería, y en `/salidas/:cafeteriaId` uno solo.
 * Son la misma hoja, y duplicarla habría dejado dos formularios que se van
 * separando sin que nadie se dé cuenta.
 *
 * NO pide sus datos: se los dan. El padre sabe si puede traer el día entero de
 * una vez —`salidas.dia`, un viaje para las cuatro— o solo el de una sede, y
 * decidirlo aquí habría convertido cuatro bloques en cuatro peticiones.
 *
 * ── Vacío no es cero ──────────────────────────────────────────────────────
 *
 * Un cero dice «se contó y no hubo ninguno»; una casilla en blanco dice «no se
 * contó». Por eso el estado guarda CADENAS y no números, y por eso la
 * diferencia solo se pinta cuando están las dos.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  guardarCierre, type LineaNueva, type LineaSalida, type ProductoSalida,
} from '../../servicios/salidasServicio.js';
import type { Cafeteria } from '../../servicios/cafeteriasServicio.js';

/** Lo tecleado en un renglón. Cadenas, porque es lo que hay en los inputs. */
interface Casillas {
  ventas: string;
  salidas: string;
}

const VACIO: Casillas = { ventas: '', salidas: '' };

/**
 * Una casilla a número, o `null` si está vacía.
 *
 * Devuelve `null` también para lo que no es un entero de cero para arriba: el
 * servidor lo rechazaría igual, y aquí lo que interesa es no pintar una
 * diferencia calculada sobre una letra.
 */
function aCuenta(texto: string): number | null {
  const limpio = texto.trim();
  if (!limpio) return null;
  const numero = Number(limpio);
  return Number.isInteger(numero) && numero >= 0 ? numero : null;
}

export interface DatosSede {
  cerrado: boolean;
  responsableNombre: string;
  lineas: LineaSalida[];
}

export function CierreSede({ fecha, cafeteria, productos, datos, alGuardar }: {
  fecha: string;
  cafeteria: Cafeteria;
  productos: ProductoSalida[];
  /** Lo que hay guardado, o `null` si esta sede no ha cerrado ese día. */
  datos: DatosSede | null;
  /** Para que el padre vuelva a leer lo que acaba de escribirse. */
  alGuardar: () => void;
}) {
  const [casillas, setCasillas] = useState<Record<number, Casillas>>({});
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null);

  /*
   * Al cambiar de día se repuebla la hoja, y se VACÍA cuando no hay nada.
   *
   * Sin ese vaciado, las cifras del lunes se quedarían escritas al pasar al
   * martes y se guardarían como suyas — que es exactamente el error que este
   * control tendría que detectar, cometido por la propia pantalla.
   */
  useEffect(() => {
    setAviso(null);
    if (!datos) { setCasillas({}); return; }
    setCasillas(Object.fromEntries(datos.lineas.map((l) => [
      l.productoId,
      {
        ventas: l.ventasRegistradas === null ? '' : String(l.ventasRegistradas),
        salidas: l.salidas === null ? '' : String(l.salidas),
      },
    ])));
  }, [datos, fecha]);

  const escribir = useCallback((productoId: number, campo: keyof Casillas, valor: string) => {
    setCasillas((antes) => ({
      ...antes,
      [productoId]: { ...(antes[productoId] ?? VACIO), [campo]: valor },
    }));
  }, []);

  /** Los renglones que de verdad van al cierre: los que tienen ALGO escrito. */
  const lineas = useMemo<LineaNueva[]>(() => {
    const salida: LineaNueva[] = [];
    for (const [id, c] of Object.entries(casillas)) {
      const ventas = aCuenta(c.ventas);
      const salidas = aCuenta(c.salidas);
      if (ventas === null && salidas === null) continue;
      salida.push({ productoId: Number(id), ventasRegistradas: ventas, salidas });
    }
    return salida;
  }, [casillas]);

  const totales = useMemo(() => {
    let ventas = 0; let salidas = 0;
    for (const l of lineas) {
      ventas += l.ventasRegistradas ?? 0;
      salidas += l.salidas ?? 0;
    }
    return { ventas, salidas, diferencia: salidas - ventas };
  }, [lineas]);

  const guardar = useCallback(async () => {
    setGuardando(true);
    setAviso(null);
    try {
      await guardarCierre({ fecha, cafeteriaId: cafeteria.id, lineas });
      setAviso({ tipo: 'exito', mensaje: 'Guardado.' });
      alGuardar();
    } catch (fallo) {
      setAviso({ tipo: 'error', mensaje: (fallo as Error).message });
    } finally {
      setGuardando(false);
    }
  }, [fecha, cafeteria.id, lineas, alGuardar]);

  return (
    <section className="cierre-sede" aria-label={`Cierre de ${cafeteria.nombre}`}>
      <div className="cierre-sede__cabecera">
        <div>
          <h2 className="cierre-sede__titulo">{cafeteria.nombre}</h2>
          <p className="cierre-sede__meta">
            {/*
              El responsable sale de la ficha de la sede y se enseña ANTES de
              guardar, para que se vea con qué nombre va a quedar. Si no hay
              ninguno se dice: el cierre se guardará igual y sin nombre, y eso
              conviene saberlo antes y no después.
            */}
            {cafeteria.responsableNombre
              ? `Responde ${cafeteria.responsableNombre}`
              : 'Sin responsable asignado'}
            {datos?.cerrado && (
              <>
                <span className="separador" aria-hidden="true">·</span>
                Ya cerrado
              </>
            )}
          </p>
        </div>

        <button
          type="button"
          className="boton boton--sm boton--primario"
          onClick={guardar}
          disabled={guardando}
          aria-busy={guardando}
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      {aviso && (
        <p className={`aviso aviso--${aviso.tipo}`} role="status">{aviso.mensaje}</p>
      )}

      <div className="tabla-envoltorio">
        <table className="tabla tabla--compacta">
          <thead>
            <tr>
              <th scope="col">Producto</th>
              <th scope="col">Ventas registradas</th>
              <th scope="col">Salidas</th>
              <th scope="col">Diferencia</th>
            </tr>
          </thead>

          <tbody>
            {productos.map((producto) => {
              const c = casillas[producto.id] ?? VACIO;
              const ventas = aCuenta(c.ventas);
              const salidas = aCuenta(c.salidas);
              // Solo cuando las DOS están: media resta no dice nada, y un
              // número ahí invitaría a leerlo como si dijera algo. Es la misma
              // regla que impone la columna generada de la base.
              const dif = ventas !== null && salidas !== null ? salidas - ventas : null;

              return (
                <tr key={producto.id}>
                  <td className="tabla__nombre">{producto.nombre}</td>
                  <td>
                    <input
                      className="campo__control cantidad"
                      type="number" min="0" step="1" inputMode="numeric"
                      value={c.ventas}
                      disabled={guardando}
                      aria-label={`Ventas registradas de ${producto.nombre} en ${cafeteria.nombre}`}
                      onChange={(e) => escribir(producto.id, 'ventas', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="campo__control cantidad"
                      type="number" min="0" step="1" inputMode="numeric"
                      value={c.salidas}
                      disabled={guardando}
                      aria-label={`Salidas de ${producto.nombre} en ${cafeteria.nombre}`}
                      onChange={(e) => escribir(producto.id, 'salidas', e.target.value)}
                    />
                  </td>
                  <td className={dif ? 'salidas__descuadre' : undefined}>
                    {dif === null ? '—' : dif > 0 ? `+${dif}` : dif}
                  </td>
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td>{totales.ventas}</td>
              <td>{totales.salidas}</td>
              <td className={totales.diferencia ? 'salidas__descuadre' : undefined}>
                {totales.diferencia > 0 ? `+${totales.diferencia}` : totales.diferencia}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
