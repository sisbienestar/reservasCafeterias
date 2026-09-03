/**
 * La pestaña «Consolidado»: cada casilla es la SUMA de ese producto para esa
 * sede en todo el periodo, no un día suelto.
 *
 * Vive en su propio componente —y su propia petición— para que cambiar a la
 * pestaña «Detallado del día» no le cueste nada: `Dia.tsx` monta esto solo
 * mientras esta pestaña está activa.
 *
 * ── Las que no cerraron salen igual ───────────────────────────────────────
 *
 * Omitir una sede que no registró convertiría un documento de control en uno
 * que solo enseña lo que salió bien: el hueco ES el hallazgo. En un solo día
 * eso es sí o no, y lleva el aviso de arriba, como siempre. En un rango no lo
 * es —una sede puede cerrar cinco de siete días sin que sea una alarma, un
 * fin de semana no es un hallazgo— así que ahí se lee en la fila, con
 * «cerró N de M», no en un aviso que interrumpe.
 *
 * ── Lo que resalta es el descuadre, no el número ──────────────────────────
 *
 * Una casilla que cuadra se pinta apagada: ya se miró y no hay nada que ver.
 * Una que no cuadra se pinta entera, no solo el «+2» de abajo, para que el ojo
 * la encuentre sin tener que leer cada par de cifras una a una.
 */

import { useCallback, useMemo } from 'react';
import { getPeriodoSalidas, type PeriodoSalidas } from '../../servicios/salidasServicio.js';
import { usePeticion } from '../../utiles/usePeticion.js';
import { BloqueEstado } from '../BloqueEstado.js';

/** La cifra de una casilla. Vacío se enseña como vacío, no como cero. */
const cifra = (v: number | null): string => (v === null ? '—' : String(v));

/** Lo sumado de una sede para UN producto, o nada si nunca se contó. */
function lineaDe(sede: PeriodoSalidas['cafeterias'][number], productoId: number) {
  return sede.lineas.find((l) => l.productoId === productoId) ?? null;
}

interface Totales { ventas: number | null; produccion: number | null; diferencia: number | null }

/** Como `SUM` en SQL: ignora los `null` y solo queda en `null` si no hubo ninguno. */
function sumar(total: number | null, valor: number | null): number | null {
  return valor === null ? total : (total ?? 0) + valor;
}

export function VistaConsolidado({ desde, hasta }: { desde: string; hasta: string }) {
  const soloUnDia = desde === hasta;

  const consultar = useCallback(() => getPeriodoSalidas(desde, hasta), [desde, hasta]);
  const { datos, cargando, error, recargar } = usePeticion(consultar, [desde, hasta]);

  const sinCerrar = soloUnDia ? (datos?.cafeterias ?? []).filter((c) => c.diasCerrados === 0) : [];

  /* El consolidado del PERIODO ENTERO, la fila de abajo del todo. Sale de lo
     que ya está en pantalla, sin otro viaje al servidor. */
  const totales = useMemo(() => {
    const mapa = new Map<number, Totales>();
    for (const p of datos?.productos ?? []) {
      mapa.set(p.productoId, { ventas: null, produccion: null, diferencia: null });
    }
    for (const sede of datos?.cafeterias ?? []) {
      for (const l of sede.lineas) {
        const acc = mapa.get(l.productoId);
        if (!acc) continue;
        acc.ventas = sumar(acc.ventas, l.ventasRegistradas);
        acc.produccion = sumar(acc.produccion, l.produccion);
        acc.diferencia = sumar(acc.diferencia, l.diferencia);
      }
    }
    return mapa;
  }, [datos]);

  return (
    <>
      {cargando && <BloqueEstado tipo="cargando" titulo="Cargando…" />}

      {error && (
        <BloqueEstado
          tipo="error"
          titulo="No se pudo cargar el consolidado"
          detalle={error}
          accion={{ texto: 'Reintentar', alPulsar: recargar }}
        />
      )}

      {/*
        El aviso de lo que FALTA va arriba y es una caja, no una fila más de
        la tabla: es lo que interrumpe. Solo tiene sentido para UN día — en
        un rango, que una sede falte un día suelto no es una alarma, así que
        ahí se lee en la fila («cerró N de M»), no aquí.
      */}
      {datos && soloUnDia && sinCerrar.length > 0 && (
        <p className="aviso aviso--aviso" role="status">
          {sinCerrar.length === 1
            ? `${sinCerrar[0]!.cafeteriaNombre} todavía no ha cerrado caja este día.`
            : `${sinCerrar.length} cafeterías todavía no han cerrado caja: `
              + `${sinCerrar.map((c) => c.cafeteriaNombre).join(', ')}.`}
        </p>
      )}

      {datos && datos.productos.length === 0 && (
        <BloqueEstado
          tipo="vacio"
          titulo="No hay productos que controlar"
          detalle="Administración los da de alta en «Productos»."
        />
      )}

      {datos && datos.productos.length > 0 && (
        <div className="tabla-envoltorio bloque-tabla">
          <table className="tabla">
            <caption className="tabla__caption">
              {soloUnDia
                ? 'Por cada producto, las ventas que registró la caja y lo que se produjo.'
                : 'Por cada producto, la suma de ventas y producción del periodo.'}
              {' '}«—» es una casilla que no se contó, que no es lo mismo que un cero.
            </caption>

            <thead>
              <tr>
                <th scope="col">Cafetería</th>
                {datos.productos.map((p) => (
                  <th key={p.productoId} scope="col">{p.nombre}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {datos.cafeterias.map((sede) => (
                <tr key={sede.cafeteriaId}
                    className={sede.diasCerrados === 0 ? 'tabla__fila--apagada' : undefined}>
                  <td className="tabla__nombre">{sede.cafeteriaNombre}</td>

                  {datos.productos.map((p) => {
                    const l = lineaDe(sede, p.productoId);
                    if (!l) return <td key={p.productoId} className="tabla__numero">—</td>;

                    /* Solo lo que NO cuadra se resalta — lo demás, incluido
                       lo que no se pudo determinar del todo, se apaga. */
                    const descuadra = l.diferencia !== null && l.diferencia !== 0;
                    return (
                      <td key={p.productoId}
                          className={`tabla__numero${descuadra
                            ? ' salidas__descuadre' : ' tabla__numero--leve'}`}>
                        {cifra(l.ventasRegistradas)} / {cifra(l.produccion)}
                        {descuadra && (
                          <span className="tabla__detalle salidas__descuadre">
                            {l.diferencia! > 0 ? `+${l.diferencia}` : l.diferencia}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr>
                <th scope="row">Total {soloUnDia ? 'del día' : 'del periodo'}</th>
                {datos.productos.map((p) => {
                  const t = totales.get(p.productoId) ?? { ventas: null, produccion: null, diferencia: null };
                  const descuadra = t.diferencia !== null && t.diferencia !== 0;
                  return (
                    <td key={p.productoId}
                        className={`tabla__numero${descuadra
                          ? ' salidas__descuadre' : ' tabla__numero--leve'}`}>
                      {cifra(t.ventas)} / {cifra(t.produccion)}
                      {descuadra && (
                        <span className="tabla__detalle salidas__descuadre">
                          {t.diferencia! > 0 ? `+${t.diferencia}` : t.diferencia}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="campo__ayuda">
        Cada casilla dice «ventas registradas / producción». El formato
        imprimible llegará cuando esté decidida la plantilla.
      </p>
    </>
  );
}
