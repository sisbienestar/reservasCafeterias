import './fechaFija.mjs';
import { getCafeterias, crearCafeteria, actualizarCafeteria, archivarCafeteria, reactivarCafeteria }
  from './banco/js/services/cafeteriasService.js';
import { getMenuSemana, guardarMenuSemana, getMenuDelDia } from './banco/js/services/menuService.js';
import { buscarReservas } from './banco/js/services/reservasService.js';
import { hoyISO, sumarDias, lunesDeEstaSemana } from './banco/js/utils/fechas.js';

let fallos = 0;
const ok = (c, e) => { console.log(`${c ? '  OK  ' : ' FALLO'} · ${e}`); if (!c) fallos++; };
async function esperaError(codigo, etiqueta, fn) {
  try { await fn(); ok(false, `${etiqueta} (no lanzó ${codigo})`); }
  catch (e) { ok(e.codigo === codigo, `${etiqueta} → ${e.codigo}`); }
}

const hoy = hoyISO();
const hace30 = sumarDias(hoy, -30);

console.log('── Búsqueda y filtros ──');
const todo = await buscarReservas({ desde: hace30, hasta: hoy, limite: 0 });
ok(todo.total > 500, `rango de 30 días → ${todo.total} reservas`);
ok(todo.reservas.length === todo.total, 'limite:0 devuelve todas');

const pagina = await buscarReservas({ desde: hace30, hasta: hoy });
ok(pagina.reservas.length === 500, `limite por defecto recorta a ${pagina.reservas.length}`);
ok(pagina.total === todo.total, 'pero el total sigue siendo el real');
ok(pagina.resumen.totales.total === todo.total, 'y el resumen se calcula sobre todas');

const central = await buscarReservas({ desde: hace30, hasta: hoy, cafeteriaId: 'bienestar-pro', limite: 0 });
ok(central.reservas.every(r => r.cafeteriaId === 'bienestar-pro'), 'filtro por cafetería');
ok(central.total < todo.total, `central → ${central.total} de ${todo.total}`);

const canc = await buscarReservas({ desde: hace30, hasta: hoy, estado: 'cancelada', limite: 0 });
ok(canc.reservas.every(r => r.estado === 'cancelada'), 'filtro por estado');

const unDia = await buscarReservas({ desde: hoy, hasta: hoy, limite: 0 });
ok(unDia.reservas.every(r => r.fecha === hoy), 'filtro de un solo día');

const nombre = todo.reservas[0].nombre.split(' ')[0];
const porTexto = await buscarReservas({ desde: hace30, hasta: hoy, texto: nombre, limite: 0 });
ok(porTexto.total > 0, `búsqueda por nombre «${nombre}» → ${porTexto.total}`);
const sinAcento = await buscarReservas({ desde: hace30, hasta: hoy, texto: 'sofia', limite: 0 });
ok(sinAcento.total > 0, `«sofia» encuentra a «Sofía» → ${sinAcento.total}`);
const porMovil = await buscarReservas({ desde: hace30, hasta: hoy, texto: todo.reservas[0].telefono, limite: 0 });
ok(porMovil.total >= 1, 'búsqueda por móvil');

await esperaError('RANGO_INVALIDO', 'rango invertido', () =>
  buscarReservas({ desde: hoy, hasta: hace30 }));
await esperaError('RANGO_INVALIDO', 'sin fechas', () => buscarReservas({}));

console.log('\n── Consolidados ──');
const r = todo.resumen;
ok(r.totales.activas + r.totales.canceladas === r.totales.total, 'activas + canceladas = total');
ok(r.porDia.length === 31, `por_dia cubre los 31 días del rango (${r.porDia.length})`);
ok(r.porDia.reduce((s,d)=>s+d.activas+d.canceladas,0) === r.totales.total, 'por_dia suma el total');
ok(r.porCafeteria.reduce((s,c)=>s+c.activas+c.canceladas,0) === r.totales.total, 'por_cafeteria suma el total');
ok(r.porPlato.reduce((s,p)=>s+p.total,0) === r.totales.activas, 'por_plato suma solo las activas');
ok(r.porCafeteria[0].activas >= r.porCafeteria[r.porCafeteria.length-1].activas, 'por_cafeteria viene ordenado');
ok(r.totales.promedioDiario > 0, `promedio diario → ${r.totales.promedioDiario}`);

