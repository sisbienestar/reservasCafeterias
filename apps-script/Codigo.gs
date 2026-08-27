/**
 * reservasCafeterias · backend temporal sobre Google Sheets
 * ============================================================================
 *
 * Implementa el mismo contrato que `js/mock/mockApi.js`: un único endpoint que
 * recibe { accion, params } y responde SIEMPRE con el mismo sobre.
 *
 *   éxito → { ok: true,  data: <lo que sea> }
 *   error → { ok: false, error: { codigo, mensaje } }
 *
 * Que el contrato sea idéntico es lo que permite cambiar de mock a backend
 * tocando tres líneas en el frontend. Si algo aquí devuelve una forma distinta
 * a la del mock, la pantalla se rompe — y al revés: cualquier regla de negocio
 * que el mock aplique y este archivo no, deja de aplicarse.
 *
 * PUESTA EN MARCHA
 * ----------------
 *  1. Crea una hoja de cálculo nueva en Google Sheets.
 *  2. Extensiones → Apps Script. Pega este archivo entero.
 *  3. Ejecuta una vez la función `configurarHojas` (menú de funciones, arriba).
 *     Crea las tres pestañas con sus cabeceras y siembra las cafeterías.
 *  4. Implementar → Nueva implementación → Aplicación web.
 *       · Ejecutar como: Yo
 *       · Quién tiene acceso: CUALQUIER USUARIO      ← imprescindible
 *  5. Copia la URL /exec a `API_BASE_URL` en js/config.js y pon
 *     `FUENTE_DATOS = 'api'`.
 *
 * TRES COSAS QUE MUERDEN
 * ----------------------
 *  · Apps Script NO responde al preflight de CORS. Por eso el frontend manda
 *    `Content-Type: text/plain`: así la petición es «simple» y no lo dispara.
 *    El cuerpo llega igual en `e.postData.contents`.
 *  · Si el despliegue no es «cualquier usuario», el fetch recibe el HTML de la
 *    pantalla de login de Google en vez de JSON. El cliente lo detecta y
 *    devuelve RESPUESTA_INVALIDA; el síntoma es ese, la causa es esta.
 *  · Cada vez que edites este archivo hay que crear una NUEVA VERSIÓN de la
 *    implementación. Guardar no basta: la URL /exec sigue sirviendo la versión
 *    anterior y parecerá que tus cambios no hacen nada.
 */

/* ── Configuración ───────────────────────────────────────────────────── */

const HOJAS = {
  cafeterias: {
    nombre: 'Cafeterias',
    cabeceras: ['id', 'codigo', 'nombre', 'ubicacion', 'imagen', 'activa', 'platos_fijos'],
  },
  menu: {
    nombre: 'MenuSemanal',
    cabeceras: ['id', 'fecha', 'opciones'],
  },
  reservas: {
    nombre: 'Reservas',
    cabeceras: [
      'id', 'nombre', 'telefono', 'cafeteria_id', 'fecha',
      'menu_id', 'menu_nombre', 'medio', 'pago', 'estado', 'timestamp', 'historial',
    ],
  },
};

/** Columnas que guardan JSON serializado: una hoja no tiene arreglos. */
const COLUMNAS_JSON = ['opciones', 'historial', 'platos_fijos'];

/** Días sin servicio: 0 = lunes … 6 = domingo. Misma regla que el frontend. */
const DIAS_SIN_SERVICIO = [5, 6];

/* ── INTERRUPTOR TEMPORAL DE PRUEBAS ────────────────────────────────────
 *
 * En `true`, se levanta la regla de «sábados y domingos no hay servicio»
 * para poder probar el sistema en fin de semana.
 *
 * DEBE VOLVER A `false` ANTES DE USARLO DE VERDAD, y hay que crear una
 * VERSIÓN NUEVA de la implementación para que el cambio surta efecto — si
 * solo se guarda, la URL /exec sigue sirviendo la versión anterior.
 *
 * Tiene una constante gemela, `PERMITIR_FIN_DE_SEMANA`, en js/config.js.
 * Las dos tienen que estar en el mismo estado: el frontend avisa y el
 * backend decide.
 */
const PERMITIR_FIN_DE_SEMANA = false;

/* ── Candado y caché ─────────────────────────────────────────────────────
 *
 * Cada lectura de una pestaña cuesta entre 400 y 900 ms contra Google, y cada
 * petición paga además un peaje fijo de un segundo largo antes de tocar una
 * sola celda. Con ese reparto, el tiempo de respuesta ES el número de
 * lecturas: lo que hay aquí sirve para bajarlo.
 */

/**
 * Qué tabla modifica cada acción. Una acción que no esté en esta lista es de
 * solo lectura. Se usa para dos cosas:
 *
 *  · Tomar el candado SOLO al escribir. Antes se tomaba siempre, y con dos
 *    cafeterías atendiendo a la vez las consultas se ponían en cola unas
 *    detrás de otras sin ninguna razón: dos lecturas no pueden pisarse.
 *  · Saber qué tabla NO puede venir de la caché compartida. Los objetos que
 *    devuelve `leerTabla` llevan `_fila`, el número de fila real, y escribir
 *    con un `_fila` de hace dos minutos es escribir en la fila equivocada.
 *    Para consultar, un dato de hace un minuto vale; para escribir, nunca.
 *
 * Al añadir una acción que escriba hay que apuntarla aquí, o se quedará sin
 * candado y podrá pisar a otra.
 */
var ACCIONES_QUE_ESCRIBEN = {
  'cafeterias.crear': 'cafeterias',
  'cafeterias.actualizar': 'cafeterias',
  'cafeterias.archivar': 'cafeterias',
  'cafeterias.reactivar': 'cafeterias',
  'menu.guardarSemana': 'menu',
  'reservas.crear': 'reservas',
  'reservas.actualizar': 'reservas',
  'reservas.cancelar': 'reservas',
};

/**
 * Tablas que se conservan de una petición a otra. 'reservas' NO está y no
 * debe estar: cambia con cada registro del mostrador, y servirla vieja es
 * enseñar una tabla que no coincide con la realidad. Las otras dos cambian
 * como mucho una vez por semana.
 */
var TABLAS_EN_CACHE = { cafeterias: true, menu: true };

/**
 * Vida de la copia compartida. Corta a propósito: la hoja se edita a veces a
 * mano, y una edición manual no puede avisar a nadie de que invalide nada.
 * Dos minutos es, entonces, lo máximo que puede tardar en verse un cambio
 * hecho por fuera de la aplicación.
 */
var VIDA_CACHE_S = 120;

/** Copia válida para UNA petición. Evita releer la misma pestaña dos veces. */
var _tablas = {};

/** La tabla que la acción en curso va a escribir; '*' en mantenimiento. */
var _tablaEscrita = null;

/** Tope por defecto del detalle en `reservas.buscar`. */
const LIMITE_DETALLE = 500;

/** Tope del rango de consulta: un año natural cubre cualquier reporte. */
const MAX_DIAS_RANGO = 366;

/* ── Punto de entrada ────────────────────────────────────────────────── */

/**
 * doPost es el único endpoint. Se toma un bloqueo de script para TODA la
 * petición, no solo para las escrituras: dos reservas simultáneas del mismo
 * móvil podrían pasar las dos la comprobación de duplicado si cada una lee
 * antes de que la otra escriba. Con dos cafeterías atendiendo a la vez, eso
 * no es un caso teórico.
 */
