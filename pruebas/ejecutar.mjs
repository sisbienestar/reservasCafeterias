/**
 * Corre TODAS las pruebas del proyecto y suma el resultado.
 *
 *   bash pruebas/sincroniza.sh && node pruebas/ejecutar.mjs
 *
 * Es el único comando que hay que recordar. Cada suite se ejecuta en su
 * propio proceso a propósito: varias manipulan globales —`Date`, `document`,
 * `window`— y compartir proceso haría que una contaminara a la siguiente, con
 * fallos que aparecen y desaparecen según el orden.
 *
 * Con `node pruebas/ejecutar.mjs <nombre>` se corre solo la que se indique,
 * que es lo que se quiere mientras se arregla algo concreto.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const CODIGO_GS = join(AQUI, '..', 'apps-script', 'Codigo.gs');

/**
 * Las suites, con el entorno que necesita cada una.
 *
 * `fecha` fija qué día cree el sistema que es. Sin fijarlo, las suites se
 * comportan distinto de lunes a viernes que en fin de semana —no hay
 * servicio— y una prueba que pasa o falla según el día en que se ejecuta no
 * sirve de nada.
 */
const SUITES = [
  ['test', 'la capa de datos: mock → servicios'],
  ['imports', 'que ningún módulo importe un nombre que ya no se exporta'],
  ['cancelar', 'cancelación y borrado lógico'],
  ['admin', 'filtros, consolidados y exportación'],
  ['tarjetas', 'las tarjetas del inicio'],
  ['acceso', 'el pestillo de administración'],
  ['identificador', 'el formato NN-AAMMDD-CCC'],
  ['fijos', 'los platos permanentes de cada sede'],
  ['opciones', 'medio de reserva y estado del pago'],
  ['columnas', 'que se escriba en la columna correcta de la hoja'],
  ['reparacion', 'la reparación de filas descolocadas'],
  ['cache', 'la caché del backend y el candado solo al escribir'],
  ['lecturas', 'cuántas veces se lee la hoja por petición'],
  ['appsscript', 'Codigo.gs entero, sin desplegarlo'],
  ['integracion', 'el frontend REAL contra el backend REAL'],
  ['carga', 'los indicadores de «trabajando»'],
  ['resumen', 'el consolidado del día en el mostrador'],
  ['ticket', 'el ticket de confirmación y su enlace de WhatsApp'],
  ['viajes', 'cuántos viajes al servidor cuesta cada gesto'],
  ['dom', 'las páginas completas en jsdom'],
  ['finde', 'la regla de sábados y domingos', { FECHA_PRUEBA: '2026-08-23T10:30:00' }],
  ['interruptor', 'que el modo pruebas esté apagado en los dos lados'],
  ['urlpublica', 'la dirección pública que va dentro de los avisos'],
  ['contrato', 'el contrato ejecutable de la API'],
];

const pedida = process.argv[2];
const aCorrer = pedida ? SUITES.filter(([n]) => n === pedida) : SUITES;

if (pedida && aCorrer.length === 0) {
  console.error(`No existe la suite «${pedida}». Las que hay:\n  ` +
    SUITES.map(([n]) => n).join(', '));
  process.exit(1);
}

if (!existsSync(join(AQUI, 'banco', 'js', 'config.js'))) {
  console.error('Falta pruebas/banco/. Ejecuta antes:  bash pruebas/sincroniza.sh');
  process.exit(1);
}

let totalOk = 0;
let totalFallos = 0;
const rotas = [];

for (const [nombre, queComprueba, entorno] of aCorrer) {
  const archivo = join(AQUI, `${nombre}.mjs`);
  const r = spawnSync(process.execPath, [archivo], {
    encoding: 'utf8',
    timeout: 180000,
    // Desde pruebas/, para que las rutas relativas de las suites —`banco/…`,
    // los HTML que leen, las vistas previas que escriben— salgan igual tanto
    // si se lanza el corredor desde la raíz como desde aquí.
    cwd: AQUI,
    env: {
      ...process.env,
      RUTA_GS: CODIGO_GS,
      RUTA_CONFIG: join(AQUI, '..', 'legado', 'js', 'config.js'),
      // Suficiente para distinguir lo encadenado de lo paralelo sin que la
      // suite entera tarde una eternidad.
      RETARDO_MS: process.env.RETARDO_MS || '60',
      TOPE: process.env.TOPE || '3',
      ...(entorno || {}),
    },
  });

  const salida = (r.stdout || '') + (r.stderr || '');
  // Las suites imprimen «  OK   · …» y « FALLO · …». Se cuentan desde aquí en
  // vez de pedirle a cada una que informe: así una suite que reviente a mitad
  // no puede mentir sobre lo que llegó a comprobar.
  const ok = (salida.match(/^ {2}OK\s+·/gm) || []).length;
  const fallos = (salida.match(/^ FALLO ·/gm) || []).length;
  totalOk += ok;
  totalFallos += fallos;

  const reventada = r.status !== 0 && fallos === 0;
  if (fallos > 0 || reventada) rotas.push([nombre, salida, reventada]);

  const marca = fallos === 0 && !reventada ? '✔' : '✘';
  console.log(`${marca} ${nombre.padEnd(14)} ${String(ok).padStart(3)} ok` +
              (fallos ? `  ${fallos} fallos` : reventada ? '  REVENTÓ' : '') +
              `   · ${queComprueba}`);
}

if (rotas.length > 0) {
  console.log('\n── Detalle de lo que falló ──');
  for (const [nombre, salida, reventada] of rotas) {
    console.log(`\n### ${nombre}`);
    const lineas = salida.split('\n');
    // Si reventó no hay líneas de FALLO que enseñar: se enseña el final, que
    // es donde está el error de Node.
    const interesantes = reventada
      ? lineas.slice(-14)
      : lineas.filter((l) => l.startsWith(' FALLO ·')).slice(0, 8);
    interesantes.forEach((l) => console.log('   ' + l));
  }
}

console.log('\n' + '─'.repeat(52));
console.log(`  ${totalOk} comprobaciones · ${totalFallos} fallos` +
            (rotas.some(([, , rev]) => rev) ? ' · alguna suite reventó' : ''));
process.exit(totalFallos === 0 && rotas.length === 0 ? 0 : 1);
