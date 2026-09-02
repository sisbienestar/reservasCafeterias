/**
 * La dirección pública, la que va dentro de los avisos por correo.
 *
 * Existe por un fallo concreto: `urlBase()` tenía escrita
 * `https://reservas-kappa-ten.vercel.app` como valor por defecto, el
 * despliegue cambió de nombre, y todos los correos siguieron saliendo con un
 * enlace a un dominio que respondía DEPLOYMENT_NOT_FOUND. Sin fallar, sin
 * avisar, y sin que nada lo delatara — el correo se enviaba «bien».
 *
 * Lo que esta suite sujeta no es el formato de la URL: es el ORDEN en que se
 * pregunta y que NO haya ninguna escrita en el código.
 *
 * ── Por qué registra tsx a mano ──────────────────────────────────────────
 *
 * `ejecutar.mjs` lanza cada suite con `node` a secas, y lo que se prueba aquí
 * vive en TypeScript, en `api/`. Registrar el cargador desde dentro es lo que
 * permite que esta suite entre en las 603 sin cambiar el corredor ni añadirle
 * un caso especial. Es, de momento, la única que mira código de `api/`.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'tsx/esm/api';

register();

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const MODULO = pathToFileURL(
  path.join(AQUI, '..', 'api', '_nucleo', 'notificaciones.ts'),
).href;

/** Las tres que puede haber, para poder dejarlas limpias entre casos. */
const VARIABLES = ['URL_PUBLICA', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL'];

let fallos = 0;
const ok = (condicion, texto) => {
  console.log(`  ${condicion ? 'OK   ' : 'FALLO'} · ${texto}`);
  if (!condicion) fallos += 1;
};

/*
 * Cada caso reimporta el módulo con una marca distinta.
 *
 * `urlBase()` lee `process.env` en cada llamada, así que bastaría con
 * reasignar; se reimporta igualmente para que la prueba siga valiendo el día
 * que alguien decida resolverla una sola vez al cargar, que es un cambio
 * razonable y silencioso.
 */
async function resolver(entorno) {
  for (const v of VARIABLES) delete process.env[v];
  Object.assign(process.env, entorno);
  const { urlBase } = await import(`${MODULO}?caso=${Math.random()}`);
  return urlBase();
}

const CASOS = [
  ['sin nada configurado, cadena vacía', {}, ''],
  ['el dominio de producción del proyecto',
    { VERCEL_PROJECT_PRODUCTION_URL: 'cafeteriasuis.vercel.app' },
    'https://cafeteriasuis.vercel.app'],
  ['una vista previa cae en su propia URL',
    { VERCEL_URL: 'rama-abc.vercel.app' },
    'https://rama-abc.vercel.app'],
  ['producción manda sobre el despliegue',
    { VERCEL_PROJECT_PRODUCTION_URL: 'cafeteriasuis.vercel.app', VERCEL_URL: 'rama-abc.vercel.app' },
    'https://cafeteriasuis.vercel.app'],
  ['URL_PUBLICA manda sobre todo, para un dominio propio',
    { URL_PUBLICA: 'https://cafeterias.uis.edu.co', VERCEL_PROJECT_PRODUCTION_URL: 'cafeteriasuis.vercel.app' },
    'https://cafeterias.uis.edu.co'],
  ['la barra final se quita',
    { URL_PUBLICA: 'https://cafeteriasuis.vercel.app/' },
    'https://cafeteriasuis.vercel.app'],
  ['http se respeta, para el backend local',
    { URL_PUBLICA: 'http://localhost:3001' },
    'http://localhost:3001'],
  ['los espacios sobrantes no cuentan',
    { URL_PUBLICA: '  https://cafeteriasuis.vercel.app  ' },
    'https://cafeteriasuis.vercel.app'],
];

console.log('\n── La dirección pública ──');
for (const [texto, entorno, esperado] of CASOS) {
  const obtenido = await resolver(entorno);
  ok(obtenido === esperado, `${texto} → ${JSON.stringify(obtenido)}`);
}

/*
 * Y la comprobación que de verdad importa: que no quede NINGUNA dirección
 * escrita en el código. Sin esto, los ocho casos de arriba seguirían pasando
 * el día que alguien vuelva a poner un valor por defecto «temporal».
 */
console.log('\n── Ninguna URL escrita en el código ──');
const fs = await import('node:fs');
for (const archivo of [
  path.join(AQUI, '..', 'api', '_nucleo', 'notificaciones.ts'),
  path.join(AQUI, '..', 'api', 'index.ts'),
]) {
  const fuente = fs.readFileSync(archivo, 'utf8');
  // Solo el código: los comentarios SÍ nombran el dominio viejo, y a propósito
  // — es donde se cuenta por qué esto existe.
  const codigo = fuente
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const encontradas = codigo.match(/https?:\/\/[^\s'"`]*vercel\.app/gi) ?? [];
  ok(encontradas.length === 0,
    `${path.basename(archivo)} → ${encontradas.length ? encontradas.join(', ') : 'ninguna'}`);
}

console.log(`\n${fallos ? `${fallos} FALLOS` : 'Todo en orden'}`);
process.exit(fallos ? 1 : 0);
