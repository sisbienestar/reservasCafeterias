/**
 * Los cuatro estados que una zona de la pantalla puede tener además de tener
 * datos: cargando, vacío, error y sin servicio.
 *
 * Están juntos en un componente y no repartidos por cada vista porque la
 * diferencia entre ellos importa y es fácil de perder. «No hay reservas» y
 * «no se pudieron cargar las reservas» se parecen en la pantalla y no se
 * parecen en nada para quien atiende: una invita a registrar la primera y la
 * otra a reintentar. Con un solo sitio donde se deciden, no puede pasar que
 * una pantalla trate un error como una lista vacía.
 */

import type { ReactNode } from 'react';

export interface Accion { texto: string; alPulsar: () => void }

interface Props {
  tipo: 'cargando' | 'vacio' | 'error';
  titulo: string;
  detalle?: string | undefined;
  accion?: Accion | undefined;
  children?: ReactNode;
}

export function BloqueEstado({ tipo, titulo, detalle, accion, children }: Props) {
  return (
    <div
      className={`estado estado--${tipo}`}
      /*
       * `polite` y no `assertive`: estos bloques aparecen al terminar de
       * cargar, y una interrupción por cada tabla que se refresca hace que un
       * lector de pantalla sea inservible. `role="status"` ya implica polite,
       * pero se deja explícito porque es la decisión, no un detalle.
       */
      role="status"
      aria-live="polite"
    >
      {tipo === 'cargando' && <span className="estado__spinner" aria-hidden="true" />}
      <p className="estado__titulo">{titulo}</p>
      {detalle && <p className="estado__detalle">{detalle}</p>}
      {accion && (
        <button
          type="button"
          className="boton boton--secundario boton--sm"
          onClick={accion.alPulsar}
        >
          {accion.texto}
        </button>
      )}
      {children}
    </div>
  );
}
