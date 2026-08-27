/** Prueba de interfaz: monta las páginas reales en jsdom y las opera. */

import './fechaFija.mjs';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

let fallos = 0;
const ok = (c, e) => { console.log(`${c ? '  OK  ' : ' FALLO'} · ${e}`); if (!c) fallos++; };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Deja una página cargada en los globales que usan los módulos. */
function montar(archivo) {
  // jsdom no sabe navegar, y `<a download>.click()` cuenta como navegación:
  // se silencia ese error concreto, que es una limitación del entorno de
  // prueba y no algo que le pase al navegador real.
  const consola = new (require('jsdom').VirtualConsole)();
  consola.on('jsdomError', (e) => {
    if (!String(e.message).includes('Not implemented: navigation')) console.error(e.message);
  });

  const dom = new JSDOM(readFileSync(archivo, 'utf8'), {
    url: 'http://localhost/',
    virtualConsole: consola,
  });
  const { window } = dom;

  // jsdom no implementa el modal nativo ni las descargas: se sustituyen por
  // lo mínimo para que el código bajo prueba corra. Lo que se comprueba es la
  // lógica de la página, no la implementación del navegador.
  const proto = window.HTMLDialogElement.prototype;
  proto.showModal = function () { this.open = true; };
  proto.close = function () {
    this.open = false;
    this.dispatchEvent(new window.Event('close'));
  };
  const descargas = [];
  window.URL.createObjectURL = (blob) => { descargas.push(blob); return 'blob:x'; };
  window.URL.revokeObjectURL = () => {};

  globalThis.window = window;
  globalThis.document = window.document;
  // El Blob de jsdom no expone .text(): se envuelve para poder leer el CSV.
  globalThis.Blob = class extends window.Blob {
    constructor(partes, opciones) { super(partes, opciones); this.texto = partes.join(''); }
  };
  globalThis.URL = window.URL;
  globalThis.Event = window.Event;
  globalThis.navigator = window.navigator;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.sessionStorage = window.sessionStorage;

  // admin.html arranca detrás del pestillo. Estas pruebas van sobre lo que
  // hay DENTRO, así que se entra con la sesión ya abierta; la puerta en sí la
  // ejercita acceso.mjs.
  window.sessionStorage.setItem('reservasCafeterias.admin', 'ok');

  return { window, descargas };
}

const clic = (nodo) => nodo.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const cambiar = (nodo) => nodo.dispatchEvent(new window.Event('change', { bubbles: true }));

/** El diálogo de confirmación que está abierto ahora mismo, o null. */
const dialogoConfirmacion = () => document.querySelector('.modal--confirmacion');
const botonesConfirmacion = () => [...dialogoConfirmacion().querySelectorAll('.modal__pie button')];

/** Espera a que aparezca el diálogo y pulsa confirmar (o volver). */
async function responderConfirmacion(aceptar = true) {
  await esperar(60);
  const [volver, aceptarBoton] = botonesConfirmacion();
  clic(aceptar ? aceptarBoton : volver);
  await esperar(60);
}

/* ── Página de mostrador ──────────────────────────────────────────────── */

console.log('── reserva.html ──');
montar('banco/reserva.html');
window.history.replaceState({}, '', '/reserva.html?cafeteria=bienestar-pro');

await import('./banco/js/paginaReserva.js');
await esperar(900);

const doc = document;
ok(doc.querySelector('#nombre-cafeteria').textContent === 'Bienestar Pro',
   `cabecera → ${doc.querySelector('#nombre-cafeteria').textContent}`);

const filasAntes = doc.querySelectorAll('#contenedor-tabla tbody tr').length;
ok(filasAntes > 0, `la tabla del día pinta ${filasAntes} filas`);

const dialogo = doc.querySelector('#dialogo-reserva');
ok(!!dialogo, 'el modal compartido se montó desde JS');
ok(!!dialogo.querySelector('#campo-telefono'), 'el modal trae el campo de móvil');
ok(!dialogo.querySelector('#campo-turno'), 'y ya no trae el de turno');

clic(doc.querySelector('#boton-reservar'));
await esperar(600);
ok(dialogo.open === true, 'el botón abre el modal');
const opcionesMenu = dialogo.querySelectorAll('#campo-menu option').length;
ok(opcionesMenu > 1, `el menú del día se rellenó (${opcionesMenu - 1} platos)`);
ok(doc.querySelector('#titulo-modal').textContent === 'Registrar reserva',
   'el modal abre en modo creación');

