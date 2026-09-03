-- reservasCafeterias · datos de PRUEBA para el control de salidas
-- ===========================================================================
--
-- NO es una migración: no lleva número, no es parte del historial del
-- esquema, y no se ejecuta «una vez para siempre» como los archivos
-- `NN-algo.sql`. Es un script de usar y tirar para tener algo que mirar en
-- las pestañas «Consolidado» y «Detallado del día» mientras se prueban.
--
-- Se ejecuta DESPUÉS de `26-renombrar-salidas-a-produccion.sql` — inserta en
-- la columna `produccion`, que es como se llama hoy.
--
-- ── Qué genera ──────────────────────────────────────────────────────────
--
-- Un cierre por cada (día hábil, sede activa) de los últimos 6 meses —de
-- lunes a viernes, con `EXTRACT(ISODOW ...)` entre 1 y 5— y no en TODOS: un
-- 15% de los días-sede se deja sin cerrar a propósito, para que también se
-- vean los huecos («—») que el control existe para señalar. Dentro de cada
-- cierre, cada producto activo tiene un 90% de probabilidad de contarse, y de
-- esos un 5% deja una de las dos cifras sin contar (para probar «vacío no es
-- cero» en las dos pestañas).
--
-- La distribución de la diferencia (producción − ventas) es a propósito
-- DESIGUAL, como en la realidad: es COMÚN producir más de lo que se vende
-- —merma en cocina— y RARO vender más de lo que esta sede produjo —solo pasa
-- si se trajo de otra—.
--
--   35% cuadra exacto            (producción = ventas)
--   55% se pierde producto       (producción = ventas + [1..10])
--   10% se trae de otra sede     (producción = ventas − [1..4], sin bajar de 0)
--
-- ── Cómo se borran, «de manera sencilla y rápida» ─────────────────────────
--
-- Cada fila que crea este script lleva `guardado_por_nombre = '__DATOS_PRUEBA__'`,
-- un marcador que ninguna fila real puede tener —`salidas.guardar` siempre
-- pone ahí el nombre de una cuenta de verdad—. Borrar todo es UNA sola
-- sentencia, sin depender de fechas ni de acordarse de qué se generó:
--
--     DELETE FROM salida_cierre WHERE guardado_por_nombre = '__DATOS_PRUEBA__';
--
-- Se lleva las líneas por delante solas: `salida_linea.cierre_id` tiene
-- `ON DELETE CASCADE` (`19-control-salidas.sql`).
--
-- ── Cómo se usa ────────────────────────────────────────────────────────
--
-- Pegar este archivo entero en el editor SQL de Supabase y ejecutarlo. Se
-- puede volver a correr sin duplicar nada —`ON CONFLICT (fecha, cafeteria_id)
-- DO NOTHING` en el cierre, y las líneas solo se insertan para los cierres que
-- de verdad se crearon en esta pasada—. Para ver una distribución nueva hay
-- que borrar la vieja primero con la sentencia de arriba.

BEGIN;

WITH
dias AS (
  SELECT d::date AS fecha
    FROM generate_series((CURRENT_DATE - INTERVAL '6 months')::date, CURRENT_DATE, '1 day') AS d
   WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5
),
sedes AS (
  SELECT id FROM cafeteria WHERE activa
),
nuevos_cierres AS (
  INSERT INTO salida_cierre (fecha, cafeteria_id, guardado_por_nombre)
  SELECT dias.fecha, sedes.id, '__DATOS_PRUEBA__'
    FROM dias CROSS JOIN sedes
   WHERE random() < 0.85
  ON CONFLICT (fecha, cafeteria_id) DO NOTHING
  RETURNING id
)
INSERT INTO salida_linea (cierre_id, producto_id, orden, producto_nombre, ventas_registradas, produccion)
SELECT
  nc.id,
  sp.id,
  sp.orden,
  sp.nombre,
  CASE WHEN r.sin_ventas THEN NULL ELSE r.ventas END,
  CASE WHEN r.sin_produccion THEN NULL ELSE GREATEST(r.ventas + d.descuadre, 0) END
  FROM nuevos_cierres nc
  CROSS JOIN salida_producto sp
  CROSS JOIN LATERAL (
    SELECT
      floor(random() * 40)::int AS ventas,
      (random() < 0.05)         AS sin_ventas,
      (random() < 0.05)         AS sin_produccion,
      -- Un solo sorteo para decidir la banda; los `random()` de las ramas de
      -- abajo solo deciden la MAGNITUD dentro de la banda ya elegida.
      random()                  AS azar
  ) r
  -- Segundo LATERAL porque Postgres no deja referenciar un alias del mismo
  -- SELECT dentro de él: hace falta un paso más para leer `r.azar`.
  CROSS JOIN LATERAL (
    SELECT CASE
      -- 35% cuadra exacto.
      WHEN r.azar < 0.35 THEN 0
      -- 55% se pierde producto: se produjo de más.
      WHEN r.azar < 0.90 THEN (floor(random() * 10) + 1)::int
      -- 10% restante: se trae de otra sede, el caso raro.
      ELSE -(floor(random() * 4) + 1)::int
    END AS descuadre
  ) d
 WHERE sp.activo
   AND random() < 0.9;

COMMIT;

/* Comprobación, para leer en la salida. */
SELECT COUNT(*) AS cierres_de_prueba
  FROM salida_cierre WHERE guardado_por_nombre = '__DATOS_PRUEBA__';
SELECT COUNT(*) AS lineas_de_prueba
  FROM salida_linea l JOIN salida_cierre c ON c.id = l.cierre_id
 WHERE c.guardado_por_nombre = '__DATOS_PRUEBA__';

-- ── Para borrarlo todo cuando termines de probar ──────────────────────────
-- DELETE FROM salida_cierre WHERE guardado_por_nombre = '__DATOS_PRUEBA__';
