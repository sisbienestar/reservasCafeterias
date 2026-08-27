/**
 * Ticket de confirmación de una reserva.
 *
 * Sale como TEXTO monoespaciado, con la forma de un recibo de caja, y no como
 * imagen. Tres razones, por orden de peso:
 *
 *  1. WhatsApp tiene formato monoespaciado nativo, así que el texto ya se ve
 *     como un recibo sin depender de nada más.
 *  2. Un texto viaja por cualquier vía —la API de WhatsApp Business, un
 *     enlace `wa.me`, un SMS, un correo— mientras que una imagen hay que
 *     alojarla en algún sitio y ese sitio hay que mantenerlo.
 *  3. Si algún día hace falta el PNG, se dibuja en un canvas a partir de
 *     estas mismas líneas. El texto es el paso previo de las dos rutas, así
 *     que construirlo primero no descarta nada.
 *
 * Todo lo de aquí son funciones puras: reciben una reserva y una cafetería, y
 * devuelven una cadena. No tocan el DOM ni la red, y por eso la automatización
 * que venga después podrá reutilizarlas tal cual, desde donde sea.
 */

import { formatearFechaLarga } from './fechas.js';
import { formatearTelefono } from './telefono.js';

/**
 * Ancho del ticket en caracteres.
 *
 * 32 es el ancho clásico de una impresora térmica de 58 mm, así que si algún
 * día se imprime, sale sin tocar nada. Cabe además en el bloque monoespaciado
 * de WhatsApp de un móvil estrecho, que es el otro sitio donde tiene que
 * verse bien. Bajarlo aprieta el texto; subirlo lo parte en pantallas
 * pequeñas, que es peor porque rompe la alineación de las columnas.
 */
export const ANCHO = 32;

// Con tildes: el destino es WhatsApp, no una impresora de los noventa, y ahí
// «TELEFONO» junto a un nombre bien acentuado se lee como un descuido.
const ETIQUETAS = {
  presencial: 'PRESENCIAL',
  telefono: 'TELÉFONO',
  pagado: 'PAGADO',
  debe: 'DEBE',
};

/** Una línea de guiones de lado a lado. */
const separador = (caracter = '-') => caracter.repeat(ANCHO);

/** Centra un texto; si no cabe, lo devuelve entero antes que recortarlo. */
function centrar(texto) {
  const t = String(texto);
  if (t.length >= ANCHO) return t;
  return ' '.repeat(Math.floor((ANCHO - t.length) / 2)) + t;
}

/**
 * Etiqueta a la izquierda y valor a la derecha, como en un recibo.
 *
 * Si los dos juntos no caben, el valor baja a la línea siguiente alineado a
 * la derecha en vez de pegarse a la etiqueta: dos campos sin separación se
 * leen como uno solo. Y si ni siquiera solo cabe —un nombre completo de los
 * largos—, se parte, porque una línea que se pasa del ancho descuadra el
 * recibo entero y no solo esa fila.
 */
function par(etiqueta, valor) {
  const e = String(etiqueta);
  const v = String(valor);
  const hueco = ANCHO - e.length - v.length;
  if (hueco >= 1) return [e + ' '.repeat(hueco) + v];
  return [e, ...envolver(v).map((l) => ' '.repeat(ANCHO - l.length) + l)];
}

/**
 * Parte un texto largo en líneas que quepan, sin cortar palabras.
 *
 * Un nombre completo o el nombre de un plato pueden pasarse del ancho, y
 * truncarlos dejaría un ticket que dice algo distinto de lo reservado.
 */
function envolver(texto, sangria = '') {
  const util = ANCHO - sangria.length;
  const lineas = [];
  let actual = '';

  for (const palabra of String(texto).split(/\s+/).filter(Boolean)) {
    if (!actual) actual = palabra;
    else if (actual.length + 1 + palabra.length <= util) actual += ' ' + palabra;
    else {
      lineas.push(sangria + actual);
      actual = palabra;
    }
  }
  if (actual) lineas.push(sangria + actual);
  return lineas.length ? lineas : [sangria];
}

