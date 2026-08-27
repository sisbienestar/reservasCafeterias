/** El indicador de carga en los botones. */
import './fechaFija.mjs';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

let fallos = 0;
const ok = (c, e) => { console.log(`${c ? '  OK  ' : ' FALLO'} · ${e}`); if (!c) fallos++; };

const dom = new JSDOM(readFileSync('banco/reserva.html', 'utf8'),
  { url: 'http://localhost/reserva.html?cafeteria=bienestar-pro' });
const p = dom.window.HTMLDialogElement.prototype;
p.showModal = function () { this.open = true; };
p.close = function () { this.open = false; this.dispatchEvent(new dom.window.Event('close')); };
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;

await import('./banco/js/paginaReserva.js');
await esperar(900);

const clic = (n) => n.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const doc = document;

console.log('── El ayudante ──');
const { conCarga } = await import('./banco/js/ui/boton.js');
const prueba = doc.createElement('button');
prueba.className = 'boton boton--primario';
prueba.textContent = 'Hacer algo';
doc.body.appendChild(prueba);

let dentro = null;
const promesa = conCarga(prueba, async () => {
  await esperar(60);
  dentro = {
    girador: !!prueba.querySelector('.boton__girador'),
    ocupado: prueba.getAttribute('aria-busy'),
    inhabilitado: prueba.disabled,
    texto: prueba.textContent.trim(),
  };
  return 'resultado';
}, 'Trabajando…');
const valor = await promesa;

ok(dentro.girador === true, 'mientras trabaja hay un girador dentro del botón');
ok(dentro.ocupado === 'true', 'y aria-busy, que es lo que oye un lector de pantalla');
ok(dentro.inhabilitado === true, 'el botón queda inhabilitado: no se puede pulsar dos veces');
ok(dentro.texto === 'Trabajando…', `y cambia el texto → «${dentro.texto}»`);
ok(valor === 'resultado', 'devuelve lo que devolvió la tarea');
ok(prueba.disabled === false && prueba.textContent === 'Hacer algo',
   'al terminar recupera su estado exacto');
ok(!prueba.hasAttribute('aria-busy'), 'y suelta aria-busy');

// Un fallo no puede dejar el botón inservible.
await conCarga(prueba, async () => { throw new Error('algo falló'); }).catch(() => {});
ok(prueba.disabled === false && prueba.textContent === 'Hacer algo',
   'si la tarea lanza, el botón se restaura igualmente');

// Un segundo clic mientras trabaja no dispara nada.
let veces = 0;
const p1 = conCarga(prueba, async () => { veces++; await esperar(80); });
await esperar(20);
const p2 = conCarga(prueba, async () => { veces++; });
await Promise.all([p1, p2]);
ok(veces === 1, 'un clic mientras está ocupado se ignora: una sola ejecución');

// Abrir el formulario dejó de consultar nada: la carta ya está en memoria
// desde que cargó la página. Un girador aquí anunciaría una espera que no
// existe, y una espera fingida se nota igual que una real.
console.log('\n── En la pantalla de mostrador ──');
const botonReservar = doc.querySelector('#boton-reservar');
clic(botonReservar);
ok(doc.querySelector('#dialogo-reserva').open === true,
   'pulsar «Registrar reserva» abre el modal en el acto, sin esperar a nadie');
ok(!botonReservar.querySelector('.boton__girador'),
   'y sin girador: no hay ninguna espera que anunciar');
ok(botonReservar.textContent.trim() === 'Registrar reserva', 'el botón conserva su etiqueta');

// Guardar: el girador va en el botón que se pulsó.
const dialogo = doc.querySelector('#dialogo-reserva');
dialogo.querySelector('#campo-nombre').value = 'Prueba Indicador';
dialogo.querySelector('#campo-telefono').value = '3005550011';
dialogo.querySelector('#campo-menu').value = dialogo.querySelectorAll('#campo-menu option')[1].value;
dialogo.querySelector('#campo-medio-presencial').checked = true;
dialogo.querySelector('#campo-pago-pagado').checked = true;
dialogo.querySelector('form').dispatchEvent(
  new window.Event('submit', { bubbles: true, cancelable: true }));
await esperar(60);
const confirmar = dialogo.querySelector('[data-confirmar]');
ok(!!confirmar.querySelector('.boton__girador') && confirmar.textContent.trim() === 'Guardando…',
   'al guardar, el girador aparece en «Registrar reserva»');
await esperar(900);

console.log('\n── En una fila de la tabla ──');
const editar = [...doc.querySelectorAll('#contenedor-tabla button')].find((b) => b.textContent === 'Editar');
doc.querySelector('#dialogo-reserva').close();
clic(editar);
ok(doc.querySelector('#dialogo-reserva').open === true,
   'el botón «Editar» de la fila también abre el modal en el acto');
// El botón de la fila sigue envuelto en `conCarga`, y debe seguirlo: en
// administración ese mismo botón SÍ espera, porque la carta que valida una
// reserva de hace tres semanas no está en memoria. Lo que se comprueba es
// que cuando no hay espera, el girador no llega a verse.
await esperar(0);
ok(!editar.querySelector('.boton__girador'),
   'el girador no llega a pintarse cuando no hay nada que esperar');
ok(editar.disabled === false, 'y el botón queda utilizable de inmediato');
ok(editar.textContent.trim() === 'Editar', 'conservando su etiqueta');

console.log(fallos === 0 ? '\n✔ Todo en verde\n' : `\n✘ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
