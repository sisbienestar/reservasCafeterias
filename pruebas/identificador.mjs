/** El identificador de reserva: formato, consecutivo y migración. */
import './fechaFija.mjs';
import { crearBackendSimulado } from './simulaAppsScript.mjs';
import { construirIdReserva, partesIdReserva, numeroDeReserva } from './banco/js/utils/idReserva.js';

let fallos = 0;
const ok = (c, e) => { console.log(`${c ? '  OK  ' : ' FALLO'} · ${e}`); if (!c) fallos++; };

console.log('── Formato ──');
ok(construirIdReserva('01', '2026-08-23', 1) === '01-260823-001',
   `01 + 2026-08-23 + 1 → ${construirIdReserva('01', '2026-08-23', 1)}`);
ok(construirIdReserva('04', '2026-01-05', 137) === '04-260105-137', 'rellena a 3 dígitos');
ok(construirIdReserva('01', '2026-08-23', 1000) === '01-260823-1000',
   'no recorta si pasa de 999: prefiere crecer a repetir');
ok(numeroDeReserva('01-260823-007') === '007', 'la tabla enseña 007');
ok(partesIdReserva('01-260823-007').fecha === '260823', 'la fecha se recupera del id');
ok(partesIdReserva('r-1755950000-a1b2c') === null,
   'un id del formato antiguo devuelve null en vez de romper');
ok(numeroDeReserva('r-viejo') === '', 'y su número sale vacío, no «undefined»');

console.log('\n── Consecutivo en el backend ──');
const b = crearBackendSimulado();
const pedir = (a, p) => { const r = b.enviar(a, p); if (!r.ok) throw new Error(r.error.codigo + ': ' + r.error.mensaje); return r.data; };

const LUNES = '2026-08-17';
pedir('menu.guardarSemana', { lunes: LUNES, dias: [{ fecha: LUNES, platos: ['Plato A', 'Plato B'] }] });

const crear = (tel, sede) => pedir('reservas.crear', {
  nombre: 'Persona ' + tel.slice(-3), telefono: tel,
  cafeteria_id: sede, fecha: LUNES, menu_id: 'plato-a', medio: 'presencial', pago: 'pagado'
});

const a1 = crear('3001110001', 'bienestar-pro');
const a2 = crear('3001110002', 'bienestar-pro');
const a3 = crear('3001110003', 'bienestar-pro');
ok(a1.id === '01-260817-001', `primera de Bienestar Pro → ${a1.id}`);
ok(a2.id === '01-260817-002' && a3.id === '01-260817-003', 'y siguen en orden');

const b1 = crear('3002220001', 'camilo-torres');
ok(b1.id === '02-260817-001',
   `cada sede lleva su propia numeración → ${b1.id}`);

pedir('reservas.cancelar', { id: a3.id });
const a4 = crear('3001110004', 'bienestar-pro');
ok(a4.id === '01-260817-004',
   `cancelar NO libera el número: la siguiente es la 004, no la 003 (${a4.id})`);

console.log('\n── Migración de una hoja antigua ──');
const viejo = crearBackendSimulado();
const hojaR = viejo.libro.getSheetByName('Reservas');
const hojaC = viejo.libro.getSheetByName('Cafeterias');

// Se simula la hoja tal como está hoy: sin columna 'codigo' y con ids viejos.
hojaC.datos[0] = ['id', 'nombre', 'ubicacion', 'imagen', 'activa'];
hojaC.datos = [hojaC.datos[0], ...hojaC.datos.slice(1).map((f) => [f[0], f[2], f[3], f[4], f[5]])];
const marca = (h, m) => `2026-08-17T${String(h).padStart(2, '0')}:${m}:00.000Z`;
[['r-viejo-1', 'bienestar-pro', marca(8, '00')],
 ['r-viejo-2', 'bienestar-pro', marca(9, '00')],
 ['r-viejo-3', 'camilo-torres', marca(8, '30')]].forEach(([id, sede, ts]) => {
  hojaR.appendRow([id, 'Nombre', '3001234567', sede, LUNES, 'plato-a', 'Plato A', 'activa', ts, '[]']);
});

viejo.migrar();
const migradas = hojaR.datos.slice(1).map((f) => f[0]);
ok(hojaC.datos[0][1] === 'codigo', 'añade la columna «codigo» a Cafeterias');
ok(hojaC.datos[1][1] === '01' && hojaC.datos[2][1] === '02', 'y reparte 01, 02, 03…');
ok(migradas[0] === '01-260817-001', `primera migrada → ${migradas[0]}`);
ok(migradas[1] === '01-260817-002', 'la segunda de esa sede sigue el orden de llegada');
ok(migradas[2] === '02-260817-001', `y Camilo Torres empieza por su 001 → ${migradas[2]}`);

viejo.migrar();
ok(hojaR.datos.slice(1).map((f) => f[0]).join() === migradas.join(),
   'ejecutarla dos veces no cambia nada: es idempotente');

console.log(fallos === 0 ? '\n✔ Todo en verde\n' : `\n✘ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
