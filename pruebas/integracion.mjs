/**
 * ¿Entiende el frontend REAL lo que devuelve el backend REAL?
 *
 * Esta es la prueba que de verdad decide si la migración va a funcionar. Usa
 * los servicios del proyecto sin tocarlos —`js-api/` es una copia con una sola
 * línea cambiada, la que elige el transporte— y los apunta a Codigo.gs
 * ejecutándose en memoria.
 *
 * Lo que caza: cualquier diferencia de forma entre el mock y Apps Script. Un
 * campo en snake_case que el servicio esperaba en camelCase, un arreglo que
 * llega como texto, un número que llega como cadena. Todo eso rompe la
 * pantalla el día del despliegue y aquí sale antes.
 */

import './fechaFija.mjs';

import { getCafeterias, crearCafeteria, archivarCafeteria } from './banco/js-api/services/cafeteriasService.js';
import { getMenuDelDia, getMenuSemana, guardarMenuSemana } from './banco/js-api/services/menuService.js';
import {
  getReservasDelDia, crearReserva, actualizarReserva, cancelarReserva, buscarReservas,
} from './banco/js-api/services/reservasService.js';
import { hoyISO, lunesDeEstaSemana, sumarDias } from './banco/js-api/utils/fechas.js';

let fallos = 0;
const ok = (c, e) => { console.log(`${c ? '  OK  ' : ' FALLO'} · ${e}`); if (!c) fallos++; };
async function esperaError(codigo, etiqueta, fn) {
  try { await fn(); ok(false, `${etiqueta} (no lanzó ${codigo})`); }
  catch (e) { ok(e.codigo === codigo, `${etiqueta} → ${e.codigo}`); }
}

const hoy = hoyISO();            // miércoles fijado por fechaFija.mjs
const lunes = lunesDeEstaSemana();

console.log('── Cafeterías: forma que espera la UI ──');
const cafeterias = await getCafeterias();
ok(cafeterias.length === 4, `listar → ${cafeterias.length}`);
const c = cafeterias[0];
ok(typeof c.id === 'string' && typeof c.nombre === 'string', 'id y nombre son cadenas');
ok(typeof c.activa === 'boolean', `activa es booleano → ${c.activa}`);
ok('ubicacion' in c && 'imagen' in c, 'trae ubicacion e imagen');
ok(!('_fila' in c), 'sin restos internos de la hoja');

console.log('\n── Carta: la publica el administrador ──');
await guardarMenuSemana(lunes, [
  { fecha: lunes, platos: ['Bandeja paisa', 'Pasta al pesto'] },
  { fecha: hoy, platos: ['Ajiaco santafereño', 'Curry de garbanzos', 'Arroz con pollo'] },
]);

const semana = await getMenuSemana(lunes);
ok(semana.length === 7, 'la semana devuelve 7 días');
ok(semana[0].fecha === lunes, 'empieza en lunes');
ok(Array.isArray(semana[0].opciones), 'opciones es un arreglo, no texto JSON');

const menuHoy = await getMenuDelDia('bienestar-pro');
ok(menuHoy.filter((o) => !o.fijo).length === 3, `carta comun de hoy: ${menuHoy.filter((o) => !o.fijo).length} platos`);
ok(menuHoy.filter((o) => o.fijo).length === 3, 'y Bienestar Pro suma sus 3 platos fijos');
ok(menuHoy.filter((o) => o.fijo).every((o) => o.fijo === true), 'el indicador fijo llega como booleano a la interfaz');
ok(typeof menuHoy[0].id === 'string' && typeof menuHoy[0].nombre === 'string',
   `normalizada → { id: '${menuHoy[0].id}', nombre: '${menuHoy[0].nombre}' }`);

console.log('\n── Reservas: el flujo del mostrador ──');
const reserva = await crearReserva({
  nombre: 'Laura Camila Ardila',
  telefono: '3001247856',
  cafeteriaId: 'bienestar-pro',
  menuId: menuHoy[0].id, medio: 'presencial', pago: 'pagado'
});
ok(reserva.cafeteriaId === 'bienestar-pro',
   `cafeteria_id llega convertido a camelCase → ${reserva.cafeteriaId}`);
