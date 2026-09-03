-- reservasCafeterias · datos de PRUEBA para el control de salidas
-- ===========================================================================
--
-- NO es una migración: no lleva número, no es parte del historial del
-- esquema, y no se ejecuta «una vez para siempre» como los archivos
-- `NN-algo.sql`. Es un script de usar y tirar para tener algo que mirar en
-- las pestañas del historial mientras se prueban.
--
-- Se ejecuta DESPUÉS de `26-renombrar-salidas-a-produccion.sql` — escribe en
-- la columna `produccion`, que es como se llama hoy.
--
-- Cubre de hace seis meses hasta AYER: hoy ya se está cerrando caja de verdad,
-- y un cierre inventado de hoy taparía el que falta por registrar.
--
-- ── Datos con FORMA, no ruido ──────────────────────────────────────────────
--
-- La primera versión sorteaba `ventas = random() * 40` para cada casilla, y el
-- resultado no servía para probar nada: todos los productos vendían lo mismo,
-- todas las sedes eran del mismo tamaño y no había ni un patrón que encontrar
-- —que es justo lo que las pantallas existen para encontrar—. Ahora:
--
--   · cada SEDE tiene un tamaño propio y estable (×0,6 a ×1,4)
--   · cada PRODUCTO tiene un volumen propio y estable (×0,25 a ×2,25): unos
--     se venden a cientos y otros a decenas, como en la vida
--   · el VIERNES cae y el LUNES sube, así que hay efecto de día de la semana
--   · cada par (sede, producto) tiene su propia tasa de merma, de 0 a ~9%: hay
--     combinaciones que se descuadran siempre y otras que no fallan nunca
--
-- Los pesos se derivan del número de la sede y del orden del producto, así que
-- son ESTABLES: la sede grande es grande todos los días y el producto flojo
-- sigue siendo el flojo. Lo único sorteado es el ruido diario y la merma.
--
-- ── Cómo se cuenta un día ──────────────────────────────────────────────────
--
-- Primero se produce y después se vende, que es el orden real:
--
--   producción = volumen de la sede × del producto × del día × ruido
--   ventas     = producción − merma
--
--   35% del tiempo la merma es cero (cuadró)
--   60% se pierde producto, y CUÁNTO depende de la tasa de ese par
--    5% se vende más de lo producido: vino de otra sede (merma negativa)
--
-- Un 3% de las casillas deja una de las dos cifras sin contar, para que
-- también haya con qué probar «vacío no es cero».
--
-- ── El sorteo va por FILA, y de ahí los `MATERIALIZED` ─────────────────────
--
-- Esto ya estuvo mal una vez y generó seis meses de datos inservibles: los
-- sorteos vivían en un `CROSS JOIN LATERAL (SELECT random() …)` que no
-- referenciaba ninguna columna de fuera. Sin esa referencia la subconsulta NO
-- está correlacionada, así que Postgres la evalúa UNA sola vez para toda la
-- consulta: las 2.873 líneas salieron con el mismo `ventas = 19` y todas
-- cuadrando exacto.
--
-- Un CTE sobre filas de verdad sí evalúa `random()` por fila. `MATERIALIZED`
-- es la otra mitad: sin él Postgres puede incorporar el CTE a la consulta de
-- abajo, y entonces un valor que se lee DOS veces se sortearía dos veces.
--
-- ── Cómo se borran, «de manera sencilla y rápida» ─────────────────────────
--
-- Cada fila que crea este script lleva `guardado_por_nombre = '__DATOS_PRUEBA__'`,
-- un marcador que ninguna fila real puede tener —`salidas.guardar` siempre
-- pone ahí el nombre de una cuenta de verdad—. Borrar todo es UNA sentencia:
--
--     DELETE FROM salida_cierre WHERE guardado_por_nombre = '__DATOS_PRUEBA__';
--
-- Se lleva las líneas por delante solas: `salida_linea.cierre_id` tiene
-- `ON DELETE CASCADE` (`19-control-salidas.sql`).
--
-- ── Cómo se usa ────────────────────────────────────────────────────────
--
-- Borrar lo anterior con la sentencia de arriba y pegar este archivo entero en
-- el editor SQL de Supabase. Volver a correrlo SIN borrar no añade nada: el
-- `ON CONFLICT DO NOTHING` deja los cierres como están y sin cierres nuevos no
-- hay líneas nuevas.

BEGIN;

WITH
/*
 * Hasta AYER, no hasta hoy.
 *
 * Hoy se está cerrando caja de verdad mientras esto corre. Llegar hasta
 * `CURRENT_DATE` inventaría el cierre de las sedes que todavía no han
 * registrado el suyo, y a media tarde el control diría que ya cuadraron.
 * El `ON CONFLICT` protege lo que YA está escrito, pero no lo que falta por
 * escribir — y eso es justo lo que hoy tiene de más que cualquier otro día.
 */
dias AS (
  SELECT d::date AS fecha
    FROM generate_series(
           (CURRENT_DATE - INTERVAL '6 months')::date,
           CURRENT_DATE - 1,
           '1 day'
         ) AS d
   WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5
),
/* Las sedes, numeradas: ese número es lo que le da a cada una un tamaño
 * propio más abajo. Estable mientras no cambie el catálogo. */
