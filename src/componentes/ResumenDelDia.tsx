/**
 * Consolidado del día en el mostrador: cuántos de cada plato y cómo va el
 * cobro, en tarjetas pequeñas encima de la tabla.
 *
 * Responde a las dos preguntas que se hacen en voz alta detrás de un
 * mostrador —«¿cuántas bandejas saco?» y «¿cuánto queda por cobrar?»— y que
 * antes solo se podían contestar contando filas a ojo.
 *
 * Se calcula en el navegador, sobre las reservas que la pantalla ya tiene:
 * no cuesta ni un viaje. Pedirle el consolidado al servidor habría añadido
 * una ida y vuelta a cada refresco para contar lo que ya estaba aquí.
 */

import { useMemo } from 'react';
import type { Reserva } from '../servicios/reservasServicio.js';

interface Props { reservas: Reserva[] }

/**
 * Cuenta por plato y por estado de pago.
 *
 * `sinPago` no es una rareza defensiva: las reservas anteriores a que
 * existiera el campo llegan vacías, y sin esa tercera cuenta las dos primeras
 * no sumarían el total. Un consolidado cuyas partes no cuadran con el total
 * es peor que no tener consolidado.
 */
function consolidar(reservas: Reserva[]) {
  const platos = new Map<string, number>();
  const pagos = { pagado: 0, debe: 0, sinPago: 0 };

  for (const reserva of reservas) {
    const plato = reserva.menuNombre || 'Sin plato';
    platos.set(plato, (platos.get(plato) ?? 0) + 1);

    if (reserva.pago === 'pagado' || reserva.pago === 'debe') pagos[reserva.pago]++;
    else pagos.sinPago++;
  }

  // De más pedido a menos, y a igualdad de pedidos por orden alfabético: el
  // mismo criterio que usa el consolidado del servidor, para que las dos
  // pantallas no ordenen lo mismo de dos maneras.
  const porPlato = [...platos.entries()]
    .map(([nombre, total]) => ({ nombre, total }))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'));

  return { porPlato, pagos };
}

function Cifra({ rotulo, valor, modificador }: {
  rotulo: string; valor: number; modificador?: string | undefined;
}) {
  return (
    <li className={modificador ? `cifra cifra--${modificador}` : 'cifra'}>
      <p className="cifra__rotulo">{rotulo}</p>
      <p className="cifra__valor">{valor}</p>
    </li>
  );
}

export function ResumenDelDia({ reservas }: Props) {
  const { porPlato, pagos } = useMemo(() => consolidar(reservas), [reservas]);

  // Sin reservas no se dibuja un cero: la tabla de debajo ya dice que todavía
  // no hay ninguna, y repetirlo en cuatro tarjetas a cero solo ocuparía la
  // pantalla con ruido.
  if (reservas.length === 0) return null;

  return (
    <div className="resumen">
      <div className="resumen__grupo">
        <h3 className="resumen__titulo">
          {porPlato.length === 1 ? 'Plato pedido' : 'Platos pedidos'}
        </h3>
        <ul className="resumen__cifras">
          {porPlato.map((p) => <Cifra key={p.nombre} rotulo={p.nombre} valor={p.total} />)}
        </ul>
      </div>

      <div className="resumen__grupo">
        <h3 className="resumen__titulo">Cobro</h3>
        <ul className="resumen__cifras">
          <Cifra rotulo="Pagado" valor={pagos.pagado} modificador="pagado" />
          <Cifra rotulo="Debe" valor={pagos.debe} modificador={pagos.debe > 0 ? 'debe' : undefined} />
          {/* Solo aparece si de verdad hay reservas sin registrar el cobro.
              Una tarjeta a cero permanente enseñaría a no mirarla. */}
          {pagos.sinPago > 0 && (
            <Cifra rotulo="Sin registrar" valor={pagos.sinPago} modificador="sin-dato" />
          )}
        </ul>
      </div>
    </div>
  );
}
