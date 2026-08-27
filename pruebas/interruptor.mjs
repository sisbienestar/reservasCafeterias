/** El interruptor de pruebas de fin de semana, en sus dos estados. */
import { readFileSync, writeFileSync, mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let fallos = 0;
const ok = (c, e) => { console.log(`${c ? '  OK  ' : ' FALLO'} · ${e}`); if (!c) fallos++; };

/** Copia el frontend con el interruptor en el estado pedido y lo carga. */
async function conInterruptor(encendido) {
  const dir = mkdtempSync(join(tmpdir(), 'interruptor-'));
  cpSync(join('..', 'js'), join(dir, 'js'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  const cfg = join(dir, 'js', 'config.js');
  writeFileSync(cfg, readFileSync(cfg, 'utf8')
    .replace(/export const PERMITIR_FIN_DE_SEMANA = (true|false);/,
             `export const PERMITIR_FIN_DE_SEMANA = ${encendido};`));
  return import(pathToFileURL(join(dir, 'js', 'utils', 'fechas.js')).href);
}

const DOMINGO = '2026-08-23';
const MIERCOLES = '2026-08-19';

console.log('── Apagado (uso real) ──');
const apagado = await conInterruptor(false);
ok(apagado.esDiaDeServicio(MIERCOLES) === true, 'miércoles: hay servicio');
ok(apagado.esDiaDeServicio(DOMINGO) === false, 'domingo: NO hay servicio');

console.log('\n── Encendido (pruebas) ──');
const encendido = await conInterruptor(true);
ok(encendido.esDiaDeServicio(MIERCOLES) === true, 'miércoles: hay servicio');
ok(encendido.esDiaDeServicio(DOMINGO) === true, 'domingo: se levanta la regla');

console.log('\n── Las dos constantes van sincronizadas ──');
// Los DOS archivos del proyecto, no la copia parcheada del banco.
 const front = readFileSync(process.env.RUTA_CONFIG, 'utf8')
  .match(/PERMITIR_FIN_DE_SEMANA = (true|false)/)[1];
const back = readFileSync(process.env.RUTA_GS, 'utf8')
  .match(/const PERMITIR_FIN_DE_SEMANA = (true|false)/)[1];
console.log(`         frontend: ${front} · backend: ${back}`);
ok(front === back, 'frontend y backend declaran el mismo estado');

console.log(fallos === 0 ? '\n✔ Todo en verde\n' : `\n✘ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
