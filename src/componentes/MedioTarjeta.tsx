/**
 * La mitad de arriba de una tarjeta: la imagen, o las iniciales si no hay.
 *
 * Estaba dentro de `TarjetaCafeteria` y salió aquí al aparecer las tarjetas de
 * módulo y de proveedor, que necesitan exactamente lo mismo. Copiarla habría
 * dejado tres marcadores de posición que se parecen hasta que alguien corrige
 * uno.
 *
 * El respaldo a iniciales no es adorno: la ruta de la imagen la teclea
 * administración en un panel, así que una errata o un archivo que se borre
 * dejarían el icono de imagen rota dentro de la tarjeta. Con esto, lo peor que
 * pasa es que se vuelve a ver la inicial.
 */

import { useState } from 'react';

interface Props {
  /** Ruta dentro de `public/`, o vacía. */
  imagen: string;
  /** Lo que se pinta cuando no hay imagen o no carga. */
  iniciales: string;
}

/** Donde viven todas las imágenes del sitio. No cambia nunca. */
const CARPETA = '/assets/img/';

/**
 * Convierte lo que hay guardado en una dirección que el navegador entienda.
 *
 * Basta con **el nombre del archivo** —`nutresa.png`—: la carpeta la pone
 * esta función. Escribir `assets/img/` en cada fila era repetir catorce
 * caracteres iguales en todas ellas, y cada repetición es una errata posible.
 *
 * Se siguen aceptando las otras tres formas, y no por si acaso: las rutas del
 * prototipo están guardadas con la carpeta delante, y una dirección completa
 * es lo que haría falta el día que las imágenes se sirvan desde otro sitio.
 *
 *     nutresa.png                 → /assets/img/nutresa.png
 *     assets/img/camilo.jpg       → /assets/img/camilo.jpg
 *     /assets/img/camilo.jpg      → tal cual
 *     https://otro.sitio/x.png    → tal cual
 *
 * La barra del principio importa: sin ella el navegador resuelve contra la
 * dirección actual, así que la misma tarjeta funcionaría en `/` y daría 404
 * en `/pedidos/`.
 */
function aRutaAbsoluta(ruta: string): string {
  const limpia = ruta.trim();
  if (!limpia) return '';

  if (/^(https?:)?\/\//.test(limpia)) return limpia;
  if (limpia.startsWith('/')) return limpia;

  // Lleva carpeta: es una de las del prototipo, solo le falta la raíz.
  if (limpia.includes('/')) return '/' + limpia;

  return CARPETA + limpia;
}

export function MedioTarjeta({ imagen, iniciales }: Props) {
  const [rota, setRota] = useState(false);
  const fuente = aRutaAbsoluta(imagen);
  const hayFoto = Boolean(fuente) && !rota;

  return (
    <div className="tarjeta__medio">
      {hayFoto ? (
        <img
          className="tarjeta__imagen"
          src={fuente}
          /* alt vacío a propósito: la imagen es decorativa y el nombre va
             justo debajo. Describirla aquí obligaría a un lector de pantalla
             a oír dos veces lo mismo. */
          alt=""
          loading="lazy"
          onError={() => setRota(true)}
        />
      ) : (
        <span className="tarjeta__inicial" aria-hidden="true">{iniciales}</span>
      )}
    </div>
  );
}
