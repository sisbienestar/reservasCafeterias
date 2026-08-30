/**
 * Vista 4 · Estacionalidad y patrones por fecha.
 *
 * Pregunta: ¿hay días de la semana o momentos del periodo académico con picos
 * que se puedan anticipar?
 *
 * Tres lecturas de la misma serie:
 *
 *   · Por día de la semana, que es el patrón que se repite todas las semanas.
 *   · Por fecha, que es donde se ven los del calendario académico —el arranque
 *     de semestre, la semana de parciales, el mes sin clase—.
 *   · El mapa de calor fecha × cafetería, que contesta lo que las dos
 *     anteriores esconden al sumar: si el pico es de todas las sedes o de una.
 *
 * El día de la semana se enseña como PROMEDIO POR DÍA y no como total. Un
 * rango de tres meses no tiene el mismo número de lunes que de viernes —y si
 * empieza en martes, tiene un lunes menos—, así que el total haría parecer más
 * flojo al día que menos veces cayó dentro del rango. El promedio quita ese
 * artefacto, y el total queda en la tabla para quien lo quiera.
 */

import { useMemo } from 'react';
import { GraficaBarras, GraficaColumnas, MapaCalor } from '../../graficas/index.js';
import type { Analisis } from '../../../servicios/analisisServicio.js';
import {
  AvisoUnidades, Bloque, DIAS_SEMANA, Pregunta, SelectorMedida, Tabla, Vacio,
  numero, rotularPeriodo, type Medida,
} from './comunes.js';

