/**
 * Capturas de pantalla del panel, para poder MIRAR lo que se ha hecho.
 *
 *   npm run capturas              · las seis vistas del análisis
 *   npm run capturas -- --ancho 1400
 *
 * Existe porque los tres primeros intentos de ajustar el análisis se hicieron
 * a ciegas, y dos de ellos fallaron por lo mismo: se puede comprobar que el
 * HTML es correcto, que el CSS compila y que las cifras cuadran, y aun así
 * entregar una pantalla que se ve mal. El caso concreto fue un `viewBox` de
 * 1000 unidades estirado a 1740 px: ni el tipado ni las pruebas ni el DOM
 * dicen nada, y sin embargo todo se dibujaba un 74 % más grande.
 *
 * ── Dos decisiones ────────────────────────────────────────────────────────
 *
 * 1. Usa `playwright-core` y CONDUCE EL CHROME QUE YA ESTÁ INSTALADO, en vez
 *    de `playwright` con sus navegadores propios: son unos 3 MB en lugar de
 *    unos 400, y para mirar una pantalla no hace falta un navegador aparte.
 *
 * 2. La sesión se INYECTA en localStorage en vez de rellenar el formulario.
 *    Escribir en el formulario probaría el acceso, que ya tiene sus pruebas;
 *    aquí lo que se quiere es llegar a la pantalla. La cuenta es temporal y
 *    se borra al terminar, pase lo que pase.
 *
 * No es una prueba: no afirma nada ni falla si algo se ve raro. Es un par de
 * ojos. Lo que decide si está bien es mirar los PNG de `capturas/`.
 */

import '../supabase/websocketDeNode.mjs';

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  console.error('Faltan SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y SUPABASE_ANON_KEY.');
  process.exit(1);
}

const argumento = (nombre, porDefecto) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? porDefecto : process.argv[i + 1];
};

const BASE = argumento('base', 'http://localhost:5173');
const ANCHO = Number(argumento('ancho', 1600));
const ALTO = Number(argumento('alto', 1000));
const SALIDA = path.resolve('capturas');

/* La cuenta desechable. Nace, mira y se borra: dejar un admin de más en la
 * base «por si acaso» es exactamente cómo aparecen las cuentas que nadie
 * recuerda haber creado. */
const CORREO = 'capturas@reservas.local';
const CLAVE = 'capturas-' + 'temporal-2026-!aB';

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const publico = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function cuentaTemporal() {
  const { data: lista } = await admin.auth.admin.listUsers();
  let usuario = lista.users.find((u) => u.email === CORREO);
  if (!usuario) {
    const { data, error } = await admin.auth.admin.createUser({
      email: CORREO, password: CLAVE, email_confirm: true,
    });
    if (error) throw error;
    usuario = data.user;
  }
  // `admin` sin sede: lo exige `perfil_sede_segun_rol` en 01-esquema.sql.
  await admin.from('perfil').upsert({
    usuario_id: usuario.id, nombre: 'Capturas', rol: 'admin', cafeteria_id: null,
  });

  const { data, error } = await publico.auth.signInWithPassword({ email: CORREO, password: CLAVE });
  if (error) throw error;
  return { usuario, sesion: data.session };
}

/** La clave con la que supabase-js guarda la sesión: `sb-<ref>-auth-token`. */
function claveDeSesion(url) {
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
}

const VISTAS = [
  ['1-por-cafeteria', 'Por cafetería'],
  ['2-tendencia', 'Tendencia'],
  ['3-productos', 'Productos'],
  ['4-estacionalidad', 'Estacionalidad'],
  ['5-composicion', 'Composición'],
  ['6-consistencia', 'Consistencia'],
];

/*
 * Pantallas sueltas, fuera del análisis. Se piden por URL porque llegar a
 * ellas pinchando exigiría elegir sede y proveedor, y lo que se quiere mirar
 * es la pantalla, no el camino.
 *
 * Van las dos plantillas: el FBE.04 del almacén interno y el FBE.34 del
 * proveedor externo. Sus formularios NO tienen las mismas columnas, así que
 * mirar solo una deja la otra sin comprobar.
 */