dialogo.querySelector('#campo-nombre').value = 'Prueba Automatizada';
dialogo.querySelector('#campo-telefono').value = '300 555 4433';
dialogo.querySelector('#campo-menu').value = dialogo.querySelectorAll('#campo-menu option')[1].value;
dialogo.querySelector('#campo-medio-presencial').checked = true;
dialogo.querySelector('#campo-pago-pagado').checked = true;
dialogo.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await esperar(900);

ok(dialogo.open === false, 'al confirmar, el modal se cierra');
const aviso = doc.querySelector('#aviso');
ok(!aviso.hidden && aviso.textContent.includes('Reserva registrada'),
   `aviso → «${aviso.textContent}»`);
ok(doc.querySelectorAll('#contenedor-tabla tbody tr').length === filasAntes + 1,
   'la tabla se recarga con la nueva fila');

// Validación: el móvil mal escrito no llega al servicio.
clic(doc.querySelector('#boton-reservar'));
await esperar(600);
dialogo.querySelector('#campo-nombre').value = 'Otra Persona';
dialogo.querySelector('#campo-telefono').value = '123';
dialogo.querySelector('#campo-menu').value = dialogo.querySelectorAll('#campo-menu option')[1].value;
dialogo.querySelector('#campo-medio-presencial').checked = true;
dialogo.querySelector('#campo-pago-pagado').checked = true;
dialogo.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await esperar(400);
ok(dialogo.open === true, 'con un móvil inválido el modal no se cierra');
ok(dialogo.querySelector('[data-error="telefono"]').textContent.length > 0,
   `y marca el campo: «${dialogo.querySelector('[data-error="telefono"]').textContent}»`);
dialogo.querySelector('[data-cerrar]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

// Editar: el modal cambia de modo y muestra el historial.
const botonEditar = [...doc.querySelectorAll('#contenedor-tabla button')]
  .find((b) => b.textContent === 'Editar');
clic(botonEditar);
await esperar(700);
ok(doc.querySelector('#titulo-modal').textContent === 'Editar reserva', 'el modal abre en modo edición');
ok(dialogo.querySelector('#campo-nombre').value.length > 0, 'con los datos ya cargados');
ok(!dialogo.querySelector('[data-historial]').hidden, 'y con el historial visible');
ok(dialogo.querySelectorAll('[data-historial-lista] li').length > 0,
   `el historial trae ${dialogo.querySelectorAll('[data-historial-lista] li').length} asiento(s)`);


// Desde el mostrador NO se cancela: eso vive en administración. «Editar» y
// «Ticket» sí están, que no destruyen nada.
ok([...doc.querySelectorAll('#contenedor-tabla tbody button')]
     .every((b) => ['Editar', 'Ticket'].includes(b.textContent)),
   'la fila ofrece «Editar» y «Ticket», y nada más');
ok([...doc.querySelectorAll('#contenedor-tabla tbody button')]
     .some((b) => b.textContent === 'Ticket'),
   'el ticket se abre desde la fila, sin pasar por el formulario');
ok(dialogo.querySelector('[data-cancelar-reserva]').hidden === true,
   'y al editar tampoco aparece «Cancelar reserva»');
ok(dialogo.querySelectorAll('.modal__pie [data-cerrar]').length === 0,
   'el pie no lleva botón de cerrar: para eso está la × de arriba');
ok(dialogo.querySelectorAll('.modal__cabecera [data-cerrar]').length === 1,
   'que sigue en su sitio');
// «Ver ticket» sí, y aquí es donde tiene que estar: el aviso de «reserva
// registrada» ofrece el ticket una sola vez y desaparece con la siguiente
// acción, así que este formulario es la única puerta de vuelta.
ok([...dialogo.querySelectorAll('.modal__pie button')]
     .filter((b) => !b.hidden).map((b) => b.textContent).join('|') === 'Guardar cambios',
   'editando, el pie se queda solo con «Guardar cambios»');

// Ni siquiera forzando el clic desde fuera: el modal no tiene a quién llamar.
const filasPrevias = doc.querySelectorAll('#contenedor-tabla tbody tr').length;
clic(dialogo.querySelector('[data-cancelar-reserva]'));
await esperar(400);
ok(!dialogoConfirmacion() || dialogoConfirmacion().open === false,
   'pulsarlo a la fuerza no abre ninguna confirmación');
ok(doc.querySelectorAll('#contenedor-tabla tbody tr').length === filasPrevias,
   'y la reserva sigue en pie');

dialogo.querySelector('.modal__cabecera [data-cerrar]').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true }));
await esperar(100);

// En modo creación tampoco, claro.
clic(doc.querySelector('#boton-reservar'));
await esperar(600);
ok(dialogo.querySelector('[data-cancelar-reserva]').hidden === true,
   'al registrar una nueva tampoco aparece');
