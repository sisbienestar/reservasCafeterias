/**
 * CONTRATO.md, ejecutable.
 *
 * Comprueba que un backend cumple lo que el frontend da por sentado. Sirve
 * para el mock de hoy, para Apps Script y para la base de datos de mañana:
 * si sale en verde, la migración está hecha y no hay discusión sobre si
 * «antes funcionaba».
 *
 *   node pruebas/contrato.mjs                      → contra el mock
 *   node pruebas/contrato.mjs <URL>                → contra un backend real
 *   node pruebas/contrato.mjs <URL> --escribir     → incluye las de escritura
 *
 * Sin `--escribir` solo lee, así que es seguro lanzarlo contra el backend en
 * uso. Con `--escribir` crea datos, y por eso trabaja **entero dentro de una
 * semana de enero de 2020**: ninguna reserva real vive ahí. Al terminar borra
 * la carta que publicó; las reservas que creó quedan canceladas con esa fecha
 * de 2020, porque el borrado del sistema es lógico y no hay forma de quitarlas
 * —y no debería haberla.
 *
 * Node 18 o superior (usa `fetch`). Sin dependencias.
 */

const argumentos = process.argv.slice(2);
// Lo que empieza por «--» es bandera; lo demás, la URL del backend.
const banderas = argumentos.filter((a) => a.startsWith('--'));
const url = argumentos.find((a) => !a.startsWith('--')) || '';
const escribir = banderas.includes('--escribir') || !url;

/**
 * Reconoce que el interruptor de pruebas `PERMITIR_FIN_DE_SEMANA` está
 * encendido.
 *
 * Sin esta bandera, un backend que acepte reservas en sábado se considera
 * INCUMPLIMIENTO — que es lo correcto en uso real. Hay que decirlo a
 * propósito, para que nadie confunda «lo tengo en modo pruebas» con «esto
 * está bien».
 */
const sinReglaFinDeSemana = banderas.includes('--sin-regla-fin-de-semana');

let fallos = 0;
let comprobaciones = 0;

function ok(condicion, etiqueta) {
  comprobaciones++;
  console.log(`${condicion ? '  OK  ' : ' FALLO'} · ${etiqueta}`);
  if (!condicion) fallos++;
}

function titulo(texto) {
  console.log(`\n── ${texto} ──`);
}

/* ── Transporte ──────────────────────────────────────────────────────── */

async function crearTransporte() {
  if (!url) {
    const { enviar } = await import('../js/mock/mockApi.js');
    return enviar;
  }

  return async function enviarHttp(accion, params) {
    const respuesta = await fetch(url, {
      method: 'POST',
      // text/plain a propósito: evita el preflight de CORS, que Apps Script
      // no responde. Es lo mismo que hace js/services/httpClient.js.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ accion, params }),
      redirect: 'follow',
    });
    const texto = await respuesta.text();
    try {
      return JSON.parse(texto);
    } catch {
      throw new Error(
        `El backend no devolvió JSON (HTTP ${respuesta.status}). ` +
        `Suele ser el HTML del login de Google: revisa que el despliegue sea ` +
        `«cualquier usuario». Primeros caracteres: ${texto.slice(0, 120)}`,
      );
    }
  };
}

const enviar = await crearTransporte();

async function pedir(accion, params = {}) {
  const sobre = await enviar(accion, params);
  if (!sobre.ok) {
    throw Object.assign(new Error(sobre.error.mensaje), { codigo: sobre.error.codigo });
  }
  return sobre.data;
}

async function esperaError(codigo, etiqueta, accion, params) {
  try {
    await pedir(accion, params);
    ok(false, `${etiqueta} (no devolvió ${codigo})`);
  } catch (error) {
    ok(error.codigo === codigo, `${etiqueta} → ${error.codigo || error.message}`);
  }
}

/* ── Fechas de trabajo ───────────────────────────────────────────────── */

const LUNES = '2020-01-06';   // lunes; ninguna reserva real vive en 2020
const MARTES = '2020-01-07';
const SABADO = '2020-01-11';

const hoy = new Date();
const dosDigitos = (n) => String(n).padStart(2, '0');
const HOY = `${hoy.getFullYear()}-${dosDigitos(hoy.getMonth() + 1)}-${dosDigitos(hoy.getDate())}`;

