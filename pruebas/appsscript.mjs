/**
 * Ejercita apps-script/Codigo.gs sin desplegarlo.
 *
 * Simula en memoria las cuatro APIs de Google que usa el script
 * (SpreadsheetApp, ContentService, LockService, Utilities) y le manda
 * peticiones por `doPost`, igual que hará el navegador. Sirve para cazar los
 * errores antes de subirlo: depurar Apps Script desde su editor, sin puntos
 * de interrupción decentes y teniendo que crear una versión nueva en cada
 * intento, es lento y desagradable.
 *
 * Lo que NO puede comprobar: los permisos del despliegue, el CORS y el
 * comportamiento real de LockService. Eso solo se ve en Google.
 */

import { readFileSync } from 'node:fs';

let fallos = 0;
const ok = (c, e) => { console.log(`${c ? '  OK  ' : ' FALLO'} · ${e}`); if (!c) fallos++; };

/* ── Hoja de cálculo en memoria ──────────────────────────────────────── */

class HojaFalsa {
  constructor(nombre) {
    this.nombre = nombre;
    this.datos = [];
    this.formatos = {};
  }

  // Sheets devuelve [['']] en una hoja vacía, no [].
  getDataRange() {
    const datos = this.datos.length ? this.datos.map((f) => [...f]) : [['']];
    return { getValues: () => datos };
  }

  appendRow(fila) {
    this.datos.push([...fila]);
  }

  getRange(fila, columna, numFilas = 1, numColumnas = 1) {
    const hoja = this;
    return {
      getValues() {
        const salida = [];
        for (let f = 0; f < numFilas; f++) {
          const origen = hoja.datos[fila - 1 + f] || [];
          salida.push(origen.slice(columna - 1, columna - 1 + numColumnas));
        }
        return salida;
      },
      setValue(valor) {
        while (hoja.datos.length < fila) hoja.datos.push([]);
        hoja.datos[fila - 1][columna - 1] = valor;
        return this;
      },
      setValues(valores) {
        valores.forEach((v, i) => {
          const destino = fila - 1 + i;
          while (hoja.datos.length <= destino) hoja.datos.push([]);
          for (let c = 0; c < v.length; c++) hoja.datos[destino][columna - 1 + c] = v[c];
        });
        return this;
      },
      setNumberFormat(f) { hoja.formatos[`${fila}:${columna}`] = f; return this; },
      setFontWeight() { return this; },
    };
  }

  getLastRow() { return this.datos.length; }
  getLastColumn() { return this.datos.length ? this.datos[0].length : 0; }
  insertColumnAfter(columna) { this.datos.forEach((f) => f.splice(columna, 0, '')); }
  getMaxRows() { return Math.max(1000, this.datos.length + 1); }
  setFrozenRows() {}
}

class LibroFalso {
  constructor() { this.hojas = new Map(); }
  getSheetByName(n) { return this.hojas.get(n) || null; }
  insertSheet(n) { const h = new HojaFalsa(n); this.hojas.set(n, h); return h; }
  getSpreadsheetTimeZone() { return 'America/Bogota'; }
  toast() {}
}

/* ── Carga del script con las APIs simuladas ─────────────────────────── */

function cargarScript() {
  const libro = new LibroFalso();

  const SpreadsheetApp = { getActive: () => libro };
  const ContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (texto) => ({
      texto,
      setMimeType() { return this; },
      getContent() { return texto; },
    }),
  };
  const LockService = {
    getScriptLock: () => ({ waitLock() {}, releaseLock() {} }),
  };
  const Utilities = {
    formatDate(fecha, zona, formato) {
      const y = fecha.getFullYear();
      const m = String(fecha.getMonth() + 1).padStart(2, '0');
      const d = String(fecha.getDate()).padStart(2, '0');
      return formato === 'yyyy-MM-dd' ? `${y}-${m}-${d}` : `${y}-${m}-${d}`;
    },
  };
  const Logger = { log: (m) => console.log('         ' + m) };

  const codigo = readFileSync(process.env.RUTA_GS, 'utf8');

  const fabrica = new Function(
    'SpreadsheetApp', 'ContentService', 'LockService', 'Utilities', 'Logger',
    codigo + '\nreturn { doPost, doGet, configurarHojas, ACCIONES, libroDePrueba: null };',
  );
  return { api: fabrica(SpreadsheetApp, ContentService, LockService, Utilities, Logger), libro };
}

