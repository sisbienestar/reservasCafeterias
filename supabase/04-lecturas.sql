-- reservasCafeterias · las lecturas que devuelven la forma del contrato
-- ===========================================================================
--
-- El frontend espera una reserva con su historial ANIDADO dentro, tal como
-- CONTRATO.md §2 lo dibuja. En la hoja eso era gratis: el historial era una
-- celda con JSON. Aquí vive en dos tablas, así que alguien tiene que volver a
-- armarlo.
--
-- Ese alguien es Postgres y no la API, por la misma razón por la que el
-- resumen se calcula aquí: cada pieza que se arma en la función de Vercel es
-- un montón de filas que antes han tenido que viajar desde la base de datos.
-- Armarlo donde están los datos convierte tres consultas en una.
--
-- Y hay un segundo motivo, este del proyecto: el argumento entero de la
-- migración era «hacer menos viajes y no encadenarlos». Sería raro cambiar de
-- backend para pagar el peaje otra vez, ahora en forma de tres consultas
-- encadenadas por pantalla.

/**
 * Una reserva con la forma exacta que espera el frontend.
 *
 * Tres detalles que no son cosméticos:
 *
 *  · `fecha` sale como TEXTO 'YYYY-MM-DD'. Serializada como fecha, el cliente
 *    la lee en UTC y en Colombia (UTC−5) muestra el día anterior toda la
 *    tarde. Es el error clásico de este proyecto.
 *  · `timestamp` sale en ISO con Z. Las pantallas ordenan comparando esa
 *    cadena como texto, así que dos formatos distintos conviviendo —los
 *    históricos y los nuevos— desordenarían las reservas del día.
 *  · `medio` y `pago` salen como '' y no como null cuando faltan. Son las
 *    reservas anteriores a que los campos existieran; la interfaz las pinta
 *    como «—» y espera una cadena.
 */
CREATE OR REPLACE FUNCTION reserva_json(r reserva)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id',           r.id,
    'nombre',       r.nombre,
    'telefono',     r.telefono,
    'cafeteria_id', r.cafeteria_id,
    'fecha',        to_char(r.fecha, 'YYYY-MM-DD'),
    'menu_id',      r.menu_id,
    'menu_nombre',  r.menu_nombre,
    'medio',        coalesce(r.medio, ''),
    'pago',         coalesce(r.pago,  ''),
    'estado',       r.estado,
    'timestamp',    to_char(r.creada_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'historial',    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'tipo',      a.tipo,
               'timestamp', to_char(a.ocurrido_en AT TIME ZONE 'UTC',
                                    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
               'cambios',   coalesce((
                 SELECT jsonb_agg(jsonb_build_object(
                          'campo', c.campo, 'antes', c.antes, 'despues', c.despues)
                        ORDER BY c.orden, c.id)
                   FROM reserva_cambio c WHERE c.asiento_id = a.id), '[]'::JSONB))
             ORDER BY a.ocurrido_en, a.id)
        FROM reserva_asiento a WHERE a.reserva_id = r.id), '[]'::JSONB));
$$;

/**
 * Las reservas activas de una sede en un día, por orden de llegada.
 *
 * El orden es `creada_en` y no el identificador: son equivalentes hoy, pero
 * el identificador de las reservas importadas del formato antiguo no lleva
 * consecutivo, y ordenar por él las mandaría todas al principio.
 */
CREATE OR REPLACE FUNCTION reservas_del_dia(p_cafeteria_id TEXT, p_fecha DATE)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(reserva_json(r) ORDER BY r.creada_en, r.id), '[]'::JSONB)
    FROM reserva r
   WHERE r.cafeteria_id = p_cafeteria_id
     AND r.fecha = p_fecha
     AND r.estado = 'activa';
$$;

/**
 * La búsqueda del administrador: detalle y consolidado, en una sola llamada.
 *
 * `p_limite` recorta SOLO el detalle. Ni `total` ni `resumen` lo miran, y esa
 * es toda la gracia: si el límite recortara los totales, la pantalla diría
 * «1.240 reservas» encima de una tabla de 500 que no suma eso. Con
 * `p_limite = 0` no se recorta nada, que es lo que pide la exportación a CSV.
 *
 * El orden del detalle es por fecha descendente y, dentro del día, por la más
 * reciente primero: lo último que pasó es lo que se suele venir a mirar.
 */
CREATE OR REPLACE FUNCTION buscar_reservas(
  p_desde        DATE,
  p_hasta        DATE,
  p_cafeteria_id TEXT,
  p_estado       TEXT,
  p_texto        TEXT,
  p_digitos      TEXT,
  p_limite       INT
) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH filtradas AS (
    SELECT r.*
      FROM reserva r
     WHERE r.fecha BETWEEN p_desde AND p_hasta
       AND (p_cafeteria_id IS NULL OR r.cafeteria_id = p_cafeteria_id)
       AND (p_estado       IS NULL OR r.estado       = p_estado)
       AND (p_texto IS NULL OR
            unaccent_simple(r.nombre) LIKE '%' || p_texto || '%' OR
            (p_digitos <> '' AND r.telefono LIKE '%' || p_digitos || '%'))
  ),
  -- Solo los IDENTIFICADORES, y luego se vuelve a la tabla para armar el
  -- JSON. No es un rodeo: `reserva_json` recibe un `reserva`, y una fila de un
  -- CTE es un registro anónimo que Postgres NO coacciona a ese tipo compuesto
  -- —falla con «no existe la función reserva_json(record)»—. Con un alias de
  -- la tabla de verdad, el tipo es el que la función espera.
  detalle AS (
    SELECT id, fecha, creada_en FROM filtradas
     ORDER BY fecha DESC, creada_en DESC, id DESC
     -- NULL en LIMIT significa «sin límite», que es justo lo que quiere
     -- p_limite = 0. Un CASE dentro del LIMIT ahorra tener dos consultas.
     LIMIT CASE WHEN p_limite > 0 THEN p_limite ELSE NULL END
  )
  SELECT jsonb_build_object(
    'total',    (SELECT count(*) FROM filtradas),
    'reservas', coalesce((SELECT jsonb_agg(reserva_json(r)
                            ORDER BY r.fecha DESC, r.creada_en DESC, r.id DESC)
                            FROM reserva r JOIN detalle d ON d.id = r.id), '[]'::JSONB),
    'resumen',  resumir_reservas(p_desde, p_hasta, p_cafeteria_id,
                                 p_estado, p_texto, p_digitos));
$$;

/**
 * La carta común de un día. Sin fila publicada devuelve la lista vacía, que
 * NO es un error: es un día sin menú, y el contrato lo dice expresamente.
 */
CREATE OR REPLACE FUNCTION carta_del_dia(p_fecha DATE)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre)
                            ORDER BY orden, id), '[]'::JSONB)
    FROM carta_opcion WHERE fecha = p_fecha;
$$;

/**
 * La carta de los siete días de una semana. Siempre devuelve siete entradas,
 * con `opciones: []` en los días sin carta: el editor semanal pinta una
 * columna por día y necesita que existan todas.
 */
CREATE OR REPLACE FUNCTION carta_de_la_semana(p_lunes DATE)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_agg(jsonb_build_object(
           'fecha',    to_char(d::DATE, 'YYYY-MM-DD'),
           'opciones', carta_del_dia(d::DATE)) ORDER BY d)
    FROM generate_series(p_lunes, p_lunes + 6, INTERVAL '1 day') d;
$$;
