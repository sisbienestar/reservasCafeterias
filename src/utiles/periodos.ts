/**
 * El desplegable de periodo, y las fechas de cada opción.
 *
 * Vivió dentro de `paginas/reservas/Admin.tsx` mientras fue el único sitio que
 * filtraba por rango. Salió aquí al necesitarlo también el historial del
 * control de salidas: son el MISMO control, y copiarlo habría dejado dos
 * listas de periodos que se van separando sin que nadie se dé cuenta — con la
 * gracia añadida de que «Semana pasada» significaría cosas distintas en dos
 * pantallas de la misma aplicación.
 */

import { lunesDeSemana, sumarDias } from './fechas.js';

/** Primer día del mes al que pertenece una fecha ISO. */
const primeroDelMes = (fechaISO: string) => `${fechaISO.slice(0, 8)}01`;

/**
 * Las opciones, en el orden en que se ofrecen.
 *
 * De lo más corto a lo más largo, y «Personalizado» al final: es la salida
 * para lo que no cabe en ninguna de las otras, no una más de la lista.
 */
export const PERIODOS: { id: string; texto: string }[] = [
  { id: 'hoy', texto: 'Hoy' },
  { id: 'semana', texto: 'Esta semana' },
  { id: 'semana-pasada', texto: 'Semana pasada' },
  { id: '30', texto: 'Últimos 30 días' },
  { id: 'mes', texto: 'Este mes' },
  { id: 'mes-pasado', texto: 'Mes pasado' },
  { id: 'todo', texto: 'Todo el histórico' },
  { id: 'personalizado', texto: 'Personalizado' },
];

/**
 * Traduce el desplegable de periodo a un par de fechas.
 *
 * Devuelve `null` en «Personalizado», y eso es la señal de que mandan las
 * fechas escritas a mano: quien llama no tiene que conocer esa palabra.
 */
export function rangoDePeriodo(periodo: string, hoy: string): [string, string] | null {
  const lunes = lunesDeSemana(hoy);
  switch (periodo) {
    case 'hoy': return [hoy, hoy];
    case 'semana': return [lunes, sumarDias(lunes, 6)];
    case 'semana-pasada': {
      const lunesPasado = sumarDias(lunes, -7);
      return [lunesPasado, sumarDias(lunesPasado, 6)];
    }
    case '30': return [sumarDias(hoy, -29), hoy];
    case 'mes': return [primeroDelMes(hoy), hoy];
    case 'mes-pasado': {
      const finMesPasado = sumarDias(primeroDelMes(hoy), -1);
      return [primeroDelMes(finMesPasado), finMesPasado];
    }
    /**
     * «Todo el histórico» son seis meses, no todo.
     *
     * El servidor rechaza rangos de más de 366 días con RANGO_INVALIDO, así
     * que un «todo» literal fallaría siempre. Seis meses cubre cualquier
     * consulta que se haga de verdad, y es lo que hacía el original.
     */
    case 'todo': return [sumarDias(hoy, -180), hoy];
    default: return null; // personalizado: mandan las fechas escritas
  }
}