const PANTALLAS = [
  ['7-pedido-fbe04', '/pedidos/almacen-alimentos'],
  ['8-pedido-fbe34', '/pedidos/ramo'],
  // El impreso, que es la otra mitad del asunto: aquí las columnas del
  // almacén SÍ tienen que seguir saliendo, en blanco, para rellenar a mano.
  ['9-documento-fbe04', '/pedidos/documento/9'],
  // Un borrador abierto: ejercita la carga de cantidades a las casillas, que
  // es el otro sitio que tocó quitar las columnas del almacén.
  ['10-borrador', '/pedidos/editar/14'],
];

/**
 * Pulsa una pestaña y comprueba que de verdad quedó seleccionada.
 *
 * `aria-selected` es la comprobación correcta porque es lo mismo que lee quien
 * usa un lector de pantalla: si dice que no está seleccionada, no lo está. Un
 * `click()` a secas solo garantiza que el botón era pulsable.
 *
 * Los reintentos no han hecho falta hasta ahora — se dejan porque el coste es
 * cero y porque el día que uno haga falta, el mensaje dirá qué pestaña fue en
 * vez de dejar un plazo agotado cuatro pantallas más allá.
 */
async function pulsarPestana(pestana, intentos = 3) {
  for (let i = 0; i < intentos; i += 1) {
    await pestana.click();
    if (await pestana.getAttribute('aria-selected') === 'true') return;
    await pestana.page().waitForTimeout(300);
  }
  throw new Error('La pestaña no quedó seleccionada.');
}

/**
 * Espera a que la pantalla tenga sus datos.
 *
 * Hace falta `networkidle` y no solo esperar al nodo, y el motivo se midió:
 * React en desarrollo monta cada efecto DOS VECES (StrictMode), así que
 * `pedidos.analisis` sale por duplicado. `usePeticion` descarta por vieja la
 * respuesta de la primera y solo pinta con la segunda — que es la que llega
 * tarde. En un Chrome recién abierto esa segunda pasaba de los 20 segundos y
 * el arnés moría esperando un nodo que iba a aparecer.
 *
 * Es un artefacto del modo desarrollo, no un fallo de la aplicación: en
 * producción no hay StrictMode y la petición sale una sola vez.
 */
async function esperarDatos(pagina, selector) {
  await pagina.waitForLoadState('networkidle');
  await pagina.locator(selector).first().waitFor({ timeout: 30_000 });
}

let usuario = null;
let navegador = null;

