-- reservasCafeterias · «salidas» pasa a llamarse «producción»
-- ===========================================================================
--
-- Se ejecuta UNA VEZ, entero, DESPUÉS de 25-diferencia-en-consolidado.sql.
--
-- ── El cambio de negocio ───────────────────────────────────────────────────
--
-- La segunda cifra de cada renglón dejó de significar «lo que salió del
-- mostrador hacia quien come» —así llevaba documentado el módulo desde
-- `19-control-salidas.sql`— y pasa a significar cuánto se PRODUJO en cocina
-- ese día. Ejemplo: 4 almuerzos vendidos y registrados contra 10 producidos
-- → la diferencia positiva (+6) dice que se perdieron seis almuerzos, no que
-- «salieron» seis de más.
--
-- La fórmula no cambia —sigue siendo lo segundo menos lo primero, y sigue
-- siendo NULL si falta cualquiera de las dos—: lo único que cambia es qué
-- representa el segundo número. Por eso esto es un RENOMBRE, no un cambio de
-- forma.
--
-- ── Por qué se renombra la columna y no solo la pantalla ──────────────────
--
-- La regla que ya se aprendió en este proyecto —`16-unificar-estados.sql`—
-- es que pantalla y base tienen que usar las MISMAS palabras. La última vez
-- que no coincidieron («Confirmado» en la pantalla, `confirmado` NO en la
-- base) costó tres días de peticiones ambiguas. Dejar la columna como
-- `salidas` mientras la pantalla dice «Producción» sería repetir el mismo
-- error a propósito.
--
-- ── Qué NO cambia ──────────────────────────────────────────────────────────
--
-- El módulo se sigue llamando «control de salidas», las tablas siguen siendo
-- `salida_cierre`/`salida_linea`/`salida_producto`, y las acciones siguen
-- siendo `salidas.*`. Ese nombre describe el módulo en general —«lo que sale
-- de la cocina», dicho con más amplitud—, no la cifra concreta que se mide
-- en cada renglón. Solo esa cifra se renombra.
--
-- ── Por qué basta con RENAME COLUMN ────────────────────────────────────────
--
-- Postgres guarda el CHECK y la fórmula de la columna GENERADA (`diferencia`)
-- por posición de columna, no por el texto «salidas». Renombrar la columna
-- las actualiza a las dos solas, sin redeclarar nada del esquema y sin tocar
-- ni una fila ya escrita.
--
-- Lo que SÍ hay que redeclarar son las funciones que mencionan `salidas` en
-- su cuerpo —el nombre de columna es texto ahí, dentro del SQL de cada una—.
-- Se redeclara la versión VIGENTE de cada una, tomada del archivo numerado
-- que la dejó como está hoy.

BEGIN;

ALTER TABLE salida_linea RENAME COLUMN salidas TO produccion;

COMMENT ON COLUMN salida_linea.produccion IS
  'Cuánto se produjo de este plato ese día. NULL si no se contó.';

COMMENT ON COLUMN salida_linea.diferencia IS
  'producción − ventas_registradas. NULL si falta cualquiera de las dos: sin contar las dos cifras no hay diferencia que calcular. Positiva = se produjo más de lo que la caja registró, es decir, se perdió producto. Negativa = se vendió más de lo que esta sede produjo, casi siempre porque se trajo de otra.';

