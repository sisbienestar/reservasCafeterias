-- reservasCafeterias · el historial pasa a ser una lista de DÍAS
-- ===========================================================================
--
-- Se ejecuta UNA VEZ, entero, DESPUÉS de 20-diferencia-solo-si-se-conto.sql.
--
-- ── Qué cambia ────────────────────────────────────────────────────────────
--
-- `buscar_salidas` devuelve una fila por CIERRE, o sea por (fecha, sede). Con
-- cuatro cafeterías, un mes son ciento veinte filas para responder a una
-- pregunta que se hace por días: «¿cómo cerró el martes?».
--
-- El cierre que importa es el del DÍA, con las cuatro sedes dentro. Esta
-- función devuelve eso: una fila por fecha, con cuántas sedes cerraron y los
-- totales consolidados. Al pulsarla se abre `dia_salidas`, que ya existe y da
-- el detalle sede por sede.
--
-- `buscar_salidas` NO se borra: sigue sirviendo para mirar una sola sede a lo
-- largo del tiempo, que es otra pregunta legítima. Lo que cambia es cuál usa
-- la pantalla de historial.
--
-- ── Cuántas sedes «debían» cerrar ─────────────────────────────────────────
--
-- Se cuentan las cafeterías EN SERVICIO HOY, no las que lo estaban aquel día:
-- la tabla no guarda cuándo abrió o cerró cada sede, así que reconstruirlo
-- sería inventarlo. Con `cerradas` y ese total se lee «3 de 4», que es lo que
-- se quiere saber de un vistazo, y el detalle exacto está a un clic en el
-- resumen del día.

BEGIN;

/* ── Los días con cierre de un rango ────────────────────────────────────
 *
 * `p_cafeteria_id` nulo o vacío significa todas, y quién puede pedir eso lo
 * decide `api/` con la guarda de sede de siempre. Con una sede indicada, los
 * totales son los de ESA sede: el mostrador ve sus propios días.
 *
 * Del más reciente al más antiguo, que es como se lee un historial.
 */
CREATE OR REPLACE FUNCTION dias_salidas(
  p_desde        DATE,
  p_hasta        DATE,
  p_cafeteria_id TEXT
) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH activas AS (
    SELECT COUNT(*) AS n FROM cafeteria WHERE activa
  ),
  por_dia AS (
    SELECT
      c.fecha,
      COUNT(DISTINCT c.cafeteria_id)                        AS cerradas,
      COALESCE(SUM(l.ventas_registradas), 0)                AS total_ventas,
      COALESCE(SUM(l.salidas), 0)                           AS total_salidas,
      /* SUM ignora los NULL, así que un renglón a medio contar no inventa un
       * descuadre. Es la misma regla que impone la columna generada desde
       * `20-diferencia-solo-si-se-conto.sql`. */
      COALESCE(SUM(l.diferencia), 0)                        AS total_diferencia,
      COUNT(l.id)                                           AS renglones
    FROM salida_cierre c
    LEFT JOIN salida_linea l ON l.cierre_id = c.id
    WHERE c.fecha BETWEEN p_desde AND p_hasta
      AND (p_cafeteria_id IS NULL OR p_cafeteria_id = ''
        OR c.cafeteria_id = p_cafeteria_id)
    GROUP BY c.fecha
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'fecha',            d.fecha,
           'cerradas',         d.cerradas,
           /* Con una sede pedida, «de cuántas» es una: preguntar por Camilo
            * Torres y leer «1 de 4» diría que faltan tres que no le tocan. */
           'sedes',            CASE WHEN COALESCE(p_cafeteria_id, '') = ''
                                    THEN (SELECT n FROM activas) ELSE 1 END,
           'renglones',        d.renglones,
           'total_ventas',     d.total_ventas,
           'total_salidas',    d.total_salidas,
           'total_diferencia', d.total_diferencia
         ) ORDER BY d.fecha DESC), '[]'::jsonb)
  FROM por_dia d;
$$;

COMMIT;

/* Comprobación, para leer en la salida: los días con cierre del último mes. */
SELECT jsonb_array_length(
  dias_salidas((CURRENT_DATE - 30)::date, CURRENT_DATE, '')
) AS dias_con_cierre;