function doPost(e) {
  let cuerpo;
  try {
    cuerpo = JSON.parse(e.postData.contents);
  } catch (error) {
    return responder(fallo('PETICION_INVALIDA', 'El cuerpo de la petición no es JSON válido.'));
  }

  const accion = cuerpo.accion;
  const manejador = ACCIONES[accion];
  if (!manejador) {
    return responder(fallo('ACCION_DESCONOCIDA', 'La API no reconoce la acción «' + accion + '».'));
  }

  // Apps Script reutiliza la instancia entre peticiones: si no se vacía aquí,
  // la segunda respondería con los datos que leyó la primera.
  _tablas = {};
  _tablaEscrita = ACCIONES_QUE_ESCRIBEN[accion] || null;

  const bloqueo = _tablaEscrita ? LockService.getScriptLock() : null;
  if (bloqueo) {
    try {
      bloqueo.waitLock(20000);
    } catch (error) {
      return responder(fallo('SERVIDOR_OCUPADO', 'El servidor está ocupado. Inténtalo otra vez.'));
    }
  }

  try {
    return responder(manejador(cuerpo.params || {}));
  } catch (error) {
    // Un fallo inesperado no puede salir como HTML de error de Apps Script:
    // el cliente espera el sobre y lo interpretaría como respuesta inválida.
    return responder(fallo('ERROR_INTERNO', String(error && error.message ? error.message : error)));
  } finally {
    _tablas = {};
    _tablaEscrita = null;
    if (bloqueo) bloqueo.releaseLock();
  }
}

/** GET solo para comprobar de un vistazo que el despliegue responde. */
function doGet() {
  return responder(exito({ servicio: 'reservasCafeterias', estado: 'en marcha' }));
}

function responder(sobre) {
  return ContentService
    .createTextOutput(JSON.stringify(sobre))
    .setMimeType(ContentService.MimeType.JSON);
}

const exito = (data) => ({ ok: true, data: data === undefined ? null : data });
const fallo = (codigo, mensaje) => ({ ok: false, error: { codigo: codigo, mensaje: mensaje } });

/* ── Acceso a las hojas ──────────────────────────────────────────────── */

function hoja(clave) {
  const h = SpreadsheetApp.getActive().getSheetByName(HOJAS[clave].nombre);
  if (!h) {
    throw new Error('Falta la pestaña «' + HOJAS[clave].nombre + '». Ejecuta configurarHojas().');
  }
  return h;
}

/**
 * Una pestaña entera como objetos, con dos niveles de caché delante.
 *
 * El primero dura una petición y no tiene ningún riesgo: sirve para no leer
 * dos veces la misma pestaña dentro de la misma acción, que es justo lo que
 * hacía `reservas.crear` con 'cafeterias'.
 *
 * El segundo dura `VIDA_CACHE_S` y se comparte entre peticiones, pero solo
 * para las tablas de `TABLAS_EN_CACHE` y nunca para la que se va a escribir.
 * Ese «nunca» es lo que hace que la optimización sea segura: un `_fila`
 * caducado escribiría en la fila de al lado.
 */
function leerTabla(clave) {
  if (_tablas[clave]) return _tablas[clave];

  const compartible = TABLAS_EN_CACHE[clave] === true &&
                      _tablaEscrita !== clave &&
                      _tablaEscrita !== '*';

  let filas = compartible ? deCacheCompartida(clave) : null;
  if (!filas) {
    filas = leerHojaEntera(clave);
    if (compartible) aCacheCompartida(clave, filas);
  }

  _tablas[clave] = filas;
  return filas;
}

/** La clave que ocupa cada tabla dentro de la caché de Apps Script. */
function claveCache(clave) {
  return 'tabla:' + clave;
}

/** Una caché que falla es una caché vacía: nunca un error para el usuario. */
function deCacheCompartida(clave) {
  try {
    const texto = CacheService.getScriptCache().get(claveCache(clave));
    return texto ? JSON.parse(texto) : null;
  } catch (error) {
    return null;
  }
}

function aCacheCompartida(clave, filas) {
  try {
    CacheService.getScriptCache().put(claveCache(clave), JSON.stringify(filas), VIDA_CACHE_S);
  } catch (error) {
    // CacheService admite 100 KB por clave. Si no cabe, se sigue sin caché.
  }
}

/** Tira la copia compartida de una tabla. Se llama tras cada escritura. */
function olvidarCache(clave) {
  _tablas[clave] = null;
  try {
    CacheService.getScriptCache().remove(claveCache(clave));
  } catch (error) {
    // Ídem: no poder olvidar solo significa esperar a que caduque.
  }
}

/**
 * Prepara una función de mantenimiento ejecutada desde el editor.
 *
 * Estas funciones escriben en varias pestañas y hasta añaden columnas, así
 * que ninguna copia previa sirve: con '*' se apaga la caché compartida
 * durante toda la ejecución.
 */
function empezarMantenimiento() {
  _tablas = {};
  _tablaEscrita = '*';
  Object.keys(TABLAS_EN_CACHE).forEach(olvidarCache);
}

/**
 * La lectura de verdad: baja a la hoja y no mira ninguna caché.
 *
 * Cada objeto lleva `_fila`, el número de fila real en la hoja, que es lo que
 * permite volver a escribir justo ahí sin buscar otra vez.
 */
function leerHojaEntera(clave) {
  const h = hoja(clave);
  const valores = h.getDataRange().getValues();
  if (valores.length < 2) return [];

  const cabeceras = valores[0].map(String);
  const filas = [];

  for (let i = 1; i < valores.length; i++) {
    const fila = valores[i];
    // Una fila sin id es una fila vacía del final de la hoja.
    if (!fila[0] && fila[0] !== 0) continue;

    const objeto = { _fila: i + 1 };
    for (let c = 0; c < cabeceras.length; c++) {
      objeto[cabeceras[c]] = normalizarCelda(cabeceras[c], fila[c]);
    }
    filas.push(objeto);
  }
  return filas;
}

/**
 * Convierte lo que devuelve la hoja a lo que espera el frontend.
 *
 * Tres conversiones que hacen falta sí o sí:
 *  · Las columnas JSON llegan como texto y tienen que salir como estructura.
 *  · `activa` puede llegar como booleano real o como el texto «TRUE».
 *  · Una fecha puede llegar como objeto Date si alguien formateó la columna
 *    como fecha; hay que devolverla a 'YYYY-MM-DD' en la zona de la hoja, no
 *    con toISOString(), que en Colombia (UTC−5) resta un día toda la tarde.
 */
