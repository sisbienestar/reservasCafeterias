/**
 * Vista consolidada: indicadores, gráficas y tablas de totales.
 *
 * Cada gráfica va acompañada de su tabla con los mismos números. No es
 * redundancia: la gráfica da la forma de un vistazo y la tabla da el valor
 * exacto, que es el que se copia a un informe. Además es lo que hace la
 * pantalla utilizable con lector de pantalla, donde un SVG no dice nada.
 */

import { crear, pintar } from './dom.js';
import { graficaColumnas, graficaBarras, filaIndicadores } from './graficas.js';
import { formatearFechaCorta, lunesDeSemana } from '../utils/fechas.js';

/** Cuántos días caben en la gráfica diaria antes de pasar a semanas. */
const TOPE_DIAS = 45;

/**
 * Agrupa la serie diaria por semanas.
 *
 * Un trimestre son noventa columnas de dos píxeles: ilegible. Cuando el rango
 * se pasa de largo, la unidad deja de ser el día y pasa a ser la semana, y se
 * dice en el título para que nadie lea una barra semanal como si fuera un día.
 */
function agruparPorSemana(porDia) {
  const semanas = new Map();
  for (const dia of porDia) {
    const lunes = lunesDeSemana(dia.fecha);
    if (!semanas.has(lunes)) semanas.set(lunes, 0);
    semanas.set(lunes, semanas.get(lunes) + dia.activas);
  }
  return [...semanas.entries()].map(([lunes, activas]) => ({
    etiqueta: formatearFechaCorta(lunes),
    valorEje: `Semana del ${formatearFechaCorta(lunes)}`,
    valor: activas,
  }));
}

function serieDiaria(porDia) {
  return porDia.map((d) => ({
    etiqueta: formatearFechaCorta(d.fecha),
    valorEje: formatearFechaCorta(d.fecha),
    valor: d.activas,
  }));
}

/** Bloque con título, gráfica y tabla. */
function bloque(titulo, subtitulo, grafica, tabla) {
  return crear('section', {
    clase: 'bloque-consolidado',
    hijos: [
      crear('h3', { clase: 'bloque-consolidado__titulo', texto: titulo }),
      subtitulo ? crear('p', { clase: 'bloque-consolidado__nota', texto: subtitulo }) : null,
      grafica,
      tabla,
    ],
  });
}

/** Tabla simple de totales. */
function tablaTotales(cabeceras, filas) {
  return crear('div', {
    clase: 'tabla-envoltorio',
    hijos: [
      crear('table', {
        clase: 'tabla tabla--totales',
        hijos: [
          crear('thead', {
            hijos: [
              crear('tr', {
                hijos: cabeceras.map((texto, i) =>
                  crear('th', {
                    texto,
                    clase: i === 0 ? '' : 'tabla__numero',
                    attrs: { scope: 'col' },
                  }),
                ),
              }),
            ],
          }),
          crear('tbody', {
            hijos: filas.map((fila) =>
              crear('tr', {
                hijos: fila.map((celda, i) =>
                  crear('td', {
                    texto: String(celda),
                    clase: i === 0 ? 'tabla__nombre' : 'tabla__numero',
                  }),
                ),
              }),
            ),
          }),
        ],
      }),
    ],
  });
}

/**
 * Pinta la vista consolidada completa.
 *
 * @param {{indicadores: HTMLElement, cuerpo: HTMLElement}} vista
 * @param {import('../services/reservasService.js').ResumenReservas} resumen
 */
export function mostrarConsolidado(vista, resumen) {
  const { totales, porDia, porCafeteria, porPlato } = resumen;

  filaIndicadores(vista.indicadores, [
    ['Reservas activas', totales.activas.toLocaleString('es-CO')],
    ['Canceladas', totales.canceladas.toLocaleString('es-CO'),
      totales.total > 0
        ? `${Math.round((totales.canceladas / totales.total) * 100)}% del total`
        : null],
    ['Promedio por día', totales.promedioDiario.toLocaleString('es-CO'),
      `sobre ${totales.diasConServicio} días con servicio`],
    ['Cafeterías con reservas', porCafeteria.length],
  ]);

  if (totales.total === 0) {
    pintar(vista.cuerpo, crear('p', {
      clase: 'grafica__vacio',
      texto: 'Ninguna reserva coincide con el filtro, así que no hay nada que consolidar.',
    }));
    return;
  }

  const porSemana = porDia.length > TOPE_DIAS;
  const serie = porSemana ? agruparPorSemana(porDia) : serieDiaria(porDia);

  const bloques = [
    bloque(
      porSemana ? 'Reservas activas por semana' : 'Reservas activas por día',
      porSemana
        ? 'El rango supera las seis semanas, así que cada barra es una semana completa.'
        : 'Los días sin barra son días sin servicio: fines de semana y festivos.',
      graficaColumnas(serie, {
        titulo: porSemana ? 'Reservas activas por semana' : 'Reservas activas por día',
      }),
      tablaTotales(
        [porSemana ? 'Semana del' : 'Día', 'Activas'],
        serie.filter((d) => d.valor > 0).map((d) => [d.valorEje, d.valor]),
      ),
    ),

    bloque(
      'Reservas por cafetería',
      null,
      graficaBarras(
        porCafeteria.map((c) => ({ etiqueta: c.nombre, valor: c.activas })),
        { titulo: 'Reservas activas por cafetería' },
      ),
      tablaTotales(
        ['Cafetería', 'Activas', 'Canceladas', 'Total'],
        porCafeteria.map((c) => [c.nombre, c.activas, c.canceladas, c.activas + c.canceladas]),
      ),
    ),

    bloque(
      'Platos más pedidos',
      'Solo cuenta reservas activas: sumar las canceladas mandaría a cocinar de más.',
      graficaBarras(
        porPlato.slice(0, 10).map((p) => ({ etiqueta: p.nombre, valor: p.total })),
        { titulo: 'Platos más pedidos' },
      ),
      tablaTotales(['Plato', 'Reservas'], porPlato.map((p) => [p.nombre, p.total])),
    ),
  ];

  pintar(vista.cuerpo, ...bloques);
}

/** Filas del CSV de consolidado por día. */
export function filasConsolidado(resumen) {
  return resumen.porDia.map((d) => [d.fecha, d.activas, d.canceladas, d.activas + d.canceladas]);
}