ok([...dialogo.querySelectorAll('.modal__pie button')]
     .filter((b) => !b.hidden).map((b) => b.textContent).join('|') === 'Registrar reserva',
   'y el pie se queda con un único botón visible: «Registrar reserva»');
dialogo.querySelector('.modal__cabecera [data-cerrar]').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true }));
await esperar(100);

/* ── Página de administración ─────────────────────────────────────────── */

console.log('\n── admin.html ──');
const { descargas } = montar('banco/admin.html');
await import('./banco/js/paginaAdmin.js');
await esperar(1200);

const a = document;
ok(a.querySelectorAll('#filtro-cafeteria option').length === 5,
   `el filtro de cafeterías se pobló (${a.querySelectorAll('#filtro-cafeteria option').length - 1} sedes)`);
ok(a.querySelector('#filtro-desde').value !== '', `periodo por defecto: ${a.querySelector('#filtro-desde').value} → ${a.querySelector('#filtro-hasta').value}`);

const filasAdmin = a.querySelectorAll('#tabla-reservas tbody tr').length;
ok(filasAdmin > 0, `la tabla de detalle pinta ${filasAdmin} filas`);
ok(a.querySelector('#tabla-reservas caption').textContent.includes('reservas encontradas'),
   `pie de tabla → «${a.querySelector('#tabla-reservas caption').textContent}»`);
ok(a.querySelectorAll('#tabla-reservas .marca-estado').length === filasAdmin,
   'cada fila lleva su marca de estado con texto');

console.log('\n── Filtros ──');
a.querySelector('#filtro-periodo').value = 'hoy';
cambiar(a.querySelector('#filtro-periodo'));
await esperar(800);
const hoyISO = new Date().toISOString().slice(0, 10);
ok(a.querySelector('#filtro-desde').value === a.querySelector('#filtro-hasta').value,
   'el preset «Hoy» iguala las dos fechas');
const filasHoy = a.querySelectorAll('#tabla-reservas tbody tr').length;
ok(filasHoy > 0 && filasHoy < filasAdmin, `«Hoy» reduce a ${filasHoy} filas`);

a.querySelector('#filtro-desde').value = '2020-01-01';
cambiar(a.querySelector('#filtro-desde'));
ok(a.querySelector('#filtro-periodo').value === 'personalizado',
   'tocar una fecha a mano pasa el periodo a «personalizado»');

a.querySelector('#filtro-periodo').value = '30';
cambiar(a.querySelector('#filtro-periodo'));
await esperar(800);
a.querySelector('#filtro-estado').value = 'cancelada';
a.querySelector('#filtros').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await esperar(800);
const marcas = [...a.querySelectorAll('#tabla-reservas .marca-estado')].map((m) => m.textContent);
ok(marcas.length > 0 && marcas.every((m) => m === 'Cancelada'), 'el filtro de estado deja solo canceladas');
ok([...a.querySelectorAll('#tabla-reservas tbody tr')].every((f) => f.querySelectorAll('button').length === 0),
   'y una cancelada no ofrece botones de editar ni cancelar');

a.querySelector('#filtro-estado').value = '';
a.querySelector('#filtros').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await esperar(800);

console.log('\n── Consolidado ──');
clic(a.querySelector('#pestana-consolidado'));
await esperar(300);
ok(a.querySelector('#vista-consolidado').hidden === false, 'la pestaña se muestra');
ok(a.querySelector('#vista-reservas').hidden === true, 'y oculta la anterior');
ok(a.querySelector('#pestana-consolidado').getAttribute('aria-selected') === 'true',
   'aria-selected se actualiza');
ok(a.querySelector('#filtros').hidden === false, 'los filtros siguen visibles aquí');

const indicadores = a.querySelectorAll('#indicadores .indicador');
ok(indicadores.length === 4, `${indicadores.length} indicadores`);
ok(indicadores[0].querySelector('.indicador__valor').textContent !== '0', 'con valores reales');

const svgs = a.querySelectorAll('#cuerpo-consolidado svg');
ok(svgs.length === 3, `${svgs.length} gráficas dibujadas`);
ok([...svgs].every((s) => s.namespaceURI === 'http://www.w3.org/2000/svg'),
   'creadas en el espacio de nombres SVG (dibujan de verdad)');
const barras = a.querySelectorAll('#cuerpo-consolidado path.grafica__dato');
ok(barras.length > 0, `${barras.length} marcas de dato`);
ok([...svgs].every((s) => s.getAttribute('aria-label')), 'cada gráfica tiene aria-label');
ok(a.querySelectorAll('#cuerpo-consolidado table').length === 3,
   'cada gráfica va acompañada de su tabla de valores');

