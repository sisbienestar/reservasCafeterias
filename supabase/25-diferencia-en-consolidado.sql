-- reservasCafeterias · la diferencia también viaja en el consolidado
-- ===========================================================================
--
-- Se ejecuta UNA VEZ, entero, DESPUÉS de 24-periodo-salidas.sql.
--
-- `consolidado_salidas` (23-consolidado-salidas.sql) ya arma la matriz día a
-- día —productos, cafeterías, días con cierre y las celdas— para el impreso,
-- que solo necesita SALIDAS. La pestaña «Detallado del día» en pantalla
-- necesita la misma matriz, pero mostrando la DIFERENCIA, no las salidas.
--
-- No hace falta otra función: `diferencia` es una columna GENERADA
-- (`salidas − ventas_registradas`, NULL si falta cualquiera de las dos —
-- 20-diferencia-solo-si-se-conto.sql), así que añadirla a la celda es gratis,
-- Postgres ya la tiene calculada.
--
-- El filtro `WHERE l.salidas IS NOT NULL` no cambia. Una fila que esa
-- condición deja fuera tiene `diferencia` en NULL de todas formas —si no se
-- contaron las salidas no puede haber diferencia—, así que el resultado que
-- ve la pantalla es el mismo se filtre como se filtre.

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
     * Las casillas, planas: (día, sede, producto) → salidas y diferencia.
     *
     * Plana y no anidada en tres niveles porque quien la consume la vuelca en
     * un índice para buscar por las tres claves a la vez. Anidarla obligaría a
     * recorrer dos arreglos por casilla para pintar una tabla que ya sabe qué
     * fila y qué columna está dibujando.
     *
     * Solo las que tienen SALIDAS anotadas: una casilla sin contar se queda
     * fuera y sale en blanco, que es lo que significa. `diferencia` viaja
     * igual —puede salir NULL si faltó `ventas_registradas` ese día— y quien
     * la lea sigue la misma regla: vacío no es cero.
     */
    'celdas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'fecha',        c.fecha,
               'cafeteria_id', c.cafeteria_id,
               'producto_id',  l.producto_id,
               'salidas',      l.salidas,
               'diferencia',   l.diferencia
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
