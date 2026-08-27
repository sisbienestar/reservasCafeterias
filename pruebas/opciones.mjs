/** Medio de reserva y estado de pago: obligatorios y validados en servidor. */
import './fechaFija.mjs';
import { crearBackendSimulado } from './simulaAppsScript.mjs';
import { enviar as mock } from './banco/js/mock/mockApi.js';

let fallos = 0;
const ok = (c, e) => { console.log(`${c ? '  OK  ' : ' FALLO'} · ${e}`); if (!c) fallos++; };

const LUNES = '2026-08-17';
const base = { nombre: 'Persona Prueba', cafeteria_id: 'bienestar-pro', fecha: LUNES, menu_id: 'plato-a' };

for (const etiqueta of ['mock', 'Apps Script']) {
  let llamar;
  if (etiqueta === 'mock') {
    llamar = (a, p) => mock(a, p);
    await mock('menu.guardarSemana', { lunes: LUNES, dias: [{ fecha: LUNES, platos: ['Plato A', 'Plato B'] }] });
  } else {
    const b = crearBackendSimulado();
    b.enviar('menu.guardarSemana', { lunes: LUNES, dias: [{ fecha: LUNES, platos: ['Plato A', 'Plato B'] }] });
    llamar = (a, p) => b.enviar(a, p);
  }
  const pedir = async (a, p) => { const r = await llamar(a, p); if (!r.ok) throw Object.assign(new Error(r.error.mensaje), { codigo: r.error.codigo }); return r.data; };
  const esperaError = async (codigo, texto, p) => {
    try { await pedir('reservas.crear', p); ok(false, `${texto} (no falló)`); }
    catch (e) { ok(e.codigo === codigo, `${texto} → ${e.codigo}`); }
  };

  console.log(`\n── ${etiqueta} ──`);
  const r = await pedir('reservas.crear', { ...base, telefono: '3001110001', medio: 'presencial', pago: 'pagado' });
  ok(r.medio === 'presencial' && r.pago === 'pagado', `se guardan → medio=${r.medio}, pago=${r.pago}`);

  await esperaError('DATOS_INCOMPLETOS', 'sin medio',
    { ...base, telefono: '3001110002', pago: 'pagado' });
  await esperaError('DATOS_INCOMPLETOS', 'sin pago',
    { ...base, telefono: '3001110003', medio: 'telefono' });
  await esperaError('DATOS_INCOMPLETOS', 'medio inventado',
    { ...base, telefono: '3001110004', medio: 'paloma-mensajera', pago: 'debe' });
  await esperaError('DATOS_INCOMPLETOS', 'pago inventado',
    { ...base, telefono: '3001110005', medio: 'presencial', pago: 'quizas' });

  const editada = await pedir('reservas.actualizar', {
    id: r.id, nombre: r.nombre, telefono: r.telefono, menu_id: r.menu_id,
    medio: 'telefono', pago: 'debe',
  });
  ok(editada.medio === 'telefono' && editada.pago === 'debe', 'la edición los cambia');
  const cambios = editada.historial[1].cambios;
  ok(cambios.length === 2, `el historial registra los ${cambios.length} cambios`);
  const cMedio = cambios.find((c) => c.campo === 'medio');
  ok(cMedio.antes === 'Presencial' && cMedio.despues === 'Teléfono',
     `con etiquetas legibles → ${cMedio.antes} → ${cMedio.despues}`);
  const cPago = cambios.find((c) => c.campo === 'pago');
  ok(cPago.antes === 'Pagado' && cPago.despues === 'Debe', `${cPago.antes} → ${cPago.despues}`);

  try {
    await pedir('reservas.actualizar', {
      id: r.id, nombre: r.nombre, telefono: r.telefono, menu_id: r.menu_id,
      medio: 'telefono', pago: 'debe',
    });
    ok(false, 'guardar sin cambios (no falló)');
  } catch (e) { ok(e.codigo === 'SIN_CAMBIOS', `guardar sin cambios → ${e.codigo}`); }
}

console.log(fallos === 0 ? '\n✔ Todo en verde\n' : `\n✘ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