/* ── Lectura: seguro contra cualquier backend ────────────────────────── */

titulo('El sobre');

const sobreOk = await enviar('cafeterias.listar', {});
ok(sobreOk.ok === true && 'data' in sobreOk, 'éxito → { ok: true, data }');

const sobreMal = await enviar('accion.que.no.existe', {});
ok(sobreMal.ok === false, 'una acción desconocida no revienta: devuelve el sobre');
ok(sobreMal.error && sobreMal.error.codigo === 'ACCION_DESCONOCIDA',
   `con código → ${sobreMal.error && sobreMal.error.codigo}`);
ok(typeof (sobreMal.error || {}).mensaje === 'string' && sobreMal.error.mensaje.length > 0,
   'y con un mensaje legible para el mostrador');

titulo('Cafeterías');

const cafeterias = await pedir('cafeterias.listar');
ok(Array.isArray(cafeterias), 'listar devuelve un arreglo');
ok(cafeterias.length > 0, `hay ${cafeterias.length} cafeterías activas`);

const c = cafeterias[0];
ok(typeof c.id === 'string' && c.id.length > 0, `id es cadena → «${c.id}»`);
ok(typeof c.nombre === 'string', 'nombre es cadena');
ok(typeof c.activa === 'boolean', `activa es BOOLEANO, no texto → ${JSON.stringify(c.activa)}`);
ok('ubicacion' in c && 'imagen' in c, 'trae ubicacion e imagen');

const todas = await pedir('cafeterias.listar', { incluir_inactivas: true });
ok(todas.length >= cafeterias.length, 'incluir_inactivas nunca devuelve menos');

const una = await pedir('cafeterias.obtener', { id: c.id });
ok(una.id === c.id, 'obtener devuelve la pedida');
await esperaError('CAFETERIA_NO_ENCONTRADA', 'obtener una inexistente',
                  'cafeterias.obtener', { id: 'no-existe-jamas' });

titulo('Menú');

const semana = await pedir('menu.semana', { lunes: LUNES });
ok(Array.isArray(semana.dias) && semana.dias.length === 7,
   `la semana devuelve 7 días (${semana.dias && semana.dias.length})`);
ok(semana.dias[0].fecha === LUNES, 'empieza en el lunes pedido');
ok(semana.dias.every((d) => Array.isArray(d.opciones)),
   'opciones es ARREGLO en los 7, no texto JSON');

const cartaHoy = await pedir('menu.delDia', { fecha: HOY });
ok(Array.isArray(cartaHoy.opciones),
   `un día sin carta devuelve opciones:[] y no un error (hoy: ${cartaHoy.opciones.length})`);

titulo('Reservas: lectura');

const delDia = await pedir('reservas.delDia', { cafeteria_id: c.id, fecha: HOY });
ok(Array.isArray(delDia), 'delDia devuelve un arreglo');
ok(delDia.every((r) => r.estado === 'activa'), 'y SOLO reservas activas');

if (delDia.length > 0) {
  const r = delDia[0];
  ok(typeof r.telefono === 'string', `telefono es CADENA → ${JSON.stringify(r.telefono)}`);
  ok(typeof r.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.fecha),
     `fecha es cadena YYYY-MM-DD → «${r.fecha}»`);
  ok(Array.isArray(r.historial), 'historial es ARREGLO, no texto JSON');
  ok(r.historial.length > 0 && r.historial[0].tipo === 'creacion',
     'y su primer asiento es la creación');
  ok(typeof r.menu_nombre === 'string' && r.menu_nombre.length > 0,
     'menu_nombre viaja con la reserva (copia, no referencia)');
} else {
  console.log('         (sin reservas hoy: no se comprueban los tipos de Reserva)');
}

titulo('Buscar y consolidar');

// Rango corto a propósito: uno de años dispararía el tope, que se comprueba
// justo debajo.
const HACE_60 = new Date(hoy.getTime() - 59 * 86400000);
const DESDE = `${HACE_60.getFullYear()}-${dosDigitos(HACE_60.getMonth() + 1)}-${dosDigitos(HACE_60.getDate())}`;

