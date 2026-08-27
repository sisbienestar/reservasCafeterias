-- reservasCafeterias · las escrituras que tienen que ser atómicas
-- ===========================================================================
--
-- Por qué esto es SQL y no TypeScript.
--
-- Escribir una reserva son dos o tres filas en tablas distintas: la reserva,
-- su asiento de historial y los cambios de ese asiento. Hechas desde la API
-- como tres llamadas sueltas, un fallo en medio deja una reserva modificada
-- sin rastro de quién la modificó — y el historial existe justamente para que
-- eso no pase. Aquí las tres caben en una transacción.
--
-- Y hay una segunda razón, la del consecutivo. En Apps Script, «leer el
-- máximo y sumar uno» estaba protegido por un bloqueo GLOBAL de script: dos
-- sedes registrando a la vez se ponían en cola aunque no tuvieran nada que
-- ver entre sí. Aquí el candado es por cafetería y por día, que es el alcance
-- real del conflicto.
--
-- Lo que NO está aquí, a propósito: las reglas de negocio que producen los
-- códigos de error del contrato —SIN_SERVICIO, MENU_INVALIDO,
-- DATOS_INCOMPLETOS—. Esas viven en api/_nucleo/reglas.ts, donde se leen, se
-- prueban sin base de datos y comparten el texto de los mensajes con el
-- frontend. En SQL queda solo lo que SOLO SQL puede garantizar: atomicidad y
-- ausencia de carreras.

/* ── Cómo viajan los errores de aquí a la API ────────────────────────────
 *
 * Un error de negocio detectado dentro de una función no puede salir como un
 * mensaje de texto suelto: la API tendría que adivinar cuál es leyendo la
 * cadena. Se usan códigos SQLSTATE propios, que `api/_nucleo/supabase.ts`
 * traduce a los códigos del contrato.
 *
 *   RS001  SIN_CAMBIOS             guardar sin tocar nada
 *   RS002  RESERVA_NO_ENCONTRADA
 *   RS003  RESERVA_CANCELADA       cancelada: ni se edita ni se recancela
 *   RS004  CAFETERIA_NO_ENCONTRADA
 *
 * Los 23505 (violación de unicidad) NO se capturan aquí: se dejan subir con
 * su nombre de restricción, y la API distingue `reserva_sin_duplicado`
 * (RESERVA_DUPLICADA) de las demás por ese nombre.
 */

/** La etiqueta que se ve en pantalla, para el historial.
 *
 *  «Presencial → Teléfono» se lee; «presencial → telefono» parece un error de
 *  escritura. El historial guarda siempre el valor visible.
 *  Un valor vacío es una reserva anterior a que estos campos existieran. */
