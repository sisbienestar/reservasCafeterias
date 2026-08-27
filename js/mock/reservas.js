/**
 * Datos simulados: reservas.
 *
 * Hoja equivalente 'Reservas':
 *   id | nombre | telefono | cafeteria_id | fecha | menu_id | menu_nombre |
 *   medio | pago | estado | timestamp | historial
 *
 * `historial` es una columna JSON, igual que `opciones` en 'MenuSemanal':
 * una hoja de cálculo no tiene arreglos, así que se guarda serializada.
 *
 * A diferencia de la primera versión —diez reservas escritas a mano para el
 * día de hoy— aquí se genera el historial de varias semanas: el módulo de
 * administración filtra y consolida por rangos de fechas, y con un solo día
 * de datos todos sus filtros parecerían rotos.
 *
 * Las reservas creadas durante la sesión se añaden a este mismo arreglo en
 * memoria y se pierden al recargar: es un mock, no una base de datos.
 */

import { hoyISO, sumarDias, lunesDeEstaSemana, esDiaDeServicio, rangoDias } from '../utils/fechas.js';
import { MENU_SEMANAL, SEMANAS_ATRAS } from './menuSemanal.js';
import { CAFETERIAS } from './cafeterias.js';
import { construirIdReserva } from '../utils/idReserva.js';

/**
 * Generador pseudoaleatorio con semilla (mulberry32).
 *
 * Con `Math.random()` los datos cambiarían en cada recarga y el administrador
 * vería totales distintos cada vez que abre la página: imposible saber si un
 * número que cambió es un dato o un artefacto. Con semilla fija, el historial
 * es siempre el mismo hasta que alguien lo toca.
 */
function generadorAleatorio(semilla) {
  let a = semilla;
  return function aleatorio() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOMBRES = [
  'Laura Camila', 'Juan Sebastián', 'María Fernanda', 'Andrés Felipe',
  'Valentina', 'Daniel Esteban', 'Sofía Alejandra', 'Carlos Andrés',
  'Paula Andrea', 'Miguel Ángel', 'Ana Lucía', 'Santiago',
  'Isabella', 'Nicolás', 'Catalina', 'Julián David',
  'Manuela', 'Sergio Iván', 'Diana Marcela', 'Óscar Mauricio',
];

const APELLIDOS = [
  'Ardila Rueda', 'Ortiz Serrano', 'Gómez Peña', 'Mantilla Rangel',
  'Villamizar Jaimes', 'Cadena Prada', 'Sarmiento Duarte', 'Quintero Amaya',
  'Beltrán Navas', 'Carreño Silva', 'Pinzón Vera', 'Acevedo Mora',
  'Blanco Uribe', 'Ferreira Lozano', 'Herrera Pabón', 'Suárez Delgado',
  'Rincón Galvis', 'Vargas Ochoa', 'Moreno Plata', 'Castellanos Rey',
];

const PREFIJOS_MOVIL = ['300', '301', '304', '310', '311', '313', '315', '316', '320', '321', '350'];

/**
 * Volumen diario típico de cada cafetería: [mínimo, máximo].
 *
 * Las claves son los `id` de `cafeterias.js`. Los rangos están inventados,
 * solo para que el consolidado no salga con las cuatro sedes empatadas y se
 * note que la gráfica ordena por volumen.
 */
const VOLUMEN_DIARIO = {
  'bienestar-pro': [16, 28],
  'camilo-torres': [6, 14],
  'bienestar-universitario': [10, 20],
  'administracion-3': [4, 10],
};

/** Opciones de menú de una fecha, o [] si no hay carta publicada ese día. */
function opcionesDe(fecha) {
  const registro = MENU_SEMANAL.find((m) => m.fecha === fecha);
  return registro ? registro.opciones : [];
}

/** Marca ISO de una fecha concreta a una hora concreta. */
function marcaEn(fechaISO, hora, minuto) {
  const [anio, mes, dia] = fechaISO.split('-').map(Number);
  return new Date(anio, mes - 1, dia, hora, minuto, 0, 0).toISOString();
}

function construirReservas() {
  const azar = generadorAleatorio(20250823);
  const entero = (min, max) => min + Math.floor(azar() * (max - min + 1));
  const elegir = (lista) => lista[Math.floor(azar() * lista.length)];

  const hoy = hoyISO();
  const desde = sumarDias(lunesDeEstaSemana(), -SEMANAS_ATRAS * 7);
  const reservas = [];

  for (const fecha of rangoDias(desde, hoy)) {
    // Sábado y domingo no hay servicio, ni siquiera hoy: generar reservas de
    // un día en el que la regla dice que no se puede reservar produciría
    // datos que la propia API rechazaría.
    if (!esDiaDeServicio(fecha)) continue;

    // La carta es la misma para todas las sedes: se busca una vez por día.
    const opciones = opcionesDe(fecha);
    if (opciones.length === 0) continue;

    for (const cafeteriaId of Object.keys(VOLUMEN_DIARIO)) {

      const codigo = CAFETERIAS.find((c) => c.id === cafeteriaId).codigo;
      const [minimo, maximo] = VOLUMEN_DIARIO[cafeteriaId];
      const cuantas = entero(minimo, maximo);
      // El mock rechaza dos reservas del mismo móvil en la misma cafetería y
      // el mismo día, así que los datos generados tienen que cumplirlo:
      // sembrar historial que la propia API consideraría inválido sería una
      // trampa que se paga en la primera prueba.
      const movilesDelDia = new Set();

      for (let i = 0; i < cuantas; i++) {
        let telefono;
        do {
          telefono = elegir(PREFIJOS_MOVIL) + String(entero(1000000, 9999999));
        } while (movilesDelDia.has(telefono));
        movilesDelDia.add(telefono);

        const plato = elegir(opciones);
        const creada = marcaEn(fecha, entero(7, 11), entero(0, 59));

        const historial = [{ tipo: 'creacion', timestamp: creada, cambios: [] }];

        // Un 12% cambia de plato antes del servicio.
        if (azar() < 0.12 && opciones.length > 1) {
          const anterior = opciones.find((o) => o.id !== plato.id);
          historial.push({
            tipo: 'modificacion',
            timestamp: marcaEn(fecha, entero(11, 12), entero(0, 59)),
            cambios: [{ campo: 'menu', antes: anterior.nombre, despues: plato.nombre }],
          });
        }

        // Un 8% acaba cancelada.
        const cancelada = azar() < 0.08;
        if (cancelada) {
          historial.push({
            tipo: 'cancelacion',
            timestamp: marcaEn(fecha, entero(11, 13), entero(0, 59)),
            cambios: [],
          });
        }

        reservas.push({
          // El consecutivo arranca en 1 cada día y en cada sede, igual que
          // hará la API: el identificador dice de dónde y de cuándo es.
          id: construirIdReserva(codigo, fecha, i + 1),
          nombre: `${elegir(NOMBRES)} ${elegir(APELLIDOS)}`,
          telefono,
          cafeteria_id: cafeteriaId,
          fecha,
          menu_id: plato.id,
          menu_nombre: plato.nombre,
          // La mayoría se hace en el mostrador y ya pagada; el resto da
          // variedad suficiente para que los filtros y reportes tengan algo
          // que enseñar.
          medio: azar() < 0.75 ? 'presencial' : 'telefono',
          pago: azar() < 0.85 ? 'pagado' : 'debe',
          estado: cancelada ? 'cancelada' : 'activa',
          timestamp: creada,
          historial,
        });
      }
    }
  }

  return reservas;
}

export const RESERVAS = construirReservas();
