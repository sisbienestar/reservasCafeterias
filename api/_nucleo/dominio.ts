/**
 * Fechas, texto e identificadores.
 *
 * Es la traducción de las utilidades de `apps-script/Codigo.gs`. Se mantiene
 * aparte de las acciones porque son las reglas que el frontend REPITE: si
 * `aSlug` no coincidiera exactamente con `js/utils/texto.js`, el plato que la
 * pantalla ofrece y el que el servidor acepta dejarían de ser el mismo, y el
 * síntoma sería un MENU_INVALIDO sobre un plato que se ve en la lista.
 *
 * Ninguna función de aquí toca la base de datos. Eso las hace comprobables
 * sin Supabase, que es justo lo que se quiere de las reglas de negocio.
 */

/** Días sin servicio, con la semana empezando en lunes: 5 = sábado, 6 = domingo. */
const DIAS_SIN_SERVICIO = [5, 6];

/* ── INTERRUPTOR TEMPORAL DE PRUEBAS ─────────────────────────────────────
 *
 * En `true` se levanta la regla de «sábados y domingos no hay servicio»,
 * para poder probar el sistema en fin de semana.
 *
 * DEBE ESTAR EN `false` EN PRODUCCIÓN. Si se queda encendido, el personal
 * podrá registrar reservas de sábado y domingo que la cocina no va a ver.
 *
 * A diferencia de Apps Script, aquí se lee de una variable de entorno: el
 * backend y el frontend son ahora dos despliegues distintos y una constante
 * duplicada en dos archivos se desincroniza sola. La pantalla de mostrador
 * pregunta por su estado al arrancar en vez de tener su propia copia.
 */
export const PERMITIR_FIN_DE_SEMANA = process.env.PERMITIR_FIN_DE_SEMANA === 'true';

/** Tope del detalle de `reservas.buscar` cuando no se pide otro. */
export const LIMITE_DETALLE = 500;

/** Tope del rango de consulta: un año natural cubre cualquier reporte. */
export const MAX_DIAS_RANGO = 366;

/* ── Texto ───────────────────────────────────────────────────────────── */

/** Los acentos que NFD separa de su letra. Escapado a propósito: el rango
 *  escrito con los caracteres literales se corrompe al copiar y pegar. */
const ACENTOS = /[\u0300-\u036f]/g;

/** 'Bandeja Paisa' → 'bandeja-paisa'. Misma regla que js/utils/texto.js. */
export function aSlug(texto: unknown): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(ACENTOS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Minúsculas, sin tildes y sin espacios de sobra, para comparar al buscar.
 *  Tiene que dar el MISMO resultado que `unaccent_simple` en Postgres, o la
 *  búsqueda encontraría cosas distintas según quién la resuelva. */
export function normalizarBusqueda(texto: unknown): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(ACENTOS, '')
    .toLowerCase()
    .trim();
}

/* ── Fechas ──────────────────────────────────────────────────────────────
 *
 * Todas trabajan sobre la cadena 'YYYY-MM-DD' y construyen el Date con los
 * tres números por separado. Nunca `new Date('2026-08-19')`: esa forma se
 * interpreta como UTC, y en Colombia (UTC−5) devuelve el día anterior desde
 * las siete de la tarde. Es el error que más veces ha mordido en este
 * proyecto, y por eso ninguna función de aquí usa toISOString() sobre una
 * fecha del calendario.
 */

const partes = (fechaISO: string): [number, number, number] => {
  const p = String(fechaISO).split('-');
  return [Number(p[0]), Number(p[1]) - 1, Number(p[2])];
};

const aISO = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Índice de día con la semana empezando en lunes: 0 = lunes … 6 = domingo. */
export function indiceDiaSemana(fechaISO: string): number {
  const [a, m, d] = partes(fechaISO);
  const dia = new Date(a, m, d).getDay(); // 0 = domingo
  return dia === 0 ? 6 : dia - 1;
}

export function esDiaDeServicio(fechaISO: string): boolean {
  if (PERMITIR_FIN_DE_SEMANA) return true;
  return !DIAS_SIN_SERVICIO.includes(indiceDiaSemana(fechaISO));
}