try {
  console.log('Creando la cuenta temporal…');
  const { usuario: u, sesion } = await cuentaTemporal();
  usuario = u;

  console.log(`Abriendo Chrome en ${ANCHO}×${ALTO}…`);
  navegador = await chromium.launch({ channel: 'chrome' });
  const contexto = await navegador.newContext({
    viewport: { width: ANCHO, height: ALTO },
    deviceScaleFactor: 1,
  });

  // Antes de que cargue nada: la sesión ya en su sitio.
  await contexto.addInitScript(
    ([clave, valor]) => window.localStorage.setItem(clave, valor),
    [claveDeSesion(SUPABASE_URL), JSON.stringify(sesion)],
  );

  const pagina = await contexto.newPage();
  const problemas = [];
  pagina.on('console', (m) => { if (m.type() === 'error') problemas.push(m.text()); });
  pagina.on('pageerror', (e) => problemas.push(String(e)));

  fs.mkdirSync(SALIDA, { recursive: true });

  await pagina.goto(`${BASE}/pedidos/admin`, { waitUntil: 'networkidle' });
  // Acotado a su barra: «Productos» es a la vez pestaña del panel y vista
  // del análisis, y sin acotar el selector encuentra las dos.
  const pestanasPanel = pagina.getByLabel('Secciones del panel de pedidos');
  await pulsarPestana(pestanasPanel.getByRole('tab', { name: 'Análisis' }));

  // A que lleguen los datos: los indicadores solo existen con respuesta.
  await esperarDatos(pagina, '.rejilla-indicadores');

  for (const [archivo, etiqueta] of VISTAS) {
    await pulsarPestana(pagina.getByLabel('Vistas del análisis').getByRole('tab', { name: etiqueta }));
    // El desplazamiento al cambiar de vista es suave: hay que dejarlo acabar
    // o la captura sale a media transición.
    await pagina.waitForTimeout(700);

    await pagina.screenshot({ path: path.join(SALIDA, `${archivo}-ventana.png`) });
    await pagina.screenshot({ path: path.join(SALIDA, `${archivo}-completa.png`), fullPage: true });

    const alto = await pagina.evaluate(() => document.documentElement.scrollHeight);
    const graficas = await pagina.locator('.grafica__lienzo').all();
    const medidas = [];
    for (const g of graficas) {
      const caja = await g.boundingBox();
      if (caja) medidas.push(`${Math.round(caja.width)}×${Math.round(caja.height)}`);
    }
    console.log(`  ${etiqueta.padEnd(15)} página ${alto} px · gráficas: ${medidas.join(', ') || '(ninguna)'}`);
  }

  for (const [archivo, ruta] of PANTALLAS) {
    await pagina.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle' });
    const tabla = pagina.locator('table.tabla--pedido, table.documento__tabla').first();
    await tabla.waitFor({ timeout: 20_000 });

    await pagina.screenshot({ path: path.join(SALIDA, `${archivo}-ventana.png`) });
    await pagina.screenshot({ path: path.join(SALIDA, `${archivo}-completa.png`), fullPage: true });

    /* Las cabeceras de la tabla, que es justo lo que se ha cambiado: se
     * imprimen para poder leer en la consola qué columnas quedaron, sin
     * tener que abrir el PNG. */
    const columnas = await tabla.locator('thead th').allInnerTexts();
    const campos = await tabla.locator('tbody input').count();
    const filas = await tabla.locator('tbody tr').count();
    console.log(`  ${archivo.padEnd(15)} ${filas} filas · ${campos} campos · columnas: ${columnas.join(' | ')}`);

    /* La línea de estado, cuando la pantalla la tenga. Se imprime entera
     * porque es texto corto y es justo lo que hay que releer: dice en qué
     * paso está el pedido y qué falta. */
    const estado = pagina.locator('.pasos-pedido');
    if (await estado.count()) {
      console.log(`  ${''.padEnd(15)} estado: «${(await estado.innerText()).replace(/\s+/g, ' ')}»`);
    }
  }

  /*
   * El modal de confirmar el pedido, abierto.
   *
   * Va aparte de `PANTALLAS` porque no es una dirección: hay que pulsar para
   * llegar. Y merece su captura porque es lo único de la aplicación que se
   * pinta ENCIMA de todo lo demás: un `z-index` mal puesto o un panel sin
   * fondo no se ven en ninguna otra pantalla.
   */
  await pagina.goto(`${BASE}/pedidos/documento/9`, { waitUntil: 'networkidle' });
  const envioFinal = pagina.getByRole('button', { name: 'Confirmar pedido' });
  if (await envioFinal.count()) {
    await envioFinal.click();
    await pagina.waitForTimeout(400);
    await pagina.screenshot({ path: path.join(SALIDA, '11-modal-envio-final.png') });
    const abierto = await pagina.locator('dialog[open]').count();
    const enFoco = await pagina.evaluate(() => document.activeElement?.textContent ?? '');
    console.log(`  ${'11-modal'.padEnd(15)} ${abierto} diálogo · foco en «${enFoco}»`);
    await pagina.keyboard.press('Escape');
  } else {
    // El pedido 9 puede estar ya en definitivo si alguien probó el botón.
    console.log(`  ${'11-modal'.padEnd(15)} sin botón: el pedido 9 ya no está en el paso «Enviado»`);
  }

  /* La comprobación que ninguna otra herramienta hace: ¿se sale algo de la
   * ventana a lo ancho? Es el síntoma de un ancho mínimo que no cabe. */
  const desborde = await pagina.evaluate(() => ({
    documento: document.documentElement.scrollWidth,
    ventana: window.innerWidth,
  }));
  console.log(`\nAncho del documento ${desborde.documento} px · ventana ${desborde.ventana} px` +
    (desborde.documento > desborde.ventana ? '  ← SE SALE DE LADO' : '  ✓ sin desbordamiento'));

  if (problemas.length) {
    console.log('\nErrores en la consola del navegador:');
    for (const p of [...new Set(problemas)].slice(0, 10)) console.log(`  · ${p}`);
  }

  console.log(`\nCapturas en ${SALIDA}`);
} finally {
  if (navegador) await navegador.close();
  if (usuario) {
    await admin.auth.admin.deleteUser(usuario.id);
    console.log('Cuenta temporal eliminada.');
  }
}
