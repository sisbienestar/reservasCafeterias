/**
 * La pestaña «Variabilidad»: cada día un rectángulo, cada sede una franja.
 *
 * Es el histórico de disponibilidad que usan las páginas de estado, con las
 * cafeterías donde allí van los servicios: de un vistazo se ve si el descuadre
 * es una racha, un día suelto o algo que pasa siempre. Lo que la tabla del
 * detallado dice con números —y hay que leer fila a fila— aquí es una forma.
 *
 * Al desplegar una sede se abren sus productos, cada uno con su propia franja
 * sobre los mismos días, así que las rachas de dos productos se comparan
 * mirando una encima de la otra.
 *
 * ── Los cuatro estados de un día ───────────────────────────────────────────
 *
 * No son «más o menos de lo mismo», que es lo que sabe pintar un mapa de
 * calor: son estados distintos y por eso llevan colores distintos.
 *
 *   cuadró            la producción y lo registrado coincidieron
 *   se perdió poco    hasta un 5% de lo producido
 *   se perdió mucho   más de ese 5%
 *   vino de otra sede se vendió más de lo que esta produjo
 *   sin cerrar        no hay dato — un hueco, no un color
 *
 * El umbral es RELATIVO a lo producido a propósito: perder tres de trescientos
 * no es lo mismo que perder tres de diez, y un umbral fijo habría pintado de
 * rojo a la sede grande por ser grande.
 *
 * ── Los días son los que tuvieron cierre ───────────────────────────────────
 *
 * `salidas.consolidado` ya devuelve solo esos, y es lo correcto: meter los
 * fines de semana y los festivos llenaría la franja de huecos que no son un
 * hallazgo. Un hueco aquí es una sede que no cerró un día en que las demás sí.
 *
 * ── Ni una petición nueva ──────────────────────────────────────────────────
 *
 * Sale del mismo `getConsolidado` que ya usa el impreso: trae la matriz
 * (día, sede, producto) entera en un viaje, y lo de la sede es la suma de sus
 * productos, hecha aquí.
 */

import { useCallback, useMemo, useState } from 'react';
import { getConsolidado } from '../../servicios/salidasServicio.js';
import { usePeticion } from '../../utiles/usePeticion.js';
import { BloqueEstado } from '../BloqueEstado.js';
import { formatearFechaCorta, formatearFechaLarga, lunesDeSemana } from '../../utiles/fechas.js';

/** A partir de aquí la pérdida se pinta de rojo: 5% de lo producido. */
const UMBRAL_ALTO = 0.05;

/** Lo contado de una casilla: puede no haber nada, y eso también se pinta. */
interface Casilla { produccion: number; diferencia: number | null }

type Estado = 'sin-cerrar' | 'cuadra' | 'perdida' | 'perdida-alta' | 'transferencia';

function estadoDe(casilla: Casilla | undefined): Estado {
  if (!casilla || casilla.diferencia === null) return 'sin-cerrar';
  if (casilla.diferencia === 0) return 'cuadra';
  if (casilla.diferencia < 0) return 'transferencia';
  const parte = casilla.produccion > 0 ? casilla.diferencia / casilla.produccion : 1;
  return parte > UMBRAL_ALTO ? 'perdida-alta' : 'perdida';
}

const TEXTO: Record<Estado, string> = {
  'sin-cerrar': 'sin cerrar',
  cuadra: 'cuadró',
  perdida: 'se perdió',
  'perdida-alta': 'se perdió',
  transferencia: 'vino de otra sede',
};

/**
 * La franja de una fila: un rectángulo por día y nada más.
 *
 * `semanas` viene calculado de fuera —dice qué días abren semana— para no
 * repetir la misma cuenta en cada sede y en cada producto desplegado.
 */