/* ── Utilidades de la prueba ─────────────────────────────────────────── */

const { api, libro } = cargarScript();

/** Llama como lo hará el navegador: por doPost, con el cuerpo JSON. */
function pedir(accion, params = {}) {
  const salida = api.doPost({ postData: { contents: JSON.stringify({ accion, params }) } });
  return JSON.parse(salida.getContent());
}

function datos(accion, params) {
  const r = pedir(accion, params);
  if (!r.ok) throw Object.assign(new Error(r.error.mensaje), { codigo: r.error.codigo });
  return r.data;
}

function esperaError(codigo, etiqueta, accion, params) {
  const r = pedir(accion, params);
  ok(!r.ok && r.error.codigo === codigo,
     `${etiqueta} → ${r.ok ? 'devolvió ok' : r.error.codigo}`);
}

const hoy = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const masDias = (base, n) => { const d = new Date(base); d.setDate(d.getDate() + n); return iso(d); };

// Un lunes fijo para que la prueba no dependa del día en que se ejecute.
const LUNES = '2026-08-17';
const MARTES = '2026-08-18';
const SABADO = '2026-08-22';

/* ── Puesta en marcha ────────────────────────────────────────────────── */

console.log('── configurarHojas ──');
api.configurarHojas();
ok(libro.getSheetByName('Cafeterias') !== null, 'crea la pestaña Cafeterias');
ok(libro.getSheetByName('MenuSemanal') !== null, 'crea la pestaña MenuSemanal');
ok(libro.getSheetByName('Reservas') !== null, 'crea la pestaña Reservas');
ok(libro.getSheetByName('Cafeterias').datos[0].join(',') === 'id,codigo,nombre,ubicacion,imagen,activa,platos_fijos',
   'con las cabeceras exactas del contrato');
ok(libro.getSheetByName('Cafeterias').datos.length === 5, 'y siembra las 4 cafeterías');

api.configurarHojas();
ok(libro.getSheetByName('Cafeterias').datos.length === 5,
   'ejecutarla dos veces no duplica nada');

console.log('\n── El sobre ──');
const sobre = pedir('cafeterias.listar');
ok(sobre.ok === true && Array.isArray(sobre.data), 'éxito → { ok: true, data }');
const malo = pedir('accion.inventada');
ok(malo.ok === false && malo.error.codigo === 'ACCION_DESCONOCIDA',
   'error → { ok: false, error: { codigo, mensaje } }');
ok(typeof malo.error.mensaje === 'string' && malo.error.mensaje.length > 0,
   'con un mensaje legible');

console.log('\n── Cafeterías ──');
const cafeterias = datos('cafeterias.listar');
ok(cafeterias.length === 4, `listar → ${cafeterias.length}`);
ok(cafeterias[0].id === 'bienestar-pro', `primera → ${cafeterias[0].nombre}`);
ok(cafeterias[0].activa === true, 'activa llega como booleano, no como texto');
ok(!('_fila' in cafeterias[0]), 'no se filtra el número de fila de la hoja');

ok(datos('cafeterias.obtener', { id: 'camilo-torres' }).nombre === 'Camilo Torres', 'obtener');
esperaError('CAFETERIA_NO_ENCONTRADA', 'obtener una que no existe',
            'cafeterias.obtener', { id: 'no-existe' });

const nueva = datos('cafeterias.crear', { nombre: 'Cafetería Salud', ubicacion: 'Bloque 5' });
ok(nueva.id === 'cafeteria-salud', `id derivado del nombre → ${nueva.id}`);
ok(datos('cafeterias.listar').length === 5, 'aparece en el listado');
esperaError('CAFETERIA_DUPLICADA', 'mismo nombre dos veces',
            'cafeterias.crear', { nombre: 'Cafetería Salud' });
esperaError('DATOS_INCOMPLETOS', 'sin nombre', 'cafeterias.crear', { nombre: '  ' });

const editada = datos('cafeterias.actualizar',
  { id: 'cafeteria-salud', nombre: 'Cafetería de Salud', ubicacion: 'Bloque 6' });
