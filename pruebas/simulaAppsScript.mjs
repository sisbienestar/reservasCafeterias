/** Ejecuta apps-script/Codigo.gs en memoria, con las APIs de Google simuladas. */

import { readFileSync } from 'node:fs';

class HojaFalsa {
  static lecturas = 0;
  constructor(nombre) { this.nombre = nombre; this.datos = []; }
  getDataRange() {
    HojaFalsa.lecturas++;
    const d = this.datos.length ? this.datos.map((f) => [...f]) : [['']];
    return { getValues: () => d };
  }
  appendRow(fila) { this.datos.push([...fila]); }
  getRange(fila, columna, numFilas = 1, numColumnas = 1) {
    const hoja = this;
    return {
      setValues(valores) {
        valores.forEach((v, i) => {
          const destino = fila - 1 + i;
          while (hoja.datos.length <= destino) hoja.datos.push([]);
          for (let c = 0; c < v.length; c++) hoja.datos[destino][columna - 1 + c] = v[c];
        });
        return this;
      },
      setNumberFormat() { return this; },
      setFontWeight() { return this; },
      setValue(valor) {
        while (hoja.datos.length < fila) hoja.datos.push([]);
        hoja.datos[fila - 1][columna - 1] = valor;
        return this;
      },
      getValues() {
        const salida = [];
        for (let f = 0; f < numFilas; f++) {
          const origen = hoja.datos[fila - 1 + f] || [];
          salida.push(origen.slice(columna - 1, columna - 1 + numColumnas));
        }
        return salida;
      },
    };
  }
  getLastRow() { return this.datos.length; }
  getLastColumn() { return this.datos.length ? this.datos[0].length : 0; }
  /** Inserta una columna: desplaza a la derecha todas las celdas siguientes. */
  insertColumnAfter(columna) {
    this.datos.forEach((fila) => fila.splice(columna, 0, ''));
  }
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

export function crearBackendSimulado() {
  const libro = new LibroFalso();

  const SpreadsheetApp = { getActive: () => libro };
  const ContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (texto) => ({ setMimeType() { return this; }, getContent: () => texto }),
  };
  const candado = { tomado: 0 };
  const LockService = {
    getScriptLock: () => ({ waitLock() { candado.tomado++; }, releaseLock() {} }),
  };
  const almacen = new Map();
  const CacheService = {
    getScriptCache: () => ({
      get: (k) => (almacen.has(k) ? almacen.get(k) : null),
      put: (k, v) => { almacen.set(k, String(v)); },
      remove: (k) => { almacen.delete(k); },
    }),
  };
  const Utilities = {
    formatDate(fecha) {
      const m = String(fecha.getMonth() + 1).padStart(2, '0');
      const d = String(fecha.getDate()).padStart(2, '0');
      return `${fecha.getFullYear()}-${m}-${d}`;
    },
  };
  const Logger = { log() {} };

  const codigo = readFileSync(process.env.RUTA_GS, 'utf8');
  const api = new Function(
    'SpreadsheetApp', 'ContentService', 'LockService', 'CacheService', 'Utilities', 'Logger',
    codigo + '\nreturn { doPost, configurarHojas, migrarAIdentificadorNuevo, repararFilasDescolocadas };',
  )(SpreadsheetApp, ContentService, LockService, CacheService, Utilities, Logger);

  api.configurarHojas();

  return {
    libro,
    /** Lecturas de hoja entera desde la última vez que se puso a cero. */
    lecturas: () => HojaFalsa.lecturas,
    ponerContadorACero() { HojaFalsa.lecturas = 0; },
    vaciarCache() { almacen.clear(); },
    /** Cuántas veces se tomó el candado. Las lecturas no deben tomarlo. */
    candados: () => candado.tomado,
    ponerCandadosACero() { candado.tomado = 0; },
    configurar: api.configurarHojas,
    migrar: api.migrarAIdentificadorNuevo,
    reparar: api.repararFilasDescolocadas,
    /** Mismo camino que el navegador: JSON por doPost y sobre de vuelta. */
    enviar(accion, params) {
      const salida = api.doPost({ postData: { contents: JSON.stringify({ accion, params }) } });
      return JSON.parse(salida.getContent());
    },
  };
}
