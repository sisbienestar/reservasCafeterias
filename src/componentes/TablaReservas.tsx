/**
 * Tabla de reservas del día.
 *
 * Columnas: N.º · Nombre · Menú del día · Móvil · Medio · Pago · acciones.
 *
 * La fila ofrece «Editar» y «Ticket», las dos cosas que se hacen sobre una
 * reserva concreta y ninguna destructiva. Cancelar NO está aquí: vive dentro
 * del modal, porque a un clic de distancia en una lista de veinte filas se
 * pulsa la de al lado sin querer.
 */

import type { Reserva } from '../servicios/reservasServicio.js';
import { formatearTelefono } from '../utiles/telefono.js';

/** Etiqueta visible de los campos de opción. */
const ETIQUETAS: Record<string, string> = {
  presencial: 'Presencial',
  telefono: 'Teléfono',
  pagado: 'Pagado',
  debe: 'Debe',
};

interface Props {
  reservas: Reserva[];
  /** La reserva recién creada o modificada, para señalarla. */
  idDestacado?: string | null;
  alEditar: (reserva: Reserva) => void;
  alVerTicket: (reserva: Reserva) => void;
}

/** Un valor que no está. Un guion largo y no una celda en blanco: una celda
 *  vacía se lee como un fallo de carga, y esto es un dato que no se registró. */
const Vacio = () => <span className="tabla__vacio">—</span>;

/**
 * Marca de pago. Con texto además del color: quien atiende necesita ver de un
 * vistazo quién debe, y no puede depender de distinguir verde de ámbar.
 */
function MarcaPago({ pago }: { pago: string }) {
  if (!pago) return <Vacio />;
  return <span className={`marca-pago marca-pago--${pago}`}>{ETIQUETAS[pago]}</span>;
}

export function TablaReservas({ reservas, idDestacado, alEditar, alVerTicket }: Props) {
  return (
    <div className="tabla__envoltorio">
      <table className="tabla">
        <thead>
          <tr>
            <th scope="col">N.º</th>
            <th scope="col">Nombre</th>
            <th scope="col">Menú del día</th>
            <th scope="col">Móvil</th>
            <th scope="col">Medio</th>
            <th scope="col">Pago</th>
            {/* Una cabecera vacía deja la columna sin nombre para un lector de
                pantalla; el texto se oculta a la vista, no a la asistencia. */}
            <th scope="col"><span className="visualmente-oculto">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {reservas.map((reserva) => (
            <tr
              key={reserva.id}
              className={reserva.id === idDestacado ? 'tabla__fila tabla__fila--destacada' : 'tabla__fila'}
            >
              {/* El número corto puede faltar en las reservas del formato
                  antiguo. No romper con ellas es parte del contrato. */}
              <td className="tabla__numero-reserva">{reserva.numero || <Vacio />}</td>
              <td className="tabla__nombre">{reserva.nombre}</td>
              <td className="tabla__menu">{reserva.menuNombre}</td>
              <td className="tabla__telefono">{formatearTelefono(reserva.telefono)}</td>
              <td>{reserva.medio ? ETIQUETAS[reserva.medio] : <Vacio />}</td>
              <td><MarcaPago pago={reserva.pago} /></td>
              <td className="tabla__acciones">
                {/*
                  Con solo «Editar» repetido diez veces, un lector de pantalla
                  que recorra los botones fuera de contexto no distingue una
                  fila de otra: de ahí el aria-label con el nombre.
                */}
                <button
                  type="button"
                  className="boton boton--secundario boton--sm"
                  onClick={() => alEditar(reserva)}
                  aria-label={`Editar la reserva de ${reserva.nombre}`}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="boton boton--secundario boton--sm"
                  onClick={() => alVerTicket(reserva)}
                  aria-label={`Ver el ticket de ${reserva.nombre}`}
                >
                  Ticket
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