ok(editada.nombre === 'Cafetería de Salud' && editada.id === 'cafeteria-salud',
   'editar no cambia el id');

datos('cafeterias.archivar', { id: 'cafeteria-salud' });
ok(datos('cafeterias.listar').length === 4, 'archivada sale del listado operativo');
ok(datos('cafeterias.listar', { incluir_inactivas: true }).length === 5, 'pero el admin la ve');
datos('cafeterias.reactivar', { id: 'cafeteria-salud' });
ok(datos('cafeterias.listar').length === 5, 'reactivada vuelve');
datos('cafeterias.archivar', { id: 'cafeteria-salud' });

console.log('\n── Carta semanal ──');
const semanaVacia = datos('menu.semana', { lunes: LUNES });
ok(semanaVacia.dias.length === 7, 'la semana trae 7 días aunque no haya nada');
ok(semanaVacia.dias.every((d) => d.opciones.length === 0), 'todos vacíos al principio');

datos('menu.guardarSemana', {
  lunes: LUNES,
  dias: [
    { fecha: LUNES, platos: ['Bandeja paisa', 'Pasta al pesto'] },
    { fecha: MARTES, platos: ['Ajiaco santafereño', 'Curry de garbanzos'] },
  ],
});
const carta = datos('menu.delDia', { fecha: LUNES });
ok(carta.opciones.length === 2, `la carta del lunes tiene ${carta.opciones.length} platos`);
ok(carta.opciones[0].id === 'bandeja-paisa', `id derivado → ${carta.opciones[0].id}`);
ok(carta.opciones[1].nombre === 'Pasta al pesto', 'y conserva el nombre visible');

esperaError('MENU_DUPLICADO', 'dos platos con el mismo nombre', 'menu.guardarSemana',
  { lunes: LUNES, dias: [{ fecha: LUNES, platos: ['Ajiaco', 'ajiaco'] }] });
esperaError('SIN_SERVICIO', 'publicar carta un sábado', 'menu.guardarSemana',
  { lunes: LUNES, dias: [{ fecha: SABADO, platos: ['Lo que sea'] }] });
esperaError('RANGO_INVALIDO', 'un día fuera de la semana', 'menu.guardarSemana',
  { lunes: LUNES, dias: [{ fecha: masDias(new Date(LUNES), 40), platos: ['X'] }] });

// Atomicidad: un día inválido no puede dejar escrito el válido que lo precede.
const antesDeFallar = datos('menu.delDia', { fecha: MARTES }).opciones.length;
pedir('menu.guardarSemana', {
  lunes: LUNES,
  dias: [
    { fecha: MARTES, platos: ['Plato A', 'Plato B', 'Plato C'] },
    { fecha: LUNES, platos: ['Repetido', 'repetido'] },
  ],
});
ok(datos('menu.delDia', { fecha: MARTES }).opciones.length === antesDeFallar,
   'un día inválido aborta la semana entera: no escribe los válidos');

console.log('\n── Reservas ──');
const r1 = datos('reservas.crear', {
  nombre: '  Laura Camila Ardila  ', telefono: '3001247856',
  cafeteria_id: 'bienestar-pro', fecha: LUNES, menu_id: 'bandeja-paisa', medio: 'presencial', pago: 'pagado'
});
ok(r1.nombre === 'Laura Camila Ardila', 'recorta el nombre');
ok(r1.telefono === '3001247856', `el móvil vuelve como cadena → «${r1.telefono}»`);
ok(r1.menu_nombre === 'Bandeja paisa', 'guarda el nombre del plato, no solo el id');
ok(r1.estado === 'activa', 'nace activa');
ok(r1.historial.length === 1 && r1.historial[0].tipo === 'creacion',
   'con su asiento de creación');

const delDia = datos('reservas.delDia', { cafeteria_id: 'bienestar-pro', fecha: LUNES });
ok(delDia.length === 1, 'aparece en la tabla del día');
ok(Array.isArray(delDia[0].historial), 'el historial vuelve como estructura, no como texto');

