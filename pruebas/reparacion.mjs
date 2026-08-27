/** La reparación de las filas que quedaron descolocadas. */
import './fechaFija.mjs';
import { crearBackendSimulado } from './simulaAppsScript.mjs';

let fallos = 0;
const ok = (c, e) => { console.log(`${c ? '  OK  ' : ' FALLO'} · ${e}`); if (!c) fallos++; };

const b = crearBackendSimulado();
const hojaR = b.libro.getSheetByName('Reservas');

// Hoja migrada: medio y pago al final, como la real.
const orden = hojaR.datos[0].filter((c) => c !== 'medio' && c !== 'pago').concat(['medio', 'pago']);
hojaR.datos[0] = orden;
const col = (n) => orden.indexOf(n);

const HIST = '[{"tipo":"creacion","timestamp":"2026-08-24T19:59:21.182Z","cambios":[]}]';
// Una fila SANA y una ROTA con el desplazamiento exacto del incidente.
const sana = ['01-260824-100', 'Persona Sana', '3001112233', 'bienestar-pro', '2026-08-24',
  'plato-a', 'Plato A', 'activa', '2026-08-24T19:00:00.000Z', HIST, 'presencial', 'pagado'];
const rota = ['01-260824-002', 'Andrés Parra', '3216549789', 'bienestar-pro', '2026-08-24',
  'cerdo-con-verduras', 'CERDO CON VERDURAS', 'presencial', 'pagado', 'activa',
  '2026-08-24T19:59:21.182Z', HIST];
hojaR.appendRow(sana);
hojaR.appendRow(rota);

console.log('── Antes ──');
ok(hojaR.datos[2][col('estado')] === 'presencial', 'la fila rota tiene «presencial» donde va el estado');
ok(b.enviar('reservas.delDia', { cafeteria_id: 'bienestar-pro', fecha: '2026-08-24' }).data.length === 1,
   'y por eso no aparece en la tabla del día: solo se ve la sana');

console.log('\n── Después de reparar ──');
b.reparar();
const filaRota = hojaR.datos.find((f) => f[0] === '01-260824-002');
ok(filaRota[col('estado')] === 'activa', `estado → ${filaRota[col('estado')]}`);
ok(filaRota[col('medio')] === 'presencial' && filaRota[col('pago')] === 'pagado',
   `medio y pago → ${filaRota[col('medio')]} · ${filaRota[col('pago')]}`);
ok(String(filaRota[col('timestamp')]).startsWith('2026-08-24T19:59'), 'timestamp en su sitio');
ok(String(filaRota[col('historial')]).startsWith('[{'), 'historial en su sitio');

const delDia = b.enviar('reservas.delDia', { cafeteria_id: 'bienestar-pro', fecha: '2026-08-24' }).data;
ok(delDia.length === 2, `ahora la tabla del día lista las ${delDia.length}`);
ok(delDia.some((r) => r.id === '01-260824-002'), 'incluida la que estaba invisible');

const filaSana = hojaR.datos.find((f) => f[0] === '01-260824-100');
ok(filaSana.join('|') === sana.join('|'), 'la fila que estaba bien no se tocó');

console.log('\n── Ejecutarla otra vez ──');
const antes = hojaR.datos.map((f) => f.join('|')).join('\n');
b.reparar();
ok(hojaR.datos.map((f) => f.join('|')).join('\n') === antes,
   'es idempotente: la segunda pasada no cambia nada');

console.log(fallos === 0 ? '\n✔ Todo en verde\n' : `\n✘ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
