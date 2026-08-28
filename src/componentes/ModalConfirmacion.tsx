/**
 * Confirmar antes de destruir.
 *
 * Se usa para cancelar una reserva y para archivar una cafetería: las dos
 * cosas que no se deshacen desde ninguna pantalla. No se usa `window.confirm`
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
  /** Texto del botón que destruye. Nunca «Aceptar»: dice qué va a pasar. */
  textoConfirmar: string;
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
              className="boton boton--peligro"
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