console.log('\n── Exportación ──');
clic(a.querySelector('#boton-exportar'));
await esperar(1200);
ok(descargas.length === 1, 'se generó un archivo');
const texto = descargas[0].texto;
const lineas = texto.trim().split('\r\n');
ok(texto.charCodeAt(0) === 0xfeff, 'empieza con BOM UTF-8 (Excel lee bien las tildes)');
ok(lineas[0] === 'sep=;', `declara el separador → «${lineas[0]}»`);
ok(lineas[1].startsWith('N.º de reserva;Fecha;Cafetería'),
   `cabeceras → «${lineas[1].slice(0, 46)}…»`);
ok(lineas[1].includes(';Medio;Pago;'), 'el CSV incluye medio y pago');
const totalTexto = a.querySelector('#tabla-reservas caption')?.textContent ?? '';
ok(lineas.length - 2 > 500, `exporta ${lineas.length - 2} filas, más que las 500 de la pantalla`);

console.log('\n── Catálogo ──');
clic(a.querySelector('#pestana-catalogo'));
await esperar(1200);
ok(a.querySelector('#filtros').hidden === true, 'los filtros se retiran en Catálogo');
ok(a.querySelectorAll('#tabla-cafeterias tbody tr').length === 4,
   `la tabla lista ${a.querySelectorAll('#tabla-cafeterias tbody tr').length} cafeterías`);
ok(a.querySelectorAll('#rejilla-carta .dia-carta').length === 7,
   'la carta semanal muestra los 7 días');
ok(!a.querySelector('#carta-cafeteria'),
   'ya no hay selector de cafetería: la carta es la misma para todas');
ok(a.querySelector('#rotulo-semana').textContent.includes('–'),
   `rótulo de semana → «${a.querySelector('#rotulo-semana').textContent}»`);
ok(a.querySelectorAll('#rejilla-carta button').length === 0,
   'ningún botón por día: se guarda la semana entera de una vez');
ok(a.querySelectorAll('.dia-carta--sin-servicio').length === 2,
   'sábado y domingo se marcan como sin servicio');
ok([...a.querySelectorAll('.dia-carta--sin-servicio textarea')].every((t) => t.readOnly),
   'y sus cajas son de solo lectura');
ok([...a.querySelectorAll('.dia-carta--sin-servicio .dia-carta__estado')]
     .every((e) => e.textContent === 'Sin servicio'),
   'rotuladas «Sin servicio»');

const areas = [...a.querySelectorAll('#rejilla-carta textarea')];
ok(areas[0].value.split('\n').filter(Boolean).length > 0, 'con los platos ya cargados');
ok(a.querySelectorAll('.dia-carta__estado').length === 7, 'cada día muestra su estado');
ok(/plato/.test(a.querySelector('.dia-carta__estado').textContent),
   `estado inicial → «${a.querySelector('.dia-carta__estado').textContent}»`);

areas[0].value = 'Sopa de prueba\nSegundo de prueba';
areas[0].dispatchEvent(new window.Event('input', { bubbles: true }));
ok(a.querySelector('.dia-carta__estado').textContent === 'Sin guardar',
   'al escribir, el día se marca como pendiente');
ok(a.querySelectorAll('.dia-carta__estado--pendiente').length === 1,
   'y solo ese día');

clic(a.querySelector('#boton-guardar-semana'));
await esperar(900);
ok(a.querySelector('#aviso-carta').textContent.includes('Carta guardada'),
   `guardar la semana confirma → «${a.querySelector('#aviso-carta').textContent}»`);
ok(a.querySelectorAll('.dia-carta__estado--pendiente').length === 0,
   'y las marcas de pendiente desaparecen');
ok(a.querySelectorAll('#rejilla-carta textarea')[0].value === 'Sopa de prueba\nSegundo de prueba',
   'lo escrito se conserva');

const antesDeCopiar = [...a.querySelectorAll('#rejilla-carta textarea')].map((t) => t.value);
clic(a.querySelector('#boton-copiar-semana'));
await esperar(900);
const despuesDeCopiar = [...a.querySelectorAll('#rejilla-carta textarea')].map((t) => t.value);
ok(antesDeCopiar.join('|') !== despuesDeCopiar.join('|'),
   'copiar la semana anterior rellena las cajas');
ok(a.querySelectorAll('.dia-carta__estado--pendiente').length > 0,
   'y las deja pendientes: copiar no es publicar');
ok(a.querySelector('#aviso-carta').textContent.includes('Guardar semana'),
   'avisando de que hay que guardar');