function normalizarCelda(cabecera, valor) {
  if (COLUMNAS_JSON.indexOf(cabecera) !== -1) {
    if (!valor) return [];
    try {
      return JSON.parse(valor);
    } catch (error) {
      return [];
    }
  }

  // El móvil siempre como cadena: si la hoja lo guardó como número, comparar
  // 3001234567 con '3001234567' daría falso y el duplicado se colaría.
  if (cabecera === 'telefono') {
    return String(valor === null || valor === undefined ? '' : valor);
  }

  // El código, a dos dígitos: si la hoja lo leyó como número, '01' volvió
  // como 1 y el identificador saldría «1-260823-001».
  if (cabecera === 'codigo') {
    const texto = String(valor === null || valor === undefined ? '' : valor);
    return texto && texto.length < 2 ? '0' + texto : texto;
  }

  if (cabecera === 'activa') {
    return valor === true || String(valor).toUpperCase() === 'TRUE';
  }

  if (cabecera === 'fecha' && valor instanceof Date) {
    return Utilities.formatDate(valor, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }

  return valor === null || valor === undefined ? '' : valor;
}

/**
 * Las cabeceras REALES de la hoja, en el orden en que están.
 *
 * No se usa `HOJAS[clave].cabeceras` para escribir, y esto importa: esa
 * constante es el orden con el que se CREA una hoja nueva, pero una hoja que
 * ya existía y recibió columnas nuevas las tiene al final. Si se escribe con
 * el orden declarado sobre una hoja con otro orden, cada valor cae en la
 * columna equivocada — y como leer sí va por nombre, el destrozo no se nota
 * hasta que alguien mira una fila.
 *
 * Leer y escribir tienen que usar la misma fuente de verdad, y la fuente de
 * verdad es la hoja.
 */
function cabecerasDe(h) {
  return h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(String);
}

/** Prepara un objeto para escribirlo, en el orden de columnas de la hoja. */
function aFila(cabeceras, objeto) {
  return cabeceras.map(function (cabecera) {
    const valor = objeto[cabecera];
    if (COLUMNAS_JSON.indexOf(cabecera) !== -1) return JSON.stringify(valor || []);
    return valor === undefined || valor === null ? '' : valor;
  });
}

function agregar(clave, objeto) {
  const h = hoja(clave);
  h.appendRow(aFila(cabecerasDe(h), objeto));
  olvidarCache(clave);
  return objeto;
}

function guardar(clave, objeto) {
  const h = hoja(clave);
  const cabeceras = cabecerasDe(h);
  h.getRange(objeto._fila, 1, 1, cabeceras.length)
    .setValues([aFila(cabeceras, objeto)]);
  olvidarCache(clave);
  return objeto;
}

/** Quita `_fila` antes de devolver al cliente: es un detalle de la hoja. */
function limpiar(objeto) {
  const copia = {};
  for (const k in objeto) {
    if (k !== '_fila') copia[k] = objeto[k];
  }
  return copia;
}

const limpiarLista = (lista) => lista.map(limpiar);

/* ── Utilidades de dominio ───────────────────────────────────────────── */

/** Los acentos que NFD separa de su letra. Escapado a propósito: el rango
 *  escrito con los caracteres literales se corrompe al copiar y pegar. */
const ACENTOS = /[\u0300-\u036f]/g;

/** 'Bandeja Paisa' → 'bandeja-paisa'. Misma regla que utils/texto.js. */
function aSlug(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(ACENTOS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizarBusqueda(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(ACENTOS, '')
    .toLowerCase()
    .trim();
}

/** Índice de día con la semana empezando en lunes: 0 = lunes … 6 = domingo. */
function indiceDiaSemana(fechaISO) {
  const partes = String(fechaISO).split('-');
  const d = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
  const dia = d.getDay(); // 0 = domingo
  return dia === 0 ? 6 : dia - 1;
}

function esDiaDeServicio(fechaISO) {
  if (PERMITIR_FIN_DE_SEMANA) return true;
  return DIAS_SIN_SERVICIO.indexOf(indiceDiaSemana(fechaISO)) === -1;
}

function sumarDias(fechaISO, n) {
  const partes = String(fechaISO).split('-');
  const d = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]) + n);
  const mes = String(d.getMonth() + 1);
  const dia = String(d.getDate());
  return d.getFullYear() + '-' + (mes.length < 2 ? '0' + mes : mes) + '-' + (dia.length < 2 ? '0' + dia : dia);
}

/* ── Identificador de reserva: 01-260823-001 ─────────────────────────────
 *
 *   01      código de la cafetería (2 dígitos)
 *   260823  fecha AAMMDD
 *   001     consecutivo de esa cafetería ESE día
 *
 * Se puede leer, dictar por teléfono y buscar en la hoja. El consecutivo
 * nunca se reutiliza, ni siquiera si la reserva se cancela: reciclarlo haría
 * que dos reservas distintas compartieran identificador.
 */

function codigoDeFecha(fechaISO) {
  const p = String(fechaISO).split('-');
  return p[0].slice(2) + p[1] + p[2];
}

function construirIdReserva(codigoCafeteria, fechaISO, consecutivo) {
  let numero = String(consecutivo);
  while (numero.length < 3) numero = '0' + numero;
  return codigoCafeteria + '-' + codigoDeFecha(fechaISO) + '-' + numero;
}

var FORMATO_ID = /^(\d{2})-(\d{6})-(\d{3,})$/;

/** Descompone el identificador, o null si es del formato antiguo. */
function partesIdReserva(id) {
  const m = FORMATO_ID.exec(String(id || ''));
  return m ? { cafeteria: m[1], fecha: m[2], consecutivo: m[3] } : null;
}

/**
 * Siguiente consecutivo de esa cafetería ese día.
 *
 * Sobre el MÁXIMO existente y no sobre la cantidad: si falta un número —una
 * fila borrada a mano de la hoja— contar daría uno ya usado.
 */
function siguienteConsecutivo(reservas, cafeteriaId, fecha) {
  let mayor = 0;
  for (let i = 0; i < reservas.length; i++) {
    const r = reservas[i];
    if (r.cafeteria_id !== cafeteriaId || String(r.fecha) !== String(fecha)) continue;
    const partes = partesIdReserva(r.id);
    if (partes) mayor = Math.max(mayor, Number(partes.consecutivo));
  }
  return mayor + 1;
}

/** Cuántos días cubre un rango, ambos extremos incluidos. */
function diasEntre(desde, hasta) {
  const a = String(desde).split('-');
  const b = String(hasta).split('-');
  const d1 = new Date(Number(a[0]), Number(a[1]) - 1, Number(a[2]));
  const d2 = new Date(Number(b[0]), Number(b[1]) - 1, Number(b[2]));
  return Math.round((d2 - d1) / 86400000) + 1;
}

function rangoDias(desde, hasta) {
  const dias = [];
  let cursor = desde;
  while (cursor <= hasta && dias.length < 1000) {
    dias.push(cursor);
    cursor = sumarDias(cursor, 1);
  }
  return dias;
}

function ahoraISO() {
  return new Date().toISOString();
}

