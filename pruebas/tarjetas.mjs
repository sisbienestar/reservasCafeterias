/** Comprueba que index.html pinta una foto por tarjeta. */
import './fechaFija.mjs';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

let fallos = 0;
const ok = (c, e) => { console.log(`${c ? '  OK  ' : ' FALLO'} · ${e}`); if (!c) fallos++; };

const dom = new JSDOM(readFileSync('banco/index.html', 'utf8'), { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;

await import('./banco/js/paginaInicio.js');
await esperar(700);

const tarjetas = [...document.querySelectorAll('#lista-cafeterias .tarjeta')];
ok(tarjetas.length === 4, `se pintan ${tarjetas.length} tarjetas`);

const fotos = document.querySelectorAll('#lista-cafeterias .tarjeta__imagen');
ok(fotos.length === 4, `${fotos.length} de 4 llevan foto`);
ok(document.querySelectorAll('.tarjeta__inicial').length === 0,
   'ninguna se queda con el marcador de iniciales');

for (const foto of fotos) {
  const src = foto.getAttribute('src');
  // El src es relativo a la raíz del proyecto —así lo resuelve el navegador
  // al abrir index.html— y las suites corren desde pruebas/.
    ok(existsSync(join('..', 'public', src)), `${src} existe en disco`);
  ok(foto.getAttribute('alt') === '', `  alt vacío (decorativa) en ${src.split('/').pop()}`);
  ok(foto.getAttribute('loading') === 'lazy', `  carga diferida en ${src.split('/').pop()}`);
}

for (const t of tarjetas) {
  const nombre = t.querySelector('.tarjeta__nombre').textContent;
  const src = t.querySelector('.tarjeta__imagen').getAttribute('src');
  console.log(`         ${nombre.padEnd(26)} → ${src.split('/').pop()}`);
}

// Una ruta rota debe caer al marcador, no dejar el icono de imagen rota.
const rota = fotos[0];
rota.dispatchEvent(new dom.window.Event('error'));
ok(!rota.isConnected, 'una foto que falla se retira de la tarjeta');
ok(document.querySelectorAll('.tarjeta__inicial').length === 1,
   'y en su hueco aparecen las iniciales');

console.log(fallos === 0 ? '\n✔ Todo en verde\n' : `\n✘ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