a.querySelector('#cafeteria-nombre').value = 'Cafetería Deportes';
a.querySelector('#formulario-cafeteria').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await esperar(1200);
ok(a.querySelector('#aviso-cafeteria').textContent.includes('cafeteria-deportes'),
   `crear cafetería → «${a.querySelector('#aviso-cafeteria').textContent}»`);
ok(a.querySelectorAll('#tabla-cafeterias tbody tr').length === 5, 'aparece en la tabla');

const semanaAntes = a.querySelector('#rotulo-semana').textContent;
clic(a.querySelector('#semana-anterior'));
ok(dialogoConfirmacion().open === true, 'cambiar de semana con cambios pendientes avisa antes');
await responderConfirmacion(true);
await esperar(700);
ok(a.querySelector('#rotulo-semana').textContent !== semanaAntes,
   `navegar cambia de semana → «${a.querySelector('#rotulo-semana').textContent}»`);

console.log('\n── Cerrar y reabrir una cafetería ──');
const botonCerrar = [...a.querySelectorAll('#tabla-cafeterias button')]
  .find((b) => b.textContent === 'Cerrar');
clic(botonCerrar);
await responderConfirmacion(true);
await esperar(1400);
ok(a.querySelectorAll('#tabla-cafeterias tbody tr').length === 5,
   'la cerrada sigue en la tabla del administrador');
ok([...a.querySelectorAll('#tabla-cafeterias .marca-estado')].some((m) => m.textContent === 'Cerrada'),
   'marcada como «Cerrada»');
ok([...a.querySelectorAll('#filtro-cafeteria option')].some((o) => o.textContent.includes('(cerrada)')),
   'y el filtro la conserva, rotulada, para consultar su histórico');
ok([...a.querySelectorAll('#tabla-cafeterias button')].some((b) => b.textContent === 'Reabrir'),
   'ofrece reabrirla');
console.log('\n── Cancelar desde administración ──');
clic(a.querySelector('#pestana-reservas'));
await esperar(200);
a.querySelector('#filtro-periodo').value = 'hoy';
cambiar(a.querySelector('#filtro-periodo'));
await esperar(900);

ok([...a.querySelectorAll('#tabla-reservas tbody button')]
     .every((b) => ['Editar', 'Ticket'].includes(b.textContent)),
   'tampoco aquí hay «Cancelar» en la fila: solo «Editar» y «Ticket»');

const filaActiva = [...a.querySelectorAll('#tabla-reservas tbody tr')]
  .find((f) => [...f.querySelectorAll('button')].some((b) => b.textContent === 'Editar'));
const nombreCancelado = filaActiva.querySelector('.tabla__nombre').textContent;

clic([...filaActiva.querySelectorAll('button')].find((b) => b.textContent === 'Editar'));
await esperar(900);
const modalAdmin = a.querySelector('#dialogo-reserva');
ok(modalAdmin.open === true, 'se abre el modal de edición');
const cancelarAdmin = modalAdmin.querySelector('[data-cancelar-reserva]');
ok(cancelarAdmin.hidden === false, 'con «Cancelar reserva» dentro');

clic(cancelarAdmin);
await esperar(60);
ok(a.querySelector('.confirmacion__mensaje').textContent.includes(nombreCancelado),
   'el mensaje nombra a la persona afectada');
const [volver, aceptar] = botonesConfirmacion();
ok(aceptar.textContent === 'Sí, cancelar la reserva',
   'el botón dice qué hace');
ok(aceptar.classList.contains('boton--peligro'), 'y va marcado como destructivo');
ok(a.activeElement === volver, 'el foco arranca en la salida segura');

await responderConfirmacion(false);
ok(modalAdmin.open === true, 'decir que no vuelve a la edición');

clic(cancelarAdmin);
await responderConfirmacion(true);
await esperar(1000);
ok(modalAdmin.open === false, 'confirmar cierra el modal');
ok(a.querySelector('#aviso').textContent.includes('cancelada'),
   `y avisa → «${a.querySelector('#aviso').textContent}»`);
const filaTrasCancelar = [...a.querySelectorAll('#tabla-reservas tbody tr')]
  .find((f) => f.querySelector('.tabla__nombre').textContent === nombreCancelado);
ok(filaTrasCancelar.querySelector('.marca-estado').textContent === 'Cancelada',
   'y la fila pasa a «Cancelada»');
ok(filaTrasCancelar.querySelectorAll('button').length === 0,
   'perdiendo su botón de editar');

console.log(fallos === 0 ? '\n✔ Todo en verde\n' : `\n✘ ${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
