-- reservasCafeterias · el consolidado de un rango, para la pantalla
-- ===========================================================================
--
-- Se ejecuta UNA VEZ, entero, DESPUÉS de 23-consolidado-salidas.sql.
--
-- Es el hermano por rango de `dia_salidas` (19-control-salidas.sql): misma
-- forma —productos y cafeterías con sus líneas— pero cada línea es la SUMA de
-- todos los cierres de esa sede dentro del rango, no un día suelto.
--
-- ── Por qué no es `consolidado_salidas` ───────────────────────────────────
--
-- Aquella función ya existe y también recibe un rango, pero es OTRA cosa: es
-- la matriz día a día para el impreso, y solo lleva `salidas` porque es lo
-- único que cabe en esa hoja. Esta es el consolidado que se lee en pantalla
-- —sede por producto, sumado— y necesita las TRES cifras: ventas, salidas y
-- diferencia, para poder resaltar un descuadre igual que hace `dia_salidas`
-- con un solo día.
--
-- ── Por qué no generaliza `dia_salidas` ───────────────────────────────────
--
-- `dia_salidas` no es solo un reporte: `Inicio.tsx` lo usa como el FORMULARIO
-- de cierre, y depende de que `cerrado` sea un booleano de un día exacto.
-- Cambiarle la forma para aceptar un rango rompería esa pantalla. Por eso esto
-- es una función nueva.
--
-- ── `cerrado` no se traduce a un rango ─────────────────────────────────────
--
-- En un solo día, una sede cerró o no. En un rango de varios días, cerrar
-- unos y otros no es lo normal —fines de semana, festivos— y no es un hallazgo
-- por sí solo. Por eso cada sede lleva `dias_cerrados`, y el consolidado
-- entero lleva `dias_con_cierre`: cuántos días del rango tuvieron cierre en
-- ALGUNA sede, el mismo «de cuántos» que ya usa `dias_salidas`.
--
-- ── El responsable se resuelve EN VIVO ────────────────────────────────────
--
-- En `dia_salidas`, y en cada `salida_cierre`, el nombre va COPIADO: sellarlo
-- el día del cierre es lo que hace que marzo siga diciendo quién estaba en
-- marzo. Un consolidado de varios días no tiene un único cierre del que
-- copiarlo, así que aquí se lee de `cafeteria.responsable_usuario_id` —quién
-- responde HOY— igual que hace `guardar_cierre_salidas` al resolver el nombre
-- antes de sellarlo.

BEGIN;

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
      /* SUM ignora los NULL: una sede que nunca contó un producto en el
       * rango entero sigue sin línea —«no se contó», no un cero inventado—,
       * la misma garantía que ya impone `dias_salidas`. */
      SUM(l.ventas_registradas) AS ventas_registradas,
      SUM(l.salidas)            AS salidas,
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
                          'salidas',            s.salidas,
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

/* Comprobación, para leer en la salida: la forma del último mes. */
SELECT jsonb_array_length(r->'productos')  AS productos,
       jsonb_array_length(r->'cafeterias') AS cafeterias,
       (r->>'dias_con_cierre')::int        AS dias_con_cierre
  FROM (SELECT periodo_salidas((CURRENT_DATE - 30)::date, CURRENT_DATE) AS r) AS s;
