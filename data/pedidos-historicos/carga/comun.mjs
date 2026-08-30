import fs from 'node:fs';
import { leerCsv } from './leercsv.mjs';

export const RUTA = 'data/pedidos-historicos/';

/* Archivos que NO se leen: `_NEOFRUT_XLS_CONVERTED.xlsx` es la conversión a
 * .xlsx del mismo libro `_NEOFRUT_.xlsm`. Sus 24 bloques son idénticos, línea
 * a línea, a 24 de los 33 del .xlsm. Leer los dos duplicaría 24 pedidos. */
export const ARCHIVOS_IGNORADOS = new Set(['_NEOFRUT_XLS_CONVERTED.xlsx']);

/* El proveedor sale del nombre del archivo. Se confirma contra el contenido:
 * ver `informe.mjs`, que compara los productos de cada archivo con el catálogo. */
export const PROVEEDOR_DE_ARCHIVO = {
  'COCA_COLA_AGOSTO.xlsx':                  'cocacola',
  'ENE_-_MARZO_COCA_COLA.xlsx':             'cocacola',
  'COLOMBINA_FEBRERO.xlsx':                 'almacen-colombina',
  'FEBRERO__VICKY_.xlsx':                   'vicky',
  'FAMA_AGOSTO.xlsx':                       'fama',
  'FAMA_FEBRERO.xlsx':                      'fama',
  'NEOFRUT_AGOSTO.xlsx':                    'neofrut',
  '_NEOFRUT_.xlsm':                         'neofrut',
  'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx':'rapifritos',
  'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx':'rapifritos',
  'ENERO_RECETTA_.xlsx':                    'recetta',
};

/* Las 14 formas de escribir las cuatro sedes en «Unidad de Servicio que
 * solicita». Se normaliza sin tildes y en mayúsculas antes de buscar. */
export const norm = (s) => (s ?? '').toString()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/\s+/g, ' ').trim();

export function sedeDeTexto(txt) {
  const t = norm(txt);
  if (!t) return null;
  // No es una cafetería, pero pide como si lo fuera. Ver 12-historico-pedidos.sql.
  if (t.includes('SERVICIOS ESPECIALES')) return 'servicios-especiales';
  if (t.includes('ADMINISTRACION 3') || t.includes('ADMIN 3') || /\bA3\b/.test(t)) return 'administracion-3';
  if (t.includes('CAMILO')) return 'camilo-torres';
  if (t.includes('BIENESTAR PRO') || t.includes('AUTOSERVICIO')) return 'bienestar-pro';
  if (t.includes('BIENESTAR ESTUDIANTIL') || t.includes('BIENESTAR UNIVERSITARIO')) return 'bienestar-universitario';
  return null;
}

const MESES = { ENERO:1, FEBRERO:2, MARZO:3, ABRIL:4, MAYO:5, JUNIO:6, JULIO:7,
  AGOSTO:8, SEPTIEMBRE:9, OCTUBRE:10, NOVIEMBRE:11, DICIEMBRE:12,
  ENE:1, FEB:2, MAR:3, ABR:4, MAY:5, JUN:6, JUL:7, AGO:8, SEP:9, OCT:10, NOV:11, DIC:12 };

export const iso = (a, m, d) =>
  `${a}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

export function fechaValida(a, m, d) {
  if (!(a>=2020 && a<=2030) || !(m>=1&&m<=12) || !(d>=1&&d<=31)) return null;
  const f = new Date(Date.UTC(a, m-1, d));
  return f.getUTCMonth() === m-1 && f.getUTCDate() === d ? iso(a,m,d) : null;
}

/** La fecha del encabezado FBE.04: «… aaaa | Alimentos y bebidas | X | 12 | 8 | 2026 |». */
export function fechaDeEncabezado(raw) {
  const t = (raw ?? '').replace(/\s+/g, ' ');
  const i = t.toLowerCase().lastIndexOf('aaaa');
  if (i === -1) return null;
  const cola = t.slice(i + 4);
  const corte = cola.search(/Aseo y productos|Unidad de Servicio|Hace referencia/i);
  const trozo = corte === -1 ? cola : cola.slice(0, corte);
  const nums = [...trozo.matchAll(/\b(\d{1,4})\b/g)].map(m => Number(m[1]));
  const anio = nums.find(n => n >= 2020 && n <= 2030);
  if (!anio) return null;
  const resto = nums.filter(n => n !== anio && n <= 31);
  if (resto.length < 2) return null;              // día y mes: hacen falta los dos
  return fechaValida(anio, resto[1], resto[0]);
}

/** El respaldo: el nombre de la hoja —«AGOSTO 12», «SALIDAS RAPIFRITOS- MARZO 4»—. */
export function fechaDeNombreHoja(hoja, anio = 2026) {
  const t = norm(hoja).replace(/[^A-Z0-9 ]/g, ' ');
  const m = t.match(/\b(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE|ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)\s*0*(\d{1,2})\b/);
  if (!m) return null;
  return fechaValida(anio, MESES[m[1]], Number(m[2]));
}

/** «Febrero 2 de 2026», «Febrero 19de 2026», «Febrero 26 de 2026 (Miercoles)». */
export function fechaDeTextoLargo(txt) {
  const t = norm(txt);
  const m = t.match(/\b(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s*0*(\d{1,2})\s*DE\s*(\d{4})/);
  if (!m) return null;
  return fechaValida(Number(m[3]), MESES[m[1]], Number(m[2]));
}

export const leer = (n) => leerCsv(RUTA + n);
export const crudo = () => JSON.parse(fs.readFileSync(RUTA + 'respaldo_crudo_completo_todas_las_hojas.json','utf8'));