/**
 * El ticket completo, listo para pegar en cualquier sitio monoespaciado.
 *
 * En la cabecera va el nombre de la sede **tal como está guardado**, sin
 * añadirle ni quitarle nada. Si el ticket tiene que decir «Autoservicio
 * Bienestar Pro», eso es lo que debe llamarse la cafetería: componer el
 * nombre aquí lo dejaría distinto del que se ve en el inicio, en la cabecera
 * de la página y en los informes.
 *
 * @param {import('../services/reservasService.js').Reserva} reserva
 * @param {{nombre: string}} cafeteria
 * @returns {string}
 */
export function construirTicket(reserva, cafeteria) {
  const debe = reserva.pago === 'debe';
  const sede = String(cafeteria.nombre).toUpperCase();

  const lineas = [
    separador('='),
    centrar('RESERVA DE ALMUERZO'),
    ...envolver(sede).map((l) => centrar(l)),
    separador('='),
    '',
    // El número va arriba del todo: es lo que se dicta para reclamar el
    // almuerzo, y lo primero que hay que encontrar de un vistazo.
    centrar('RESERVA N.º'),
    centrar(reserva.id),
    '',
    ...envolver(formatearFechaLarga(reserva.fecha)).map((l) => centrar(l)),
    '',
    separador(),
    ...par('NOMBRE', reserva.nombre),
    ...par('MÓVIL', formatearTelefono(reserva.telefono)),
    separador(),
    'MENÚ DEL DÍA',
    ...envolver(String(reserva.menuNombre).toUpperCase()),
    separador(),
    ...par('MEDIO', ETIQUETAS[reserva.medio] || '-'),
    ...par('PAGO', ETIQUETAS[reserva.pago] || '-'),
    separador(),
    '',
  ];

  // Deber dinero no puede quedarse en una línea más entre otras diez. Va
  // marcado y aparte, porque es la única parte del ticket que pide una
  // acción de quien lo recibe.
  if (debe) {
    lineas.push(separador('*'), centrar('PENDIENTE DE PAGO'), separador('*'), '');
  }

  lineas.push(
    centrar('PRESENTA ESTE TICKET AL'),
    centrar('RECLAMAR TU ALMUERZO'),
    '',
    centrar('GRACIAS POR TU VISITA'),
    '',
    separador('='),
  );

  // Sin espacios al final de línea: en un bloque monoespaciado no se ven,
  // pero se copian, y ensucian cualquier sitio donde se pegue el ticket.
  return lineas.map((l) => l.replace(/\s+$/, '')).join('\n');
}

/**
 * El ticket envuelto para WhatsApp.
 *
 * Las tres comillas invertidas son lo que hace que WhatsApp lo muestre en
 * monoespaciado; sin ellas, la fuente proporcional descuadra las columnas y
 * el recibo deja de parecerlo.
 */
export function mensajeWhatsApp(reserva, cafeteria) {
  return '```\n' + construirTicket(reserva, cafeteria) + '\n```';
}

/**
 * Enlace que abre WhatsApp con el ticket ya escrito para ese móvil.
 *
 * Es el puente manual mientras no exista la automatización: abre la
 * conversación con el mensaje puesto, y **quien atiende pulsa enviar**. No
 * manda nada por su cuenta, que es justo lo que debe hacer mientras no haya
 * una plantilla aprobada ni un consentimiento registrado.
 *
 * Los móviles se guardan en diez dígitos, sin indicativo; `wa.me` lo exige,
 * así que se antepone el 57 de Colombia.
 *
 * @returns {string|null} null si el móvil no sirve para escribir por WhatsApp
 */
export function enlaceWhatsApp(reserva, cafeteria, indicativo = '57') {
  const digitos = String(reserva.telefono || '').replace(/\D/g, '');
  if (digitos.length !== 10) return null;
  const texto = encodeURIComponent(mensajeWhatsApp(reserva, cafeteria));
  return `https://wa.me/${indicativo}${digitos}?text=${texto}`;
}
