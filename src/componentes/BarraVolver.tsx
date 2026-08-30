/**
 * El renglón de contexto de una pantalla: de dónde vienes y dónde estás.
 *
 * Antes se llamaba `BarraSesion` y llevaba además quién había entrado y el
 * botón de salir. Eso se mudó a `<Cabecera>`, que es donde puede decir la
 * verdad: la identidad es la misma en todas las pantallas, y aquí acababa
 * mostrando la sede de LO QUE SE ESTABA MIRANDO como si fuera la de la
 * persona.
 *
 * ── Por qué el enlace y el sobretítulo comparten renglón ─────────────────
 *
 * Porque eran dos líneas pequeñas y grises, una encima de otra, diciendo casi
 * lo mismo:
 *
 *     ← Todos los proveedores
 *     PEDIDOS A PROVEEDORES
 *     Historial
 *     Todas las cafeterías
 *
 * Cuatro renglones para situar una pantalla. Ahora son dos: este, con el
 * enlace y el dato que de verdad añade algo —«Pedido n.º 9»—, y el del título.
 * Donde el sobretítulo solo repetía el destino del enlace, como en el
 * historial, directamente no se pasa.
 *
 * Se usa en dos sitios y por eso `contexto` es opcional: dentro del bloque de
 * encabezado en las pantallas que lo tienen, y suelto arriba en las que no.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface Props {
  /** A dónde vuelve esta pantalla, si vuelve a alguna parte. */
  volver?: { a: string; texto: string } | undefined;
  /**
   * Lo que situaba el antiguo sobretítulo: el número del pedido, el tipo de
   * proveedor, la ubicación de la sede. Se omite cuando repetiría el enlace.
   */
  contexto?: ReactNode;
}

export function BarraVolver({ volver, contexto }: Props) {
  // Sin nada que decir no se pinta el renglón: un espacio en blanco reservado
  // «por si acaso» es exactamente lo que sobraba de la versión anterior.
  if (!volver && !contexto) return null;

  return (
    <p className="linea-contexto">
      {volver && <Link className="enlace-volver" to={volver.a}>{volver.texto}</Link>}
      {volver && contexto && <span className="separador" aria-hidden="true">·</span>}
      {contexto && <span className="linea-contexto__donde">{contexto}</span>}
    </p>
  );
}
