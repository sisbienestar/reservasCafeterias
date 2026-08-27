/**
 * El pestillo de admin.html.
 *
 * Lo que se comprueba aquí es que la puerta hace lo que dice: que empieza
 * cerrada, que falla cerrada, que la clave correcta abre y que «Cerrar
 * sesión» vuelve a cerrar. NO se comprueba que sea segura, porque no lo es:
 * cualquiera con las herramientas de desarrollo entra igual.
 */

import './fechaFija.mjs';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

let fallos = 0;
const ok = (c, e) => { console.log(`${c ? '  OK  ' : ' FALLO'} · ${e}`); if (!c) fallos++; };

const CLAVE = 'adminSilvia';

/** Monta admin.html con los globales que necesita la página. */
function montar({ conCripto = true, sesion = null } = {}) {
  const dom = new JSDOM(readFileSync('banco/admin.html', 'utf8'), { url: 'http://localhost/admin.html' });
  const { window } = dom;
  const proto = window.HTMLDialogElement.prototype;
  proto.showModal = function () { this.open = true; };
  proto.close = function () { this.open = false; this.dispatchEvent(new window.Event('close')); };
  window.URL.createObjectURL = () => 'blob:x';
  window.URL.revokeObjectURL = () => {};

  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Blob = window.Blob;
  globalThis.URL = window.URL;
  globalThis.Event = window.Event;
  globalThis.navigator = window.navigator;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.TextEncoder = TextEncoder;
  globalThis.sessionStorage = window.sessionStorage;
  // globalThis.crypto es de solo lectura en Node: hay que redefinirla.
  Object.defineProperty(globalThis, 'crypto', {
    value: conCripto ? webcrypto : {},
    configurable: true,
    writable: true,
  });

  if (sesion) window.sessionStorage.setItem('reservasCafeterias.admin', sesion);
  return window;
}

const clic = (n) => n.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const enviar = (f) => f.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

/* ── Empieza cerrada ──────────────────────────────────────────────────── */

console.log('── Sin sesión ──');
montar();
const { pedirAcceso, cerrarSesion } = await import('./banco/js/ui/accesoAdmin.js');

const doc = document;
ok(doc.querySelector('#contenido').hasAttribute('hidden'),
   'el contenido viene oculto desde el HTML: el pestillo falla cerrado');

let abierto = false;
pedirAcceso({ acceso: doc.querySelector('#acceso'), contenido: doc.querySelector('#contenido') })
  .then(() => { abierto = true; });
await esperar(50);

ok(doc.querySelector('#acceso').hidden === false, 'se muestra la pantalla de acceso');
ok(doc.querySelector('#contenido').hidden === true, 'y el contenido sigue oculto');
ok(doc.querySelector('#campo-clave').type === 'password', 'la clave no se escribe a la vista');

console.log('\n── Clave incorrecta ──');
doc.querySelector('#campo-clave').value = 'no-es-esta';
enviar(doc.querySelector('#formulario-acceso'));
await esperar(120);
ok(abierto === false, 'no entra');
ok(doc.querySelector('#contenido').hidden === true, 'el contenido sigue oculto');
ok(doc.querySelector('[data-error-acceso]').textContent === 'Clave incorrecta.',
   'avisa sin dar pistas sobre la clave');
ok(doc.querySelector('#campo-clave').value === '', 'y limpia el campo');

console.log('\n── Clave correcta ──');
doc.querySelector('#campo-clave').value = CLAVE;
enviar(doc.querySelector('#formulario-acceso'));
await esperar(150);
ok(abierto === true, 'entra');
ok(doc.querySelector('#acceso').hidden === true, 'la pantalla de acceso desaparece');
ok(doc.querySelector('#contenido').hidden === false, 'y el contenido se muestra');
ok(window.sessionStorage.getItem('reservasCafeterias.admin') === 'ok',
   'la sesión queda anotada');

console.log('\n── La sesión se recuerda ──');
montar({ sesion: 'ok' });
const doc2 = document;
let abierto2 = false;
pedirAcceso({ acceso: doc2.querySelector('#acceso'), contenido: doc2.querySelector('#contenido') })
  .then(() => { abierto2 = true; });
await esperar(80);
ok(abierto2 === true, 'con sesión abierta no vuelve a pedir la clave');
ok(doc2.querySelector('#acceso').hidden === true, 'ni muestra la pantalla de acceso');

cerrarSesion();
ok(window.sessionStorage.getItem('reservasCafeterias.admin') === null,
   '«Cerrar sesión» borra la marca');

console.log('\n── Sin contexto seguro ──');
// crypto.subtle no existe sirviendo por http desde una IP de red. Debe
// explicarlo, no fallar con «undefined».
montar({ conCripto: false });
const doc3 = document;
pedirAcceso({ acceso: doc3.querySelector('#acceso'), contenido: doc3.querySelector('#contenido') });
await esperar(80);
ok(doc3.querySelector('[data-error-acceso]').hidden === false,
   'lo explica en pantalla');
ok(doc3.querySelector('[data-error-acceso]').textContent.includes('localhost'),
   `diciendo qué hace falta → «${doc3.querySelector('[data-error-acceso]').textContent.slice(0, 60)}…»`);
ok(doc3.querySelector('[data-entrar]').disabled === true, 'y deshabilita el botón');
ok(doc3.querySelector('#contenido').hidden === true, 'sin abrir el contenido');

console.log(fallos === 0 ? '\n✔ Todo en verde\n' : `\n✘ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
