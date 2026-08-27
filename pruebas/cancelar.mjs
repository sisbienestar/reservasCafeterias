import './fechaFija.mjs';
import { getMenuDelDia } from './banco/js/services/menuService.js';
import { getReservasDelDia, crearReserva, actualizarReserva, cancelarReserva }
  from './banco/js/services/reservasService.js';

let fallos = 0;
const ok = (c, e) => { console.log(`${c ? '  OK  ' : ' FALLO'} · ${e}`); if (!c) fallos++; };
async function esperaError(codigo, etiqueta, fn) {
  try { await fn(); ok(false, `${etiqueta} (no lanzó ${codigo})`); }
  catch (e) { ok(e.codigo === codigo, `${etiqueta} → ${e.codigo}`); }
}

const menu = await getMenuDelDia('bienestar-pro');
const inicial = await getReservasDelDia('camilo-torres');
ok(inicial.every((r) => r.estado === 'activa'), 'las semillas nacen activas');

console.log('\n── Cancelar ──');
const r = await crearReserva({
  nombre: 'Pedro Nel Sarmiento', telefono: '3021119988',
  cafeteriaId: 'camilo-torres', menuId: menu[0].id, medio: 'presencial', pago: 'pagado'
});
ok((await getReservasDelDia('camilo-torres')).length === inicial.length + 1, 'aparece en la tabla');

const cancelada = await cancelarReserva(r.id);
ok(cancelada.estado === 'cancelada', `estado → ${cancelada.estado}`);
ok(cancelada.historial.length === 2, 'historial conserva creación + cancelación');
ok(cancelada.historial[1].tipo === 'cancelacion', 'último asiento es cancelacion');

const tras = await getReservasDelDia('camilo-torres');
ok(tras.length === inicial.length, 'desaparece de la tabla del día');
ok(!tras.some((x) => x.id === r.id), 'y no está entre las devueltas');

console.log('\n── Reglas alrededor del borrado lógico ──');
const reusa = await crearReserva({
  nombre: 'Pedro Nel Sarmiento', telefono: '3021119988',
  cafeteriaId: 'camilo-torres', menuId: menu[0].id, medio: 'presencial', pago: 'pagado'
});
ok(reusa.id !== r.id, 'el mismo móvil puede volver a reservar tras cancelar');

await esperaError('RESERVA_CANCELADA', 'cancelar dos veces', () => cancelarReserva(r.id));
await esperaError('RESERVA_CANCELADA', 'editar una cancelada', () =>
  actualizarReserva(r.id, { nombre: 'Otro Nombre', telefono: '3021119988', menuId: menu[0].id , medio: 'presencial', pago: 'pagado'}));
await esperaError('RESERVA_NO_ENCONTRADA', 'cancelar una inexistente', () =>
  cancelarReserva('r-no-existe'));
await esperaError('RESERVA_DUPLICADA', 'la activa sí sigue bloqueando duplicados', () =>
  crearReserva({ nombre: 'Tercero', telefono: '3021119988',
                 cafeteriaId: 'camilo-torres', menuId: menu[0].id , medio: 'presencial', pago: 'pagado'}));

console.log(fallos === 0 ? '\n✔ Todo en verde\n' : `\n✘ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
