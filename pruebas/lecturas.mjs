/**
 * Cuántas veces lee una hoja entera cada acción.
 *
 * Cada lectura cuesta entre 400 y 900 ms contra Google de verdad, así que
 * este número ES el tiempo de respuesta. Se mide en vez de razonarlo: la
 * lectura duplicada de 'cafeterias' en `reservas.crear` no se ve leyendo el
 * código, y era la mitad del coste de registrar una reserva.
 *
 * La columna que importa es «en caliente»: el mostrador no trabaja nunca en
 * frío, porque abrir la página ya consultó la carta y las cafeterías.
 */
import './fechaFija.mjs';
import { crearBackendSimulado } from './simulaAppsScript.mjs';

const HOY = '2026-08-24';
const b = crearBackendSimulado();
b.enviar('menu.guardarSemana', {
  lunes: '2026-08-24',
  dias: [{ fecha: HOY, platos: ['Bandeja paisa', 'Pollo asado'] }],
});

const casos = [
  ['cafeterias.listar', {}],
  ['menu.delDia', { fecha: HOY }],
  ['menu.delDia', { fecha: HOY, cafeteria_id: 'bienestar-pro' }],
  ['reservas.delDia', { cafeteria_id: 'bienestar-pro', fecha: HOY }],
  ['reservas.buscar', { desde: '2026-08-01', hasta: HOY, limite: 50 }],
  ['reservas.crear', { cafeteria_id: 'bienestar-pro', fecha: HOY, nombre: 'Quien Sea',
    telefono: '3001234567', menu_id: 'bandeja-paisa', medio: 'presencial', pago: 'pagado' }],
];

function medir(accion, params, enFrio) {
  if (enFrio) b.vaciarCache();
  b.ponerContadorACero();
  const r = b.enviar(accion, params);
  return { n: b.lecturas(), ok: r.ok, codigo: r.ok ? '' : r.error.codigo };
}

let frio = 0;
let caliente = 0;
console.log('  ' + 'acción'.padEnd(24) + 'en frío   en caliente');
console.log('  ' + '─'.repeat(47));

for (const [accion, params] of casos) {
  const a = medir(accion, params, true);
  const c = medir(accion, params, false);
  frio += a.n;
  caliente += c.n;
  const etiqueta = accion === 'menu.delDia' && params.cafeteria_id ? accion + ' (+sede)' : accion;
  console.log('  ' + etiqueta.padEnd(24) + String(a.n).padStart(5) + String(c.n).padStart(12) +
              (a.ok ? '' : '   ⚠ ' + a.codigo));
}

console.log('  ' + '─'.repeat(47));
console.log('  ' + 'TOTAL'.padEnd(24) + String(frio).padStart(5) + String(caliente).padStart(12));

const tope = Number(process.env.TOPE || 0);
if (tope) {
  const pasa = caliente <= tope;
  console.log(pasa
    ? `\n  OK  · ${caliente} lecturas en caliente, tope ${tope}`
    : `\n FALLO · ${caliente} lecturas en caliente, el tope es ${tope}`);
  process.exit(pasa ? 0 : 1);
}
