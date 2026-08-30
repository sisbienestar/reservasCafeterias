/**
 * Confirmar antes de lo que no se deshace.
 *
 * Se usa para cancelar una reserva, archivar una cafetería y dar el envío
 * final de un pedido. Ninguna se deshace. No se usa `window.confirm`
 * porque su texto no se puede redactar —no cabe decir A QUIÉN se le va a
 * cancelar la reserva— y porque el navegador lo pinta donde quiere, a veces
 * lejos de donde estaba mirando quien lo pidió.
 *
 * El botón que confirma NO es el que tiene el foco al abrir. Quien va a
 * destruir algo debería tener que llegar hasta el botón, no encontrárselo
 * bajo la tecla que ya venía pulsando.
 */

import { useEffect, useRef } from 'react';

export interface PeticionConfirmacion {
  titulo: string;
  detalle: string;
  /** Texto del botón que confirma. Nunca «Aceptar»: dice qué va a pasar. */
  textoConfirmar: string;
  /**
   * De qué color va ese botón.
   *
   * `peligro` —el de siempre— para lo que DESTRUYE: cancelar una reserva,
   * archivar una cafetería. `primario` para lo que no se deshace pero es el
   * camino normal, como el envío final de un pedido: pintar de rojo un paso
   * que hay que dar todos los días acaba enseñando a ignorar el rojo, y
   * entonces deja de avisar cuando de verdad hay que parar.
   */
  tono?: 'peligro' | 'primario';
  alConfirmar: () => void;
}

interface Props {
  peticion: PeticionConfirmacion | null;
  alCerrar: () => void;
}

export function ModalConfirmacion({ peticion, alCerrar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const refCancelar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const nodo = dialogo.current;
    if (!nodo) return;
    if (peticion && !nodo.open) {
      nodo.showModal();
      refCancelar.current?.focus();
    } else if (!peticion && nodo.open) {
      nodo.close();
    }
  }, [peticion]);

  return (
    <dialog
      className="modal modal--confirmacion"
      ref={dialogo}
      onCancel={alCerrar}
      onClose={alCerrar}
      aria-labelledby="titulo-confirmacion"
    >
      {peticion && (
        <div className="modal__panel">
          <h2 className="modal__titulo" id="titulo-confirmacion">{peticion.titulo}</h2>
          <p className="modal__nota">{peticion.detalle}</p>
          <footer className="modal__pie">
            <button
              ref={refCancelar}
              type="button"
              className="boton boton--secundario"
              onClick={alCerrar}
            >
              Volver
            </button>
            <button
              type="button"
              className={`boton boton--${peticion.tono ?? 'peligro'}`}
              onClick={() => { peticion.alConfirmar(); alCerrar(); }}
            >
              {peticion.textoConfirmar}
            </button>
          </footer>
        </div>
      )}
    </dialog>
  );
}
