/**
 * El día del cierre: la fecha escrita en cristiano, y el calendario al pulsar.
 *
 * ── Por qué no es un `<input type="date">` a secas ────────────────────────
 *
 * Porque un `input` de fecha se pinta en el formato del NAVEGADOR, no en el
 * del país. En un Chrome en inglés, el 2 de septiembre sale «09/02/2026», que
 * aquí se lee como el 9 de febrero. Estaba pasando: la cabecera decía
 * «Miércoles, 2 de septiembre» y el campo, justo debajo, «09/02/2026».
 *
 * No hay forma de cambiarle el formato ni desde CSS ni desde JavaScript. Lo
 * único que se puede es taparlo: el texto que se ve es nuestro y el `input`
 * va encima, transparente, para que siga siendo él quien recibe el foco, el
 * teclado y el calendario nativo.
 *
 * ── Y por qué hace falta `showPicker()` ──────────────────────────────────
 *
 * Porque Chrome abre el calendario al pulsar SU ICONO, no el resto del campo.
 * Con el `input` transparente ese icono es invisible, así que el clic caía en
 * la parte del texto y no pasaba nada: parecía que la fecha no se podía
 * cambiar. `showPicker()` lo abre desde donde sea que se haya pulsado.
 *
 * Va en try/catch porque puede lanzar —un navegador que no lo tenga, o una
 * llamada sin gesto del usuario detrás—. Si lanza no se pierde nada: el
 * `input` sigue enfocado y las flechas del teclado siguen moviendo la fecha,
 * que es el camino de siempre.
 */

import { formatearFechaCorta, nombreDiaCorto } from '../../utiles/fechas.js';

export function SelectorDia({ fecha, alCambiar }: {
  fecha: string;
  alCambiar: (fecha: string) => void;
}) {
  return (
    <span className="selector-dia">
      {/*
        `aria-hidden` porque es la pintura del valor que ya anuncia el `input`
        de al lado. Sin esto, un lector de pantalla leería la fecha dos veces.
      */}
      <span className="selector-dia__texto" aria-hidden="true">
        {nombreDiaCorto(fecha)} {formatearFechaCorta(fecha)} {fecha.slice(0, 4)}
      </span>

      {/* El icono es NUESTRO: el del navegador viaja dentro del input, que va
          transparente, así que se iría con él. */}
      <svg className="selector-dia__icono" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="3" width="12" height="11" rx="2" fill="none" strokeWidth="1.3" />
        <path d="M2,6.5 H14 M5.5,1.8 V4 M10.5,1.8 V4" strokeWidth="1.3" strokeLinecap="round" />
      </svg>

      <input
        type="date"
        className="selector-dia__nativo"
        value={fecha}
        aria-label="Día del cierre"
        onClick={(e) => {
          try {
            e.currentTarget.showPicker();
          } catch {
            /* Sin `showPicker` queda el comportamiento nativo: el campo se
               enfoca y se navega con el teclado. */
          }
        }}
        onChange={(e) => e.target.value && alCambiar(e.target.value)}
      />
    </span>
  );
}