const busqueda = await pedir('reservas.buscar', { desde: DESDE, hasta: HOY, limite: 5 });
ok(typeof busqueda.total === 'number', `total es número → ${busqueda.total}`);
ok(Array.isArray(busqueda.reservas), 'reservas es arreglo');
ok(busqueda.reservas.length <= 5, `limite recorta el detalle (${busqueda.reservas.length} ≤ 5)`);

const res = busqueda.resumen;
ok(res && res.totales && Array.isArray(res.por_dia), 'el resumen viene con la respuesta');
ok(res.totales.total === busqueda.total,
   'el resumen se calcula sobre TODAS, no sobre la página devuelta');
ok(res.totales.activas + res.totales.canceladas === res.totales.total,
   'activas + canceladas = total');
ok(res.por_dia.reduce((s, d) => s + d.activas + d.canceladas, 0) === res.totales.total,
   'por_dia suma el total');
ok(res.por_dia.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.fecha)),
   'por_dia trae fechas como cadena');
ok(res.por_cafeteria.every((x) => 'cafeteria_id' in x && 'nombre' in x),
   'por_cafeteria resuelve el nombre de la sede');
ok(res.por_plato.reduce((s, p) => s + p.total, 0) === res.totales.activas,
   'por_plato cuenta SOLO las activas');

await esperaError('RANGO_INVALIDO', 'rango invertido',
                  'reservas.buscar', { desde: HOY, hasta: LUNES });
await esperaError('RANGO_INVALIDO', 'sin fechas', 'reservas.buscar', {});
// Sin tope, la serie diaria se corta y por_dia deja de cuadrar en silencio.
await esperaError('RANGO_INVALIDO', 'rango de más de un año',
                  'reservas.buscar', { desde: '2020-01-01', hasta: HOY });

/* ── Escritura ───────────────────────────────────────────────────────── */