CREATE OR REPLACE FUNCTION etiqueta_opcion(v TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE v
    WHEN 'presencial' THEN 'Presencial'
    WHEN 'telefono'   THEN 'Teléfono'
    WHEN 'pagado'     THEN 'Pagado'
    WHEN 'debe'       THEN 'Debe'
    ELSE '—'
  END;
$$;

/** El identificador legible a partir de sus tres piezas: 01-260823-001.
 *
 *  El relleno a tres dígitos usa `greatest(3, length(...))` y no un 3 pelado
 *  porque `lpad('1000', 3, '0')` devuelve '100': RECORTA. Con más de 999
 *  reservas de una sede en un día, un lpad ingenuo generaría identificadores
 *  repetidos justo el día de más trabajo del año. El contrato ya lo previó:
 *  si pasa de 999, el consecutivo crece a cuatro dígitos. */
CREATE OR REPLACE FUNCTION construir_id_reserva(
  p_codigo TEXT, p_fecha DATE, p_consecutivo INT
) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_codigo || '-' || to_char(p_fecha, 'YYMMDD') || '-' ||
         lpad(p_consecutivo::TEXT, greatest(3, length(p_consecutivo::TEXT)), '0');
$$;

/* ── Cafeterías ─────────────────────────────────────────────────────── */

/**
 * Alta de cafetería. El `codigo` lo asigna el servidor.
 *
 * Es el siguiente número LIBRE, no la cantidad de filas: si alguna se borrara
 * a mano, contar daría un código ya usado y las reservas de dos sedes
 * distintas empezarían por los mismos dos dígitos.
 */
CREATE OR REPLACE FUNCTION crear_cafeteria(
  p_id           TEXT,
  p_nombre       TEXT,
  p_ubicacion    TEXT,
  p_platos_fijos TEXT[]
) RETURNS cafeteria
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_codigo TEXT;
  v_fila   cafeteria;
BEGIN
  -- Serializa solo el reparto de códigos, no la tabla entera.
  PERFORM pg_advisory_xact_lock(hashtext('cafeteria:codigo'));

  SELECT lpad((coalesce(max(codigo::INT), 0) + 1)::TEXT, 2, '0')
    INTO v_codigo FROM cafeteria;

  INSERT INTO cafeteria (id, codigo, nombre, ubicacion, imagen, activa, platos_fijos)
  VALUES (p_id, v_codigo, p_nombre, coalesce(p_ubicacion, ''), '', TRUE,
          coalesce(p_platos_fijos, '{}'))
  RETURNING * INTO v_fila;

  RETURN v_fila;
END;
$$;

/* ── La carta de la semana ──────────────────────────────────────────── */

/**
 * Reescribe la carta de los días que se le pasen, de una vez.
 *
 * `menu.guardarSemana` es atómico por contrato: si el jueves trae un plato
 * repetido no se escribe ninguno de los siete días, porque no puede quedar
 * media semana publicada. Al ser una sola función, o entra todo o no entra
 * nada sin tener que coordinar nada desde fuera.
 *
 * Un día con la lista vacía se queda sin carta: se borran sus opciones y no
 * se inserta ninguna. Es la forma de decir «ese día no hay servicio».
 *
 * p_dias = [{"fecha":"2026-08-19","opciones":[{"id":"…","nombre":"…"}]}, …]
 */
CREATE OR REPLACE FUNCTION guardar_carta_semana(p_dias JSONB)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dia JSONB;
BEGIN
  -- Primero se vacían TODOS los días afectados y luego se rellenan. Hacerlo
  -- día a día (borrar el lunes, escribir el lunes, borrar el martes…) daría
  -- el mismo resultado dentro de la transacción, pero así el orden de las
  -- opciones dentro de un día no depende de lo que hubiera antes.
  FOR v_dia IN SELECT * FROM jsonb_array_elements(p_dias) LOOP
    DELETE FROM carta_opcion WHERE fecha = (v_dia->>'fecha')::DATE;
  END LOOP;

  FOR v_dia IN SELECT * FROM jsonb_array_elements(p_dias) LOOP
    INSERT INTO carta_opcion (fecha, id, nombre, orden)
    SELECT (v_dia->>'fecha')::DATE,
           opcion->>'id',
           opcion->>'nombre',
           (indice - 1)::INT
      FROM jsonb_array_elements(v_dia->'opciones')
             WITH ORDINALITY AS t(opcion, indice);
  END LOOP;
END;
$$;

/* ── Reservas ───────────────────────────────────────────────────────── */

/**
 * Alta de reserva: consecutivo, fila y asiento de creación, en una pieza.
 *
 * El candado es por cafetería y por día porque ese es el alcance del
 * conflicto: dos sedes registrando a la vez calculan consecutivos de series
 * distintas y no tienen por qué esperarse. Se libera solo al cerrar la
 * transacción (`_xact_`), así que cubre hasta el INSERT incluido.
 *
 * La regla del duplicado NO se comprueba aquí: la impone el índice
 * `reserva_sin_duplicado`. Dejar que sea el índice quien la aplique es lo que
 * hace imposible burlarla desde otro camino de escritura.
 */
CREATE OR REPLACE FUNCTION crear_reserva(
  p_cafeteria_id TEXT,
  p_fecha        DATE,
  p_nombre       TEXT,
  p_telefono     TEXT,
  p_menu_id      TEXT,
  p_menu_nombre  TEXT,
  p_medio        TEXT,
  p_pago         TEXT,
  p_autor        UUID
) RETURNS reserva
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_codigo      TEXT;
  v_consecutivo INT;
  v_reserva     reserva;
BEGIN
  SELECT codigo INTO v_codigo FROM cafeteria WHERE id = p_cafeteria_id;
  IF v_codigo IS NULL THEN
    RAISE EXCEPTION 'no existe la cafetería %', p_cafeteria_id USING ERRCODE = 'RS004';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_cafeteria_id || ':' || p_fecha::TEXT));

  -- Sobre el MÁXIMO existente y no sobre la cantidad: si falta un número
  -- —una fila retirada a mano— contar daría uno ya usado, y dos reservas
  -- compartirían identificador. Incluye las canceladas: su número está
  -- gastado para siempre.
  SELECT coalesce(max(consecutivo), 0) + 1 INTO v_consecutivo
    FROM reserva WHERE cafeteria_id = p_cafeteria_id AND fecha = p_fecha;

  INSERT INTO reserva (id, consecutivo, nombre, telefono, cafeteria_id, fecha,
                       menu_id, menu_nombre, medio, pago, estado)
  VALUES (construir_id_reserva(v_codigo, p_fecha, v_consecutivo), v_consecutivo,
          p_nombre, p_telefono, p_cafeteria_id, p_fecha,
          p_menu_id, p_menu_nombre, p_medio, p_pago, 'activa')
  RETURNING * INTO v_reserva;

  -- Toda reserva nace con su asiento de creación, sin cambios dentro.
  INSERT INTO reserva_asiento (reserva_id, tipo, ocurrido_en, autor)
  VALUES (v_reserva.id, 'creacion', v_reserva.creada_en, p_autor);

  RETURN v_reserva;
