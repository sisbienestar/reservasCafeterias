/**
 * Consolidado del día en el mostrador: cuántos de cada plato y cómo va el
 * cobro, en tarjetas pequeñas encima de la tabla.
 *
 * Responde a las dos preguntas que se hacen en voz alta detrás de un
 * mostrador —«¿cuántas bandejas saco?» y «¿cuánto queda por cobrar?»— y que
 * hoy solo se podían contestar contando filas a ojo.
 *
 * Se calcula en el navegador, sobre las reservas que la página ya tiene en
 * memoria: no cuesta ni un viaje al servidor. Consultar un consolidado al
 * backend habría añadido más de un segundo a cada refresco para contar lo que
 * ya estaba aquí.
 *
 * Solo dibuja. Quien decide cuándo llamarlo es `paginaReserva.js`.
 */

import { crear, pintar, limpiar } from './dom.js';

const ETIQUETAS_PAGO = {
  pagado: 'Pagado',
  debe: 'Debe',
};

/**
 * Cuenta por plato y por estado de pago.
 *
 * `sinPago` no es una rareza defensiva: las reservas anteriores a que
 * existiera el campo tienen la celda vacía, y sin esa tercera cuenta las dos
 * primeras no sumarían el total. Un consolidado cuyas partes no cuadran con
 * el total es peor que no tener consolidado.
 *
 * @param {import('../services/reservasService.js').Reserva[]} reservas
 */
function consolidar(reservas) {
  const platos = new Map();
  const pagos = { pagado: 0, debe: 0, sinPago: 0 };

  for (const reserva of reservas) {
    const plato = reserva.menuNombre || 'Sin plato';
    platos.set(plato, (platos.get(plato) || 0) + 1);

    if (reserva.pago === 'pagado' || reserva.pago === 'debe') pagos[reserva.pago]++;
    else pagos.sinPago++;
  }

  // De más pedido a menos, y a igualdad de pedidos por orden alfabético: el
  // mismo criterio que usa el consolidado del servidor, para que las dos
  // pantallas no ordenen lo mismo de dos maneras.
  const porPlato = [...platos.entries()]
    .map(([nombre, total]) => ({ nombre, total }))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'));

  return { porPlato, pagos, total: reservas.length };
}

/** Una tarjeta: el rótulo arriba y la cifra debajo. */
function tarjeta(rotulo, valor, modificador) {
  return crear('li', {
    clase: modificador ? `cifra cifra--${modificador}` : 'cifra',
    hijos: [
      crear('p', { clase: 'cifra__rotulo', texto: rotulo }),
      crear('p', { clase: 'cifra__valor', texto: String(valor) }),
    ],
  });
}

/** Un grupo de tarjetas con su encabezado. */
function grupo(titulo, tarjetas) {
  return crear('div', {
    clase: 'resumen__grupo',
    hijos: [
      crear('h3', { clase: 'resumen__titulo', texto: titulo }),
      crear('ul', { clase: 'resumen__cifras', hijos: tarjetas }),
    ],
  });
}

/**
 * Pinta el consolidado, o lo deja vacío si no hay nada que consolidar.
 *
 * Sin reservas no se dibuja un cero: la tabla de debajo ya dice que todavía
 * no hay ninguna, y repetirlo en cuatro tarjetas a cero solo ocuparía la
 * pantalla con ruido.
 *
 * @param {HTMLElement} contenedor
 * @param {import('../services/reservasService.js').Reserva[]} reservas
 */
export function mostrarResumen(contenedor, reservas) {
  if (!reservas || reservas.length === 0) {
    limpiar(contenedor);
    return;
  }

  const { porPlato, pagos } = consolidar(reservas);

  const tarjetasPago = [
    tarjeta(ETIQUETAS_PAGO.pagado, pagos.pagado, 'pagado'),
    tarjeta(ETIQUETAS_PAGO.debe, pagos.debe, pagos.debe > 0 ? 'debe' : null),
  ];
  // Solo aparece si de verdad hay reservas sin registrar el cobro. Una
  // tarjeta a cero permanente enseñaría a no mirarla.
  if (pagos.sinPago > 0) {
    tarjetasPago.push(tarjeta('Sin registrar', pagos.sinPago, 'sin-dato'));
  }

  pintar(contenedor, crear('div', {
    clase: 'resumen',
    hijos: [
      grupo(
        porPlato.length === 1 ? 'Plato pedido' : 'Platos pedidos',
        porPlato.map((p) => tarjeta(p.nombre, p.total)),
      ),
      grupo('Cobro', tarjetasPago),
    ],
  }));
}