function Franja({ dias, semanas, casillas }: {
  dias: string[];
  semanas: Set<string>;
  casillas: Map<string, Casilla>;
}) {
  return (
    <div className="franja-dias">
      {dias.map((dia) => {
        const casilla = casillas.get(dia);
        const estado = estadoDe(casilla);
        const cifra = casilla?.diferencia;
        return (
          <div
            key={dia}
            className={`franja-dias__dia franja-dias__dia--${estado}`
              + (semanas.has(dia) ? ' franja-dias__dia--semana' : '')}
            /* El `title` es lo que hace que el color no sea el único que lo
               dice: pasar por encima da la fecha y la cifra exacta. */
            title={`${formatearFechaLarga(dia)} · ${TEXTO[estado]}`
              + (cifra ? ` (${cifra > 0 ? `+${cifra}` : cifra})` : '')}
          />
        );
      })}
    </div>
  );
}

/**
 * Las marcas del eje: por mes si el rango cruza varios, y si no por semana.
 *
 * Se reparten a lo ancho y no se clavan bajo su día exacto — es un eje para
 * situarse, no una regla de medir. Va UNA vez, en la cabecera, y no debajo de
 * cada franja: repetido en cada sede y en cada producto sería ruido.
 */
function marcasDe(dias: string[]): string[] {
  const meses = new Set(dias.map((d) => d.slice(0, 7)));
  const porMes = meses.size > 2;
  const vistos = new Set<string>();

  return dias.filter((d) => {
    const clave = porMes ? d.slice(0, 7) : lunesDeSemana(d);
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

export function VistaVariabilidad({ desde, hasta }: { desde: string; hasta: string }) {
  const consultar = useCallback(() => getConsolidado(desde, hasta), [desde, hasta]);
  const { datos, cargando, error, recargar } = usePeticion(consultar, [desde, hasta]);

  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());

  /* Dos índices por la clave que toca: el de la sede suma sus productos, y el
     del producto se lee tal cual. Se arman una vez y no en cada rectángulo. */
  const { porSede, porProducto } = useMemo(() => {
    const porSede = new Map<string, Map<string, Casilla>>();
    const porProducto = new Map<string, Map<string, Casilla>>();

    for (const c of datos?.celdas ?? []) {
      const sede = porSede.get(c.cafeteriaId) ?? new Map<string, Casilla>();
      const antes = sede.get(c.fecha);
      sede.set(c.fecha, {
        produccion: (antes?.produccion ?? 0) + c.produccion,
        /* `null` solo si NINGUNA línea de ese día tuvo las dos cifras: es la
           misma regla que `SUM(diferencia)` en SQL, que ignora los nulos. */
        diferencia: c.diferencia === null
          ? antes?.diferencia ?? null
          : (antes?.diferencia ?? 0) + c.diferencia,
      });
      porSede.set(c.cafeteriaId, sede);

      const clave = `${c.cafeteriaId}|${c.productoId}`;
      const linea = porProducto.get(clave) ?? new Map<string, Casilla>();
      linea.set(c.fecha, { produccion: c.produccion, diferencia: c.diferencia });
      porProducto.set(clave, linea);
    }

    return { porSede, porProducto };
  }, [datos]);

  function alternar(id: string) {
    setAbiertas((antes) => {
      const nuevas = new Set(antes);
      if (nuevas.has(id)) nuevas.delete(id); else nuevas.add(id);
      return nuevas;
    });
  }

  const dias = datos?.dias ?? [];

  /* Qué días abren semana: se calcula UNA vez y lo usan todas las franjas.
     El primero de la lista no cuenta — no hay nada a su izquierda que
     separar. */
  const semanas = useMemo(() => {
    const inicios = new Set<string>();
    let anterior = '';
    for (const dia of dias) {
      const lunes = lunesDeSemana(dia);
      if (anterior && lunes !== anterior) inicios.add(dia);
      anterior = lunes;
    }
    return inicios;
  }, [dias]);

  return (
    <>
      {cargando && <BloqueEstado tipo="cargando" titulo="Cargando el periodo…" />}

      {error && (
        <BloqueEstado
          tipo="error"
          titulo="No se pudo cargar el periodo"
          detalle={error}
          accion={{ texto: 'Reintentar', alPulsar: recargar }}
        />
      )}

      {datos && dias.length === 0 && (
        <BloqueEstado
          tipo="vacio"
          titulo="No hay ningún cierre en ese periodo"
          detalle="Sin días cerrados no hay variabilidad que enseñar. Prueba con otro rango."
        />
      )}

      {datos && dias.length > 0 && (
        <>
          <p className="franja-leyenda">
            <span>
              <span className="franja-leyenda__marca franja-dias__dia--cuadra" aria-hidden="true" />
              Cuadró
            </span>
            <span>
              <span className="franja-leyenda__marca franja-dias__dia--perdida" aria-hidden="true" />
              Se perdió poco
            </span>
            <span>
              <span className="franja-leyenda__marca franja-dias__dia--perdida-alta" aria-hidden="true" />
              Se perdió más del {Math.round(UMBRAL_ALTO * 100)}%
            </span>
            <span>
              <span className="franja-leyenda__marca franja-dias__dia--transferencia" aria-hidden="true" />
              Vino de otra sede
            </span>
            <span>
              <span className="franja-leyenda__marca franja-leyenda__marca--vacio" aria-hidden="true" />
              Sin cerrar
            </span>
          </p>

          <div className="tabla-envoltorio bloque-tabla">
            <table className="tabla tabla--franjas">
              <thead>
                <tr>
                  <th scope="col">Cafetería</th>
                  <th scope="col">
                    <p className="franja-dias__eje">
                      {marcasDe(dias).map((d) => (
                        <span key={d}>{formatearFechaCorta(d)}</span>
                      ))}
                    </p>
                  </th>
                </tr>
              </thead>

              {datos.cafeterias.map((sede) => {
                const abierta = abiertas.has(sede.cafeteriaId);
                const panel = `franja-${sede.cafeteriaId}`;

                return (
                  <tbody key={sede.cafeteriaId} id={panel}>
                    <tr className="tabla__fila--pulsable"
                        onClick={() => alternar(sede.cafeteriaId)}>
                      <td className="tabla__nombre" title={sede.nombre}>
                        <button
                          type="button"
                          className="tabla__desplegar"
                          aria-expanded={abierta}
                          aria-controls={panel}
                          onClick={(e) => { e.stopPropagation(); alternar(sede.cafeteriaId); }}
                        >
                          <span aria-hidden="true">{abierta ? '▾' : '▸'}</span>
                          <span className="visualmente-oculto">
                            {abierta ? 'Plegar' : 'Desplegar'} los productos de {sede.nombre}
                          </span>
                        </button>
                        {' '}
                        {sede.nombre}
                      </td>
                      <td>
                        <Franja semanas={semanas}
                          dias={dias}
                          casillas={porSede.get(sede.cafeteriaId) ?? new Map()}
                        />
                      </td>
                    </tr>

                    {/* Solo los productos de los que esta sede tiene registro
                        en el periodo. Un plato que aquí no se cuenta nunca
                        sería una franja entera de huecos: ocupa sitio y no
                        dice nada que el catálogo no diga ya. */}
                    {abierta && datos.productos
                      .filter((p) => porProducto.has(`${sede.cafeteriaId}|${p.productoId}`))
                      .map((p) => (
                        <tr key={p.productoId} className="tabla__fila--hija">
                          {/* El `title` porque la columna es de ancho fijo y
                              los nombres largos se cortan con puntos. */}
                          <td title={p.nombre}>{p.nombre}</td>
                          <td>
                            <Franja semanas={semanas}
                              dias={dias}
                              casillas={porProducto.get(`${sede.cafeteriaId}|${p.productoId}`)!}
                            />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                );
              })}
            </table>
          </div>
        </>
      )}
    </>
  );
}