/* ── Guardar un cierre: vigente en 22-responsable-no-se-reescribe.sql ──── */
CREATE OR REPLACE FUNCTION guardar_cierre_salidas(
  p_fecha              DATE,
  p_cafeteria_id       TEXT,
  p_responsable_nombre TEXT,
  p_guardado_por       UUID,
  p_guardado_nombre    TEXT,
  -- [{producto_id, ventas_registradas, produccion}]
  p_lineas             JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id        BIGINT;
  v_pedidas   INT;
  v_escritas  INT;
BEGIN
  v_pedidas := jsonb_array_length(p_lineas);

  INSERT INTO salida_cierre (
    fecha, cafeteria_id, responsable_nombre,
    guardado_por, guardado_por_nombre
  ) VALUES (
    p_fecha, p_cafeteria_id, COALESCE(p_responsable_nombre, ''),
    p_guardado_por, COALESCE(p_guardado_nombre, '')
  )
  ON CONFLICT (fecha, cafeteria_id) DO UPDATE SET
    responsable_nombre  = COALESCE(
                            NULLIF(salida_cierre.responsable_nombre, ''),
                            EXCLUDED.responsable_nombre
                          ),
    guardado_por        = EXCLUDED.guardado_por,
    guardado_por_nombre = EXCLUDED.guardado_por_nombre,
    actualizado_en      = now()
  RETURNING id INTO v_id;

  DELETE FROM salida_linea WHERE cierre_id = v_id;

  INSERT INTO salida_linea (
    cierre_id, producto_id, orden, producto_nombre,
    ventas_registradas, produccion
  )
  SELECT v_id, sp.id, sp.orden, sp.nombre, l.ventas_registradas, l.produccion
    FROM jsonb_to_recordset(p_lineas) AS l(
      producto_id        BIGINT,
      ventas_registradas INT,
      produccion         INT
    )
    JOIN salida_producto sp ON sp.id = l.producto_id AND sp.activo;

  GET DIAGNOSTICS v_escritas = ROW_COUNT;

  IF v_escritas <> v_pedidas THEN
    RAISE EXCEPTION 'PRODUCTO_AJENO';
  END IF;

  RETURN detalle_cierre_salidas(p_fecha, p_cafeteria_id);
END;
$$;

/* ── Leer un cierre: vigente en 19-control-salidas.sql ──────────────────── */
CREATE OR REPLACE FUNCTION detalle_cierre_salidas(p_fecha DATE, p_cafeteria_id TEXT)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id',                  c.id,
    'fecha',               c.fecha,
    'cafeteria_id',        c.cafeteria_id,
    'cafeteria_nombre',    caf.nombre,
    'responsable_nombre',  c.responsable_nombre,
    'guardado_por_nombre', c.guardado_por_nombre,
    'guardado_en',         c.guardado_en,
    'actualizado_en',      c.actualizado_en,
    'lineas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'producto_id',        l.producto_id,
               'nombre',             l.producto_nombre,
               'ventas_registradas', l.ventas_registradas,
               'produccion',         l.produccion,
               'diferencia',         l.diferencia
             ) ORDER BY l.orden, l.id)
        FROM salida_linea l WHERE l.cierre_id = c.id
    ), '[]'::jsonb)
  )
  FROM salida_cierre c
  JOIN cafeteria caf ON caf.id = c.cafeteria_id
  WHERE c.fecha = p_fecha AND c.cafeteria_id = p_cafeteria_id;
$$;

/* ── El día entero, para el formulario de cierre: vigente en 19 ─────────── */
CREATE OR REPLACE FUNCTION dia_salidas(p_fecha DATE)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'fecha', p_fecha,
    'productos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('producto_id', sp.id, 'nombre', sp.nombre)
                       ORDER BY sp.orden)
        FROM salida_producto sp WHERE sp.activo
    ), '[]'::jsonb),
    'cafeterias', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'cafeteria_id',       caf.id,
               'cafeteria_nombre',   caf.nombre,
               'cerrado',            c.id IS NOT NULL,
               'responsable_nombre', COALESCE(c.responsable_nombre, ''),
               'lineas', COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                          'producto_id',        l.producto_id,
                          'nombre',             l.producto_nombre,
                          'ventas_registradas', l.ventas_registradas,
                          'produccion',         l.produccion,
                          'diferencia',         l.diferencia
                        ) ORDER BY l.orden, l.id)
                   FROM salida_linea l WHERE l.cierre_id = c.id
               ), '[]'::jsonb)
             ) ORDER BY caf.codigo)
        FROM cafeteria caf
        LEFT JOIN salida_cierre c
          ON c.cafeteria_id = caf.id AND c.fecha = p_fecha
       WHERE caf.activa
    ), '[]'::jsonb)
  );
$$;

/* ── El historial de una sede: vigente en 19 ─────────────────────────────── */
CREATE OR REPLACE FUNCTION buscar_salidas(
  p_desde        DATE,
  p_hasta        DATE,
  p_cafeteria_id TEXT
) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(f ORDER BY f->>'fecha' DESC, f->>'cafeteria_nombre'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
             'id',                 c.id,
             'fecha',              c.fecha,
             'cafeteria_id',       c.cafeteria_id,
             'cafeteria_nombre',   caf.nombre,
             'responsable_nombre', c.responsable_nombre,
             'renglones',          (SELECT COUNT(*) FROM salida_linea l WHERE l.cierre_id = c.id),
             'total_ventas',       (SELECT COALESCE(SUM(l.ventas_registradas), 0)
                                      FROM salida_linea l WHERE l.cierre_id = c.id),
             'total_produccion',   (SELECT COALESCE(SUM(l.produccion), 0)
                                      FROM salida_linea l WHERE l.cierre_id = c.id),
             'total_diferencia',   (SELECT COALESCE(SUM(l.diferencia), 0)
                                      FROM salida_linea l WHERE l.cierre_id = c.id)
           ) AS f
      FROM salida_cierre c
      JOIN cafeteria caf ON caf.id = c.cafeteria_id
     WHERE c.fecha BETWEEN p_desde AND p_hasta
       AND (p_cafeteria_id IS NULL OR p_cafeteria_id = '' OR c.cafeteria_id = p_cafeteria_id)
  ) AS s;
$$;

