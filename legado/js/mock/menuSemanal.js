/**
 * Datos simulados: menú semanal.
 *
 * Hoja equivalente 'MenuSemanal':
 *   id | fecha | opciones (JSON con 2-3 platos)
 *
 * **El menú es del día, no de la cafetería.** Todas las sedes sirven la misma
 * carta, así que la fecha es la única clave. Antes había una columna
 * `cafeteria_id` y una carta por sede; se quitó porque una columna que
 * siempre repite el mismo valor cuatro veces no es un dato, es una mentira
 * que confunde a quien abra la hoja y multiplica por cuatro el trabajo de
 * publicar la carta cada semana.
 *
 * Si algún día las cafeterías vuelven a tener cartas distintas, esto es lo
 * que hay que deshacer: la columna `cafeteria_id` vuelve a la hoja, las tres
 * acciones de `menu.*` vuelven a recibir el id, y `menuService.js` lo vuelve
 * a pasar. Nada más — la interfaz pide la carta al servicio y pinta lo que
 * llegue.
 *
 * Las fechas se anclan al lunes de la semana en curso para que el prototipo
 * siempre tenga menú "de hoy" sin editar el archivo a mano, y se generan
 * varias semanas alrededor: hacia atrás para que el administrador tenga
 * historial, hacia delante para que pueda publicar la carta de la próxima.
 * En la hoja real las fechas se escriben literales, una vez por semana.
 */

import { lunesDeEstaSemana, sumarDias, esDiaDeServicio } from '../utils/fechas.js';
import { aSlug } from '../utils/texto.js';

/**
 * Cuántas semanas se generan hacia atrás y hacia delante del lunes en curso.
 *
 * Hacia atrás, para que el módulo de administración tenga historial que
 * filtrar y consolidar; hacia delante, una, porque la carta de la semana
 * siguiente se publica con antelación y el administrador tiene que poder
 * verla y editarla antes de que llegue.
 */
export const SEMANAS_ATRAS = 5;
export const SEMANAS_ADELANTE = 1;

/** Platos del campus por día de la semana (0 = lunes … 6 = domingo). */
const PLAN_SEMANAL = [
  ['Bandeja paisa', 'Pechuga a la plancha con ensalada', 'Pasta al pesto (vegetariano)'],
  ['Sancocho de gallina', 'Lomo de cerdo en salsa de ciruela', 'Lentejas guisadas con arroz'],
  ['Ajiaco santafereño', 'Pescado apanado con patacón', 'Curry de garbanzos (vegano)'],
  ['Arroz con pollo', 'Carne asada con yuca', 'Lasaña de verduras'],
  ['Mute santandereano', 'Cabrito con pepitoria', 'Risotto de champiñones (vegetariano)'],
  ['Sopa de pastas y sobrebarriga', 'Pollo agridulce con arroz', 'Ensalada César con quinua'],
  ['Caldo de costilla', 'Pernil al horno con puré', 'Salteado de tofu y verduras (vegano)'],
];

/** Convierte 'Bandeja paisa' en el identificador estable 'bandeja-paisa'. */
const idPlato = aSlug;

/**
 * Genera la carta de varias semanas alrededor de la actual.
 *
 * El plan de siete días se rota una posición por semana, de modo que dos
 * semanas seguidas no sirvan exactamente lo mismo cada lunes. Es un truco de
 * datos simulados: en la hoja real cada semana se escribe a mano.
 */
function construirMenuSemanal() {
  const lunesActual = lunesDeEstaSemana();
  const registros = [];

  for (let semana = -SEMANAS_ATRAS; semana <= SEMANAS_ADELANTE; semana++) {
    const lunes = sumarDias(lunesActual, semana * 7);
    const rotacion = ((semana % 7) + 7) % 7;

    PLAN_SEMANAL.forEach((_, indiceDia) => {
      const fecha = sumarDias(lunes, indiceDia);
      // Sábado y domingo no llevan carta: sin servicio no hay nada que
      // publicar, y una carta ahí haría creer que se puede reservar.
      if (!esDiaDeServicio(fecha)) return;

      const platos = PLAN_SEMANAL[(indiceDia + rotacion) % PLAN_SEMANAL.length];
      registros.push({
        id: fecha,
        fecha,
        opciones: platos.map((nombre) => ({ id: idPlato(nombre), nombre })),
      });
    });
  }

  return registros;
}

export const MENU_SEMANAL = construirMenuSemanal();
