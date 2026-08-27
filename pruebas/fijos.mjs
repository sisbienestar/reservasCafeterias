/** Platos fijos por cafetería: se ofrecen todos los días con servicio. */
import './fechaFija.mjs';
import { crearBackendSimulado } from './simulaAppsScript.mjs';
import { enviar as mock } from './banco/js/mock/mockApi.js';

let fallos = 0;
const ok = (c, e) => { console.log(`${c ? '  OK  ' : ' FALLO'} · ${e}`); if (!c) fallos++; };

const LUNES = '2026-08-17';
const SABADO = '2026-08-22';

for (const [etiqueta, enviar, preparar] of [
  ['mock', (a, p) => mock(a, p), async () => {}],
  ['Apps Script', null, null],
]) {
  let llamar = enviar;
  if (!llamar) {
    const b = crearBackendSimulado();
    b.enviar('menu.guardarSemana', { lunes: LUNES, dias: [{ fecha: LUNES, platos: ['Sopa', 'Pollo'] }] });
    llamar = (a, p) => b.enviar(a, p);
  }
  const pedir = async (a, p) => { const r = await llamar(a, p); if (!r.ok) throw new Error(r.error.codigo); return r.data; };

  console.log(`\n── ${etiqueta} ──`);
  const pro = await pedir('menu.delDia', { fecha: LUNES, cafeteria_id: 'bienestar-pro' });
  const fijosPro = pro.opciones.filter((o) => o.fijo).map((o) => o.nombre);
  ok(fijosPro.join(' · ') === 'Especial carne · Especial pollo · Especial cerdo',
     `Bienestar Pro añade → ${fijosPro.join(' · ')}`);

  const ct = await pedir('menu.delDia', { fecha: LUNES, cafeteria_id: 'camilo-torres' });
  ok(ct.opciones.filter((o) => o.fijo).map((o) => o.nombre).join() === 'Mini Lunch',
     'Camilo Torres añade Mini Lunch');

  const bu = await pedir('menu.delDia', { fecha: LUNES, cafeteria_id: 'bienestar-universitario' });
  ok(bu.opciones.filter((o) => o.fijo).map((o) => o.nombre).join() === 'Mini Lunch',
     'Bienestar Universitario también');

  const a3 = await pedir('menu.delDia', { fecha: LUNES, cafeteria_id: 'administracion-3' });
  ok(a3.opciones.filter((o) => o.fijo).length === 0, 'Administración 3 no tiene fijos');

  const comun = await pedir('menu.delDia', { fecha: LUNES });
  ok(comun.opciones.every((o) => !o.fijo),
     'sin cafetería devuelve solo la carta común: es lo que edita el admin');
  ok(pro.opciones.length === comun.opciones.length + 3, 'los fijos se SUMAN a la carta, no la sustituyen');

  const sabado = await pedir('menu.delDia', { fecha: SABADO, cafeteria_id: 'camilo-torres' });
  ok(sabado.opciones.length === 0,
     'en sábado no hay nada: los fijos tampoco se ofrecen sin servicio');

  const reserva = await pedir('reservas.crear', {
    nombre: 'Prueba Fijos', telefono: '3007778899',
    cafeteria_id: 'camilo-torres', fecha: LUNES, menu_id: 'mini-lunch', medio: 'presencial', pago: 'pagado'
  });
  ok(reserva.menu_nombre === 'Mini Lunch', `se puede reservar un plato fijo → ${reserva.menu_nombre}`);

  try {
    await pedir('reservas.crear', {
      nombre: 'Otra', telefono: '3007778800',
      cafeteria_id: 'administracion-3', fecha: LUNES, menu_id: 'mini-lunch', medio: 'presencial', pago: 'pagado'
    });
    ok(false, 'una sede sin ese fijo debería rechazarlo');
  } catch (e) {
    ok(e.message === 'MENU_INVALIDO',
       `y una sede sin ese fijo lo rechaza → ${e.message}`);
  }
}

console.log(fallos === 0 ? '\n✔ Todo en verde\n' : `\n✘ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
