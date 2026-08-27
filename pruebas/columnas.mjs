/**
 * Escribir en una hoja cuyas columnas NO están en el orden declarado.
 *
 * Es el fallo que corrompió una reserva en producción: la migración añade las
 * columnas nuevas al final, el código las tenía declaradas en medio, y al
 * escribir cada valor caía en la columna de al lado. Leer iba por nombre, así
 * que no se notaba hasta mirar una fila.
 */
import './fechaFija.mjs';
import { crearBackendSimulado } from './simulaAppsScript.mjs';

let fallos = 0;
const ok = (c, e) => { console.log(`${c ? '  OK  ' : ' FALLO'} · ${e}`); if (!c) fallos++; };

const LUNES = '2026-08-17';
const b = crearBackendSimulado();
const pedir = (a, p) => { const r = b.enviar(a, p); if (!r.ok) throw new Error(r.error.codigo + ': ' + r.error.mensaje); return r.data; };

// Se simula una hoja migrada: 'medio' y 'pago' al FINAL, no en medio.
const hojaR = b.libro.getSheetByName('Reservas');
const declarado = hojaR.datos[0].slice();
const reordenado = declarado.filter((c) => c !== 'medio' && c !== 'pago').concat(['medio', 'pago']);
hojaR.datos[0] = reordenado;
ok(reordenado.join() !== declarado.join(),
   `la hoja queda en otro orden → …${reordenado.slice(-4).join(' | ')}`);

pedir('menu.guardarSemana', { lunes: LUNES, dias: [{ fecha: LUNES, platos: ['Plato A', 'Plato B'] }] });

const creada = pedir('reservas.crear', {
  nombre: 'Persona Prueba', telefono: '3001112233',
  cafeteria_id: 'bienestar-pro', fecha: LUNES, menu_id: 'plato-a',
  medio: 'telefono', pago: 'debe',
});

// Se relee desde la hoja: es donde se vería el desajuste.
const releida = pedir('reservas.delDia', { cafeteria_id: 'bienestar-pro', fecha: LUNES })
  .find((r) => r.id === creada.id);

ok(!!releida, 'la reserva creada SÍ aparece en la tabla del día');
ok(releida.estado === 'activa', `estado correcto → «${releida.estado}»`);
ok(releida.medio === 'telefono' && releida.pago === 'debe',
   `medio y pago en su sitio → ${releida.medio} · ${releida.pago}`);
ok(/^\d{4}-\d{2}-\d{2}T/.test(releida.timestamp), 'el timestamp no se fue a otra columna');
ok(Array.isArray(releida.historial) && releida.historial[0].tipo === 'creacion',
   'y el historial sigue siendo un arreglo');

// Editar reescribe la fila entera: el mismo riesgo.
const editada = pedir('reservas.actualizar', {
  id: creada.id, nombre: 'Persona Prueba', telefono: '3001112233',
  menu_id: 'plato-b', medio: 'presencial', pago: 'pagado',
});
const trasEditar = pedir('reservas.delDia', { cafeteria_id: 'bienestar-pro', fecha: LUNES })
  .find((r) => r.id === creada.id);
ok(trasEditar.estado === 'activa' && trasEditar.medio === 'presencial' && trasEditar.pago === 'pagado',
   'editar tampoco descoloca las columnas');
ok(Array.isArray(trasEditar.historial) && trasEditar.historial.length === 2,
   'el historial crece bien tras la edición');

// Y cancelar.
pedir('reservas.cancelar', { id: creada.id });
const cancelada = pedir('reservas.buscar', { desde: LUNES, hasta: LUNES, limite: 0 })
  .reservas.find((r) => r.id === creada.id);
ok(cancelada.estado === 'cancelada' && cancelada.medio === 'presencial',
   'cancelar deja el estado bien y no pisa los demás campos');

console.log(fallos === 0 ? '\n✔ Todo en verde\n' : `\n✘ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