END;
$$;

/**
 * Edición de reserva. Calcula el historial por su cuenta.
 *
 * Comparar los valores viejos con los nuevos podría hacerse en la API, que ya
 * ha leído la reserva para pintarla. No se hace, y la razón es la carrera:
 * entre esa lectura y la escritura, otra persona puede haber guardado. El
 * historial diría entonces «Ana → Beatriz» cuando en la fila ponía Carmen.
 *
 * Con `FOR UPDATE` la fila queda tomada mientras se compara y se escribe, así
 * que el asiento describe siempre el cambio que de verdad ocurrió.
 *
 * El orden de los campos —nombre, teléfono, menú, medio, pago— es el que se
 * lee en pantalla, y `orden` lo conserva: sin él, el historial saldría
 * barajado según el humor del planificador.
 */
CREATE OR REPLACE FUNCTION actualizar_reserva(
  p_id          TEXT,
  p_nombre      TEXT,
  p_telefono    TEXT,
  p_menu_id     TEXT,
  p_menu_nombre TEXT,
  p_medio       TEXT,
  p_pago        TEXT,
  p_autor       UUID
) RETURNS reserva
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_previa   reserva;
  v_reserva  reserva;
  v_asiento  BIGINT;
  v_cambios  JSONB := '[]'::JSONB;