/* ── Los días con cierre, consolidados: vigente en 21-dias-de-cierre.sql ── */
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
      COALESCE(SUM(l.produccion), 0)                        AS total_produccion,
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
           'sedes',            CASE WHEN COALESCE(p_cafeteria_id, '') = ''
                                    THEN (SELECT n FROM activas) ELSE 1 END,
           'renglones',        d.renglones,
           'total_ventas',     d.total_ventas,
           'total_produccion', d.total_produccion,
           'total_diferencia', d.total_diferencia
         ) ORDER BY d.fecha DESC), '[]'::jsonb)
  FROM por_dia d;
$$;

/* ── El consolidado día a día, para el impreso Y la pantalla: vigente en
 *    25-diferencia-en-consolidado.sql. Gana `ventas_registradas` en la
 *    celda, que hasta ahora no viajaba —hace falta para la lista de
 *    descuadres de «Detallado del día». ── */
CREATE OR REPLACE FUNCTION consolidado_salidas(p_desde DATE, p_hasta DATE)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,

    'productos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('producto_id', sp.id, 'nombre', sp.nombre)
                       ORDER BY sp.orden)
        FROM salida_producto sp WHERE sp.activo
    ), '[]'::jsonb),

    'cafeterias', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('cafeteria_id', c.id, 'nombre', c.nombre)
                       ORDER BY c.codigo)
        FROM cafeteria c WHERE c.activa
    ), '[]'::jsonb),

    'dias', COALESCE((
      SELECT jsonb_agg(DISTINCT f ORDER BY f)
        FROM (
          SELECT c.fecha AS f FROM salida_cierre c
           WHERE c.fecha BETWEEN p_desde AND p_hasta
        ) AS d
    ), '[]'::jsonb),

    /* Solo las que tienen PRODUCCIÓN anotada: una casilla sin contar se
     * queda fuera y sale en blanco, que es lo que significa. */
    'celdas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'fecha',               c.fecha,
               'cafeteria_id',        c.cafeteria_id,
               'producto_id',         l.producto_id,
               'ventas_registradas',  l.ventas_registradas,
               'produccion',          l.produccion,
               'diferencia',          l.diferencia
             ))
        FROM salida_cierre c
        JOIN salida_linea l ON l.cierre_id = c.id
       WHERE c.fecha BETWEEN p_desde AND p_hasta
         AND l.produccion IS NOT NULL
    ), '[]'::jsonb)
  );
$$;

/* ── El consolidado por rango, sumado: vigente en 24-periodo-salidas.sql ── */
CREATE OR REPLACE FUNCTION periodo_salidas(p_desde DATE, p_hasta DATE)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cierres AS (
    SELECT c.id, c.cafeteria_id, c.fecha
      FROM salida_cierre c
     WHERE c.fecha BETWEEN p_desde AND p_hasta
  ),
  sumas AS (
    SELECT
      ci.cafeteria_id,
      l.producto_id,
      SUM(l.ventas_registradas) AS ventas_registradas,
      SUM(l.produccion)         AS produccion,
      SUM(l.diferencia)         AS diferencia
    FROM cierres ci
    JOIN salida_linea l ON l.cierre_id = ci.id
    GROUP BY ci.cafeteria_id, l.producto_id
  ),
  dias_por_sede AS (
    SELECT ci.cafeteria_id, COUNT(DISTINCT ci.fecha) AS dias_cerrados
      FROM cierres ci
     GROUP BY ci.cafeteria_id
  )
  SELECT jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,

    'dias_con_cierre', (SELECT COUNT(DISTINCT fecha) FROM cierres),

    'productos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('producto_id', sp.id, 'nombre', sp.nombre)
                       ORDER BY sp.orden)
        FROM salida_producto sp WHERE sp.activo
    ), '[]'::jsonb),

    'cafeterias', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'cafeteria_id',       caf.id,
               'cafeteria_nombre',   caf.nombre,
               'responsable_nombre', COALESCE(resp.nombre, ''),
               'dias_cerrados',      COALESCE(dps.dias_cerrados, 0),
               'lineas', COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                          'producto_id',        s.producto_id,
                          'ventas_registradas', s.ventas_registradas,
                          'produccion',         s.produccion,
                          'diferencia',         s.diferencia
                        ))
                   FROM sumas s WHERE s.cafeteria_id = caf.id
               ), '[]'::jsonb)
             ) ORDER BY caf.codigo)
        FROM cafeteria caf
        LEFT JOIN perfil resp ON resp.usuario_id = caf.responsable_usuario_id
        LEFT JOIN dias_por_sede dps ON dps.cafeteria_id = caf.id
       WHERE caf.activa
    ), '[]'::jsonb)
  );
$$;

COMMIT;

/* Comprobación, para leer en la salida. */
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'salida_linea' AND column_name IN ('produccion', 'salidas');
