/** Ejercita la capa de datos sin navegador: mock → services. */

import './fechaFija.mjs';
import { getCafeterias, getCafeteria } from './banco/js/services/cafeteriasService.js';
import { getMenuDelDia } from './banco/js/services/menuService.js';
import {
  getReservasDelDia,
  crearReserva,
  actualizarReserva,
} from './banco/js/services/reservasService.js';
import { normalizarTelefono, formatearTelefono } from './banco/js/utils/telefono.js';

let fallos = 0;
const ok = (cond, etiqueta) => {
  console.log(`${cond ? '  OK  ' : ' FALLO'} · ${etiqueta}`);
  if (!cond) fallos++;
};

async function esperaError(codigo, etiqueta, fn) {
  try {
    await fn();
    ok(false, `${etiqueta} (no lanzó ${codigo})`);
  } catch (e) {
    ok(e.codigo === codigo, `${etiqueta} → ${e.codigo}: ${e.message}`);
  }
}

console.log('\n── Teléfono ──');
ok(normalizarTelefono('300 123 4567') === '3001234567', 'con espacios');
ok(normalizarTelefono('+57 300-123-4567') === '3001234567', 'con indicativo +57');
ok(normalizarTelefono('6076345678') === null, 'fijo (no empieza por 3) rechazado');
ok(normalizarTelefono('30012345') === null, 'corto rechazado');
ok(normalizarTelefono('') === null, 'vacío rechazado');
ok(formatearTelefono('3001234567') === '300 123 4567', 'formato de salida');

console.log('\n── Cafeterías ──');
const cafeterias = await getCafeterias();
ok(cafeterias.length === 4, `listar → ${cafeterias.length}`);
ok(!('turnos' in cafeterias[0]), 'sin campo turnos');
ok(!('capacidadPorTurno' in cafeterias[0]), 'sin campo capacidadPorTurno');
const central = await getCafeteria('bienestar-pro');
ok(central.nombre === 'Bienestar Pro', `obtener → ${central.nombre}`);

console.log('\n── Menú y reservas de hoy ──');
const menu = await getMenuDelDia('bienestar-pro');
ok(menu.length >= 2, `menú de hoy → ${menu.length} platos`);
const antes = await getReservasDelDia('bienestar-pro');
ok(antes.length > 0, `reservas del día → ${antes.length}`);
ok(antes.every((r) => r.historial.length >= 1), 'toda semilla tiene historial');
const conEdicion = antes.find((r) => r.historial.length > 1);
ok(!!conEdicion, `una semilla trae modificación → ${conEdicion?.nombre}`);
ok(
  conEdicion?.historial[1].cambios[0].despues === conEdicion?.menuNombre,
  'el historial de la semilla concuerda con su plato actual',
);
ok(!('turno' in antes[0]), 'la reserva no tiene campo turno');
ok(typeof antes[0].telefono === 'string', 'la reserva tiene teléfono');

console.log('\n── Crear ──');
const nueva = await crearReserva({
  nombre: '  Ana Lucía Prada  ',
  telefono: '3009998877',
  cafeteriaId: 'bienestar-pro',
  menuId: menu[0].id, medio: 'presencial', pago: 'pagado'
});
ok(nueva.nombre === 'Ana Lucía Prada', 'nombre recortado');
ok(nueva.menuNombre === menu[0].nombre, `plato → ${nueva.menuNombre}`);
ok(nueva.historial.length === 1 && nueva.historial[0].tipo === 'creacion',
   'nace con asiento de creación');
ok((await getReservasDelDia('bienestar-pro')).length === antes.length + 1, 'aparece en la tabla');

await esperaError('RESERVA_DUPLICADA', 'mismo móvil, misma cafetería, mismo día', () =>
  crearReserva({
    nombre: 'Otra Persona',
    telefono: '3009998877',
    cafeteriaId: 'bienestar-pro',
    menuId: menu[0].id, medio: 'presencial', pago: 'pagado'
  }),
);
await esperaError('MENU_INVALIDO', 'plato que no está en la carta de hoy', () =>
  crearReserva({
    nombre: 'Otra Persona',
    telefono: '3001110000',
    cafeteriaId: 'bienestar-pro',
    menuId: 'plato-inventado', medio: 'presencial', pago: 'pagado'
  }),
);
await esperaError('DATOS_INCOMPLETOS', 'sin móvil', () =>
  crearReserva({ nombre: 'Otra Persona', telefono: '', cafeteriaId: 'bienestar-pro', menuId: menu[0].id , medio: 'presencial', pago: 'pagado'}),
);

console.log('\n── Editar e historial ──');
const editada = await actualizarReserva(nueva.id, {
  nombre: 'Ana Lucía Prada Ortiz',
  telefono: '3009998877',
  menuId: menu[1].id, medio: 'presencial', pago: 'pagado'
});
ok(editada.historial.length === 2, `historial → ${editada.historial.length} asientos`);
const ultimo = editada.historial[1];
ok(ultimo.tipo === 'modificacion', 'último asiento es modificación');
ok(ultimo.cambios.length === 2, `registró ${ultimo.cambios.length} cambios (nombre y menú)`);
const cambioMenu = ultimo.cambios.find((c) => c.campo === 'menu');
ok(cambioMenu.antes === menu[0].nombre && cambioMenu.despues === menu[1].nombre,
   `menú: ${cambioMenu.antes} → ${cambioMenu.despues}`);
ok(ultimo.cambios.find((c) => c.campo === 'nombre').antes === 'Ana Lucía Prada',
   'guarda el valor anterior del nombre');
ok(editada.historial[0].tipo === 'creacion', 'la creación sigue siendo el primer asiento');

await esperaError('SIN_CAMBIOS', 'guardar sin tocar nada', () =>
  actualizarReserva(editada.id, {
    nombre: editada.nombre,
    telefono: editada.telefono,
    menuId: editada.menuId, medio: 'presencial', pago: 'pagado'
  }),
);
await esperaError('RESERVA_DUPLICADA', 'cambiar al móvil de otra reserva', () =>
  actualizarReserva(editada.id, {
    nombre: editada.nombre,
    telefono: antes[0].telefono,
    menuId: editada.menuId, medio: 'presencial', pago: 'pagado'
  }),
);
await esperaError('RESERVA_NO_ENCONTRADA', 'editar una reserva inexistente', () =>
  actualizarReserva('r-no-existe', {
    nombre: 'X Y',
    telefono: '3001112233',
    menuId: menu[0].id, medio: 'presencial', pago: 'pagado'
  }),
);

// El teléfono propio debe poder repetirse consigo mismo al editar.
const soloNombre = await actualizarReserva(editada.id, {
  nombre: 'Ana L. Prada',
  telefono: editada.telefono,
  menuId: editada.menuId, medio: 'presencial', pago: 'pagado'
});
ok(soloNombre.historial.length === 3, 'editar solo el nombre añade otro asiento');
ok(soloNombre.historial[2].cambios.length === 1, 'y registra un único cambio');

console.log('\n── Aislamiento del almacén ──');
const copia = await getReservasDelDia('bienestar-pro');
copia[0].nombre = 'MUTADO';
const releida = await getReservasDelDia('bienestar-pro');
ok(releida[0].nombre !== 'MUTADO', 'mutar el resultado no toca el almacén');

console.log(fallos === 0 ? '\n✔ Todo en verde\n' : `\n✘ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