BEGIN
  SELECT * INTO v_previa FROM reserva WHERE id = p_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no existe la reserva %', p_id USING ERRCODE = 'RS002';
  END IF;
  IF v_previa.estado = 'cancelada' THEN
    RAISE EXCEPTION 'reserva cancelada %', p_id USING ERRCODE = 'RS003';
  END IF;

  IF p_nombre IS DISTINCT FROM v_previa.nombre THEN
    v_cambios := v_cambios || jsonb_build_object(
      'campo', 'nombre', 'antes', v_previa.nombre, 'despues', p_nombre);
  END IF;
  IF p_telefono IS DISTINCT FROM v_previa.telefono THEN
    v_cambios := v_cambios || jsonb_build_object(
      'campo', 'telefono', 'antes', v_previa.telefono, 'despues', p_telefono);
  END IF;
  -- Se compara por id, pero se GUARDA el nombre: el id es de la máquina.
  IF p_menu_id IS DISTINCT FROM v_previa.menu_id THEN
    v_cambios := v_cambios || jsonb_build_object(
      'campo', 'menu', 'antes', v_previa.menu_nombre, 'despues', p_menu_nombre);
  END IF;
  IF p_medio IS DISTINCT FROM v_previa.medio THEN
    v_cambios := v_cambios || jsonb_build_object(
      'campo', 'medio', 'antes', etiqueta_opcion(v_previa.medio),
      'despues', etiqueta_opcion(p_medio));
  END IF;
  IF p_pago IS DISTINCT FROM v_previa.pago THEN
    v_cambios := v_cambios || jsonb_build_object(
      'campo', 'pago', 'antes', etiqueta_opcion(v_previa.pago),
      'despues', etiqueta_opcion(p_pago));
  END IF;

  -- Guardar sin tocar nada dejaría un asiento vacío en el historial, que es
  -- justo lo que un registro de cambios no debe tener.
  IF jsonb_array_length(v_cambios) = 0 THEN
    RAISE EXCEPTION 'sin cambios en %', p_id USING ERRCODE = 'RS001';
  END IF;

  UPDATE reserva SET nombre = p_nombre, telefono = p_telefono,
                     menu_id = p_menu_id, menu_nombre = p_menu_nombre,
                     medio = p_medio, pago = p_pago
   WHERE id = p_id
   RETURNING * INTO v_reserva;

  INSERT INTO reserva_asiento (reserva_id, tipo, autor)
  VALUES (p_id, 'modificacion', p_autor)
  RETURNING id INTO v_asiento;

  INSERT INTO reserva_cambio (asiento_id, campo, antes, despues, orden)
  SELECT v_asiento, c->>'campo', c->>'antes', c->>'despues', (indice - 1)::INT
    FROM jsonb_array_elements(v_cambios) WITH ORDINALITY AS t(c, indice);

  RETURN v_reserva;
END;
$$;

/**
 * Cancelación: borrado LÓGICO. La fila no se quita, se marca.
 *
 * Borrarla de verdad tiraría el historial justo del caso que más interesa
 * auditar —«esta persona reservó y luego se canceló»— y dejaría sin
 * referencia a las reservas históricas de una sede que se cierre.
 */
CREATE OR REPLACE FUNCTION cancelar_reserva(p_id TEXT, p_autor UUID)
RETURNS reserva
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_estado  TEXT;
  v_reserva reserva;
BEGIN
  SELECT estado INTO v_estado FROM reserva WHERE id = p_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no existe la reserva %', p_id USING ERRCODE = 'RS002';
  END IF;
  IF v_estado = 'cancelada' THEN
    RAISE EXCEPTION 'ya cancelada %', p_id USING ERRCODE = 'RS003';
  END IF;

  UPDATE reserva SET estado = 'cancelada' WHERE id = p_id RETURNING * INTO v_reserva;

  INSERT INTO reserva_asiento (reserva_id, tipo, autor)
  VALUES (p_id, 'cancelacion', p_autor);

  RETURN v_reserva;
END;
$$;

/* ── Búsqueda por nombre ────────────────────────────────────────────── */

/**
 * Minúsculas y sin tildes, para buscar por nombre.
 *
 * «Ardila» tiene que encontrar a «Ardilá» y «MARIA» a «María»: quien busca en
 * el mostrador escribe deprisa y sin acentos. Se hace con `translate` y no
 * con la extensión `unaccent` porque `unaccent` no es IMMUTABLE en Postgres y
 * por tanto no se puede indexar; esta sí, y cubre las vocales acentuadas, la
 * eñe y la cedilla, que es todo lo que aparece en un nombre en español.
 *
 * Tiene que quedar declarada ANTES de `resumir_reservas`, que la usa.
 */
