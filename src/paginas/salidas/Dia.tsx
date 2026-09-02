/**
 * El día completo: todas las cafeterías juntas.
 *
 * Es el control de verdad — mirar una sede sola no contrasta nada; lo que se
 * revisa al cierre es el día entero. Por eso cruza sedes, y por eso el
 * servidor solo se lo sirve a quien no atiende una en concreto.
 *
 * ── Las que no cerraron salen igual ───────────────────────────────────────
 *
 * Y es la decisión que hace que esto sirva para algo. Omitir una sede que no
 * registró convertiría un documento de control en uno que solo enseña lo que
 * salió bien: el hueco ES el hallazgo, tanto como un descuadre.
 *
 * ── Todavía no es el impreso institucional ────────────────────────────────
 *
 * Esta es la vista en pantalla. El formato imprimible —con su membrete, su
 * código y sus firmas, como el FBE.04 de pedidos— está pendiente de que
 * llegue la plantilla. Cuando llegue, se añade una hoja como `Documento.tsx`
 * y esta pantalla le pone el botón; los datos ya vienen con la forma que hace
 * falta, una matriz de sedes por productos.
 */

import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getDia, type SedeDelDia } from '../../servicios/salidasServicio.js';
import { usePeticion } from '../../utiles/usePeticion.js';
import { BloqueEstado } from '../../componentes/BloqueEstado.js';
import { BarraVolver } from '../../componentes/BarraVolver.js';
import { Pie } from '../../componentes/Pie.js';
import { useHoy } from '../../contexto/Sesion.js';
import { formatearFechaLarga } from '../../utiles/fechas.js';

/** La cifra de una casilla. Vacío se enseña como vacío, no como cero. */
const cifra = (v: number | null): string => (v === null ? '—' : String(v));

/** Lo pedido y lo salido de una sede para UN producto, o nada si no lo tiene. */
function lineaDe(sede: SedeDelDia, productoId: number) {
  return sede.lineas.find((l) => l.productoId === productoId) ?? null;
}

export function Dia() {
  const hoy = useHoy();
  const { fecha = hoy } = useParams();
  const navegar = useNavigate();

  const consultar = useCallback(() => getDia(fecha), [fecha]);
  const { datos, cargando, error, recargar } = usePeticion(consultar, [fecha]);

  const sinCerrar = (datos?.cafeterias ?? []).filter((c) => !c.cerrado);

  return (
    <>
      <main className="contenedor pagina">
        <BarraVolver volver={{ a: '/salidas', texto: '← Control de salidas' }} />

        <section className="encabezado-reserva">
          <div className="encabezado-reserva__texto">
            <div className="encabezado-reserva__linea">
              <h1 className="encabezado-reserva__titulo">Cierre del día</h1>
              <p className="encabezado-reserva__meta">{formatearFechaLarga(fecha)}</p>
            </div>
          </div>

          <div className="campo filtros__campo">
            <label className="campo__etiqueta" htmlFor="fecha-dia">Día</label>
            <input
              id="fecha-dia"
              className="campo__control"
              type="date"
              value={fecha}
              /* La fecha SÍ va en la dirección aquí, al revés que en el
                 formulario de una sede: este día concreto es lo que se
                 comparte y lo que se imprime, así que tiene que poder
                 enlazarse. `replace` para no llenar el historial del navegador
                 de días al mover el calendario. */
              onChange={(e) => navegar(`/salidas/dia/${e.target.value}`, { replace: true })}
            />
          </div>
        </section>

        {cargando && <BloqueEstado tipo="cargando" titulo="Cargando el día…" />}

        {error && (
          <BloqueEstado
            tipo="error"
            titulo="No se pudo cargar el día"
            detalle={error}
            accion={{ texto: 'Reintentar', alPulsar: recargar }}
          />
        )}

        {/*
          El aviso de lo que FALTA va arriba y es una caja, no una fila más de
          la tabla: es lo que interrumpe. Un día con una sede sin cerrar no se
          puede dar por revisado, y eso hay que leerlo antes de mirar cifras.
        */}
        {datos && sinCerrar.length > 0 && (
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
            <table className="tabla tabla--compacta">
              <caption className="tabla__caption">
                Por cada producto, las ventas que registró la caja y lo que
                salió. «—» es una casilla que no se contó, que no es lo mismo
                que un cero.
              </caption>

              <thead>
                <tr>
                  <th scope="col">Cafetería</th>
                  <th scope="col">Responsable</th>
                  {datos.productos.map((p) => (
                    <th key={p.productoId} scope="col">{p.nombre}</th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {datos.cafeterias.map((sede) => (
                  <tr key={sede.cafeteriaId}
                      className={sede.cerrado ? undefined : 'tabla__fila--apagada'}>
                    <td className="tabla__nombre">{sede.cafeteriaNombre}</td>
                    <td className="tabla__menu">
                      {sede.cerrado
                        ? (sede.responsableNombre
                          || <span className="tabla__detalle">sin asignar</span>)
                        : <span className="tabla__detalle">sin cerrar</span>}
                    </td>

                    {datos.productos.map((p) => {
                      const l = sede.cerrado ? lineaDe(sede, p.productoId) : null;
                      if (!l) return <td key={p.productoId} className="tabla__numero">—</td>;
                      return (
                        <td key={p.productoId} className="tabla__numero">
                          {cifra(l.ventasRegistradas)} / {cifra(l.salidas)}
                          {/* La diferencia solo se dice cuando la hay: un cero
                              repetido treinta veces esconde el que no lo es.

                              El `{' '}` es el espacio que la separa del número,
                              y va en el marcado a propósito. En CSS habría
                              tenido que ser un margen, y un margen no se puede
                              condicionar a que haya algo delante: `:first-child`
                              cuenta ELEMENTOS y no texto, así que este `<span>`
                              es el primero aunque tenga «2 / 3» a su izquierda.
                              Se probó, y salía «2 / 3+1». */}
                          {l.diferencia !== null && l.diferencia !== 0 && (
                            <>
                              {' '}
                              <span className="tabla__detalle salidas__descuadre">
                                {l.diferencia > 0 ? `+${l.diferencia}` : l.diferencia}
                              </span>
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="campo__ayuda">
          Cada casilla dice «ventas registradas / salidas». El formato
          imprimible llegará cuando esté decidida la plantilla.
        </p>
      </main>

      <Pie />
    </>
  );
}