console.log('\n── Catálogo: cafeterías ──');
const activas = await getCafeterias();
ok(activas.length === 4, `activas → ${activas.length}`);
const nueva = await crearCafeteria({ nombre: 'Cafetería Salud', ubicacion: 'Facultad de Salud' });
ok(nueva.id === 'cafeteria-salud', `id derivado del nombre → ${nueva.id}`);
ok((await getCafeterias()).length === 5, 'aparece en el listado');
await esperaError('CAFETERIA_DUPLICADA', 'mismo nombre dos veces', () =>
  crearCafeteria({ nombre: 'Cafetería Salud' }));
await esperaError('DATOS_INCOMPLETOS', 'sin nombre', () => crearCafeteria({ nombre: '  ' }));

const editada = await actualizarCafeteria('cafeteria-salud', { nombre: 'Cafetería de Salud', ubicacion: 'Bloque 5' });
ok(editada.nombre === 'Cafetería de Salud' && editada.id === 'cafeteria-salud', 'editar no cambia el id');

await archivarCafeteria('cafeteria-salud');
ok((await getCafeterias()).length === 4, 'archivada desaparece del listado operativo');
ok((await getCafeterias({ incluirInactivas: true })).length === 5, 'pero el admin sí la ve');
await reactivarCafeteria('cafeteria-salud');
ok((await getCafeterias()).length === 5, 'reactivada vuelve');
await archivarCafeteria('cafeteria-salud');

console.log('\n── Catálogo: carta semanal (compartida por todo el campus) ──');
const lunes = lunesDeEstaSemana();
const semana = await getMenuSemana(lunes);
ok(semana.length === 7, `la semana trae 7 días (${semana.length})`);
ok(semana[0].fecha === lunes, 'empieza en lunes');
const conCarta = semana.filter((d) => d.opciones.length > 0);
ok(conCarta.length === 5, `solo los 5 días laborables llevan carta (${conCarta.length})`);
ok(semana.slice(5).every((d) => d.opciones.length === 0),
   'sábado y domingo van sin carta: no hay servicio');

// La misma carta vale para cualquier cafetería: ya no hay una por sede.
const cartaLunes = await getMenuDelDia('', lunes);
ok(JSON.stringify(cartaLunes) === JSON.stringify(semana[0].opciones),
   'la carta del día coincide con la del editor semanal');

const guardado = await guardarMenuSemana(lunes, [
  { fecha: lunes, platos: ['Sopa de guineo', 'Pollo sudado', '  '] },
]);
ok(guardado[0].opciones.length === 2, `guarda 2 platos e ignora el vacío (${guardado[0].opciones.length})`);
ok(guardado[0].opciones[0].id === 'sopa-de-guineo', `id derivado → ${guardado[0].opciones[0].id}`);
ok((await getMenuDelDia('', lunes)).length === 2, 'se refleja en la carta del día');

await esperaError('MENU_DUPLICADO', 'dos platos con el mismo nombre', () =>
  guardarMenuSemana(lunes, [{ fecha: lunes, platos: ['Ajiaco', 'ajiaco'] }]));

// Atomicidad: si un día de la semana falla, no puede quedar ninguno escrito.
const antesDeFallar = await getMenuDelDia('', sumarDias(lunes, 1));
await esperaError('MENU_DUPLICADO', 'un día inválido aborta la semana entera', () =>
  guardarMenuSemana(lunes, [
    { fecha: sumarDias(lunes, 1), platos: ['Plato Nuevo A', 'Plato Nuevo B'] },
    { fecha: sumarDias(lunes, 2), platos: ['Repetido', 'repetido'] },
  ]));
const despuesDeFallar = await getMenuDelDia('', sumarDias(lunes, 1));
ok(JSON.stringify(antesDeFallar) === JSON.stringify(despuesDeFallar),
   'el día válido no se escribió: la semana entra o no entra');

await esperaError('RANGO_INVALIDO', 'un día fuera de la semana', () =>
  guardarMenuSemana(lunes, [{ fecha: sumarDias(lunes, 30), platos: ['X'] }]));

await guardarMenuSemana(lunes, [{ fecha: lunes, platos: [] }]);
ok((await getMenuDelDia('', lunes)).length === 0, 'lista vacía borra la carta del día');

console.log(fallos === 0 ? '\n✔ Todo en verde\n' : `\n✘ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
