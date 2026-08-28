/**
 * Levanta el proyecto entero con un solo comando.
 *
 *   npm run local
 *
 * Arranca el backend (:3001) y el frontend (:5173) y —esto es lo importante—
 * los mata a los DOS al salir con Ctrl+C.
 *
 * POR QUÉ EXISTE
 * Arrancarlos en dos ventanas funciona hasta que una se cierra sin la otra.
 * Entonces queda un Vite vivo contra un backend muerto, y el síntoma no dice
 * nada útil: la pantalla carga, el diseño está bien, y los datos simplemente
 * no llegan. En la terminal aparece un `ECONNREFUSED` del proxy y en el
 * navegador, nada. Peor todavía si el Vite que sobrevive es de una rama
 * anterior: entonces sirve una aplicación que ya no existe.
 *
 * Además comprueba el puerto ANTES de arrancar. Si algo lo ocupa, lo dice y
 * se para, en vez de dejar que Vite se vaya al 5174 «para no molestar» — que
 * es justo lo que produce dos instancias distintas sirviendo cosas distintas.
 *
 * Sin dependencias, como todo lo que hay aquí.
 */

import { spawn } from 'node:child_process';
import { connect } from 'node:net';

const PUERTOS = { backend: 3001, frontend: 5173 };

/**
 * ¿Hay algo escuchando ahí?
 *
 * Se comprueba CONECTANDO, no intentando ocupar el puerto. Ocuparlo parece lo
 * natural y no sirve en Windows: si el otro proceso escucha en `0.0.0.0` o en
 * `[::1]`, reservar `127.0.0.1` puede tener éxito igualmente, y el comprobador
 * daría el puerto por libre justo cuando no lo está. Si alguien acepta la
 * conexión, está ocupado, y da igual en qué interfaz escuche.
 *
 * Se prueban las dos familias porque Vite escucha en IPv6 (`[::1]`) y el
 * backend en las dos: mirar solo una deja pasar la mitad de los casos.
 */
function ocupado(puerto) {
  const probar = (anfitrion) => new Promise((resolver) => {
    const zocalo = connect({ port: puerto, host: anfitrion });
    const terminar = (valor) => { zocalo.destroy(); resolver(valor); };
    zocalo.setTimeout(700);
    zocalo.once('connect', () => terminar(true));
    zocalo.once('error', () => terminar(false));
    zocalo.once('timeout', () => terminar(false));
  });
  return Promise.all([probar('127.0.0.1'), probar('::1')])
    .then((r) => r.some(Boolean));
}

for (const [nombre, puerto] of Object.entries(PUERTOS)) {
  if (await ocupado(puerto)) {
    console.error(`\nEl puerto ${puerto} (${nombre}) ya está ocupado.`);
    console.error('Casi seguro es una instancia de una sesión anterior. Para liberarlo:\n');
    console.error(`  PowerShell:  Get-NetTCPConnection -LocalPort ${Object.values(PUERTOS).join(',')} ` +
                  '-State Listen |');
    console.error('                 Select-Object -ExpandProperty OwningProcess -Unique |');
    console.error('                 ForEach-Object { Stop-Process -Id $_ -Force }\n');
    process.exit(1);
  }
}

/** Espera a que el backend conteste antes de arrancar el frontend. */
async function esperarBackend(intentos = 40) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(`http://localhost:${PUERTOS.backend}`, { signal: AbortSignal.timeout(1000) });
      if (r.ok) return true;
    } catch { /* todavía no */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const hijos = [];

function arrancar(etiqueta, guion) {
  // `shell: true` porque en Windows `npm` es un .cmd y spawn no lo resuelve solo.
  const hijo = spawn('npm', ['run', guion], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefijo = `[${etiqueta}]`;
  const escribir = (flujo, destino) => {
    flujo.setEncoding('utf8');
    flujo.on('data', (t) => {
      for (const linea of t.split('\n')) if (linea.trim()) destino.write(`${prefijo} ${linea}\n`);
    });
  };
  escribir(hijo.stdout, process.stdout);
  escribir(hijo.stderr, process.stderr);

  // Si uno de los dos se cae, se para todo. Seguir con la mitad viva es
  // exactamente el estado confuso que este guion viene a evitar.
  hijo.on('exit', (codigo) => {
    if (!cerrando) {
      console.error(`\n${prefijo} terminó con código ${codigo}. Parando lo demás.\n`);
      parar(codigo ?? 1);
    }
  });

  hijos.push(hijo);
  return hijo;
}

let cerrando = false;
function parar(codigo = 0) {
  if (cerrando) return;
  cerrando = true;
  for (const hijo of hijos) {
    // En Windows hay que matar el árbol: `npm run` lanza a su vez node, y
    // matar solo al padre deja al nieto escuchando el puerto. Eso es lo que
    // dejaba zombis.
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(hijo.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      hijo.kill('SIGTERM');
    }
  }
  setTimeout(() => process.exit(codigo), 600);
}

process.on('SIGINT', () => { console.log('\nParando los dos…'); parar(0); });
process.on('SIGTERM', () => parar(0));

console.log('Arrancando el backend…');
arrancar('backend', 'backend-local');

if (!(await esperarBackend())) {
  console.error('\nEl backend no respondió. Revisa que .env.local tenga las claves de Supabase.\n');
  parar(1);
} else {
  console.log(`Backend listo en http://localhost:${PUERTOS.backend}`);
  console.log('Arrancando el frontend…\n');
  arrancar('frontend', 'dev');
  console.log(`\n  Abre http://localhost:${PUERTOS.frontend}`);
  console.log('  Ctrl+C para parar los DOS.\n');
}
