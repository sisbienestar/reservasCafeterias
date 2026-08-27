/**
 * El consolidado: los totales del filtro, la serie por día y los repartos por
 * sede y por plato.
 *
 * Las cifras NO se calculan aquí. Llegan ya sumadas dentro de la respuesta de
 * `reservas.buscar`, porque el administrador puede pedir un trimestre y
 * mandar miles de filas al navegador para que cuente es justo lo que no hay
 * que hacer. Esta pantalla solo dibuja.
 *
 * Los gráficos son SVG escrito a mano y no una librería. Son tres formas
 * sencillas —barras verticales, barras horizontales— y una dependencia de
 * gráficos pesa más que todo lo que hay aquí; además tendría que llegar al
 * navegador, y el proyecto lleva desde el principio sin nada que lo haga.
 */

import type { ResumenReservas } from '../../servicios/reservasServicio.js';
import { formatearFechaCorta, nombreDiaCorto } from '../../utiles/fechas.js';

interface Props { resumen: ResumenReservas }

export function Consolidado({ resumen }: Props) {
  const { totales, porDia, porCafeteria, porPlato } = resumen;

  return (
    <div className="consolidado">
      <ul className="resumen__cifras resumen__cifras--anchas">
        <Cifra rotulo="Reservas" valor={totales.total} />
        <Cifra rotulo="Activas" valor={totales.activas} modificador="pagado" />
        <Cifra rotulo="Canceladas" valor={totales.canceladas}
               modificador={totales.canceladas > 0 ? 'debe' : undefined} />
        <Cifra rotulo="Días con servicio" valor={totales.diasConServicio} />
        <Cifra rotulo="Promedio diario" valor={totales.promedioDiario} />
      </ul>

      <SerieDiaria porDia={porDia} />

      <div className="consolidado__columnas">
        <BarrasHorizontales
          titulo="Por cafetería"
          filas={porCafeteria.map((c) => ({ nombre: c.nombre, total: c.activas }))}
          vacio="Ninguna reserva activa en este rango."
        />
        <BarrasHorizontales
          titulo="Platos más pedidos"
          filas={porPlato}
          vacio="Ningún plato servido en este rango."
        />
      </div>
    </div>
  );
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

/**
 * La serie por día, en barras.
 *
 * `porDia` trae TODOS los días del rango, también los que no tuvieron ni una
 * reserva: eso lo garantiza el servidor. Un hueco es información —un puente,
 * unas vacaciones— y omitirlo juntaría dos fechas lejanas como si fueran
 * consecutivas, que es una gráfica que miente.
 */
function SerieDiaria({ porDia }: { porDia: ResumenReservas['porDia'] }) {
  if (porDia.length === 0) return null;

  const mayor = Math.max(1, ...porDia.map((d) => d.activas + d.canceladas));
  const ALTO = 160;

  // Con muchos días no cabe una etiqueta por barra. Se van poniendo cada N
  // para que el eje siga situando sin amontonarse.
  const paso = Math.ceil(porDia.length / 12);

  return (
    <section className="grafica">
      <h3 className="grafica__titulo">Reservas por día</h3>
      <div className="grafica__lienzo" role="img"
           aria-label={`Serie de ${porDia.length} días. Máximo diario: ${mayor} reservas.`}>
        {porDia.map((dia, i) => {
          const alturaActivas = (dia.activas / mayor) * ALTO;
          const alturaCanceladas = (dia.canceladas / mayor) * ALTO;
          return (
            <div className="grafica__columna" key={dia.fecha}>
              <div className="grafica__barras" style={{ height: `${ALTO}px` }}>
                {/* Las canceladas encima de las activas: apiladas, la altura
                    total es el total de reservas del día, que es lo que se
                    quiere comparar de un vistazo. */}
                <span className="grafica__barra grafica__barra--cancelada"
                      style={{ height: `${alturaCanceladas}px` }} />
                <span className="grafica__barra grafica__barra--activa"
                      style={{ height: `${alturaActivas}px` }} />
              </div>
              <span className="grafica__etiqueta">
                {i % paso === 0
                  ? `${nombreDiaCorto(dia.fecha)} ${formatearFechaCorta(dia.fecha)}`
                  : ''}
              </span>
            </div>
          );
        })}
      </div>
      <p className="grafica__leyenda">
        <span className="grafica__muestra grafica__muestra--activa" aria-hidden="true" /> Activas
        <span className="grafica__muestra grafica__muestra--cancelada" aria-hidden="true" /> Canceladas
      </p>
    </section>
  );
}

/** Reparto en barras horizontales, de mayor a menor. El orden lo trae ya el
 *  servidor: reordenar aquí haría que dos pantallas contaran distinto. */
function BarrasHorizontales({ titulo, filas, vacio }: {
  titulo: string;
  filas: { nombre: string; total: number }[];
  vacio: string;
}) {
  const mayor = Math.max(1, ...filas.map((f) => f.total));

  return (
    <section className="grafica">
      <h3 className="grafica__titulo">{titulo}</h3>
      {filas.length === 0 ? (
        <p className="grafica__vacio">{vacio}</p>
      ) : (
        <ul className="barras">
          {filas.map((fila) => (
            <li className="barras__fila" key={fila.nombre}>
              <span className="barras__nombre">{fila.nombre}</span>
              <span className="barras__pista">
                <span className="barras__relleno"
                      style={{ width: `${(fila.total / mayor) * 100}%` }} />
              </span>
              <span className="barras__valor">{fila.total}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
