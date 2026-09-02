-- reservasCafeterias · el consolidado de un rango, para imprimir
-- ===========================================================================
--
-- Se ejecuta UNA VEZ, entero, DESPUÉS de 22-responsable-no-se-reescribe.sql.
--
-- La hoja «CONTROL DE PEDIDO Y SALIDAS DE ALMUERZOS, MINI LUNCH Y ENSALADAS»
-- es una MATRIZ: los productos en filas, y en columnas cada cafetería con sus
-- días dentro. Lo que va en cada casilla son las SALIDAS.
--
-- ── Por qué una función y no tres consultas ───────────────────────────────
--
-- Porque el documento necesita las tres cosas a la vez para poder dibujarse
-- —qué productos, qué cafeterías y qué se cruzó en cada casilla— y pedirlas
-- por separado serían tres viajes para pintar una hoja. Es la misma disciplina
-- que `dia_salidas`, del que este es el hermano por rango.
--
-- ── Solo los días CON cierre ──────────────────────────────────────────────
--
-- Un rango de un mes lleva fines de semana y festivos, y una columna por cada
-- uno —vacía— haría la hoja ilegible sin añadir nada: que el sábado no se
-- cerró caja no es un hallazgo. Los días que sí tuvieron cierre en alguna sede
-- salen todos, aunque a alguna cafetería le falte: ese hueco SÍ dice algo, y
-- se ve como casilla vacía dentro de una columna que existe.
--
-- Las cafeterías, en cambio, salen TODAS las que están en servicio. Una sede
-- que no cerró ni un día del mes tiene que verse, y verse vacía.

BEGIN;

CREATE OR REPLACE FUNCTION consolidado_salidas(p_desde DATE, p_hasta DATE)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,

    /* Los productos EN SERVICIO, en el orden del catálogo: son las filas, y
     * ese orden es el mismo del formulario de cierre. */
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

    /* Los días con cierre, de menor a mayor: son las columnas dentro de cada
     * cafetería, y la pantalla los reparte en semanas. */
    'dias', COALESCE((
      SELECT jsonb_agg(DISTINCT f ORDER BY f)
        FROM (
          SELECT c.fecha AS f FROM salida_cierre c
           WHERE c.fecha BETWEEN p_desde AND p_hasta
        ) AS d
    ), '[]'::jsonb),

    /*
     * Las casillas, planas: (día, sede, producto) → salidas.
     *
     * Plana y no anidada en tres niveles porque quien la consume la vuelca en
     * un índice para buscar por las tres claves a la vez. Anidarla obligaría a
     * recorrer dos arreglos por casilla para pintar una tabla que ya sabe qué
     * fila y qué columna está dibujando.
     *
     * Solo las que tienen SALIDAS anotadas: una casilla sin contar se queda
     * fuera y sale en blanco, que es lo que significa.
     */
    'celdas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'fecha',        c.fecha,
               'cafeteria_id', c.cafeteria_id,
               'producto_id',  l.producto_id,
               'salidas',      l.salidas
             ))
        FROM salida_cierre c
        JOIN salida_linea l ON l.cierre_id = c.id
       WHERE c.fecha BETWEEN p_desde AND p_hasta
         AND l.salidas IS NOT NULL
    ), '[]'::jsonb)
  );
$$;

COMMIT;

/* Comprobación, para leer en la salida: la forma del último mes. */
SELECT jsonb_array_length(r->'productos')  AS productos,
       jsonb_array_length(r->'cafeterias') AS cafeterias,
       jsonb_array_length(r->'dias')       AS dias_con_cierre,
       jsonb_array_length(r->'celdas')     AS casillas
  FROM (SELECT consolidado_salidas((CURRENT_DATE - 30)::date, CURRENT_DATE) AS r) AS s;