CREATE OR REPLACE FUNCTION unaccent_simple(t TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT lower(translate(t,
    'ÁÀÄÂÃáàäâãÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔÕóòöôõÚÙÜÛúùüûÑñÇç',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc'));
$$;

-- El índice que hace que buscar por nombre no recorra la tabla entera.
-- gin_trgm_ops sirve los LIKE '%…%', que es la forma que tiene la búsqueda
-- del administrador: un trozo de nombre en cualquier posición. Un índice
-- normal no serviría: solo acelera los LIKE anclados al principio.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX reserva_por_nombre
  ON reserva USING gin (unaccent_simple(nombre) gin_trgm_ops);

/* ── Consolidados ───────────────────────────────────────────────────────
 *
 * `reservas.buscar` devuelve el resumen calculado, y se calcula AQUÍ y no en
 * el navegador: el administrador puede pedir un trimestre, y mandar miles de
 * filas al cliente para que sume es justo lo que no hay que hacer.
 *
 * Tampoco se calcula en la API: eso solo mueve el problema de máquina, porque
 * las filas tendrían que viajar igual de Postgres a la función. Agregar donde
 * están los datos es un viaje menos y una suma que hace quien sabe hacerla.
 *
 * `por_dia` incluye TODOS los días del rango, también los vacíos —de ahí el
 * generate_series—: un hueco es información, y omitirlo junta dos fechas
 * lejanas en la gráfica como si fueran consecutivas.
 *
 * `por_plato` cuenta solo las activas: un consolidado de consumo que sume las
 * canceladas manda a cocinar de más.
 */
CREATE OR REPLACE FUNCTION resumir_reservas(
  p_desde        DATE,
  p_hasta        DATE,
  p_cafeteria_id TEXT,
  p_estado       TEXT,
  p_texto        TEXT,
  p_digitos      TEXT
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_resultado JSONB;
BEGIN
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
  dias AS (
    SELECT d::DATE AS fecha
      FROM generate_series(p_desde, p_hasta, INTERVAL '1 day') d
  ),
  por_dia AS (
    SELECT d.fecha,
           count(*) FILTER (WHERE f.estado = 'activa')    AS activas,
           count(*) FILTER (WHERE f.estado = 'cancelada') AS canceladas
      FROM dias d LEFT JOIN filtradas f ON f.fecha = d.fecha
     GROUP BY d.fecha ORDER BY d.fecha
  ),
  por_cafeteria AS (
    SELECT f.cafeteria_id,
           coalesce(c.nombre, f.cafeteria_id) AS nombre,
           count(*) FILTER (WHERE f.estado = 'activa')    AS activas,
           count(*) FILTER (WHERE f.estado = 'cancelada') AS canceladas
      FROM filtradas f LEFT JOIN cafeteria c ON c.id = f.cafeteria_id
     GROUP BY f.cafeteria_id, c.nombre
     ORDER BY activas DESC
  ),
  por_plato AS (
    SELECT f.menu_nombre AS nombre, count(*) AS total
      FROM filtradas f WHERE f.estado = 'activa'
     GROUP BY f.menu_nombre
     ORDER BY total DESC, nombre ASC
  ),
  totales AS (
    SELECT count(*)                                       AS total,
           count(*) FILTER (WHERE estado = 'activa')      AS activas,
           count(*) FILTER (WHERE estado = 'cancelada')   AS canceladas
      FROM filtradas
  ),
  servicio AS (
    SELECT count(*) AS dias_con_servicio
      FROM por_dia WHERE activas + canceladas > 0
  )
  SELECT jsonb_build_object(
    'totales', jsonb_build_object(
      'total',             t.total,
      'activas',           t.activas,
      'canceladas',        t.canceladas,
      'dias_con_servicio', s.dias_con_servicio,
      -- Un decimal, como en Apps Script. Sobre los días CON servicio y no
      -- sobre los del rango: dividir por los días vacíos hundiría la media de
      -- cualquier consulta que abarque un puente o unas vacaciones.
      'promedio_diario',   CASE WHEN s.dias_con_servicio > 0
                                THEN round(t.activas::NUMERIC / s.dias_con_servicio, 1)
                                ELSE 0 END),
    'por_dia', coalesce((SELECT jsonb_agg(jsonb_build_object(
                  'fecha', to_char(fecha, 'YYYY-MM-DD'),
                  'activas', activas, 'canceladas', canceladas)) FROM por_dia), '[]'::JSONB),
    'por_cafeteria', coalesce((SELECT jsonb_agg(jsonb_build_object(
                  'cafeteria_id', cafeteria_id, 'nombre', nombre,
                  'activas', activas, 'canceladas', canceladas)) FROM por_cafeteria), '[]'::JSONB),
    'por_plato', coalesce((SELECT jsonb_agg(jsonb_build_object(
                  'nombre', nombre, 'total', total)) FROM por_plato), '[]'::JSONB))
    INTO v_resultado
    FROM totales t, servicio s;

  RETURN v_resultado;
END;
$$;
