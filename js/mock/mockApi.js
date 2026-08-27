/**
 * API simulada.
 *
 * Imita el contrato del futuro backend de Google Apps Script: un único punto
 * de entrada que recibe una `accion` y un objeto de parámetros, y responde
 * SIEMPRE con el mismo sobre:
 *
 *   éxito → { ok: true,  data: <lo que sea> }
 *   error → { ok: false, error: { codigo, mensaje } }
 *
 * Nunca lanza excepciones: un fallo de negocio es una respuesta válida con
 * ok:false. Quien traduce eso a un error de JavaScript es la capa de
 * servicios, para que la UI trate igual un fallo de red y uno de negocio.
 *
 * Es intencional que este archivo valide duplicados, menú y cambios: son las
 * mismas reglas que tendrá que aplicar el backend real, y tenerlas aquí
 * obliga a que el frontend ya maneje sus mensajes de error.
 *
 * También es este archivo quien escribe el historial de cada reserva. Que lo
 * lleve el servidor y no el cliente es a propósito: el historial es un
 * registro de lo que de verdad pasó, y el cliente no puede saberlo —dos
 * personas editando la misma reserva verían cada una solo su propio cambio.
 */

import { LATENCIA_MOCK_MS } from '../config.js';
import { CAFETERIAS } from './cafeterias.js';
import { MENU_SEMANAL } from './menuSemanal.js';
import { RESERVAS } from './reservas.js';
import { aSlug, normalizarBusqueda } from '../utils/texto.js';
import { construirIdReserva, partesIdReserva } from '../utils/idReserva.js';
import { rangoDias, sumarDias, esDiaDeServicio, diasEntre } from '../utils/fechas.js';

/** Tope del rango de consulta: un año natural cubre cualquier reporte. */
const MAX_DIAS_RANGO = 366;

/** Almacén en memoria. Se reinicia con cada recarga de la página. */
const almacen = {
  cafeterias: CAFETERIAS,
  menuSemanal: MENU_SEMANAL,
  reservas: [...RESERVAS],
};

const exito = (data) => ({ ok: true, data: copiar(data) });
const fallo = (codigo, mensaje) => ({ ok: false, error: { codigo, mensaje } });