ok(reserva.menuNombre === menuHoy[0].nombre, `menuNombre → ${reserva.menuNombre}`);
ok(reserva.estado === 'activa', 'estado normalizado');
ok(Array.isArray(reserva.historial) && reserva.historial[0].tipo === 'creacion',
   'historial llega como arreglo de asientos');
ok(typeof reserva.telefono === 'string' && reserva.telefono === '3001247856',
   `el móvil sobrevive el viaje por la hoja → «${reserva.telefono}»`);

const tabla = await getReservasDelDia('bienestar-pro');
ok(tabla.length === 1, 'aparece en la tabla del día');
ok(tabla[0].id === reserva.id, 'con el mismo id');

await esperaError('RESERVA_DUPLICADA', 'el móvil duplicado se rechaza igual que en el mock', () =>
  crearReserva({ nombre: 'Otra', telefono: '3001247856',
                 cafeteriaId: 'bienestar-pro', menuId: menuHoy[0].id , medio: 'presencial', pago: 'pagado'}));

console.log('\n── Editar: el historial que pinta el modal ──');
const editada = await actualizarReserva(reserva.id, {
  nombre: 'Laura Camila Ardila Rueda',
  telefono: '3001247856',
  menuId: menuHoy[1].id, medio: 'presencial', pago: 'pagado'
});
ok(editada.historial.length === 2, 'el historial crece');
const asiento = editada.historial[1];
ok(asiento.tipo === 'modificacion' && Array.isArray(asiento.cambios),
   'el asiento tiene la forma que espera modalReserva.js');
ok(asiento.cambios.every((x) => 'campo' in x && 'antes' in x && 'despues' in x),
   'y cada cambio trae campo/antes/despues');
ok(asiento.cambios.find((x) => x.campo === 'menu').despues === menuHoy[1].nombre,
   `menú: → ${asiento.cambios.find((x) => x.campo === 'menu').despues}`);

console.log('\n── Cancelar ──');
const cancelada = await cancelarReserva(reserva.id);
ok(cancelada.estado === 'cancelada', 'queda cancelada');
ok((await getReservasDelDia('bienestar-pro')).length === 0, 'sale de la tabla del día');

console.log('\n── Administración: buscar y consolidar ──');
await crearReserva({
  nombre: 'Juan Sebastián Rueda', telefono: '3106654210',
  cafeteriaId: 'camilo-torres', menuId: menuHoy[2].id, medio: 'presencial', pago: 'pagado'
});

const resultado = await buscarReservas({ desde: sumarDias(hoy, -7), hasta: hoy, limite: 0 });
ok(resultado.total === 2, `encuentra ${resultado.total} reservas`);
ok(Array.isArray(resultado.reservas), 'devuelve el detalle');

const r = resultado.resumen;
ok(typeof r.totales.diasConServicio === 'number',
   `totales normalizado a camelCase → diasConServicio = ${r.totales.diasConServicio}`);
ok(typeof r.totales.promedioDiario === 'number',
   `promedioDiario = ${r.totales.promedioDiario}`);
ok(Array.isArray(r.porDia) && 'fecha' in r.porDia[0], 'porDia con { fecha, activas, canceladas }');
ok(r.porCafeteria.every((x) => 'cafeteriaId' in x && 'nombre' in x),
   'porCafeteria normalizado a camelCase');
ok(r.porPlato.every((x) => 'nombre' in x && typeof x.total === 'number'),
   'porPlato con { nombre, total }');
ok(r.porDia.reduce((s, d) => s + d.activas + d.canceladas, 0) === r.totales.total,
   'y los totales cuadran');

console.log('\n── Catálogo desde la pantalla de administración ──');
const salud = await crearCafeteria({ nombre: 'Cafetería Salud', ubicacion: 'Bloque 5' });
ok(salud.id === 'cafeteria-salud', `crear → ${salud.id}`);
ok(salud.activa === true, 'nace activa');
await archivarCafeteria(salud.id);
ok((await getCafeterias()).length === 4, 'archivar la saca del listado operativo');
ok((await getCafeterias({ incluirInactivas: true })).length === 5, 'el admin sigue viéndola');

console.log(fallos === 0 ? '\n✔ El frontend real habla con el backend real\n' : `\n✘ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