export function sumarDias(fechaISO: string, n: number): string {
  const [a, m, d] = partes(fechaISO);
  return aISO(new Date(a, m, d + n));
}

/** Cuántos días cubre un rango, ambos extremos incluidos. */
export function diasEntre(desde: string, hasta: string): number {
  const [a1, m1, d1] = partes(desde);
  const [a2, m2, d2] = partes(hasta);
  return Math.round((+new Date(a2, m2, d2) - +new Date(a1, m1, d1)) / 86_400_000) + 1;
}

export function rangoDias(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  let cursor = desde;
  while (cursor <= hasta && dias.length < 1000) {
    dias.push(cursor);
    cursor = sumarDias(cursor, 1);
  }
  return dias;
}

/** Formato de fecha admitido en los parámetros. Cualquier otra cosa se
 *  rechaza antes de llegar a Postgres, donde el error sería ininteligible. */
export const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/* ── Marcas de tiempo ────────────────────────────────────────────────────
 *
 * El contrato dice que `timestamp` es un ISO 8601 en UTC con milisegundos:
 * '2026-08-19T12:06:00.000Z'. Postgres devuelve un TIMESTAMPTZ como
 * '2026-08-19 12:06:00+00', que NO es la misma cadena.
 *
 * Da igual para leerla, pero no para ordenarla: `reservas.delDia` y
 * `reservas.buscar` ordenan comparando esas cadenas como texto, y mezclar los
 * dos formatos —los históricos importados de la hoja en uno, los nuevos en
 * otro— pondría las reservas del día en un orden que no es el de llegada.
 * Por eso toda marca pasa por aquí antes de salir.
 */
export function aTimestampISO(valor: unknown): string {
  if (!valor) return '';
  const d = valor instanceof Date ? valor : new Date(String(valor));
  return Number.isNaN(+d) ? String(valor) : d.toISOString();
}

/* ── El identificador de una reserva ─────────────────────────────────────
 *
 *   01-260823-001
 *   ▲   ▲      ▲
 *   │   │      └─ consecutivo de esa cafetería ESE día
 *   │   └──────── fecha AAMMDD
 *   └──────────── codigo de la cafetería
 *
 * Lo construye Postgres, en `construir_id_reserva`. Esto es la copia que
 * necesita el frontend para LEERLO, y la prueba `pruebas/identificador.mjs`
 * es la que vigila que las dos digan lo mismo.
 */

const FORMATO_ID = /^(\d{2})-(\d{6})-(\d{3,})$/;

/** Descompone el identificador, o null si es de los antiguos.
 *  Un identificador viejo NO puede romper nada: la interfaz lo detecta y
 *  muestra el número vacío en vez de fallar. */
export function partesIdReserva(id: unknown) {
  const m = FORMATO_ID.exec(String(id ?? ''));
  return m ? { cafeteria: m[1], fecha: m[2], consecutivo: m[3] } : null;
}

/* ── Medio de reserva y estado del pago ───────────────────────────────── */

export const VALORES_MEDIO = ['presencial', 'telefono'] as const;
export const VALORES_PAGO = ['pagado', 'debe'] as const;

export type Medio = (typeof VALORES_MEDIO)[number];
export type Pago = (typeof VALORES_PAGO)[number];

/** La etiqueta visible. Gemela de `etiqueta_opcion` en 03-funciones.sql: el
 *  historial lo escribe Postgres, pero la pantalla usa estas mismas. */
export const ETIQUETAS: Record<string, string> = {
  presencial: 'Presencial',
  telefono: 'Teléfono',
  pagado: 'Pagado',
  debe: 'Debe',
};

/** Quita vacíos y repetidos de la lista de platos fijos de una sede. */
export function limpiarPlatosFijos(lista: unknown): string[] {
  const nombres: string[] = [];
  const vistos = new Set<string>();
  for (const bruto of Array.isArray(lista) ? lista : []) {
    const nombre = String(bruto).trim();
    const id = aSlug(nombre);
    if (!nombre || !id || vistos.has(id)) continue;
    vistos.add(id);
    nombres.push(nombre);
  }
  return nombres;
}
