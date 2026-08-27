/**
 * Tabla de detalle del administrador.
 *
 * Es más ancha que la de la página operativa —lleva fecha, cafetería y
 * estado— porque aquí se mira a través de días y sedes, no un solo servicio.
 * Se mantiene como módulo aparte en vez de parametrizar `tablaReservas.js`:
 * las dos tablas responden a preguntas distintas y fundirlas obligaría a
 * llenar la de mostrador de condicionales que allí no pintan nada.
 */

import { crear, pintar, bloqueEstado } from './dom.js';
import { botonConCarga } from './boton.js';
import { formatearTelefono } from '../utils/telefono.js';
import { formatearFechaCorta, nombreDiaCorto } from '../utils/fechas.js';

const COLUMNAS = ['N.º de reserva', 'Fecha', 'Cafetería', 'Nombre', 'Móvil', 'Menú del día', 'Estado'];

export function mostrarCargando(contenedor) {
  pintar(contenedor, bloqueEstado({ tipo: 'cargando', titulo: 'Buscando reservas…' }));
}

export function mostrarError(contenedor, mensaje, alReintentar) {
  pintar(contenedor, bloqueEstado({
    tipo: 'error',
    titulo: 'No se pudo completar la búsqueda',
    detalle: mensaje,
    accion: alReintentar ? { texto: 'Reintentar', alPulsar: alReintentar } : null,
  }));
}

/** Con girador: abrir el modal consulta la carta de esa fecha. */
function boton(texto, etiqueta, alPulsar) {
  return botonConCarga({ texto, etiqueta, alPulsar });
}

/** Etiqueta de estado. Lleva texto, no solo color: el color no es un dato. */
function marcaEstado(estado) {
  return crear('span', {
    clase: `marca-estado marca-estado--${estado}`,
    texto: estado === 'activa' ? 'Activa' : 'Cancelada',
  });
}

/**
 * @param {HTMLElement} contenedor
 * @param {import('../services/reservasService.js').Reserva[]} reservas
 * @param {{total: number, nombreCafeteria: (id: string) => string,
 *          alEditar: Function, alVerTicket?: Function}} opciones
 *
 * Igual que en la pantalla de mostrador, la fila ofrece «Editar» y «Ticket».
 * Cancelar NO: vive dentro del modal, porque es destructiva y a un clic de
 * distancia en una lista larga se pulsa la fila de al lado sin querer.
 */
export function mostrarReservas(contenedor, reservas, opciones) {
  const { total, nombreCafeteria, alEditar, alVerTicket } = opciones;

  if (reservas.length === 0) {
    pintar(contenedor, bloqueEstado({
      tipo: 'vacio',
      titulo: 'Ninguna reserva coincide con el filtro',
      detalle: 'Prueba a ampliar el rango de fechas o a quitar alguna condición.',
    }));
    return;
  }

  const cabecera = crear('thead', {
    hijos: [
      crear('tr', {
        hijos: [
          ...COLUMNAS.map((texto) => crear('th', { texto, attrs: { scope: 'col' } })),
          crear('th', {
            clase: 'tabla__acciones',
            attrs: { scope: 'col' },
            hijos: [crear('span', { clase: 'visualmente-oculto', texto: 'Acciones' })],
          }),
        ],
      }),
    ],
  });

  const cuerpo = crear('tbody', {
    hijos: reservas.map((r) =>
      crear('tr', {
        clase: r.estado === 'cancelada' ? 'tabla__fila tabla__fila--apagada' : 'tabla__fila',
        hijos: [
          // El identificador entero: esta tabla cruza sedes y fechas, así
          // que el consecutivo suelto no distinguiría nada.
          crear('td', { clase: 'tabla__id-reserva', texto: r.id }),
          crear('td', {
            clase: 'tabla__fecha',
            texto: `${nombreDiaCorto(r.fecha)} ${formatearFechaCorta(r.fecha)}`,
          }),
          crear('td', { clase: 'tabla__menu', texto: nombreCafeteria(r.cafeteriaId) }),
          crear('td', { clase: 'tabla__nombre', texto: r.nombre }),
          crear('td', { clase: 'tabla__telefono', texto: formatearTelefono(r.telefono) }),
          crear('td', { clase: 'tabla__menu', texto: r.menuNombre }),
          crear('td', { hijos: [marcaEstado(r.estado)] }),
          crear('td', {
            clase: 'tabla__acciones',
            hijos: [
              // Una reserva cancelada no se puede editar: ofrecer el botón
              // sería prometer algo que la API rechaza.
              r.estado === 'activa'
                ? boton('Editar', `Editar la reserva de ${r.nombre}`, () => alEditar(r))
                : null,
              // Tampoco tiene ticket: el comprobante dice «presenta esto al
              // reclamar tu almuerzo», y ese almuerzo ya no existe. Mandarlo
              // sería citar a alguien a recoger algo que no le van a dar.
              r.estado === 'activa' && alVerTicket
                ? boton('Ticket', `Ver el ticket de ${r.nombre}`, () => alVerTicket(r))
                : null,
            ],
          }),
        ],
      }),
    ),
  });

  const pie = reservas.length < total
    ? crear('p', {
        clase: 'tabla__nota',
        texto: `Mostrando ${reservas.length} de ${total} reservas. ` +
          'Afina el filtro para verlas todas, o expórtalas a CSV: la exportación las lleva todas.',
      })
    : null;

  pintar(
    contenedor,
    crear('table', {
      clase: 'tabla tabla--admin',
      hijos: [
        crear('caption', {
          clase: 'tabla__caption',
          texto: `${total} ${total === 1 ? 'reserva encontrada' : 'reservas encontradas'}`,
        }),
        cabecera,
        cuerpo,
      ],
    }),
    pie,
  );
}
