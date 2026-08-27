/**
 * Vista consolidada: indicadores, gráficas y tablas de totales.
 *
 * Cada gráfica va acompañada de su tabla con los mismos números. No es
 * redundancia: la gráfica da la forma de un vistazo y la tabla da el valor
 * exacto, que es el que se copia a un informe. Además es lo que hace la
 * pantalla utilizable con lector de pantalla, donde un SVG no dice nada.
 *
 * Las cifras NO se calculan aquí: llegan ya sumadas dentro de la respuesta de
 * `reservas.buscar`, porque el administrador puede pedir un trimestre y
 * mandar miles de filas al navegador para que cuente es justo lo que no hay
 * que hacer.
 */

import type { ReactNode } from 'react';
import type { ResumenReservas } from '../../servicios/reservasServicio.js';
import { formatearFechaCorta, lunesDeSemana } from '../../utiles/fechas.js';
import { GraficaBarras, GraficaColumnas, Indicador, type DatoColumna } from './graficas.js';

/** Cuántos días caben en la gráfica diaria antes de pasar a semanas. */
const TOPE_DIAS = 45;

/**
 * Agrupa la serie diaria por semanas.
 *
 * Un trimestre son noventa columnas de dos píxeles: ilegible. Cuando el rango
 * se pasa de largo, la unidad deja de ser el día y pasa a ser la semana, y se
 * dice en el título para que nadie lea una barra semanal como si fuera un día.
 */
function agruparPorSemana(porDia: ResumenReservas['porDia']): DatoColumna[] {
  const semanas = new Map<string, number>();
  for (const dia of porDia) {
    const lunes = lunesDeSemana(dia.fecha);
    semanas.set(lunes, (semanas.get(lunes) ?? 0) + dia.activas);
  }
  return [...semanas.entries()].map(([lunes, activas]) => ({
    etiqueta: formatearFechaCorta(lunes),
    valorEje: `Semana del ${formatearFechaCorta(lunes)}`,
    valor: activas,
  }));
}

function serieDiaria(porDia: ResumenReservas['porDia']): DatoColumna[] {
  return porDia.map((d) => ({
    etiqueta: formatearFechaCorta(d.fecha),
    valorEje: formatearFechaCorta(d.fecha),
    valor: d.activas,
  }));
}

/** Bloque con título, gráfica y tabla. */
function Bloque({ titulo, subtitulo, children }: {
  titulo: string; subtitulo?: string | undefined; children: ReactNode;
}) {
  return (
    <section className="bloque-consolidado">
      <h3 className="bloque-consolidado__titulo">{titulo}</h3>
      {subtitulo && <p className="bloque-consolidado__nota">{subtitulo}</p>}
      {children}
    </section>
  );
}

/** Tabla simple de totales. La primera columna es el nombre; el resto, cifras. */
function TablaTotales({ cabeceras, filas }: {
  cabeceras: string[]; filas: (string | number)[][];
}) {
  return (
    <div className="tabla-envoltorio">
      <table className="tabla tabla--totales">
        <thead>
          <tr>
            {cabeceras.map((c) => <th key={c} scope="col">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila, i) => (
            <tr key={`${String(fila[0])}-${i}`}>
              {fila.map((celda, j) => (
                <td key={j} className={j === 0 ? 'tabla__nombre' : 'tabla__numero'}>
                  {String(celda)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Consolidado({ resumen }: { resumen: ResumenReservas }) {
  const { totales, porDia, porCafeteria, porPlato } = resumen;

  const porSemana = porDia.length > TOPE_DIAS;
  const serie = porSemana ? agruparPorSemana(porDia) : serieDiaria(porDia);
  const tituloSerie = porSemana ? 'Reservas activas por semana' : 'Reservas activas por día';

  return (
    <>
      <div className="rejilla-indicadores">
        <Indicador rotulo="Reservas activas" valor={totales.activas.toLocaleString('es-CO')} />
        <Indicador
          rotulo="Canceladas"
          valor={totales.canceladas.toLocaleString('es-CO')}
          detalle={totales.total > 0
            ? `${Math.round((totales.canceladas / totales.total) * 100)}% del total`
            : undefined}
        />
        <Indicador
          rotulo="Promedio por día"
          valor={totales.promedioDiario.toLocaleString('es-CO')}
          detalle={`sobre ${totales.diasConServicio} días con servicio`}
        />
        <Indicador rotulo="Cafeterías con reservas" valor={porCafeteria.length} />
      </div>

      {/* Sin nada que consolidar se dice con palabras, en vez de enseñar
          cuatro ceros y tres gráficas vacías. */}
      {totales.total === 0 ? (
        <p className="grafica__vacio">
          Ninguna reserva coincide con el filtro, así que no hay nada que consolidar.
        </p>
      ) : (
        <>
          <Bloque
            titulo={tituloSerie}
            subtitulo={porSemana
              ? 'El rango supera las seis semanas, así que cada barra es una semana completa.'
              : 'Los días sin barra son días sin servicio: fines de semana y festivos.'}
          >
            <GraficaColumnas datos={serie} titulo={tituloSerie} />
            <TablaTotales
              cabeceras={[porSemana ? 'Semana del' : 'Día', 'Activas']}
              filas={serie.filter((d) => d.valor > 0).map((d) => [d.valorEje, d.valor])}
            />
          </Bloque>

          <Bloque titulo="Reservas por cafetería">
            <GraficaBarras
              datos={porCafeteria.map((c) => ({ etiqueta: c.nombre, valor: c.activas }))}
              titulo="Reservas activas por cafetería"
            />
            <TablaTotales
              cabeceras={['Cafetería', 'Activas', 'Canceladas', 'Total']}
              filas={porCafeteria.map((c) =>
                [c.nombre, c.activas, c.canceladas, c.activas + c.canceladas])}
            />
          </Bloque>

          <Bloque
            titulo="Platos más pedidos"
            subtitulo="Solo cuenta reservas activas: sumar las canceladas mandaría a cocinar de más."
          >
            {/* La gráfica se queda en los diez primeros —más barras no se
                distinguen— pero la tabla los lleva todos. */}
            <GraficaBarras
              datos={porPlato.slice(0, 10).map((p) => ({ etiqueta: p.nombre, valor: p.total }))}
              titulo="Platos más pedidos"
            />
            <TablaTotales
              cabeceras={['Plato', 'Reservas']}
              filas={porPlato.map((p) => [p.nombre, p.total])}
            />
          </Bloque>
        </>
      )}
    </>
  );
}
