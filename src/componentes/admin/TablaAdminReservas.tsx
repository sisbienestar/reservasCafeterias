/**
 * Tabla de detalle del administrador.
 *
 * Es más ancha que la de la página operativa —lleva fecha, cafetería y
 * estado— porque aquí se mira a través de días y sedes, no un solo servicio.
 * Se mantiene como componente aparte en vez de parametrizar `TablaReservas`:
 * las dos tablas responden a preguntas distintas y fundirlas obligaría a
 * llenar la de mostrador de condicionales que allí no pintan nada.
 *
 * NO lleva «Medio» ni «Pago». Son datos del cobro de un servicio concreto y
 * quien consulta el histórico busca otra cosa; están dentro del modal de cada
 * reserva y en la exportación a CSV, que sí los lleva.
 */

import type { Reserva } from '../../servicios/reservasServicio.js';
import { formatearTelefono } from '../../utiles/telefono.js';
import { formatearFechaCorta, nombreDiaCorto } from '../../utiles/fechas.js';

const COLUMNAS = [
  'N.º de reserva', 'Fecha', 'Cafetería', 'Nombre', 'Móvil', 'Menú del día', 'Estado',
];

interface Props {
  reservas: Reserva[];
  total: number;
  nombreCafeteria: (id: string) => string;
  alEditar: (reserva: Reserva) => void;
  alVerTicket: (reserva: Reserva) => void;
}

/** Etiqueta de estado. Lleva texto, no solo color: el color no es un dato. */
function MarcaEstado({ estado }: { estado: string }) {
  return (
    <span className={`marca-estado marca-estado--${estado}`}>
      {estado === 'activa' ? 'Activa' : 'Cancelada'}
    </span>
  );
}

export function TablaAdminReservas({
  reservas, total, nombreCafeteria, alEditar, alVerTicket,
}: Props) {
  return (
    <>
      <div className="tabla-envoltorio">
        <table className="tabla tabla--admin">
          <caption className="tabla__caption">
            {total} {total === 1 ? 'reserva encontrada' : 'reservas encontradas'}
          </caption>
          <thead>
            <tr>
              {COLUMNAS.map((texto) => <th key={texto} scope="col">{texto}</th>)}
              <th className="tabla__acciones" scope="col">
                <span className="visualmente-oculto">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {reservas.map((reserva) => {
              const activa = reserva.estado === 'activa';
              return (
                <tr
                  key={reserva.id}
                  className={activa ? 'tabla__fila' : 'tabla__fila tabla__fila--apagada'}
                >
                  {/* El identificador ENTERO: esta tabla cruza sedes y fechas,
                      así que el consecutivo suelto no distinguiría nada. */}
                  <td className="tabla__id-reserva">{reserva.id}</td>
                  <td className="tabla__fecha">
                    {nombreDiaCorto(reserva.fecha)} {formatearFechaCorta(reserva.fecha)}
                  </td>
                  <td className="tabla__menu">{nombreCafeteria(reserva.cafeteriaId)}</td>
                  <td className="tabla__nombre">{reserva.nombre}</td>
                  <td className="tabla__telefono">{formatearTelefono(reserva.telefono)}</td>
                  <td className="tabla__menu">{reserva.menuNombre}</td>
                  <td><MarcaEstado estado={reserva.estado} /></td>
                  <td className="tabla__acciones">
                    {/* Una reserva cancelada no se puede editar: ofrecer el
                        botón sería prometer algo que la API rechaza. */}
                    {activa && (
                      <button
                        type="button"
                        className="boton boton--secundario boton--sm"
                        onClick={() => alEditar(reserva)}
                        aria-label={`Editar la reserva de ${reserva.nombre}`}
                      >
                        Editar
                      </button>
                    )}
                    {/* Tampoco tiene ticket: el comprobante dice «presenta
                        esto al reclamar tu almuerzo», y ese almuerzo ya no
                        existe. Mandarlo sería citar a alguien a recoger algo
                        que no le van a dar. */}
                    {activa && (
                      <button
                        type="button"
                        className="boton boton--secundario boton--sm"
                        onClick={() => alVerTicket(reserva)}
                        aria-label={`Ver el ticket de ${reserva.nombre}`}
                      >
                        Ticket
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/*
        Debajo de la tabla y no encima: es una nota sobre lo que se acaba de
        leer, no una advertencia previa. El servidor devuelve el total real
        aunque solo mande 500 filas, así que sin esto la tabla no cuadraría
        con su propio titular.
      */}
      {reservas.length < total && (
        <p className="tabla__nota">
          Mostrando {reservas.length} de {total} reservas. Afina el filtro para
          verlas todas, o expórtalas a CSV: la exportación las lleva todas.
        </p>
      )}
    </>
  );
}