esperaError('RESERVA_DUPLICADA', 'mismo móvil, misma sede, mismo día', 'reservas.crear',
  { nombre: 'Otra', telefono: '3001247856', cafeteria_id: 'bienestar-pro',
    fecha: LUNES, menu_id: 'bandeja-paisa' , medio: 'presencial', pago: 'pagado'});
esperaError('MENU_INVALIDO', 'plato fuera de la carta', 'reservas.crear',
  { nombre: 'Otra', telefono: '3009990000', cafeteria_id: 'bienestar-pro',
    fecha: LUNES, menu_id: 'plato-inventado' , medio: 'presencial', pago: 'pagado'});
esperaError('SIN_SERVICIO', 'reservar en sábado', 'reservas.crear',
  { nombre: 'Otra', telefono: '3009990001', cafeteria_id: 'bienestar-pro',
    fecha: SABADO, menu_id: 'bandeja-paisa' , medio: 'presencial', pago: 'pagado'});
esperaError('DATOS_INCOMPLETOS', 'sin móvil', 'reservas.crear',
  { nombre: 'Otra', telefono: '', cafeteria_id: 'bienestar-pro',
    fecha: LUNES, menu_id: 'bandeja-paisa' , medio: 'presencial', pago: 'pagado'});
esperaError('CAFETERIA_NO_ENCONTRADA', 'cafetería inexistente', 'reservas.crear',
  { nombre: 'Otra', telefono: '3009990002', cafeteria_id: 'no-existe',
    fecha: LUNES, menu_id: 'bandeja-paisa' , medio: 'presencial', pago: 'pagado'});

console.log('\n── Editar e historial ──');
const editadaR = datos('reservas.actualizar', {
  id: r1.id, nombre: 'Laura Camila Ardila Rueda',
  telefono: '3001247856', menu_id: 'pasta-al-pesto', medio: 'presencial', pago: 'pagado'
});
ok(editadaR.historial.length === 2, `historial → ${editadaR.historial.length} asientos`);
const ultimo = editadaR.historial[1];
ok(ultimo.tipo === 'modificacion', 'último asiento es modificación');
ok(ultimo.cambios.length === 2, `registró ${ultimo.cambios.length} cambios`);
const cambioMenu = ultimo.cambios.find((c) => c.campo === 'menu');
ok(cambioMenu.antes === 'Bandeja paisa' && cambioMenu.despues === 'Pasta al pesto',
   `menú: ${cambioMenu.antes} → ${cambioMenu.despues}`);
ok(editadaR.historial[0].tipo === 'creacion', 'la creación sigue siendo el primero');

esperaError('SIN_CAMBIOS', 'guardar sin tocar nada', 'reservas.actualizar',
  { id: r1.id, nombre: editadaR.nombre, telefono: editadaR.telefono, menu_id: editadaR.menu_id , medio: 'presencial', pago: 'pagado'});
esperaError('RESERVA_NO_ENCONTRADA', 'editar una inexistente', 'reservas.actualizar',
  { id: 'r-no-existe', nombre: 'X Y', telefono: '3001112233', menu_id: 'bandeja-paisa' , medio: 'presencial', pago: 'pagado'});

console.log('\n── Cancelar ──');
const cancelada = datos('reservas.cancelar', { id: r1.id });
ok(cancelada.estado === 'cancelada', `estado → ${cancelada.estado}`);
ok(cancelada.historial.length === 3 && cancelada.historial[2].tipo === 'cancelacion',
   'y su asiento de cancelación');
ok(datos('reservas.delDia', { cafeteria_id: 'bienestar-pro', fecha: LUNES }).length === 0,
   'desaparece de la tabla del día');

esperaError('RESERVA_CANCELADA', 'cancelar dos veces', 'reservas.cancelar', { id: r1.id });
esperaError('RESERVA_CANCELADA', 'editar una cancelada', 'reservas.actualizar',
  { id: r1.id, nombre: 'Otro', telefono: '3001247856', menu_id: 'bandeja-paisa' , medio: 'presencial', pago: 'pagado'});

const reusa = datos('reservas.crear', {
  nombre: 'Laura Camila Ardila', telefono: '3001247856',
  cafeteria_id: 'bienestar-pro', fecha: LUNES, menu_id: 'bandeja-paisa', medio: 'presencial', pago: 'pagado'
});
ok(reusa.id !== r1.id, 'el mismo móvil puede volver a reservar tras cancelar');

