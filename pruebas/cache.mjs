/**
 * La caché no puede mentir, y el candado solo debe estorbar al escribir.
 *
 * Guardar tablas entre peticiones es la optimización con más filo del
 * sistema: si una escritura no invalida su copia, la pantalla enseña durante
 * dos minutos algo que ya no es verdad. Cada caso de aquí es una forma
 * concreta de que eso pase.
 */
import './fechaFija.mjs';
import { crearBackendSimulado } from './simulaAppsScript.mjs';

let fallos = 0;
const ok = (c, e) => { console.log(`${c ? '  OK  ' : ' FALLO'} · ${e}`); if (!c) fallos++; };

const HOY = '2026-08-24';
const b = crearBackendSimulado();
const datos = (a, p) => b.enviar(a, p).data;

console.log('── El candado ──');
b.ponerCandadosACero();
datos('cafeterias.listar', {});
datos('menu.delDia', { fecha: HOY });
datos('reservas.delDia', { cafeteria_id: 'bienestar-pro', fecha: HOY });
datos('reservas.buscar', { desde: '2026-08-01', hasta: HOY });
ok(b.candados() === 0, 'cuatro consultas seguidas no toman el candado ni una vez');

b.ponerCandadosACero();
b.enviar('menu.guardarSemana', { lunes: '2026-08-24', dias: [{ fecha: HOY, platos: ['Bandeja paisa', 'Pollo asado'] }] });
ok(b.candados() === 1, 'guardar la carta sí lo toma');

// Toda acción que escriba tiene que estar declarada, o se quedaría sin
// candado sin que nadie se entere hasta que dos personas coincidan.
console.log('\n── Ninguna escritura sin candado ──');
const escrituras = [
  ['reservas.crear', { cafeteria_id: 'bienestar-pro', fecha: HOY, nombre: 'Ana Ruiz',
    telefono: '3001112233', menu_id: 'bandeja-paisa', medio: 'presencial', pago: 'pagado' }],
  ['cafeterias.actualizar', { id: 'bienestar-pro', nombre: 'Bienestar Pro', ubicacion: 'Campus' }],
  ['cafeterias.archivar', { id: 'administracion-3' }],
  ['cafeterias.reactivar', { id: 'administracion-3' }],
];
for (const [accion, params] of escrituras) {
  b.ponerCandadosACero();
  const r = b.enviar(accion, params);
  ok(r.ok && b.candados() === 1, `${accion} escribe con el candado tomado`);
}

console.log('\n── La caché no puede quedarse vieja ──');
// 1. La carta.
datos('menu.delDia', { fecha: HOY });                       // deja copia
b.enviar('menu.guardarSemana', { lunes: '2026-08-24', dias: [{ fecha: HOY, platos: ['Sancocho'] }] });
const carta = datos('menu.delDia', { fecha: HOY });
ok(carta.opciones.length === 1 && carta.opciones[0].nombre === 'Sancocho',
   `cambiar la carta se ve al instante: ${carta.opciones.map((o) => o.nombre).join(', ')}`);

// 2. Los platos fijos de una sede.
datos('menu.delDia', { fecha: HOY, cafeteria_id: 'camilo-torres' });
b.enviar('cafeterias.actualizar', { id: 'camilo-torres', nombre: 'Camilo Torres',
  ubicacion: 'Auditorio', platos_fijos: ['Mini Lunch', 'Ensalada del día'] });
const oferta = datos('menu.delDia', { fecha: HOY, cafeteria_id: 'camilo-torres' });
ok(oferta.opciones.some((o) => o.nombre === 'Ensalada del día'),
   'añadir un plato fijo se ve al instante en la oferta de esa sede');

// 3. El listado de cafeterías.
datos('cafeterias.listar', {});
b.enviar('cafeterias.archivar', { id: 'administracion-3' });
ok(!datos('cafeterias.listar', {}).some((c) => c.id === 'administracion-3'),
   'archivar una cafetería la saca del listado al instante');
b.enviar('cafeterias.reactivar', { id: 'administracion-3' });

// 4. Las reservas nunca se guardan en caché.
console.log('\n── Las reservas, siempre frescas ──');
datos('reservas.delDia', { cafeteria_id: 'bienestar-pro', fecha: HOY });
const nueva = datos('reservas.crear', { cafeteria_id: 'bienestar-pro', fecha: HOY,
  nombre: 'Pedro Gómez', telefono: '3009998877', menu_id: 'sancocho',
  medio: 'telefono', pago: 'debe' });
const delDia = datos('reservas.delDia', { cafeteria_id: 'bienestar-pro', fecha: HOY });
ok(delDia.some((r) => r.id === nueva.id), 'la reserva recién creada aparece en la tabla del día');

b.enviar('reservas.cancelar', { id: nueva.id });
ok(!datos('reservas.delDia', { cafeteria_id: 'bienestar-pro', fecha: HOY }).some((r) => r.id === nueva.id),
   'y al cancelarla desaparece al instante');

// 5. Escribir jamás puede usar un `_fila` guardado: es como se escribe en la
//    fila equivocada, el error que ya nos costó una tarde.
console.log('\n── Escribir nunca lee de la caché ──');
datos('cafeterias.listar', {});                              // deja copia con _fila
b.enviar('cafeterias.actualizar', { id: 'camilo-torres', nombre: 'Camilo Torres II', ubicacion: 'Auditorio' });
const tras = datos('cafeterias.listar', {});
ok(tras.find((c) => c.id === 'camilo-torres').nombre === 'Camilo Torres II',
   'se escribió en la fila correcta');
ok(tras.find((c) => c.id === 'bienestar-pro').nombre === 'Bienestar Pro',
   'y la fila de al lado quedó intacta');

console.log(fallos === 0 ? '\n✔ Todo en verde\n' : `\n✘ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