export function VistaEstacionalidad({ datos, medida, alCambiarMedida }: {
  datos: Analisis; medida: Medida; alCambiarMedida: (m: Medida) => void;
}) {
  const { porDiaSemana, porFecha, porFechaSede, granoFecha, desde, hasta, resumen } = datos;

  const valor = (f: { cantidad: number; lineas: number; pedidos: number }) => (
    medida === 'cantidad' ? f.cantidad : medida === 'lineas' ? f.lineas : f.pedidos
  );

  /**
   * Cuántas veces cae cada día de la semana dentro del rango. Es el divisor
   * que convierte el total en promedio; sin él, comparar días es comparar
   * cuántas veces tocaron.
   */
  const vecesPorDia = useMemo(() => {
    const cuenta = new Array<number>(8).fill(0);
    const fin = new Date(`${hasta}T12:00:00`);
    for (let d = new Date(`${desde}T12:00:00`); d <= fin; d.setDate(d.getDate() + 1)) {
      // getDay(): 0 = domingo. ISO: 1 = lunes … 7 = domingo.
      const iso = d.getDay() === 0 ? 7 : d.getDay();
      cuenta[iso] = (cuenta[iso] ?? 0) + 1;
    }
    return cuenta;
  }, [desde, hasta]);

  const semana = useMemo(() => {
    const porDia = new Map(porDiaSemana.map((f) => [f.dia, f]));
    return [1, 2, 3, 4, 5, 6, 7].map((dia) => {
      const fila = porDia.get(dia);
      const total = fila ? valor(fila) : 0;
      const veces = vecesPorDia[dia] ?? 0;
      return {
        dia,
        nombre: DIAS_SEMANA[dia]!,
        total,
        veces,
        promedio: veces > 0 ? total / veces : 0,
      };
    });
  }, [porDiaSemana, vecesPorDia, medida]);

  const serieFecha = porFecha.map((f) => ({
    etiqueta: rotularPeriodo(f.periodo, granoFecha),
    valorEje: rotularPeriodo(f.periodo, granoFecha),
    valor: valor(f),
  }));

  /* El mapa de calor: columnas = periodos, filas = sedes. */
  const calor = useMemo(() => {
    const periodos = [...new Set(porFechaSede.map((f) => f.periodo))].sort();
    const sedes = [...new Map(porFechaSede.map((f) => [f.cafeteriaId, f.cafeteriaNombre]))]
      .sort((a, b) => a[1].localeCompare(b[1], 'es'));
    const indiceP = new Map(periodos.map((p, i) => [p, i]));
    const indiceS = new Map(sedes.map(([id], i) => [id, i]));
    return {
      columnas: periodos.map((p) => rotularPeriodo(p, granoFecha)),
      filas: sedes.map(([, nombre]) => nombre),
      celdas: porFechaSede.map((f) => ({
        columna: indiceP.get(f.periodo) ?? 0,
        fila: indiceS.get(f.cafeteriaId) ?? 0,
        valor: valor(f),
      })),
    };
  }, [porFechaSede, granoFecha, medida]);

  const sinDatos = porFecha.length === 0;

  return (
    <>
      <Pregunta>
        ¿Hay días de la semana o momentos del periodo académico con picos de
        consumo que se puedan anticipar?
      </Pregunta>

      {sinDatos ? (
        <Vacio>No hay pedidos con estos filtros.</Vacio>
      ) : (
        <>
          <Bloque
            titulo="Por día de la semana"
            nota="Promedio por día, no total: el rango no contiene el mismo número de
                  lunes que de viernes, y el total haría parecer más flojo al día que
                  menos veces cayó dentro. El total está en la tabla."
            acciones={<SelectorMedida id="medida-estacionalidad" valor={medida} alCambiar={alCambiarMedida} />}
          >
            <AvisoUnidades unidades={resumen.unidades} medida={medida} />
            <GraficaBarras
              datos={semana.filter((d) => d.veces > 0)
                .map((d) => ({ etiqueta: d.nombre, valor: Math.round(d.promedio * 10) / 10 }))}
              titulo="Promedio por día de la semana"
            />
            <Tabla minimo="520px">
              <thead>
                <tr>
                  <th scope="col">Día</th>
                  <th scope="col" className="tabla__numero">Veces en el rango</th>
                  <th scope="col" className="tabla__numero">Total</th>
                  <th scope="col" className="tabla__numero">Promedio por día</th>
                </tr>
              </thead>
              <tbody>
                {semana.map((d) => (
                  <tr key={d.dia} className={d.total === 0 ? 'tabla__fila--apagada' : undefined}>
                    <th scope="row" className="tabla__nombre">{d.nombre}</th>
                    <td className="tabla__numero tabla__fecha">{d.veces}</td>
                    <td className="tabla__numero">{numero(d.total)}</td>
                    <td className="tabla__numero">
                      <strong>{d.promedio.toLocaleString('es-CO', { maximumFractionDigits: 1 })}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabla>
            <p className="tabla__nota">
              Sábado y domingo salen en cero salvo excepción: las cafeterías del campus
              no prestan servicio el fin de semana.
            </p>
          </Bloque>

          <Bloque
            titulo={granoFecha === 'semana' ? 'A lo largo del rango, por semana' : 'A lo largo del rango, por día'}
            nota={granoFecha === 'semana'
              ? 'El rango pasa de dos meses, así que cada columna es una semana —rotulada con su lunes— y no un día: noventa columnas de dos píxeles no se leen.'
              : 'Cada columna es un día del rango.'}
          >
            <GraficaColumnas datos={serieFecha} titulo="Volumen pedido a lo largo del rango" />
          </Bloque>

          <Bloque
            titulo="Mapa de calor: cafetería × fecha" ancho="completo"
            nota="Cuanto más oscura la celda, más se pidió. Es lo que las dos gráficas de
                  arriba esconden al sumar: si un pico es de todas las sedes o de una sola,
                  y si alguna lleva rachas enteras sin pedir. El tono más claro es el cero."
          >
            {calor.filas.length === 0 ? (
              <Vacio>No hay pedidos por cafetería con estos filtros.</Vacio>
            ) : (
              <MapaCalor
                columnas={calor.columnas} filas={calor.filas} celdas={calor.celdas}
                titulo="Pedidos por cafetería y fecha"
              />
            )}
          </Bloque>
        </>
      )}
    </>
  );
}
