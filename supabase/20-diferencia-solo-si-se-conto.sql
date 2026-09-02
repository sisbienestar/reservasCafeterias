-- reservasCafeterias · la diferencia solo existe si se contaron las dos cifras
-- ===========================================================================
--
-- Se ejecuta UNA VEZ, entero, DESPUÉS de 19-control-salidas.sql.
--
-- ── El fallo ──────────────────────────────────────────────────────────────
--
-- La columna generada se declaró así:
--
--     COALESCE(salidas, 0) - COALESCE(ventas_registradas, 0)
--
-- y ese COALESCE convierte «no se contó» en «cero», que es justo la
-- distinción que este módulo entero existe para respetar. Un renglón con 12
-- ventas y las salidas sin contar salía con diferencia −12: un descuadre que
-- nadie tuvo, inventado por un hueco.
--
-- Y no se quedaba en la casilla. `buscar_salidas` suma esa columna para el
-- total del cierre, así que un producto a medio contar ensuciaba el total de
-- la fila del historial. En una herramienta de control, un descuadre falso es
-- peor que ninguno: manda a alguien a buscar en la caja algo que no pasó.
--
-- ── El arreglo ────────────────────────────────────────────────────────────
--
-- La resta a secas. En SQL, cualquier operación con NULL da NULL, así que la
-- diferencia existe cuando existen las dos cifras y no existe cuando falta
-- una — que es exactamente lo que significa.
--
-- `SUM` ignora los NULL, así que los totales del historial pasan a sumar solo
-- lo que de verdad se contó. La pantalla ya lo hacía bien: `Cierre.tsx` solo
-- pinta la diferencia cuando están las dos casillas.

BEGIN;

/* Una columna generada no se puede redefinir: hay que soltarla y volver a
 * declararla. No se pierde nada — se recalcula sola para todas las filas. */
ALTER TABLE salida_linea DROP COLUMN IF EXISTS diferencia;

ALTER TABLE salida_linea
  ADD COLUMN diferencia INT
  GENERATED ALWAYS AS (salidas - ventas_registradas) STORED;

COMMENT ON COLUMN salida_linea.diferencia IS
  'salidas − ventas_registradas. NULL si falta cualquiera de las dos: sin contar las dos cifras no hay diferencia que calcular. Positiva = salió más de lo que registró la caja.';

COMMIT;

/*
 * Comprobación, para leer en la salida.
 *
 * Lo que tiene que salir: ninguna línea con la diferencia puesta a la que le
 * falte una de las dos cifras.
 */
SELECT COUNT(*) AS lineas,
       COUNT(*) FILTER (WHERE diferencia IS NULL)     AS sin_diferencia,
       COUNT(*) FILTER (WHERE diferencia IS NOT NULL
                          AND (salidas IS NULL
                            OR ventas_registradas IS NULL)) AS mal_calculadas
  FROM salida_linea;