if (!escribir) {
  console.log('\n(Se omitieron las comprobaciones de escritura. Añade --escribir para incluirlas.)');
} else {
  titulo('Escritura · reglas de negocio');
  console.log(`         Trabajando en la semana del ${LUNES} para no tocar datos reales.`);

  await pedir('menu.guardarSemana', {
    lunes: LUNES,
    dias: [
      { fecha: LUNES, platos: ['Plato de prueba A', 'Plato de prueba B'] },
      { fecha: MARTES, platos: ['Plato de prueba C'] },
    ],
  });
  const carta = await pedir('menu.delDia', { fecha: LUNES });
  ok(carta.opciones.length === 2, `la carta se publicó (${carta.opciones.length} platos)`);
  ok(carta.opciones[0].id === 'plato-de-prueba-a',
     `el id del plato lo deriva el servidor → ${carta.opciones[0].id}`);

  if (sinReglaFinDeSemana) {
    console.log('  AVISO · la regla de fin de semana está DESACTIVADA: no se comprueba');
    console.log('          Apágala en los dos lados antes de usarlo de verdad.');
  } else {
    await esperaError('SIN_SERVICIO', 'publicar carta en sábado', 'menu.guardarSemana',
      { lunes: LUNES, dias: [{ fecha: SABADO, platos: ['X'] }] });
  }
  await esperaError('MENU_DUPLICADO', 'dos platos iguales el mismo día', 'menu.guardarSemana',
    { lunes: LUNES, dias: [{ fecha: LUNES, platos: ['Repetido', 'repetido'] }] });
  await esperaError('RANGO_INVALIDO', 'día fuera de la semana', 'menu.guardarSemana',
    { lunes: LUNES, dias: [{ fecha: '2020-03-01', platos: ['X'] }] });

  const MOVIL = '3009998877';
  const nueva = await pedir('reservas.crear', {
    nombre: '  Prueba De Contrato  ', telefono: MOVIL,
    cafeteria_id: c.id, fecha: LUNES, menu_id: carta.opciones[0].id,
    medio: 'presencial', pago: 'pagado',
  });
  ok(nueva.nombre === 'Prueba De Contrato', 'el servidor recorta el nombre');
  ok(nueva.estado === 'activa', 'nace activa');
  ok(nueva.menu_nombre === carta.opciones[0].nombre, 'copia el nombre del plato');
  ok(Array.isArray(nueva.historial) && nueva.historial[0].tipo === 'creacion',
     'nace con su asiento de creación');
  ok(typeof nueva.telefono === 'string', 'devuelve el móvil como cadena');
  ok(nueva.medio === 'presencial' && nueva.pago === 'pagado',
     `guarda medio y pago → ${nueva.medio} · ${nueva.pago}`);

  // Lo que se guarda tiene que ser lo que se lee. Parece obvio y no lo es:
  // si el backend escribe las columnas en un orden distinto al que tiene la
  // hoja, la respuesta de `crear` sale bien —viene de memoria— y el destrozo
  // solo aparece al releer. Es exactamente el fallo que dejó reservas
  // invisibles en producción.
  const releida = (await pedir('reservas.delDia', { cafeteria_id: c.id, fecha: LUNES }))
    .find((x) => x.id === nueva.id);
  ok(!!releida, 'la reserva recién creada aparece al releer el día');
  if (releida) {
    ok(releida.estado === 'activa', `estado tras releer → «${releida.estado}»`);
    ok(releida.medio === 'presencial' && releida.pago === 'pagado',
       `medio y pago tras releer → ${releida.medio} · ${releida.pago}`);
    ok(/^\d{4}-\d{2}-\d{2}T/.test(releida.timestamp),
       `timestamp tras releer → ${String(releida.timestamp).slice(0, 24)}`);
    ok(Array.isArray(releida.historial) && releida.historial[0]?.tipo === 'creacion',
       'historial tras releer sigue siendo un arreglo con su asiento de creación');
    ok(releida.nombre === nueva.nombre && releida.telefono === nueva.telefono,
       'y el nombre y el móvil no se han corrido de columna');
  }

  await esperaError('DATOS_INCOMPLETOS', 'sin «pago»', 'reservas.crear',
    { nombre: 'Otra', telefono: '3009990004', cafeteria_id: c.id,
      fecha: LUNES, menu_id: carta.opciones[0].id, medio: 'presencial' });
  await esperaError('DATOS_INCOMPLETOS', 'un «medio» inventado', 'reservas.crear',
    { nombre: 'Otra', telefono: '3009990005', cafeteria_id: c.id,
      fecha: LUNES, menu_id: carta.opciones[0].id, medio: 'humo', pago: 'debe' });

  await esperaError('RESERVA_DUPLICADA', 'mismo móvil, misma sede, mismo día', 'reservas.crear',
    { nombre: 'Otra', telefono: MOVIL, cafeteria_id: c.id,
      fecha: LUNES, menu_id: carta.opciones[0].id, medio: 'presencial', pago: 'pagado' });
  await esperaError('MENU_INVALIDO', 'plato fuera de la carta', 'reservas.crear',
    { nombre: 'Otra', telefono: '3009990001', cafeteria_id: c.id,
      fecha: LUNES, menu_id: 'plato-que-no-existe', medio: 'presencial', pago: 'pagado' });
  if (!sinReglaFinDeSemana) {
    await esperaError('SIN_SERVICIO', 'reservar en sábado', 'reservas.crear',
      { nombre: 'Otra', telefono: '3009990002', cafeteria_id: c.id,
        fecha: SABADO, menu_id: carta.opciones[0].id, medio: 'presencial', pago: 'pagado' });
  }
  await esperaError('DATOS_INCOMPLETOS', 'sin móvil', 'reservas.crear',
    { nombre: 'Otra', telefono: '', cafeteria_id: c.id,
      fecha: LUNES, menu_id: carta.opciones[0].id, medio: 'presencial', pago: 'pagado' });
  await esperaError('CAFETERIA_NO_ENCONTRADA', 'cafetería inexistente', 'reservas.crear',
    { nombre: 'Otra', telefono: '3009990003', cafeteria_id: 'no-existe-jamas',
      fecha: LUNES, menu_id: carta.opciones[0].id, medio: 'presencial', pago: 'pagado' });

  titulo('Escritura · historial');

  const editada = await pedir('reservas.actualizar', {
    id: nueva.id, nombre: 'Prueba De Contrato Editada',
    telefono: MOVIL, menu_id: carta.opciones[1].id,
    medio: 'presencial', pago: 'pagado',
  });
  ok(editada.historial.length === 2, `el historial crece a ${editada.historial.length}`);
  const asiento = editada.historial[1];
  ok(asiento.tipo === 'modificacion', 'el nuevo asiento es una modificación');
  ok(Array.isArray(asiento.cambios) && asiento.cambios.length === 2,
     `registra los ${asiento.cambios.length} campos que cambiaron`);
  ok(asiento.cambios.every((x) => 'campo' in x && 'antes' in x && 'despues' in x),
     'cada cambio trae campo/antes/despues');
  const cambioMenu = asiento.cambios.find((x) => x.campo === 'menu');
  ok(cambioMenu.despues === carta.opciones[1].nombre,
     'el historial guarda el NOMBRE del plato, no su id');

  await esperaError('SIN_CAMBIOS', 'guardar sin tocar nada', 'reservas.actualizar',
    { id: nueva.id, nombre: editada.nombre, telefono: editada.telefono,
      menu_id: editada.menu_id, medio: editada.medio, pago: editada.pago });
  await esperaError('RESERVA_NO_ENCONTRADA', 'editar una inexistente', 'reservas.actualizar',
    { id: 'r-no-existe-jamas', nombre: 'X Y', telefono: '3001112233',
      menu_id: carta.opciones[0].id, medio: 'presencial', pago: 'pagado' });

  titulo('Escritura · cancelación');

  const cancelada = await pedir('reservas.cancelar', { id: nueva.id });
  ok(cancelada.estado === 'cancelada', 'queda cancelada');
  ok(cancelada.historial[cancelada.historial.length - 1].tipo === 'cancelacion',
     'con su asiento de cancelación');

  const trasCancelar = await pedir('reservas.delDia', { cafeteria_id: c.id, fecha: LUNES });
  ok(!trasCancelar.some((r) => r.id === nueva.id), 'desaparece de la tabla del día');

  await esperaError('RESERVA_CANCELADA', 'cancelar dos veces',
                    'reservas.cancelar', { id: nueva.id });
  await esperaError('RESERVA_CANCELADA', 'editar una cancelada', 'reservas.actualizar',
    { id: nueva.id, nombre: 'Otro', telefono: MOVIL, menu_id: carta.opciones[0].id,
      medio: 'presencial', pago: 'pagado' });

  const reusa = await pedir('reservas.crear', {
    nombre: 'Prueba De Contrato', telefono: MOVIL,
    cafeteria_id: c.id, fecha: LUNES, menu_id: carta.opciones[0].id,
    medio: 'presencial', pago: 'pagado',
  });
  ok(reusa.id !== nueva.id, 'una cancelada NO bloquea: el móvil puede reservar otra vez');
  await pedir('reservas.cancelar', { id: reusa.id });

  titulo('Limpieza');
  await pedir('menu.guardarSemana', {
    lunes: LUNES,
    dias: [{ fecha: LUNES, platos: [] }, { fecha: MARTES, platos: [] }],
  });
  const limpia = await pedir('menu.delDia', { fecha: LUNES });
  ok(limpia.opciones.length === 0, 'la carta de prueba se retiró');
  console.log('         Quedan 2 reservas canceladas con fecha 2020-01-06.');
  console.log('         Es esperado: el borrado del sistema es lógico, y debe serlo.');
}

/* ── Veredicto ───────────────────────────────────────────────────────── */

const destino = url || 'el mock (js/mock/mockApi.js)';
console.log(`\n${'─'.repeat(60)}`);
if (sinReglaFinDeSemana) {
  console.log('AVISO · MODO PRUEBAS: la regla de fin de semana no se comprobó.');
}
if (fallos === 0) {
  console.log(`✔ ${comprobaciones} comprobaciones · ${destino} CUMPLE el contrato\n`);
} else {
  console.log(`✘ ${fallos} de ${comprobaciones} fallaron · ${destino} NO cumple el contrato`);
  console.log('  Mira CONTRATO.md para la forma exacta que se espera.\n');
}
process.exit(fallos === 0 ? 0 : 1);
