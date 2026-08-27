/**
 * La tabla del histórico. Se parece a la del mostrador pero no es la misma, y
 * las diferencias son las que justifican que sean dos:
 *
 *  · Lleva columna de FECHA y de CAFETERÍA. En el mostrador las dos son
 *    siempre la misma y ocuparían sitio sin decir nada; aquí son el filtro.
 *  · Muestra las CANCELADAS, atenuadas. Es la única pantalla donde se pueden
 *    ver: en el mostrador desaparecen, y ese es justo el sitio donde alguien
 *    querría comprobar qué pasó con una.
 */

import type { Reserva } from '../../servicios/reservasServicio.js';
import { formatearTelefono } from '../../utiles/telefono.js';
import { formatearFechaCorta } from '../../utiles/fechas.js';

const ETIQUETAS: Record<string, string> = {
  presencial: 'Presencial',
  telefono: 'Teléfono',
  pagado: 'Pagado',
  debe: 'Debe',
};

interface Props {
  reservas: Reserva[];
  total: number;
  nombreCafeteria: (id: string) => string;
  alEditar: (reserva: Reserva) => void;
}

const Vacio = () => <span className="tabla__vacio">—</span>;

export function TablaAdminReservas({ reservas, total, nombreCafeteria, alEditar }: Props) {
  return (
    <>
      {/*
        Cuando el límite recorta, hay que DECIRLO. El servidor devuelve el
        total real aunque solo mande 500 filas, y una tabla que enseña 500
        debajo de un titular de 1.240 sin explicar la diferencia parece un
        error de suma. La exportación sí se lleva todas.
      */}
      {total > reservas.length && (
        <p className="tabla__nota" role="status">
          Se muestran las {reservas.length} más recientes de {total}. Exporta el
          CSV para llevarte todas.
        </p>
      )}

      <div className="tabla-envoltorio">
        <table className="tabla tabla--admin">
          <caption className="tabla__caption">
            {total} {total === 1 ? 'reserva encontrada' : 'reservas encontradas'}
          </caption>
          <thead>
            <tr>
              <th scope="col">N.º</th>
              <th scope="col">Fecha</th>
              <th scope="col">Cafetería</th>
              <th scope="col">Nombre</th>
              <th scope="col">Móvil</th>
              <th scope="col">Menú</th>
              <th scope="col">Medio</th>
              <th scope="col">Pago</th>
              <th scope="col">Estado</th>
              <th scope="col"><span className="visualmente-oculto">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {reservas.map((reserva) => {
              const cancelada = reserva.estado === 'cancelada';
              return (
                <tr
                  key={reserva.id}
                  className={cancelada ? 'tabla__fila tabla__fila--apagada' : 'tabla__fila'}
                >
                  <td className="tabla__numero-reserva">{reserva.numero || <Vacio />}</td>
                  <td>{formatearFechaCorta(reserva.fecha)}</td>
                  <td>{nombreCafeteria(reserva.cafeteriaId)}</td>
                  <td className="tabla__nombre">{reserva.nombre}</td>
                  <td className="tabla__telefono">{formatearTelefono(reserva.telefono)}</td>
                  <td className="tabla__menu">{reserva.menuNombre}</td>
                  <td>{reserva.medio ? ETIQUETAS[reserva.medio] : <Vacio />}</td>
                  <td>
                    {reserva.pago
                      ? <span className={`marca-pago marca-pago--${reserva.pago}`}>
                          {ETIQUETAS[reserva.pago]}
                        </span>
                      : <Vacio />}
                  </td>
                  <td>
                    <span className={`marca-estado marca-estado--${reserva.estado}`}>
                      {cancelada ? 'Cancelada' : 'Activa'}
                    </span>
                  </td>
                  <td className="tabla__acciones">
                    {/*
                      Una cancelada no se abre para editar: el servidor lo
                      rechaza con RESERVA_CANCELADA, y ofrecer un botón que
                      siempre falla es peor que no ofrecerlo. Su historial se
                      lee en la propia fila, que ya dice lo que pasó.
                    */}
                    {!cancelada && (
                      <button
                        type="button"
                        className="boton boton--secundario boton--sm"
                        onClick={() => alEditar(reserva)}
                        aria-label={`Abrir la reserva de ${reserva.nombre}`}
                      >
                        Abrir
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