console.log('\n── Buscar y consolidar ──');
datos('reservas.crear', {
  nombre: 'Juan Sebastián Rueda', telefono: '3106654210',
  cafeteria_id: 'camilo-torres', fecha: MARTES, menu_id: 'ajiaco-santafereno', medio: 'presencial', pago: 'pagado'
});

const busqueda = datos('reservas.buscar', { desde: LUNES, hasta: SABADO, limite: 0 });
ok(busqueda.total === 3, `el rango encuentra ${busqueda.total} reservas`);
ok(busqueda.reservas.length === busqueda.total, 'limite:0 devuelve todas');

const r = busqueda.resumen;
ok(r.totales.activas + r.totales.canceladas === r.totales.total, 'activas + canceladas = total');
ok(r.por_dia.length === 6, `por_dia cubre los 6 días del rango (${r.por_dia.length})`);
ok(r.por_dia.reduce((s, d) => s + d.activas + d.canceladas, 0) === r.totales.total,
   'por_dia suma el total');
ok(r.por_cafeteria.reduce((s, c) => s + c.activas + c.canceladas, 0) === r.totales.total,
   'por_cafeteria suma el total');
ok(r.por_plato.reduce((s, p) => s + p.total, 0) === r.totales.activas,
   'por_plato solo cuenta las activas');
ok(r.por_cafeteria[0].nombre.length > 0, 'por_cafeteria resuelve el nombre de la sede');

const soloUna = datos('reservas.buscar', { desde: LUNES, hasta: SABADO, cafeteria_id: 'camilo-torres', limite: 0 });
ok(soloUna.reservas.every((x) => x.cafeteria_id === 'camilo-torres'), 'filtro por cafetería');
const soloCanceladas = datos('reservas.buscar', { desde: LUNES, hasta: SABADO, estado: 'cancelada', limite: 0 });
ok(soloCanceladas.reservas.every((x) => x.estado === 'cancelada'), 'filtro por estado');
ok(datos('reservas.buscar', { desde: LUNES, hasta: SABADO, texto: 'sebastian', limite: 0 }).total === 1,
   'búsqueda por nombre sin acentos: «sebastian» encuentra «Sebastián»');
ok(datos('reservas.buscar', { desde: LUNES, hasta: SABADO, texto: '3106654210', limite: 0 }).total === 1,
   'búsqueda por móvil');

const conLimite = datos('reservas.buscar', { desde: LUNES, hasta: SABADO, limite: 1 });
ok(conLimite.reservas.length === 1 && conLimite.total === 3,
   'el límite recorta el detalle pero no el total');
ok(conLimite.resumen.totales.total === 3, 'ni el resumen');

esperaError('RANGO_INVALIDO', 'rango invertido', 'reservas.buscar', { desde: SABADO, hasta: LUNES });
esperaError('RANGO_INVALIDO', 'sin fechas', 'reservas.buscar', {});

console.log('\n── Lo que se guardó en la hoja ──');
const hojaReservas = libro.getSheetByName('Reservas');
ok(hojaReservas.datos[0].join(',').startsWith('id,nombre,telefono'),
   'cabeceras en su sitio');
const filaCancelada = hojaReservas.datos.find((f) => f[0] === r1.id);
// Por nombre de columna y no por índice: añadir un campo mueve las
// posiciones y una prueba atada al número se rompe sin que nada esté mal.
const col = (nombre) => hojaReservas.datos[0].indexOf(nombre);
ok(filaCancelada[col('estado')] === 'cancelada',
   'la cancelada se marca, no se borra: la fila sigue ahí');
ok(typeof filaCancelada[col('historial')] === 'string' &&
   filaCancelada[col('historial')].startsWith('['),
   'el historial se guarda serializado como JSON');
ok(filaCancelada[col('medio')] === 'presencial' && filaCancelada[col('pago')] === 'pagado',
   'medio y pago quedan escritos en sus columnas');
ok(hojaReservas.datos.length === 4, `${hojaReservas.datos.length - 1} filas de reserva en la hoja`);

console.log(fallos === 0 ? '\n✔ Todo en verde\n' : `\n✘ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