sedes AS (
  SELECT id, (row_number() OVER (ORDER BY codigo))::int AS n
    FROM cafeteria WHERE activa
),
nuevos_cierres AS (
  INSERT INTO salida_cierre (fecha, cafeteria_id, guardado_por_nombre)
  SELECT dias.fecha, sedes.id, '__DATOS_PRUEBA__'
    FROM dias CROSS JOIN sedes
   -- El 15% que falta son los días que una sede no cerró: el hueco que el
   -- control existe para señalar.
   WHERE random() < 0.85
  ON CONFLICT (fecha, cafeteria_id) DO NOTHING
  RETURNING id, fecha, cafeteria_id
),
/* Los pares (cierre, producto) que se cuentan ese día. */
pares AS (
  SELECT nc.id AS cierre_id, nc.fecha, s.n AS n_sede,
         sp.id AS producto_id, sp.orden, sp.nombre
    FROM nuevos_cierres nc
    JOIN sedes s ON s.id = nc.cafeteria_id
    CROSS JOIN salida_producto sp
   WHERE sp.activo
     AND random() < 0.95
),
/*
 * Los pesos estables y los sorteos del día.
 *
 * Los pesos salen de aritmética sobre el número de la sede y el orden del
 * producto, no de un sorteo: así la sede grande es grande TODOS los días y el
 * producto flojo sigue siendo el flojo. Los múltiplos primos (7, 13) reparten
 * los valores en vez de dejar a productos vecinos con el mismo peso. Nada de
 * esto se guarda en ninguna parte; se deriva al generar.
 */
sorteo AS MATERIALIZED (
  SELECT
    p.cierre_id, p.producto_id, p.orden, p.nombre,
    -- ×0,6 a ×1,4: el tamaño de la sede.
    0.6 + (p.n_sede % 5) * 0.2                    AS peso_sede,
    -- ×0,25 a ×2,25: unos platos se venden a cientos y otros a decenas.
    0.25 + ((p.orden * 7) % 9) * 0.25             AS peso_producto,
    -- 0% a 9%: hay pares que se descuadran siempre y otros que no fallan.
    ((p.orden * 13 + p.n_sede * 7) % 10) / 100.0  AS tasa_merma,
    -- El viernes se produce menos y el lunes más: da un patrón semanal que
    -- buscar en la pestaña de variabilidad.
    CASE EXTRACT(ISODOW FROM p.fecha) WHEN 1 THEN 1.08 WHEN 5 THEN 0.72 ELSE 1.0 END
      AS factor_dia,
    0.8 + random() * 0.4 AS ruido,
    random()             AS azar,
    random()             AS magnitud,
    (random() < 0.03)    AS sin_ventas,
    (random() < 0.03)    AS sin_produccion
    FROM pares p
),
/* La producción del día, ya redondeada: las ventas se calculan a partir de
 * ella, y por eso hace falta tenerla resuelta antes. */
cifras AS MATERIALIZED (
  SELECT
    s.*,
    GREATEST(round(45 * s.peso_sede * s.peso_producto * s.factor_dia * s.ruido), 0)::int
      AS produccion
    FROM sorteo s
)
INSERT INTO salida_linea (cierre_id, producto_id, orden, producto_nombre, ventas_registradas, produccion)
SELECT
  c.cierre_id,
  c.producto_id,
  c.orden,
  c.nombre,
  CASE WHEN c.sin_ventas THEN NULL ELSE GREATEST(c.produccion - CASE
    -- 35% cuadra exacto.
    WHEN c.azar < 0.35 THEN 0
    -- 60% se pierde producto, en proporción a lo que produjo ese par.
    WHEN c.azar < 0.95 THEN ceil(c.produccion * c.tasa_merma * (0.4 + c.magnitud * 1.6))::int
    -- 5% al revés: se vendió más de lo producido porque vino de otra sede.
    ELSE -(1 + floor(c.magnitud * 4))::int
  END, 0) END,
  CASE WHEN c.sin_produccion THEN NULL ELSE c.produccion END
  FROM cifras c;

COMMIT;

/* Comprobación, para leer en la salida: cuántas líneas y cómo quedó el
 * reparto. Lo esperable es ~35% en cero, ~60% positivas y ~5% negativas. */
SELECT COUNT(*)                                              AS lineas,
       COUNT(*) FILTER (WHERE l.diferencia = 0)              AS cuadran,
       COUNT(*) FILTER (WHERE l.diferencia > 0)              AS con_perdida,
       COUNT(*) FILTER (WHERE l.diferencia < 0)              AS de_otra_sede,
       COUNT(*) FILTER (WHERE l.diferencia IS NULL)          AS sin_contar,
       MIN(l.produccion)                                     AS produccion_min,
       MAX(l.produccion)                                     AS produccion_max
  FROM salida_linea l
  JOIN salida_cierre c ON c.id = l.cierre_id
 WHERE c.guardado_por_nombre = '__DATOS_PRUEBA__';

-- ── Para borrarlo todo cuando termines de probar ──────────────────────────
-- DELETE FROM salida_cierre WHERE guardado_por_nombre = '__DATOS_PRUEBA__';