/** Copia profunda: la UI no debe poder mutar el almacén por referencia. */
function copiar(valor) {
  return valor === undefined ? null : JSON.parse(JSON.stringify(valor));
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Limpia la lista de platos fijos: quita vacíos y repetidos por id.
 * Dos platos con el mismo identificador dejarían una reserva sin saber a
 * cuál de los dos apunta.
 */
function limpiarPlatosFijos(lista) {
  const nombres = [];
  const ids = new Set();
  for (const bruto of lista ?? []) {
    const nombre = String(bruto).trim();
    const id = aSlug(nombre);
    if (!nombre || !id || ids.has(id)) continue;
    ids.add(id);
    nombres.push(nombre);
  }
  return nombres;
}

/** Valores admitidos en los dos campos de opción de una reserva. */
/** Etiqueta visible de cada valor, para el historial y los reportes. */
const ETIQUETAS = {
  presencial: 'Presencial',
  telefono: 'Teléfono',
  pagado: 'Pagado',
  debe: 'Debe',
};

const VALORES = {
  medio: ['presencial', 'telefono'],
  pago: ['pagado', 'debe'],
};

/**
 * Comprueba los campos de opción y devuelve el error si algo no cuadra.
 *
 * Se valida en el servidor y no solo en el formulario porque son datos con
 * consecuencias: «pagado» o «debe» es dinero, y un valor inventado por una
 * petición hecha a mano dejaría la contabilidad con un estado que ninguna
 * pantalla sabe pintar.
 */
function errorDeOpciones({ medio, pago }) {
  for (const [campo, admitidos] of Object.entries(VALORES)) {
    const valor = campo === 'medio' ? medio : pago;
    if (!valor) {
      return fallo('DATOS_INCOMPLETOS', `Falta indicar «${campo}» en la reserva.`);
    }
    if (!admitidos.includes(valor)) {
      return fallo(
        'DATOS_INCOMPLETOS',
        `«${valor}» no es un valor válido para «${campo}»: se espera ${admitidos.join(' o ')}.`,
      );
    }
  }
  return null;
}

/** Carta de un día. La misma para todas las sedes: la clave es la fecha. */
function cartaDe(fecha) {
  return almacen.menuSemanal.find((m) => m.fecha === fecha) ?? null;
}

/**
 * Lo que se puede pedir ese día en esa cafetería: la carta común más los
 * platos fijos de la sede.
 *
 * Aquí vuelve a entrar la cafetería en el menú, pero por un motivo distinto
 * al de antes: la carta del día SIGUE siendo la misma para todo el campus. Lo
 * que varía por sede son los productos permanentes —Mini Lunch, los
 * especiales—, que no dependen del día.
 *
 * Los fijos se ofrecen todos los días CON SERVICIO, haya carta publicada o
 * no: son parte de lo que esa sede vende siempre.
 */
function ofertaDelDia(cafeteriaId, fecha) {
  if (!esDiaDeServicio(fecha)) return [];

  const opciones = [...(cartaDe(fecha)?.opciones ?? [])];
  const cafeteria = almacen.cafeterias.find((c) => c.id === cafeteriaId);

  for (const nombre of cafeteria?.platos_fijos ?? []) {
    const id = aSlug(nombre);
    // Si el plato fijo coincide con uno de la carta del día, gana el del día:
    // dos opciones con el mismo id dejarían la reserva sin saber a cuál apunta.
    if (!id || opciones.some((o) => o.id === id)) continue;
    opciones.push({ id, nombre, fijo: true });
  }
  return opciones;
}

/** Plato válido ese día en esa cafetería, o null. */
function buscarPlato(cafeteriaId, fecha, menuId) {
  return ofertaDelDia(cafeteriaId, fecha).find((o) => o.id === menuId) ?? null;
}

/**
 * Siguiente consecutivo para esa cafetería ese día.
 *
 * Cuenta **todas** las reservas, también las canceladas: reciclar el número
 * de una cancelada haría que dos reservas distintas compartieran
 * identificador. Se calcula sobre el máximo existente y no sobre la cantidad,
 * para que un hueco no provoque una colisión.
 */
function siguienteConsecutivo(cafeteriaId, fecha) {
  let mayor = 0;
  for (const r of almacen.reservas) {
    if (r.cafeteria_id !== cafeteriaId || r.fecha !== fecha) continue;
    const partes = partesIdReserva(r.id);
    if (partes) mayor = Math.max(mayor, Number(partes.consecutivo));
  }
  return mayor + 1;
}

/**
 * ¿Hay otra reserva ACTIVA de ese móvil, ese día y esa cafetería?
 *
 * Las canceladas no cuentan: si alguien canceló por la mañana y vuelve a
 * pasar por el mostrador, tiene que poder reservar otra vez.
 */
function telefonoYaReservo(cafeteriaId, fecha, telefono, idExcluido = null) {
  return almacen.reservas.some(
    (r) =>
      r.cafeteria_id === cafeteriaId &&
      r.fecha === fecha &&
      r.telefono === telefono &&
      r.estado === 'activa' &&
      r.id !== idExcluido,
  );
}

/**
 * Consolidados de un conjunto de reservas ya filtrado.
 *
 * Se calculan aquí, del lado del servidor, y no en el navegador: con datos
 * reales el administrador puede pedir un trimestre entero, y mandar miles de
 * filas al cliente para que cuente sumas es justo lo que no hay que hacer.
 */
function resumir(reservas, desde, hasta) {
  const activas = reservas.filter((r) => r.estado === 'activa');
  const canceladas = reservas.length - activas.length;

  // Todos los días del rango, incluidos los que no tuvieron ni una reserva:
  // un hueco en la serie es información —ese día no hubo servicio— y si se
  // omite, la gráfica junta dos fechas lejanas como si fueran consecutivas.
  const conteoDia = new Map(rangoDias(desde, hasta).map((f) => [f, { activas: 0, canceladas: 0 }]));
  const conteoCafeteria = new Map();
  const conteoPlato = new Map();

  for (const r of reservas) {
    const dia = conteoDia.get(r.fecha);
    if (dia) dia[r.estado === 'activa' ? 'activas' : 'canceladas']++;

    if (!conteoCafeteria.has(r.cafeteria_id)) {
      conteoCafeteria.set(r.cafeteria_id, { activas: 0, canceladas: 0 });
    }
    conteoCafeteria.get(r.cafeteria_id)[r.estado === 'activa' ? 'activas' : 'canceladas']++;

    // El plato solo se cuenta sobre reservas activas: un consolidado de
    // consumo que sume las canceladas manda a cocinar comida de más.
    if (r.estado === 'activa') {
      conteoPlato.set(r.menu_nombre, (conteoPlato.get(r.menu_nombre) ?? 0) + 1);
    }
  }

  const diasConServicio = [...conteoDia.values()].filter(
    (d) => d.activas + d.canceladas > 0,
  ).length;

  return {
    totales: {
      total: reservas.length,
      activas: activas.length,
      canceladas,
      dias_con_servicio: diasConServicio,
      promedio_diario: diasConServicio > 0
        ? Math.round((activas.length / diasConServicio) * 10) / 10
        : 0,
    },
    por_dia: [...conteoDia.entries()].map(([fecha, conteo]) => ({ fecha, ...conteo })),
    por_cafeteria: [...conteoCafeteria.entries()]
      .map(([id, conteo]) => ({
        cafeteria_id: id,
        nombre: almacen.cafeterias.find((c) => c.id === id)?.nombre ?? id,
        ...conteo,
      }))
      .sort((a, b) => b.activas - a.activas),
    por_plato: [...conteoPlato.entries()]
      .map(([nombre, total]) => ({ nombre, total }))
      .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre)),
  };
}

