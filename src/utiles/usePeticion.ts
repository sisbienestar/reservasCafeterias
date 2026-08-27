/**
 * Un enganche para las tres cosas que toda pantalla que consulta necesita:
 * si está cargando, qué llegó y qué falló.
 *
 * En la app vanilla esos tres estados se llevaban a mano en cada página, y de
 * ahí salía la mitad del código de `paginaReserva.js` y `paginaAdmin.js`. El
 * riesgo no era escribir de más: era olvidarse de uno. Una pantalla que no
 * distingue «cargando» de «vacío» enseña «todavía no hay reservas» durante el
 * segundo que tarda en llegar la lista, e invita a registrar una que ya
 * existe.
 *
 * Trae además la protección contra respuestas que llegan tarde. Si se cambia
 * de cafetería antes de que vuelva la consulta anterior, esa respuesta ya no
 * vale: pintarla enseñaría datos de la sede que se acaba de dejar.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ErrorServicio } from '../servicios/api.js';

export interface Peticion<T> {
  datos: T | null;
  cargando: boolean;
  error: string | null;
  /** Código de negocio del último fallo, si lo hubo. */
  codigo: string | null;
  /** Vuelve a lanzar la consulta. */
  recargar: () => void;
}

export function usePeticion<T>(
  consultar: () => Promise<T>,
  dependencias: unknown[],
): Peticion<T> {
  const [datos, setDatos] = useState<T | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  /**
   * El número de la consulta en curso. Cada llamada se queda con el suyo y al
   * volver comprueba que sigue siendo el último; si no, se calla. Es la misma
   * idea que el sello de escrituras de `paginaReserva.js`, aplicada a las
   * lecturas.
   */
  const turno = useRef(0);

  const recargar = useCallback(() => setIntento((n) => n + 1), []);

  useEffect(() => {
    const mio = ++turno.current;
    setCargando(true);
    setError(null);
    setCodigo(null);

    consultar().then(
      (resultado) => {
        if (turno.current !== mio) return;
        setDatos(resultado);
        setCargando(false);
      },
      (fallo: unknown) => {
        if (turno.current !== mio) return;
        // Los datos anteriores se tiran: dejarlos debajo de un mensaje de
        // error los haría parecer vigentes, y no lo son.
        setDatos(null);
        setError(fallo instanceof Error ? fallo.message : 'Ocurrió un error inesperado.');
        setCodigo(fallo instanceof ErrorServicio ? fallo.codigo : null);
        setCargando(false);
      },
    );

    // El turno también sirve de limpieza: al desmontar se invalida el que
    // hubiera en vuelo, así que no se llama a setState sobre nada muerto.
    return () => { turno.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencias, intento]);

  return { datos, cargando, error, codigo, recargar };
}
