/**
 * Exportación a CSV.
 *
 * Está pensado para que el archivo se abra bien en Excel, que es donde acaba
 * cualquier reporte de una oficina administrativa. Dos detalles que lo
 * deciden todo y que casi siempre se olvidan:
 *
 * - **BOM UTF-8 al principio.** Sin él, Excel abre el archivo en la
 *   codificación del sistema y «Cafetería» sale como «CafeterÃ­a».
 * - **La línea `sep=;`.** Excel usa como separador el de la configuración
 *   regional: con lista separada por punto y coma —lo normal en español— un
 *   CSV de comas cae entero en la primera columna. Esa primera línea le dice
 *   explícitamente cuál es, y deja de depender del equipo donde se abra.
 *
 * A cambio, un lector que no entienda `sep=` verá esa línea como una fila
 * más. Es el precio de que funcione en el Excel de quien va a usar esto.
 */

const SEPARADOR = ';';
const BOM = '﻿';

/**
 * Escapa un valor. Se entrecomilla si contiene el separador, comillas o un
 * salto de línea; las comillas internas se duplican, que es como manda el
 * formato.
 */
function escapar(valor) {
  const texto = valor == null ? '' : String(valor);
  return /["\n\r;,]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * Convierte filas en texto CSV.
 *
 * @param {string[]} cabeceras
 * @param {Array<Array<string|number>>} filas
 * @returns {string}
 */
export function aCSV(cabeceras, filas) {
  const lineas = [cabeceras, ...filas].map((fila) => fila.map(escapar).join(SEPARADOR));
  // CRLF: es lo que espera Excel y no molesta a nadie más.
  return `${BOM}sep=${SEPARADOR}\r\n${lineas.join('\r\n')}\r\n`;
}

/**
 * Dispara la descarga de un texto como archivo.
 *
 * Se revoca la URL del blob después de usarla: sin eso el navegador retiene
 * el archivo entero en memoria hasta que se cierra la pestaña, y un
 * administrador que exporte veinte veces seguidas los acumula todos.
 *
 * @param {string} nombreArchivo
 * @param {string} contenido
 */
export function descargarTexto(nombreArchivo, contenido) {
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}
