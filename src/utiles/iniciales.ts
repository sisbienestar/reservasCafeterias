/**
 * Las iniciales del marcador de posición de las tarjetas.
 *
 * Estaba dentro de `TarjetaCafeteria`. Salió aquí al aparecer las tarjetas de
 * proveedor, que necesitan exactamente lo mismo con otra lista de palabras
 * que ignorar. Copiarla habría dejado dos marcadores que se parecen hasta que
 * alguien corrige uno.
 */

/** Palabras que no aportan identidad y no deben dar la inicial. */
const VACIAS = /^(de|del|la|las|el|los|y)$/i;

/**
 * Hasta dos letras, de las dos primeras palabras con contenido.
 *
 * Dos y no una porque con una sola letra «Bienestar Pro» y «Bienestar
 * Universitario» darían las dos una «B», y sus tarjetas se verían idénticas
 * mientras no haya fotos. «Administración 3» sale como «A3», que es como la
 * llama todo el mundo.
 *
 * `ignorar` añade las palabras genéricas de cada dominio: «cafetería» no
 * distingue una sede de otra, ni «almacén» un proveedor de otro.
 */
export function iniciales(nombre: string, ignorar: RegExp = VACIAS): string {
  const palabras = nombre
    .split(/\s+/)
    .filter((p) => p && !VACIAS.test(p) && !ignorar.test(p));

  const letras = palabras
    .slice(0, 2)
    // Sin esto, «Coca-Cola (Indega)» daría «C(»: el paréntesis es el primer
    // carácter de la segunda palabra y no es una letra.
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, '').charAt(0).toUpperCase())
    .filter(Boolean);

  return letras.join('') || nombre.charAt(0).toUpperCase();
}
