/**
 * El ticket de confirmación, en pantalla.
 *
 * Lo que se VE y lo que se ENVÍA salen de la misma función. Mantener dos
 * versiones —una bonita para la pantalla y otra para WhatsApp— acabaría con
 * que una de las dos dijera algo distinto de lo reservado, y la que se
 * enviaría sería siempre la que nadie mira.
 *
 * La única diferencia entre las dos cadenas son las comillas invertidas que
 * WhatsApp necesita para pintar el bloque monoespaciado: se añaden al copiar,
 * no al mostrar, porque en pantalla no significan nada.
 */

import { useEffect, useRef, useState } from 'react';
import type { Reserva } from '../servicios/reservasServicio.js';
import { construirTicket, mensajeWhatsApp, enlaceWhatsApp } from '../utiles/ticket.js';

interface Props {
  reserva: Reserva | null;
  cafeteria: { nombre: string } | null;
  alCerrar: () => void;
}

export function ModalTicket({ reserva, cafeteria, alCerrar }: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const papel = useRef<HTMLPreElement>(null);
  const [aviso, setAviso] = useState('');
  const [avisoEsFallo, setAvisoEsFallo] = useState(false);

  const abierto = reserva !== null && cafeteria !== null;

  useEffect(() => {
    const nodo = dialogo.current;
    if (!nodo) return;
    if (abierto && !nodo.open) {
      setAviso('');
      nodo.showModal();
    } else if (!abierto && nodo.open) {
      nodo.close();
    }
  }, [abierto]);

  if (!abierto) return <dialog className="modal modal--ticket" ref={dialogo} />;

  const texto = construirTicket(reserva, cafeteria);
  const enlace = enlaceWhatsApp(reserva, cafeteria);

  async function copiar() {
    if (!reserva || !cafeteria) return;
    try {
      await navigator.clipboard.writeText(mensajeWhatsApp(reserva, cafeteria));
      setAvisoEsFallo(false);
      setAviso('Ticket copiado. Ya se puede pegar en WhatsApp.');
    } catch {
      // Sin permiso de portapapeles —o sin HTTPS— no se puede copiar solo.
      // Se selecciona el texto para que baste con Ctrl+C: dejarlo en «no se
      // pudo» obligaría a seleccionarlo a mano dentro de un modal.
      const nodo = papel.current;
      if (nodo) {
        const rango = document.createRange();
        rango.selectNodeContents(nodo);
        const seleccion = window.getSelection();
        seleccion?.removeAllRanges();
        seleccion?.addRange(rango);
      }
      setAvisoEsFallo(true);
      setAviso('No se pudo copiar solo: el ticket quedó seleccionado, pulsa Ctrl+C.');
    }
  }

  return (
    <dialog
      className="modal modal--ticket"
      ref={dialogo}
      onCancel={alCerrar}
      onClose={alCerrar}
      onClick={(e) => { if (e.target === dialogo.current) alCerrar(); }}
      aria-labelledby="titulo-ticket"
    >
      <div className="modal__panel">
        <header className="modal__cabecera">
          <h2 className="modal__titulo" id="titulo-ticket">Ticket de confirmación</h2>
          <button type="button" className="modal__cerrar" onClick={alCerrar} aria-label="Cerrar">
            ×
          </button>
        </header>

        <p className="modal__nota">Se envía por WhatsApp al móvil de la reserva.</p>

        <pre className="ticket" ref={papel}>{texto}</pre>

        {aviso && (
          <p className={avisoEsFallo ? 'ticket__aviso ticket__aviso--error' : 'ticket__aviso'}
             role="status">
            {aviso}
          </p>
        )}

        <footer className="modal__pie">
          <button type="button" className="boton boton--secundario" onClick={copiar}>
            Copiar ticket
          </button>

          {/*
            Enlace y no botón: abre WhatsApp con el mensaje ya escrito y QUIEN
            ATIENDE pulsa enviar. No manda nada por su cuenta, que es lo que
            debe hacer mientras no haya una plantilla aprobada ni un
            consentimiento registrado.

            Sin enlace —un móvil que no sirve para WhatsApp— el botón se
            deshabilita en vez de desaparecer: que falte explica más que un
            hueco donde antes había algo.
          */}
          {enlace ? (
            <a className="boton boton--primario" href={enlace}
               target="_blank" rel="noopener noreferrer">
              Abrir en WhatsApp
            </a>
          ) : (
            <span className="boton boton--primario boton--inerte" aria-disabled="true">
              Móvil no válido para WhatsApp
            </span>
          )}
        </footer>
      </div>
    </dialog>
  );
}