const ACCIONES = {
  /**
   * Por defecto solo devuelve las cafeterías activas: la página operativa no
   * debe ofrecer una cafetería cerrada. El administrador pide todas.
   */
  'cafeterias.listar': ({ incluir_inactivas } = {}) =>
    exito(
      incluir_inactivas
        ? almacen.cafeterias
        : almacen.cafeterias.filter((c) => c.activa !== false),
    ),

  'cafeterias.obtener': ({ id }) => {
    const cafeteria = almacen.cafeterias.find((c) => c.id === id);
    return cafeteria
      ? exito(cafeteria)
      : fallo('CAFETERIA_NO_ENCONTRADA', `No existe la cafetería «${id}».`);
  },

  /**
   * La oferta de un día. Con `cafeteria_id` incluye sus platos fijos; sin
   * él devuelve solo la carta común, que es lo que edita el administrador.
   */
  'menu.delDia': ({ fecha, cafeteria_id }) => {
    // Sin carta publicada no es un error: es un día sin menú.
    if (!cafeteria_id) return exito(cartaDe(fecha) ?? { fecha, opciones: [] });
    return exito({ fecha, opciones: ofertaDelDia(cafeteria_id, fecha) });
  },

  'reservas.delDia': ({ cafeteria_id, fecha }) => {
    // Sin turnos, el orden natural es el de llegada. Las canceladas no salen:
    // la tabla responde a «quién viene hoy», no «qué se tecleó hoy».
    const delDia = almacen.reservas
      .filter(
        (r) => r.cafeteria_id === cafeteria_id && r.fecha === fecha && r.estado === 'activa',
      )
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return exito(delDia);
  },

  'reservas.crear': (datos) => {
    const { nombre, telefono, cafeteria_id, fecha, menu_id, medio, pago } = datos;

    const cafeteria = almacen.cafeterias.find((c) => c.id === cafeteria_id);
    if (!cafeteria) {
      return fallo('CAFETERIA_NO_ENCONTRADA', `No existe la cafetería «${cafeteria_id}».`);
    }
    if (!nombre || !telefono || !menu_id) {
      return fallo('DATOS_INCOMPLETOS', 'Faltan datos obligatorios en la reserva.');
    }
    const malOpciones = errorDeOpciones({ medio, pago });
    if (malOpciones) return malOpciones;
    // Se comprueba aquí y no solo en la pantalla: el fin de semana tampoco
    // hay carta publicada, así que sin esta regla el rechazo llegaría como
    // MENU_INVALIDO —«ese plato no está en la carta»— que es verdad pero no
    // explica nada a quien está en el mostrador.
    if (!esDiaDeServicio(fecha)) {
      return fallo('SIN_SERVICIO', 'Los sábados y domingos no hay servicio de almuerzo.');
    }

    const plato = buscarPlato(cafeteria_id, fecha, menu_id);
    if (!plato) {
      return fallo('MENU_INVALIDO', 'Ese plato no está en el menú de hoy.');
    }

    if (telefonoYaReservo(cafeteria_id, fecha, telefono)) {
      return fallo(
        'RESERVA_DUPLICADA',
        'Ese móvil ya tiene una reserva para hoy en esta cafetería.',
      );
    }

    const ahora = new Date().toISOString();
    const reserva = {
      id: construirIdReserva(cafeteria.codigo, fecha, siguienteConsecutivo(cafeteria_id, fecha)),
      nombre: nombre.trim(),
      telefono,
      cafeteria_id,
      fecha,
      menu_id: plato.id,
      menu_nombre: plato.nombre,
      medio,
      pago,
      estado: 'activa',
      timestamp: ahora,
      // Toda reserva nace con su historial abierto: la creación es el primer
      // asiento, así el historial nunca está vacío y la fecha de alta no
      // depende de un campo aparte.
      historial: [{ tipo: 'creacion', timestamp: ahora, cambios: [] }],
    };
    almacen.reservas.push(reserva);
    return exito(reserva);
  },

  'reservas.actualizar': (datos) => {
    const { id, nombre, telefono, menu_id, medio, pago } = datos;

    const reserva = almacen.reservas.find((r) => r.id === id);
    if (!reserva) {
      return fallo('RESERVA_NO_ENCONTRADA', 'Esa reserva ya no existe.');
    }
    if (reserva.estado === 'cancelada') {
      return fallo('RESERVA_CANCELADA', 'Esa reserva está cancelada y ya no se puede editar.');
    }
    if (!nombre || !telefono || !menu_id) {
      return fallo('DATOS_INCOMPLETOS', 'Faltan datos obligatorios en la reserva.');
    }
    const malOpcionesEdicion = errorDeOpciones({ medio, pago });
    if (malOpcionesEdicion) return malOpcionesEdicion;

    const plato = buscarPlato(reserva.cafeteria_id, reserva.fecha, menu_id);
    if (!plato) {
      return fallo('MENU_INVALIDO', 'Ese plato no está en la carta de ese día.');
    }

    if (telefonoYaReservo(reserva.cafeteria_id, reserva.fecha, telefono, reserva.id)) {
      return fallo(
        'RESERVA_DUPLICADA',
        'Ese móvil ya tiene otra reserva para hoy en esta cafetería.',
      );
    }

    // El historial guarda el valor visible, no el id: 'Bandeja paisa' se
    // entiende dentro de un año; 'bandeja-paisa' obliga a cruzar tablas.
    const cambios = [];
    const nombreLimpio = nombre.trim();
    if (nombreLimpio !== reserva.nombre) {
      cambios.push({ campo: 'nombre', antes: reserva.nombre, despues: nombreLimpio });
    }
    if (telefono !== reserva.telefono) {
      cambios.push({ campo: 'telefono', antes: reserva.telefono, despues: telefono });
    }
    if (plato.id !== reserva.menu_id) {
      cambios.push({ campo: 'menu', antes: reserva.menu_nombre, despues: plato.nombre });
    }
    // El historial guarda la etiqueta que se ve en pantalla, no el valor
    // interno: «Presencial → Teléfono» se entiende, «presencial → telefono»
    // parece un error de escritura.
    if (medio !== reserva.medio) {
      cambios.push({ campo: 'medio', antes: ETIQUETAS[reserva.medio] ?? '—', despues: ETIQUETAS[medio] });
    }
    if (pago !== reserva.pago) {
      cambios.push({ campo: 'pago', antes: ETIQUETAS[reserva.pago] ?? '—', despues: ETIQUETAS[pago] });
    }

    // Guardar sin tocar nada dejaría un asiento vacío en el historial, que
    // es justo lo que un registro de cambios no debe tener.
    if (cambios.length === 0) {
      return fallo('SIN_CAMBIOS', 'No se modificó ningún dato de la reserva.');
    }

    reserva.nombre = nombreLimpio;
    reserva.telefono = telefono;
    reserva.menu_id = plato.id;
    reserva.menu_nombre = plato.nombre;
    reserva.medio = medio;
    reserva.pago = pago;
    reserva.historial.push({
      tipo: 'modificacion',
      timestamp: new Date().toISOString(),
      cambios,
    });

    return exito(reserva);
  },

  /**
   * Cancelación: borrado LÓGICO, no físico.
   *
   * La fila no se quita del almacén, se marca `estado: 'cancelada'` y se le
   * añade su asiento. Borrarla de verdad tiraría el historial justo del caso
   * que más interesa auditar —«esta persona reservó y luego se canceló»— y en
   * una hoja de cálculo compartida no habría forma de recuperarlo.
   *
   * La reserva cancelada desaparece de la tabla del día porque `delDia` filtra
   * por estado, así que la pantalla se ve igual que si se hubiera borrado.
   */
  'reservas.cancelar': ({ id }) => {
    const reserva = almacen.reservas.find((r) => r.id === id);
    if (!reserva) {
      return fallo('RESERVA_NO_ENCONTRADA', 'Esa reserva ya no existe.');
    }
    if (reserva.estado === 'cancelada') {
      return fallo('RESERVA_CANCELADA', 'Esa reserva ya estaba cancelada.');
    }

    reserva.estado = 'cancelada';
    reserva.historial.push({
      tipo: 'cancelacion',
      timestamp: new Date().toISOString(),
      cambios: [],
    });

    return exito(reserva);
  },

  /* ── Administración ─────────────────────────────────────────────────── */

  /**
   * Búsqueda con filtros + consolidados, en una sola llamada.
   *
   * Detalle y resumen viajan juntos porque el administrador mira los dos a la
   * vez y separarlos serían dos viajes para pintar una misma pantalla.
   *
   * `limite` recorta el detalle pero NUNCA el resumen: los totales se calculan
   * sobre todo lo que casa con el filtro, o un rango largo mostraría «1.240
   * reservas» y una tabla de 500 que no suma eso. La exportación a CSV pide
   * `limite: 0` para llevarse todas las filas.
   */
  'reservas.buscar': (filtros = {}) => {
    const { desde, hasta, cafeteria_id, estado, texto, limite = 500 } = filtros;
    if (!desde || !hasta) {
      return fallo('RANGO_INVALIDO', 'Hay que indicar la fecha de inicio y la de fin.');
    }
    if (desde > hasta) {
      return fallo('RANGO_INVALIDO', 'La fecha de inicio es posterior a la de fin.');
    }
    // Un rango sin tope se rompe en silencio: `por_dia` deja de cuadrar con
    // los totales porque la serie diaria se corta, y el administrador ve un
    // consolidado que no suma sin ninguna pista de por qué. Mejor negarse.
    if (diasEntre(desde, hasta) > MAX_DIAS_RANGO) {
      return fallo(
        'RANGO_INVALIDO',
        `El rango no puede superar ${MAX_DIAS_RANGO} días. Consulta por periodos más cortos.`,
      );
    }

    const buscado = texto ? normalizarBusqueda(texto) : '';
    const coincide = (r) => {
      if (r.fecha < desde || r.fecha > hasta) return false;
      if (cafeteria_id && r.cafeteria_id !== cafeteria_id) return false;
      if (estado && r.estado !== estado) return false;
      if (buscado) {
        const enNombre = normalizarBusqueda(r.nombre).includes(buscado);
        // El móvil se busca por dígitos, para que dé igual cómo se teclee.
        const enMovil = r.telefono.includes(buscado.replace(/\D/g, ''));
        if (!enNombre && !(buscado.replace(/\D/g, '') && enMovil)) return false;
      }
      return true;
    };

    const encontradas = almacen.reservas
      .filter(coincide)
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.timestamp.localeCompare(a.timestamp));

    return exito({
      total: encontradas.length,
      reservas: limite > 0 ? encontradas.slice(0, limite) : encontradas,
      resumen: resumir(encontradas, desde, hasta),
    });
  },

  'cafeterias.crear': ({ nombre, ubicacion, platos_fijos }) => {
    if (!nombre || !nombre.trim()) {
      return fallo('DATOS_INCOMPLETOS', 'La cafetería necesita al menos un nombre.');
    }
    const id = aSlug(nombre);
    if (!id) {
      return fallo('DATOS_INCOMPLETOS', 'Ese nombre no produce un identificador válido.');
    }
    if (almacen.cafeterias.some((c) => c.id === id)) {
      return fallo('CAFETERIA_DUPLICADA', `Ya existe una cafetería con el id «${id}».`);
    }

    // El código es el siguiente número libre, no la cantidad de cafeterías:
    // si alguna se borrara de la hoja a mano, contar daría un código repetido.
    const mayor = almacen.cafeterias.reduce((m, c) => Math.max(m, Number(c.codigo) || 0), 0);

    const cafeteria = {
      id,
      codigo: String(mayor + 1).padStart(2, '0'),
      nombre: nombre.trim(),
      ubicacion: (ubicacion ?? '').trim(),
      imagen: '',
      activa: true,
      platos_fijos: limpiarPlatosFijos(platos_fijos),
    };
    almacen.cafeterias.push(cafeteria);
    return exito(cafeteria);
  },

  /**
   * El `id` no se puede cambiar: es la clave con la que miles de reservas
   * históricas apuntan a esta cafetería, y renombrarlo las dejaría huérfanas.
   */
  'cafeterias.actualizar': ({ id, nombre, ubicacion, platos_fijos }) => {
    const cafeteria = almacen.cafeterias.find((c) => c.id === id);
    if (!cafeteria) {
      return fallo('CAFETERIA_NO_ENCONTRADA', `No existe la cafetería «${id}».`);
    }
    if (!nombre || !nombre.trim()) {
      return fallo('DATOS_INCOMPLETOS', 'La cafetería necesita al menos un nombre.');
    }

    cafeteria.nombre = nombre.trim();
    cafeteria.ubicacion = (ubicacion ?? '').trim();
    cafeteria.platos_fijos = limpiarPlatosFijos(platos_fijos);
    return exito(cafeteria);
  },

  /**
   * Cerrar una cafetería es otro borrado lógico. Eliminarla de verdad dejaría
   * sin referencia a todas sus reservas pasadas y rompería los reportes de
   * meses anteriores.
   */
  'cafeterias.archivar': ({ id }) => {
    const cafeteria = almacen.cafeterias.find((c) => c.id === id);
    if (!cafeteria) {
      return fallo('CAFETERIA_NO_ENCONTRADA', `No existe la cafetería «${id}».`);
    }
    cafeteria.activa = false;
    return exito(cafeteria);
  },

  'cafeterias.reactivar': ({ id }) => {
    const cafeteria = almacen.cafeterias.find((c) => c.id === id);
    if (!cafeteria) {
      return fallo('CAFETERIA_NO_ENCONTRADA', `No existe la cafetería «${id}».`);
    }
    cafeteria.activa = true;
    return exito(cafeteria);
  },

  /** La carta de los siete días de una semana. Es la misma para todo el campus. */
  'menu.semana': ({ lunes }) => {
    if (!lunes) {
      return fallo('DATOS_INCOMPLETOS', 'Hay que indicar el lunes de la semana.');
    }
    const dias = rangoDias(lunes, sumarDias(lunes, 6)).map((fecha) => ({
      fecha,
      opciones: cartaDe(fecha)?.opciones ?? [],
    }));
    return exito({ lunes, dias });
  },

  /**
   * Guarda la carta de una semana entera de una vez.
   *
   * Va por semana y no por día porque publicar la carta ES una tarea semanal:
   * quien la actualiza tiene delante los siete días y quiere guardarlos
   * juntos. Además así la escritura es atómica —o entran los siete días o no
   * entra ninguno—, y no se puede quedar media semana publicada porque algo
   * falló en el cuarto día.
   *
   * Los platos llegan como texto y aquí se les asigna el id, igual que hará
   * la hoja: quien administra escribe nombres, no identificadores.
   *
   * Un día con la lista vacía se queda sin carta, que es la forma de decir
   * «ese día no hay servicio».
   */
  'menu.guardarSemana': ({ lunes, dias }) => {
    if (!lunes || !Array.isArray(dias)) {
      return fallo('DATOS_INCOMPLETOS', 'Falta la semana o los días de la carta.');
    }

    const fechasValidas = new Set(rangoDias(lunes, sumarDias(lunes, 6)));
    const preparados = [];

    // Se valida TODO antes de tocar el almacén: si el quinto día trae un
    // plato repetido, no puede haber dejado ya escritos los cuatro primeros.
    for (const dia of dias) {
      if (!fechasValidas.has(dia.fecha)) {
        return fallo('RANGO_INVALIDO', `El día ${dia.fecha} no pertenece a esa semana.`);
      }
      // Publicar carta un sábado sería prometer un servicio que no existe.
      // Un fin de semana vacío sí se acepta: es lo que manda el editor.
      if (!esDiaDeServicio(dia.fecha) && (dia.platos ?? []).some((p) => String(p).trim())) {
        return fallo('SIN_SERVICIO', 'Los sábados y domingos no hay servicio: no llevan carta.');
      }

      const opciones = [];
      for (const bruto of dia.platos ?? []) {
        const nombre = String(bruto).trim();
        if (!nombre) continue;
        const id = aSlug(nombre);
        if (!id) continue;
        // Dos platos con el mismo nombre darían el mismo id y una reserva no
        // sabría a cuál de los dos apunta.
        if (opciones.some((o) => o.id === id)) {
          return fallo('MENU_DUPLICADO', `«${nombre}» está repetido en la carta de ese día.`);
        }
        opciones.push({ id, nombre });
      }
      preparados.push({ fecha: dia.fecha, opciones });
    }

    for (const { fecha, opciones } of preparados) {
      const indice = almacen.menuSemanal.findIndex((m) => m.fecha === fecha);
      if (opciones.length === 0) {
        if (indice >= 0) almacen.menuSemanal.splice(indice, 1);
      } else if (indice >= 0) {
        almacen.menuSemanal[indice] = { id: fecha, fecha, opciones };
      } else {
        almacen.menuSemanal.push({ id: fecha, fecha, opciones });
      }
    }

    return exito({ lunes, dias: preparados });
  },
};

/**
 * Punto de entrada único. Misma firma que services/httpClient.js#enviar.
 * @param {string} accion
 * @param {object} params
 * @returns {Promise<{ok: boolean, data?: any, error?: {codigo: string, mensaje: string}}>}
 */
export async function enviar(accion, params = {}) {
  await esperar(LATENCIA_MOCK_MS);
  const manejador = ACCIONES[accion];
  if (!manejador) {
    return fallo('ACCION_DESCONOCIDA', `La API no reconoce la acción «${accion}».`);
  }
  return manejador(params);
}