function nuevoId(prefijo) {
  return prefijo + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

/* ── Consultas auxiliares ────────────────────────────────────────────── */

function cartaDe(fecha) {
  const filas = leerTabla('menu');
  for (let i = 0; i < filas.length; i++) {
    if (String(filas[i].fecha) === String(fecha)) return filas[i];
  }
  return null;
}

/**
 * Lo que se puede pedir ese día en esa cafetería: la carta común más los
 * platos fijos de la sede.
 *
 * La carta del día SIGUE siendo la misma para todo el campus. Lo que varía
 * por sede son los productos permanentes —Mini Lunch, los especiales—, que no
 * dependen del día y por eso viven en la cafetería y no en la carta.
 *
 * Se ofrecen todos los días CON SERVICIO, haya carta publicada o no.
 */
function ofertaDelDia(cafeteriaId, fecha) {
  if (!esDiaDeServicio(fecha)) return [];

  const carta = cartaDe(fecha);
  const opciones = carta ? carta.opciones.slice() : [];

  const cafeterias = leerTabla('cafeterias');
  let fijos = [];
  for (let i = 0; i < cafeterias.length; i++) {
    if (cafeterias[i].id === cafeteriaId) fijos = cafeterias[i].platos_fijos || [];
  }

  for (let i = 0; i < fijos.length; i++) {
    const nombre = String(fijos[i]).trim();
    const id = aSlug(nombre);
    if (!id) continue;
    // Si coincide con uno de la carta del día, gana el del día: dos opciones
    // con el mismo id dejarían la reserva sin saber a cuál apunta.
    let repetido = false;
    for (let j = 0; j < opciones.length; j++) {
      if (opciones[j].id === id) repetido = true;
    }
    if (!repetido) opciones.push({ id: id, nombre: nombre, fijo: true });
  }
  return opciones;
}

/** Plato válido ese día en esa cafetería, o null. */
function buscarPlato(cafeteriaId, fecha, menuId) {
  const opciones = ofertaDelDia(cafeteriaId, fecha);
  for (let i = 0; i < opciones.length; i++) {
    if (opciones[i].id === menuId) return opciones[i];
  }
  return null;
}

/** Valores admitidos en los campos de opción, y su etiqueta visible. */
var VALORES_MEDIO = ['presencial', 'telefono'];
var VALORES_PAGO = ['pagado', 'debe'];
var ETIQUETAS = {
  presencial: 'Presencial',
  telefono: 'Teléfono',
  pagado: 'Pagado',
  debe: 'Debe',
};

/**
 * Comprueba los campos de opción; devuelve el sobre de error o null.
 *
 * Se valida en el servidor y no solo en el formulario porque son datos con
 * consecuencias: «pagado» o «debe» es dinero, y un valor inventado por una
 * petición hecha a mano dejaría la contabilidad con un estado que ninguna
 * pantalla sabe pintar.
 */
function errorDeOpciones(medio, pago) {
  const revisar = [['medio', medio, VALORES_MEDIO], ['pago', pago, VALORES_PAGO]];
  for (let i = 0; i < revisar.length; i++) {
    const campo = revisar[i][0];
    const valor = revisar[i][1];
    const admitidos = revisar[i][2];
    if (!valor) {
      return fallo('DATOS_INCOMPLETOS', 'Falta indicar «' + campo + '» en la reserva.');
    }
    if (admitidos.indexOf(valor) === -1) {
      return fallo('DATOS_INCOMPLETOS',
        '«' + valor + '» no es un valor válido para «' + campo + '»: se espera ' +
        admitidos.join(' o ') + '.');
    }
  }
  return null;
}

/** Quita vacíos y repetidos de la lista de platos fijos. */
function limpiarPlatosFijos(lista) {
  const nombres = [];
  const ids = {};
  const brutos = lista || [];
  for (let i = 0; i < brutos.length; i++) {
    const nombre = String(brutos[i]).trim();
    const id = aSlug(nombre);
    if (!nombre || !id || ids[id]) continue;
    ids[id] = true;
    nombres.push(nombre);
  }
  return nombres;
}

/** ¿Hay otra reserva ACTIVA de ese móvil, ese día y esa cafetería? */
function telefonoYaReservo(reservas, cafeteriaId, fecha, telefono, idExcluido) {
  for (let i = 0; i < reservas.length; i++) {
    const r = reservas[i];
    if (r.cafeteria_id === cafeteriaId &&
        String(r.fecha) === String(fecha) &&
        String(r.telefono) === String(telefono) &&
        r.estado === 'activa' &&
        r.id !== idExcluido) {
      return true;
    }
  }
  return false;
}

/* ── Consolidados ────────────────────────────────────────────────────── */

/**
 * Se calculan aquí, en el servidor, y no en el navegador: el administrador
 * puede pedir un trimestre entero, y mandar miles de filas al cliente para
 * que cuente sumas es justo lo que no hay que hacer.
 */
function resumir(reservas, desde, hasta, cafeterias) {
  const conteoDia = {};
  const dias = rangoDias(desde, hasta);
  for (let i = 0; i < dias.length; i++) {
    conteoDia[dias[i]] = { activas: 0, canceladas: 0 };
  }

  const conteoCafeteria = {};
  const conteoPlato = {};
  let activas = 0;

  for (let i = 0; i < reservas.length; i++) {
    const r = reservas[i];
    const esActiva = r.estado === 'activa';
    if (esActiva) activas++;

    const dia = conteoDia[r.fecha];
    if (dia) dia[esActiva ? 'activas' : 'canceladas']++;

    if (!conteoCafeteria[r.cafeteria_id]) {
      conteoCafeteria[r.cafeteria_id] = { activas: 0, canceladas: 0 };
    }
    conteoCafeteria[r.cafeteria_id][esActiva ? 'activas' : 'canceladas']++;

    // Solo las activas: un consolidado de consumo que sume las canceladas
    // manda a cocinar comida de más.
    if (esActiva) {
      conteoPlato[r.menu_nombre] = (conteoPlato[r.menu_nombre] || 0) + 1;
    }
  }

  const porDia = dias.map(function (f) {
    return { fecha: f, activas: conteoDia[f].activas, canceladas: conteoDia[f].canceladas };
  });

  let diasConServicio = 0;
  for (let i = 0; i < porDia.length; i++) {
    if (porDia[i].activas + porDia[i].canceladas > 0) diasConServicio++;
  }

  const nombrePorId = {};
  for (let i = 0; i < cafeterias.length; i++) nombrePorId[cafeterias[i].id] = cafeterias[i].nombre;

  const porCafeteria = Object.keys(conteoCafeteria).map(function (id) {
    return {
      cafeteria_id: id,
      nombre: nombrePorId[id] || id,
      activas: conteoCafeteria[id].activas,
      canceladas: conteoCafeteria[id].canceladas,
    };
  }).sort(function (a, b) { return b.activas - a.activas; });

  const porPlato = Object.keys(conteoPlato).map(function (nombre) {
    return { nombre: nombre, total: conteoPlato[nombre] };
  }).sort(function (a, b) {
    return b.total - a.total || String(a.nombre).localeCompare(String(b.nombre));
  });

  return {
    totales: {
      total: reservas.length,
      activas: activas,
      canceladas: reservas.length - activas,
      dias_con_servicio: diasConServicio,
      promedio_diario: diasConServicio > 0 ? Math.round((activas / diasConServicio) * 10) / 10 : 0,
    },
    por_dia: porDia,
    por_cafeteria: porCafeteria,
    por_plato: porPlato,
  };
}

/* ── Acciones ────────────────────────────────────────────────────────── */

const ACCIONES = {

  /* ── Cafeterías ────────────────────────────────────────────────────── */

  'cafeterias.listar': function (params) {
    const filas = leerTabla('cafeterias');
    const visibles = params.incluir_inactivas
      ? filas
      : filas.filter(function (c) { return c.activa !== false; });
    return exito(limpiarLista(visibles));
  },

  'cafeterias.obtener': function (params) {
    const filas = leerTabla('cafeterias');
    for (let i = 0; i < filas.length; i++) {
      if (filas[i].id === params.id) return exito(limpiar(filas[i]));
    }
    return fallo('CAFETERIA_NO_ENCONTRADA', 'No existe la cafetería «' + params.id + '».');
  },

  'cafeterias.crear': function (params) {
    const nombre = String(params.nombre || '').trim();
    if (!nombre) return fallo('DATOS_INCOMPLETOS', 'La cafetería necesita al menos un nombre.');

    const id = aSlug(nombre);
    if (!id) return fallo('DATOS_INCOMPLETOS', 'Ese nombre no produce un identificador válido.');

    const filas = leerTabla('cafeterias');
    for (let i = 0; i < filas.length; i++) {
      if (filas[i].id === id) {
        return fallo('CAFETERIA_DUPLICADA', 'Ya existe una cafetería con el id «' + id + '».');
      }
    }

    // El siguiente número libre, no la cantidad de filas: si alguna se
    // borrara a mano de la hoja, contar daría un código repetido.
    let mayorCodigo = 0;
    for (let i = 0; i < filas.length; i++) {
      mayorCodigo = Math.max(mayorCodigo, Number(filas[i].codigo) || 0);
    }
    let codigoNuevo = String(mayorCodigo + 1);
    if (codigoNuevo.length < 2) codigoNuevo = '0' + codigoNuevo;

    const cafeteria = {
      id: id,
      codigo: codigoNuevo,
      nombre: nombre,
      ubicacion: String(params.ubicacion || '').trim(),
      imagen: '',
      activa: true,
      platos_fijos: limpiarPlatosFijos(params.platos_fijos),
    };
    agregar('cafeterias', cafeteria);
    return exito(cafeteria);
  },

  /**
   * El `id` no se toca: es la clave con la que las reservas históricas
   * apuntan a esta cafetería, y renombrarlo las dejaría huérfanas.
   */
  'cafeterias.actualizar': function (params) {
    const nombre = String(params.nombre || '').trim();
    if (!nombre) return fallo('DATOS_INCOMPLETOS', 'La cafetería necesita al menos un nombre.');

    const filas = leerTabla('cafeterias');
    for (let i = 0; i < filas.length; i++) {
      if (filas[i].id === params.id) {
        filas[i].nombre = nombre;
        filas[i].ubicacion = String(params.ubicacion || '').trim();
        filas[i].platos_fijos = limpiarPlatosFijos(params.platos_fijos);
        guardar('cafeterias', filas[i]);
        return exito(limpiar(filas[i]));
      }
    }
    return fallo('CAFETERIA_NO_ENCONTRADA', 'No existe la cafetería «' + params.id + '».');
  },

  'cafeterias.archivar': function (params) {
    return cambiarActiva(params.id, false);
  },

  'cafeterias.reactivar': function (params) {
    return cambiarActiva(params.id, true);
  },

  /* ── Menú ──────────────────────────────────────────────────────────── */

  /**
   * La oferta de un día. Con `cafeteria_id` incluye sus platos fijos; sin él
   * devuelve solo la carta común, que es lo que edita el administrador.
   */
  'menu.delDia': function (params) {
    if (params.cafeteria_id) {
      return exito({
        fecha: params.fecha,
        opciones: ofertaDelDia(params.cafeteria_id, params.fecha),
      });
    }
    const carta = cartaDe(params.fecha);
    // Sin carta publicada no es un error: es un día sin menú.
    return exito(carta
      ? { fecha: carta.fecha, opciones: carta.opciones }
      : { fecha: params.fecha, opciones: [] });
  },

  'menu.semana': function (params) {
    if (!params.lunes) return fallo('DATOS_INCOMPLETOS', 'Hay que indicar el lunes de la semana.');

    const filas = leerTabla('menu');
    const porFecha = {};
    for (let i = 0; i < filas.length; i++) porFecha[filas[i].fecha] = filas[i].opciones;

    const dias = rangoDias(params.lunes, sumarDias(params.lunes, 6)).map(function (f) {
      return { fecha: f, opciones: porFecha[f] || [] };
    });
    return exito({ lunes: params.lunes, dias: dias });
  },

  /**
   * Guarda la carta de una semana entera. La escritura es atómica: se valida
   * TODO antes de tocar la hoja, para que un plato repetido el jueves no deje
   * ya escritos lunes a miércoles.
   */
  'menu.guardarSemana': function (params) {
    if (!params.lunes || !Array.isArray(params.dias)) {
      return fallo('DATOS_INCOMPLETOS', 'Falta la semana o los días de la carta.');
    }

    const validas = {};
    const semana = rangoDias(params.lunes, sumarDias(params.lunes, 6));
    for (let i = 0; i < semana.length; i++) validas[semana[i]] = true;

    const preparados = [];
    for (let i = 0; i < params.dias.length; i++) {
      const dia = params.dias[i];
      if (!validas[dia.fecha]) {
        return fallo('RANGO_INVALIDO', 'El día ' + dia.fecha + ' no pertenece a esa semana.');
      }

      const brutos = dia.platos || [];
      const conTexto = brutos.filter(function (p) { return String(p).trim(); });
      if (!esDiaDeServicio(dia.fecha) && conTexto.length > 0) {
        return fallo('SIN_SERVICIO', 'Los sábados y domingos no hay servicio: no llevan carta.');
      }

      const opciones = [];
      for (let j = 0; j < conTexto.length; j++) {
        const nombre = String(conTexto[j]).trim();
        const id = aSlug(nombre);
        if (!id) continue;
        let repetido = false;
        for (let k = 0; k < opciones.length; k++) {
          if (opciones[k].id === id) repetido = true;
        }
        if (repetido) {
          return fallo('MENU_DUPLICADO', '«' + nombre + '» está repetido en la carta de ese día.');
        }
        opciones.push({ id: id, nombre: nombre });
      }
      preparados.push({ fecha: dia.fecha, opciones: opciones });
    }

    const filas = leerTabla('menu');
    const porFecha = {};
    for (let i = 0; i < filas.length; i++) porFecha[filas[i].fecha] = filas[i];

    for (let i = 0; i < preparados.length; i++) {
      const p = preparados[i];
      const existente = porFecha[p.fecha];

      if (p.opciones.length === 0) {
        // Sin platos, el día se queda sin carta: se vacía la fila en vez de
        // borrarla, porque borrar filas desplaza los índices de las demás.
        if (existente) {
          existente.opciones = [];
          guardar('menu', existente);
        }
      } else if (existente) {
        existente.opciones = p.opciones;
        guardar('menu', existente);
      } else {
        agregar('menu', { id: p.fecha, fecha: p.fecha, opciones: p.opciones });
      }
    }

    return exito({ lunes: params.lunes, dias: preparados });
  },

  /* ── Reservas ──────────────────────────────────────────────────────── */

  'reservas.delDia': function (params) {
    const filas = leerTabla('reservas');
    const delDia = filas.filter(function (r) {
      return r.cafeteria_id === params.cafeteria_id &&
             String(r.fecha) === String(params.fecha) &&
             r.estado === 'activa';
    }).sort(function (a, b) {
      return String(a.timestamp).localeCompare(String(b.timestamp));
    });
    return exito(limpiarLista(delDia));
  },

  'reservas.crear': function (params) {
    const cafeterias = leerTabla('cafeterias');
    let cafeteria = null;
    for (let i = 0; i < cafeterias.length; i++) {
      if (cafeterias[i].id === params.cafeteria_id) cafeteria = cafeterias[i];
    }
    if (!cafeteria) {
      return fallo('CAFETERIA_NO_ENCONTRADA', 'No existe la cafetería «' + params.cafeteria_id + '».');
    }

    if (!params.nombre || !params.telefono || !params.menu_id) {
      return fallo('DATOS_INCOMPLETOS', 'Faltan datos obligatorios en la reserva.');
    }
    const malOpciones = errorDeOpciones(params.medio, params.pago);
    if (malOpciones) return malOpciones;
    if (!esDiaDeServicio(params.fecha)) {
      return fallo('SIN_SERVICIO', 'Los sábados y domingos no hay servicio de almuerzo.');
    }

    const plato = buscarPlato(params.cafeteria_id, params.fecha, params.menu_id);
    if (!plato) return fallo('MENU_INVALIDO', 'Ese plato no está en el menú de hoy.');

    const reservas = leerTabla('reservas');
    if (telefonoYaReservo(reservas, params.cafeteria_id, params.fecha, params.telefono, null)) {
      return fallo('RESERVA_DUPLICADA', 'Ese móvil ya tiene una reserva para hoy en esta cafetería.');
    }

    const ahora = ahoraISO();
    const reserva = {
      id: construirIdReserva(
        cafeteria.codigo,
        params.fecha,
        siguienteConsecutivo(reservas, params.cafeteria_id, params.fecha),
      ),
      nombre: String(params.nombre).trim(),
      telefono: String(params.telefono),
      cafeteria_id: params.cafeteria_id,
      fecha: params.fecha,
      menu_id: plato.id,
      menu_nombre: plato.nombre,
      medio: params.medio,
      pago: params.pago,
      estado: 'activa',
      timestamp: ahora,
      historial: [{ tipo: 'creacion', timestamp: ahora, cambios: [] }],
    };
    agregar('reservas', reserva);
    return exito(reserva);
  },

  'reservas.actualizar': function (params) {
    const reservas = leerTabla('reservas');
    let reserva = null;
    for (let i = 0; i < reservas.length; i++) {
      if (reservas[i].id === params.id) reserva = reservas[i];
    }
    if (!reserva) return fallo('RESERVA_NO_ENCONTRADA', 'Esa reserva ya no existe.');
    if (reserva.estado === 'cancelada') {
      return fallo('RESERVA_CANCELADA', 'Esa reserva está cancelada y ya no se puede editar.');
    }
    if (!params.nombre || !params.telefono || !params.menu_id) {
      return fallo('DATOS_INCOMPLETOS', 'Faltan datos obligatorios en la reserva.');
    }

    const malOpcionesEdicion = errorDeOpciones(params.medio, params.pago);
    if (malOpcionesEdicion) return malOpcionesEdicion;

    const plato = buscarPlato(reserva.cafeteria_id, reserva.fecha, params.menu_id);
    if (!plato) return fallo('MENU_INVALIDO', 'Ese plato no está en la carta de ese día.');

    if (telefonoYaReservo(reservas, reserva.cafeteria_id, reserva.fecha, params.telefono, reserva.id)) {
      return fallo('RESERVA_DUPLICADA', 'Ese móvil ya tiene otra reserva para hoy en esta cafetería.');
    }

    // El historial guarda el valor visible, no el id: 'Bandeja paisa' se
    // entiende dentro de un año; 'bandeja-paisa' obliga a cruzar tablas.
    const cambios = [];
    const nombreLimpio = String(params.nombre).trim();
    const telefonoActual = String(reserva.telefono);

    if (nombreLimpio !== reserva.nombre) {
      cambios.push({ campo: 'nombre', antes: reserva.nombre, despues: nombreLimpio });
    }
    if (String(params.telefono) !== telefonoActual) {
      cambios.push({ campo: 'telefono', antes: telefonoActual, despues: String(params.telefono) });
    }
    if (plato.id !== reserva.menu_id) {
      cambios.push({ campo: 'menu', antes: reserva.menu_nombre, despues: plato.nombre });
    }
    // El historial guarda la etiqueta que se ve en pantalla, no el valor
    // interno: «Presencial → Teléfono» se entiende, «presencial → telefono»
    // parece un error de escritura.
    if (params.medio !== reserva.medio) {
      cambios.push({ campo: 'medio',
        antes: ETIQUETAS[reserva.medio] || '—', despues: ETIQUETAS[params.medio] });
    }
    if (params.pago !== reserva.pago) {
      cambios.push({ campo: 'pago',
        antes: ETIQUETAS[reserva.pago] || '—', despues: ETIQUETAS[params.pago] });
    }

    // Guardar sin tocar nada dejaría un asiento vacío en el historial, que es
    // justo lo que un registro de cambios no debe tener.
    if (cambios.length === 0) {
      return fallo('SIN_CAMBIOS', 'No se modificó ningún dato de la reserva.');
    }

    reserva.nombre = nombreLimpio;
    reserva.telefono = String(params.telefono);
    reserva.menu_id = plato.id;
    reserva.menu_nombre = plato.nombre;
    reserva.medio = params.medio;
    reserva.pago = params.pago;
    reserva.historial = (reserva.historial || []).concat([{
      tipo: 'modificacion',
      timestamp: ahoraISO(),
      cambios: cambios,
    }]);
    guardar('reservas', reserva);
    return exito(limpiar(reserva));
  },

  /**
   * Cancelación: borrado LÓGICO. La fila no se quita, se marca. Borrarla
   * tiraría el historial justo del caso que más interesa auditar —«esta
   * persona reservó y luego se canceló»— y en una hoja compartida no habría
   * forma de recuperarlo.
   */
  'reservas.cancelar': function (params) {
    const reservas = leerTabla('reservas');
    for (let i = 0; i < reservas.length; i++) {
      const reserva = reservas[i];
      if (reserva.id !== params.id) continue;

      if (reserva.estado === 'cancelada') {
        return fallo('RESERVA_CANCELADA', 'Esa reserva ya estaba cancelada.');
      }
      reserva.estado = 'cancelada';
      reserva.historial = (reserva.historial || []).concat([{
        tipo: 'cancelacion',
        timestamp: ahoraISO(),
        cambios: [],
      }]);
      guardar('reservas', reserva);
      return exito(limpiar(reserva));
    }
    return fallo('RESERVA_NO_ENCONTRADA', 'Esa reserva ya no existe.');
  },

  /**
   * Búsqueda con filtros + consolidados, en una sola llamada.
   *
   * `limite` recorta el detalle pero NUNCA el resumen: los totales se calculan
   * sobre todo lo que casa con el filtro, o un rango largo mostraría «1.240
   * reservas» y una tabla de 500 que no suma eso.
   */
  'reservas.buscar': function (params) {
    if (!params.desde || !params.hasta) {
      return fallo('RANGO_INVALIDO', 'Hay que indicar la fecha de inicio y la de fin.');
    }
    if (params.desde > params.hasta) {
      return fallo('RANGO_INVALIDO', 'La fecha de inicio es posterior a la de fin.');
    }
    // Un rango sin tope se rompe en silencio: la serie diaria se corta y
    // `por_dia` deja de cuadrar con los totales, sin ninguna pista de por qué.
    if (diasEntre(params.desde, params.hasta) > MAX_DIAS_RANGO) {
      return fallo('RANGO_INVALIDO',
        'El rango no puede superar ' + MAX_DIAS_RANGO + ' días. Consulta por periodos más cortos.');
    }

    const buscado = params.texto ? normalizarBusqueda(params.texto) : '';
    const digitos = buscado.replace(/\D/g, '');

    const encontradas = leerTabla('reservas').filter(function (r) {
      const fecha = String(r.fecha);
      if (fecha < params.desde || fecha > params.hasta) return false;
      if (params.cafeteria_id && r.cafeteria_id !== params.cafeteria_id) return false;
      if (params.estado && r.estado !== params.estado) return false;
      if (buscado) {
        const enNombre = normalizarBusqueda(r.nombre).indexOf(buscado) !== -1;
        const enMovil = digitos && String(r.telefono).indexOf(digitos) !== -1;
        if (!enNombre && !enMovil) return false;
      }
      return true;
    }).sort(function (a, b) {
      return String(b.fecha).localeCompare(String(a.fecha)) ||
             String(b.timestamp).localeCompare(String(a.timestamp));
    });

    const limite = params.limite === undefined ? LIMITE_DETALLE : params.limite;
    const detalle = limite > 0 ? encontradas.slice(0, limite) : encontradas;

    return exito({
      total: encontradas.length,
      reservas: limpiarLista(detalle),
      resumen: resumir(encontradas, params.desde, params.hasta, leerTabla('cafeterias')),
    });
  },
};

function cambiarActiva(id, activa) {
  const filas = leerTabla('cafeterias');
  for (let i = 0; i < filas.length; i++) {
    if (filas[i].id === id) {
      filas[i].activa = activa;
      guardar('cafeterias', filas[i]);
      return exito(limpiar(filas[i]));
    }
  }
  return fallo('CAFETERIA_NO_ENCONTRADA', 'No existe la cafetería «' + id + '».');
}

/* ── Puesta en marcha ────────────────────────────────────────────────── */

/**
 * Crea las tres pestañas con sus cabeceras y siembra las cuatro cafeterías.
 * Ejecutar UNA VEZ desde el editor. Es idempotente: si una pestaña ya existe,
 * la respeta y no la pisa.
 */
function configurarHojas() {
  empezarMantenimiento();
  const libro = SpreadsheetApp.getActive();

  Object.keys(HOJAS).forEach(function (clave) {
    const definicion = HOJAS[clave];
    let h = libro.getSheetByName(definicion.nombre);
    if (!h) h = libro.insertSheet(definicion.nombre);

    if (h.getLastRow() === 0) {
      h.appendRow(definicion.cabeceras);
      h.setFrozenRows(1);
      h.getRange(1, 1, 1, definicion.cabeceras.length).setFontWeight('bold');
    }

    // Fechas y móviles como TEXTO, no como fecha ni número. Si la hoja los
    // interpreta, '2026-08-24' vuelve como objeto Date y el móvil pierde
    // cualquier cero inicial: dos clases enteras de error que así no existen.
    // 'codigo' incluido: si la hoja lo lee como número, '01' se convierte en 1
    // y el identificador saldría «1-260823-001».
    // Por las cabeceras REALES de la hoja y no por las declaradas: en una
    // hoja que ya existía, las columnas añadidas después están en otro sitio
    // y el formato acabaría puesto sobre la columna equivocada.
    const columnasTexto = ['fecha', 'telefono', 'timestamp', 'id', 'codigo'];
    cabecerasDe(h).forEach(function (cabecera, i) {
      if (columnasTexto.indexOf(cabecera) !== -1) {
        h.getRange(2, i + 1, h.getMaxRows() - 1, 1).setNumberFormat('@');
      }
    });
  });

  sembrarCafeterias();
  SpreadsheetApp.getActive().toast('Hojas listas. Ya puedes desplegar la aplicación web.');
}

function sembrarCafeterias() {
  const existentes = leerTabla('cafeterias');
  if (existentes.length > 0) return;

  const semillas = [
    ['bienestar-pro', '01', 'Bienestar Pro', 'Campus central', 'assets/img/bienestar-pro.jpg',
      ['Especial carne', 'Especial pollo', 'Especial cerdo']],
    ['camilo-torres', '02', 'Camilo Torres', 'Auditorio Camilo Torres', 'assets/img/camilo-torres.jpg',
      ['Mini Lunch']],
    ['bienestar-universitario', '03', 'Bienestar Universitario', 'Edificio de Bienestar Universitario', 'assets/img/bienestar-universitario.jpeg',
      ['Mini Lunch']],
    ['administracion-3', '04', 'Administración 3', 'Edificio de Administración 3', 'assets/img/administracion3.jpg',
      []],
  ];

  semillas.forEach(function (s) {
    agregar('cafeterias', {
      id: s[0], codigo: s[1], nombre: s[2], ubicacion: s[3], imagen: s[4],
      activa: true, platos_fijos: s[5],
    });
  });
}

/**
 * Comprobación rápida desde el editor, sin navegador de por medio.
 * Ejecutar y mirar el registro: si algo está mal montado, sale aquí.
 */
function probarDesdeElEditor() {
  empezarMantenimiento();
  const casos = [
    ['cafeterias.listar', {}],
    ['menu.delDia', { fecha: hoyDelServidor() }],
    ['reservas.delDia', { cafeteria_id: 'bienestar-pro', fecha: hoyDelServidor() }],
    ['reservas.buscar', { desde: sumarDias(hoyDelServidor(), -30), hasta: hoyDelServidor(), limite: 3 }],
  ];

  casos.forEach(function (caso) {
    const respuesta = ACCIONES[caso[0]](caso[1]);
    const resumen = respuesta.ok
      ? 'ok · ' + JSON.stringify(respuesta.data).slice(0, 120)
      : 'ERROR · ' + respuesta.error.codigo + ': ' + respuesta.error.mensaje;
    Logger.log(caso[0] + ' → ' + resumen);
  });
}

/**
 * Vuelca las tres pestañas a JSON, listas para cargar en otra base de datos.
 *
 * Ejecutar desde el editor y copiar el resultado del registro. Es la salida
 * de emergencia y también la puerta de la migración: el día que esto pase a
 * una base de datos de verdad, lo primero es sacar los datos de aquí sin
 * depender de exportar CSV a mano pestaña por pestaña —que además rompe las
 * columnas JSON, porque el historial lleva comas dentro.
 *
 * Las fechas y los móviles salen como cadenas, y `opciones` e `historial`
 * como estructuras ya deserializadas.
 */
function exportarTodo() {
  empezarMantenimiento();
  const volcado = {
    exportado: new Date().toISOString(),
    cafeterias: leerTabla('cafeterias').map(limpiar),
    menuSemanal: leerTabla('menu').map(limpiar),
    reservas: leerTabla('reservas').map(limpiar),
  };

  const texto = JSON.stringify(volcado, null, 2);
  Logger.log('Cafeterías: ' + volcado.cafeterias.length +
             ' · Cartas: ' + volcado.menuSemanal.length +
             ' · Reservas: ' + volcado.reservas.length);

  // El registro corta los mensajes largos, así que el volcado va troceado.
  const TROZO = 40000;
  for (let i = 0; i < texto.length; i += TROZO) {
    Logger.log('--- volcado ' + (Math.floor(i / TROZO) + 1) + ' ---\n' + texto.slice(i, i + TROZO));
  }
  return texto;
}

/**
 * Pone al día una hoja creada ANTES del identificador nuevo.
 *
 * Ejecutar UNA VEZ desde el editor, después de pegar esta versión. Hace dos
 * cosas y ninguna destruye nada:
 *
 *  1. Añade la columna `codigo` a 'Cafeterias' si falta, y reparte 01, 02…
 *     por el orden en que están en la hoja.
 *  2. Reescribe los identificadores de reserva del formato antiguo al nuevo,
 *     numerando por cafetería y día en orden de llegada.
 *
 * El punto 2 cambia claves primarias, y por eso conviene hacerlo antes de que
 * haya reservas de las que dependa alguien. Es seguro porque nada fuera de la
 * hoja guarda esos identificadores: la interfaz siempre los relee.
 *
 * Es idempotente: las reservas que ya tengan el formato nuevo no se tocan.
 */
function migrarAIdentificadorNuevo() {
  empezarMantenimiento();
  const hojaCafeterias = hoja('cafeterias');
  const cabeceras = hojaCafeterias.getRange(1, 1, 1, hojaCafeterias.getLastColumn())
    .getValues()[0].map(String);

  // 1. La columna 'codigo', si no está.
  if (cabeceras.indexOf('codigo') === -1) {
    hojaCafeterias.insertColumnAfter(1);
    hojaCafeterias.getRange(1, 2).setValue('codigo').setFontWeight('bold');
    hojaCafeterias.getRange(2, 2, Math.max(hojaCafeterias.getMaxRows() - 1, 1), 1)
      .setNumberFormat('@');
    Logger.log('Añadida la columna «codigo» a Cafeterias.');
  }

  // 1b. La columna 'platos_fijos', si falta. Va al final, así que basta con
  // escribir la cabecera en la primera columna libre.
  const cabecerasAhora = hojaCafeterias.getRange(1, 1, 1, hojaCafeterias.getLastColumn())
    .getValues()[0].map(String);
  if (cabecerasAhora.indexOf('platos_fijos') === -1) {
    hojaCafeterias.getRange(1, cabecerasAhora.length + 1)
      .setValue('platos_fijos').setFontWeight('bold');
    Logger.log('Añadida la columna «platos_fijos» a Cafeterias.');
  }

  const cafeterias = leerTabla('cafeterias');
  const codigoPorId = {};
  let siguiente = 1;
  for (let i = 0; i < cafeterias.length; i++) {
    if (!cafeterias[i].codigo) {
      let codigo = String(siguiente);
      if (codigo.length < 2) codigo = '0' + codigo;
      cafeterias[i].codigo = codigo;
      guardar('cafeterias', cafeterias[i]);
    }
    siguiente = Math.max(siguiente, Number(cafeterias[i].codigo) || 0) + 1;
    codigoPorId[cafeterias[i].id] = cafeterias[i].codigo;
  }

  // 1c. Las columnas 'medio' y 'pago' en Reservas, si faltan.
  const hojaReservas = hoja('reservas');
  ['medio', 'pago'].forEach(function (columna) {
    const cabeceras = hojaReservas.getRange(1, 1, 1, hojaReservas.getLastColumn())
      .getValues()[0].map(String);
    if (cabeceras.indexOf(columna) === -1) {
      hojaReservas.getRange(1, cabeceras.length + 1).setValue(columna).setFontWeight('bold');
      Logger.log('Añadida la columna «' + columna + '» a Reservas.');
    }
  });

  // 2. Los identificadores de reserva.
  const reservas = leerTabla('reservas');
  // Por orden de llegada dentro de cada cafetería y día, para que el
  // consecutivo signifique lo mismo que en las reservas nuevas.
  reservas.sort(function (a, b) {
    return String(a.timestamp).localeCompare(String(b.timestamp));
  });

  const contador = {};
  let migradas = 0;

  for (let i = 0; i < reservas.length; i++) {
    const r = reservas[i];
    const clave = r.cafeteria_id + '|' + r.fecha;
    const partes = partesIdReserva(r.id);

    if (partes) {
      // Ya está en el formato nuevo: solo se anota para no repetir su número.
      contador[clave] = Math.max(contador[clave] || 0, Number(partes.consecutivo));
      continue;
    }

    const codigo = codigoPorId[r.cafeteria_id];
    if (!codigo) {
      Logger.log('SIN CÓDIGO · la reserva ' + r.id + ' apunta a «' + r.cafeteria_id + '», que no existe. Se deja como está.');
      continue;
    }

    contador[clave] = (contador[clave] || 0) + 1;
    r.id = construirIdReserva(codigo, r.fecha, contador[clave]);
    guardar('reservas', r);
    migradas++;
  }

  Logger.log('Identificadores migrados: ' + migradas + ' de ' + reservas.length + ' reservas.');
  SpreadsheetApp.getActive().toast('Migración terminada. Revisa el registro.');
}

/**
 * Repara las filas que quedaron con los valores corridos de columna.
 *
 * Contexto: durante un tiempo el script escribía usando el orden de columnas
 * DECLARADO en `HOJAS`, mientras que la hoja —tras añadirle `medio` y
 * `pago` al final— tenía otro. Cada valor cayó una o dos casillas a la
 * derecha. Leer va por nombre, así que el desajuste no se veía en pantalla:
 * la reserva simplemente desaparecía de la tabla del día, porque su `estado`
 * no decía «activa».
 *
 * Ejecutar UNA VEZ, después de desplegar la versión corregida. Es segura:
 * solo toca las filas cuya firma es inequívoca —`estado` contiene un valor
 * de `medio`, y `historial` contiene un estado— así que una fila sana no se
 * reconoce y no se toca. Ejecutarla dos veces no hace nada la segunda.
 */
function repararFilasDescolocadas() {
  empezarMantenimiento();
  const h = hoja('reservas');
  const cabeceras = cabecerasDe(h);
  const col = {};
  cabeceras.forEach(function (c, i) { col[c] = i; });

  const necesarias = ['estado', 'timestamp', 'historial', 'medio', 'pago'];
  for (let i = 0; i < necesarias.length; i++) {
    if (col[necesarias[i]] === undefined) {
      Logger.log('Falta la columna «' + necesarias[i] + '». Ejecuta antes migrarAIdentificadorNuevo().');
      return;
    }
  }

  const valores = h.getDataRange().getValues();
  const MEDIOS = ['presencial', 'telefono'];
  const ESTADOS = ['activa', 'cancelada'];
  let reparadas = 0;

  for (let f = 1; f < valores.length; f++) {
    const fila = valores[f];
    if (!fila[0]) continue;

    // La firma del destrozo: donde debería ir el estado hay un medio, y donde
    // debería ir el historial hay un estado.
    const pareceRoto =
      MEDIOS.indexOf(String(fila[col.estado])) !== -1 &&
      ESTADOS.indexOf(String(fila[col.historial])) !== -1;
    if (!pareceRoto) continue;

    const medio = fila[col.estado];
    const pago = fila[col.timestamp];
    const estado = fila[col.historial];
    const timestamp = fila[col.medio];
    const historial = fila[col.pago];

    fila[col.estado] = estado;
    fila[col.timestamp] = timestamp;
    fila[col.historial] = historial;
    fila[col.medio] = medio;
    fila[col.pago] = pago;

    h.getRange(f + 1, 1, 1, cabeceras.length).setValues([fila]);
    reparadas++;
    Logger.log('Reparada la reserva ' + fila[0]);
  }

  Logger.log(reparadas === 0
    ? 'No había filas descolocadas.'
    : 'Filas reparadas: ' + reparadas);
  SpreadsheetApp.getActive().toast('Reparación terminada. Revisa el registro.');
}

function hoyDelServidor() {
  return Utilities.formatDate(
    new Date(),
    SpreadsheetApp.getActive().getSpreadsheetTimeZone(),
    'yyyy-MM-dd'
  );
}
