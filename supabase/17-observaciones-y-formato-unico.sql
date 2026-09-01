-- reservasCafeterias · el FBE.04 como formato único, y las observaciones
-- ===========================================================================
--
-- Se ejecuta UNA VEZ, entero, DESPUÉS de 16-unificar-estados.sql.
--
-- Dos cambios que llegaron juntos porque los pidió la misma revisión del
-- formato impreso:
--
--   1. TODOS los pedidos se imprimen con el FBE.04. Hasta hoy convivían dos
--      plantillas y el proveedor decidía cuál. Ya no: la hoja institucional
--      que se firma es una sola.
--
--   2. «Observaciones» deja de ser un recuadro en blanco para escribir a
--      mano y pasa a ser un campo del pedido, editable y guardado.
--
-- El FBE.34 NO se borra: la plantilla sigue en el código y el tipo sigue
-- siendo un valor válido de la columna, para el día que vuelva a hacer falta.
-- Lo que cambia es que hoy no lo usa nadie.

BEGIN;

/* ── 1 · Observaciones ──────────────────────────────────────────────────
 *
 * `NOT NULL DEFAULT ''` y no NULL: en el documento este campo o dice algo o
 * no dice nada, y esas son las dos únicas situaciones. Un tercer estado
 * —«no se sabe»— no significaría nada sobre el papel, y obligaría a que cada
 * sitio que lo imprime decidiera qué hacer con el nulo.
 *
 * El tope es del ESQUEMA y no solo del formulario. Lo que va aquí acaba
 * dentro de un recuadro de una hoja carta: un texto de diez mil caracteres no
 * es una observación, es otro documento, y saldría impreso empujando las
 * firmas a una segunda página. `api/` lo repite para poder dar el mensaje.
 */
ALTER TABLE pedido
  ADD COLUMN IF NOT EXISTS observaciones TEXT NOT NULL DEFAULT '';

ALTER TABLE pedido
  DROP CONSTRAINT IF EXISTS pedido_observaciones_cabe;

ALTER TABLE pedido
  ADD CONSTRAINT pedido_observaciones_cabe
  CHECK (char_length(observaciones) <= 1000);

COMMENT ON COLUMN pedido.observaciones IS
  'Lo que se escribe en el recuadro «Observaciones» del FBE.04. Vacío = el recuadro sale en blanco, para escribir a mano al recibir.';

/* ── 2 · Un FBE.04 ya puede llevar fecha y hora de entrega ──────────────
 *
 * El CHECK de 05-pedidos.sql prohibía la pareja «FBE.04 + fecha de entrega»
 * porque esa plantilla no tiene casillas donde imprimirlas. Sigue sin
 * tenerlas —el papel no cambia— pero ahora el FBE.04 es el formato de TODOS
 * los pedidos, incluidos los dos que se elaboraron como FBE.34 y sí llevan
 * fecha de entrega dentro.
 *
 * Borrar ese dato para que cupiera en la restricción habría sido perder
 * información real de un pedido pasado por una regla sobre cómo se dibuja
 * una hoja. Se guarda, y no se imprime: son dos cosas distintas.
 *
 * Lo que SÍ se sigue prohibiendo es un FBE.34 con categoría marcada, que es
 * la mitad de la regla que hablaba del formulario y no del archivo.
 */
ALTER TABLE pedido
  DROP CONSTRAINT IF EXISTS pedido_campos_segun_tipo;

ALTER TABLE pedido
  ADD CONSTRAINT pedido_campos_segun_tipo CHECK (
    tipo_documento = 'FBE.04' OR categoria_marcada IS NULL
  );

/* ── 3 · Los proveedores que faltaban por categoría ─────────────────────
 *
 * En el FBE.04 la casilla «Categoría (Marque con X)» no es decorativa: es
 * parte del formato, y una hoja con las tres vacías es una hoja incompleta.
 * Coca-Cola era FBE.04 desde siempre y nunca tuvo categoría —venía de una
 * ficha que no la pedía—, así que sus pedidos salían con el recuadro en
 * blanco. Se le pone la que le corresponde.
 *
 * Ramo y Vicky pasan de FBE.34 a FBE.04, y con el mismo criterio: lo que
 * venden son alimentos y bebidas.
 *
 * OJO: `categoria_fija` es la del PRÓXIMO pedido. Los ya elaborados llevan su
 * copia en `pedido.categoria_marcada` y se corrigen aparte, en el paso 4.
 */
UPDATE proveedor
   SET categoria_fija = 'Alimentos y bebidas'
 WHERE id = 'cocacola'
   AND categoria_fija IS NULL;

UPDATE proveedor
   SET tipo_documento = 'FBE.04',
       categoria_fija = COALESCE(categoria_fija, 'Alimentos y bebidas')
 WHERE tipo_documento = 'FBE.34';

/* ── 4 · Los pedidos que ya existen ─────────────────────────────────────
 *
 * `pedido.tipo_documento` es una copia deliberada (ver 05-pedidos.sql): un
 * documento reimpreso dentro de un año sale con el formato con el que se
 * elaboró. Reescribirla va justo contra eso, y se hace a sabiendas: la
 * decisión es que TODO el histórico se imprima igual, no que cada hoja
 * recuerde con qué plantilla nació. Son dos pedidos.
 *
 * La categoría se hereda del proveedor, que en el paso anterior quedó con la
 * suya. `categoria_marcada` vacía en un FBE.04 sale como tres casillas sin X,
 * y ahí no hay nada que deducir después.
 */
UPDATE pedido p
   SET tipo_documento = 'FBE.04',
       categoria_marcada = COALESCE(
         p.categoria_marcada,
         (SELECT pv.categoria_fija FROM proveedor pv WHERE pv.id = p.proveedor_id)
       )
 WHERE p.tipo_documento = 'FBE.34';

-- Y los que ya eran FBE.04 pero nacieron sin categoría, por el mismo motivo:
-- todos los de Coca-Cola.
UPDATE pedido p
   SET categoria_marcada =
         (SELECT pv.categoria_fija FROM proveedor pv WHERE pv.id = p.proveedor_id)
 WHERE p.categoria_marcada IS NULL
   AND EXISTS (
     SELECT 1 FROM proveedor pv
      WHERE pv.id = p.proveedor_id AND pv.categoria_fija IS NOT NULL
   );

/* ── 5 · crear_pedido, con observaciones ────────────────────────────────
 *
 * La firma CAMBIA, así que `CREATE OR REPLACE` no basta: dejaría las dos
 * versiones conviviendo y PostgREST no sabría cuál llamar. Hay que soltar la
 * anterior por su firma exacta.
 */
DROP FUNCTION IF EXISTS crear_pedido(TEXT, TEXT, TEXT, TEXT, DATE, DATE, TIME, TEXT, UUID, JSONB);

CREATE OR REPLACE FUNCTION crear_pedido(
  p_proveedor_id      TEXT,
  p_cafeteria_id      TEXT,
  p_tipo_documento    TEXT,
  p_categoria_marcada TEXT,
  p_fecha_elaboracion DATE,
  p_fecha_entrega     DATE,
  p_hora_entrega      TIME,
  p_lugar_entrega     TEXT,
  p_observaciones     TEXT,
  p_creado_por        UUID,
  -- [{producto_id, cantidad_solicitada, cantidad_devuelta, cantidad_adicional}]
  p_lineas            JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pedido    pedido;
  v_pedidas   INT;
  v_escritas  INT;
BEGIN
  v_pedidas := jsonb_array_length(p_lineas);

  IF v_pedidas = 0 THEN
    RAISE EXCEPTION 'PEDIDO_VACIO';
  END IF;

  INSERT INTO pedido (
    proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
    fecha_elaboracion, fecha_entrega, hora_entrega, lugar_entrega,
    observaciones, creado_por
  ) VALUES (
    p_proveedor_id, p_cafeteria_id, p_tipo_documento, p_categoria_marcada,
    p_fecha_elaboracion, p_fecha_entrega, p_hora_entrega,
    COALESCE(p_lugar_entrega, ''), COALESCE(p_observaciones, ''), p_creado_por
  )
  RETURNING * INTO v_pedido;

  /*
   * El JOIN contra `producto` es la comprobación, no solo la copia: un
   * producto que no sea de ESTE proveedor, o que esté dado de baja, no
   * encuentra pareja y no produce fila. Por eso después se cuenta.
   */
  INSERT INTO pedido_linea (
    pedido_id, producto_id, orden,
    producto_codigo, producto_nombre, producto_categoria, unidad_medida,
    cantidad_solicitada, cantidad_devuelta, cantidad_adicional
  )
  SELECT
    v_pedido.id, pr.id, pr.orden,
    pr.codigo, pr.nombre, pr.categoria, pr.unidad_medida,
    l.cantidad_solicitada, l.cantidad_devuelta, l.cantidad_adicional
  FROM jsonb_to_recordset(p_lineas) AS l(
    producto_id         BIGINT,
    cantidad_solicitada NUMERIC,
    cantidad_devuelta   NUMERIC,
    cantidad_adicional  NUMERIC
  )
  JOIN producto pr
    ON pr.id = l.producto_id
   AND pr.proveedor_id = p_proveedor_id
   AND pr.activo;

  GET DIAGNOSTICS v_escritas = ROW_COUNT;

  IF v_escritas <> v_pedidas THEN
    RAISE EXCEPTION 'PRODUCTO_AJENO';
  END IF;

  PERFORM anotar_pedido(v_pedido.id, 'creado', p_creado_por,
                        jsonb_build_object('renglones', v_escritas));

  RETURN detalle_pedido(v_pedido.id);
END;
$$;

/* ── 6 · actualizar_pedido, con observaciones ───────────────────────────
 *
 * `p_observaciones` NULL significa «no lo toques» y la cadena vacía significa
 * «bórralas». Son dos gestos distintos y hacen falta los dos: la pantalla
 * manda siempre el campo —y entonces vaciarlo tiene que vaciarlo de verdad—
 * pero una llamada futura que solo cuadre cantidades no debería borrar de
 * paso lo que alguien anotó.
 *
 * La fecha y la hora de entrega se CONSERVAN en un FBE.04.
 *
 * Es la contrapartida del paso 2. Esa plantilla no tiene casillas de entrega,
 * así que el formulario tampoco las ofrece y manda NULL; escribir ese NULL
 * sería borrar, al primer guardado, el dato de un pedido que sí lo traía. Se
 * decide por el TIPO del pedido y no por lo que llegue: quien no puede
 * editarlas tampoco puede vaciarlas sin querer.
 */
DROP FUNCTION IF EXISTS actualizar_pedido(BIGINT, DATE, TIME, TEXT, JSONB, UUID, TEXT);

/*
 * Y de paso, la de CINCO argumentos que quedó viva.
 *
 * La declaró 07-flujo-pedidos.sql y 15-pedido-definitivo.sql le añadió el
 * actor y el rol; como eso cambia la firma, lo que hizo `CREATE OR REPLACE`
 * fue una SEGUNDA función, no reemplazar la primera. Llevan desde entonces
 * conviviendo. No se nota porque `api/` llama por nombre de argumento y
 * PostgREST desempata, y porque la vieja mira `estado = 'borrador'`, que desde
 * 16-unificar-estados.sql ya no existe: nunca habría dejado editar nada.
 *
 * Se suelta ahora que hay motivo para tocar aquí. Un día que alguien llame con
 * los cinco argumentos justos, la ambigüedad deja de ser teórica.
 */
DROP FUNCTION IF EXISTS actualizar_pedido(BIGINT, DATE, TIME, TEXT, JSONB);

CREATE OR REPLACE FUNCTION actualizar_pedido(
  p_id                BIGINT,
  p_fecha_entrega     DATE,
  p_hora_entrega      TIME,
  p_lugar_entrega     TEXT,
  p_observaciones     TEXT,
  p_lineas            JSONB,
  p_actor             UUID,
  p_rol               TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pedido    pedido;
  v_pedidas   INT;
  v_escritas  INT;
BEGIN
  v_pedidas := jsonb_array_length(p_lineas);

  IF v_pedidas = 0 THEN
    RAISE EXCEPTION 'PEDIDO_VACIO';
  END IF;

  -- `FOR UPDATE`: sin él, dos pestañas guardando a la vez pasarían las dos
  -- por la comprobación antes de que ninguna escribiera.
  SELECT * INTO v_pedido FROM pedido WHERE id = p_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PEDIDO_NO_ENCONTRADO';
  END IF;

  IF NOT puede_editar_pedido(v_pedido.estado, p_rol) THEN
    RAISE EXCEPTION 'PEDIDO_NO_EDITABLE';
  END IF;

  UPDATE pedido SET
    fecha_entrega = CASE WHEN v_pedido.tipo_documento = 'FBE.04'
                         THEN v_pedido.fecha_entrega ELSE p_fecha_entrega END,
    hora_entrega  = CASE WHEN v_pedido.tipo_documento = 'FBE.04'
                         THEN v_pedido.hora_entrega  ELSE p_hora_entrega  END,
    lugar_entrega = COALESCE(NULLIF(p_lugar_entrega, ''), lugar_entrega),
    observaciones = COALESCE(p_observaciones, observaciones)
  WHERE id = p_id;

  DELETE FROM pedido_linea WHERE pedido_id = p_id;

  INSERT INTO pedido_linea (
    pedido_id, producto_id, orden,
    producto_codigo, producto_nombre, producto_categoria, unidad_medida,
    cantidad_solicitada, cantidad_devuelta, cantidad_adicional
  )
  SELECT
    p_id, pr.id, pr.orden,
    pr.codigo, pr.nombre, pr.categoria, pr.unidad_medida,
    l.cantidad_solicitada, l.cantidad_devuelta, l.cantidad_adicional
  FROM jsonb_to_recordset(p_lineas) AS l(
    producto_id         BIGINT,
    cantidad_solicitada NUMERIC,
    cantidad_devuelta   NUMERIC,
    cantidad_adicional  NUMERIC
  )
  JOIN producto pr
    ON pr.id = l.producto_id
   AND pr.proveedor_id = v_pedido.proveedor_id
   AND pr.activo;

  GET DIAGNOSTICS v_escritas = ROW_COUNT;

  IF v_escritas <> v_pedidas THEN
    RAISE EXCEPTION 'PRODUCTO_AJENO';
  END IF;

  /*
   * Se anota el estado DESDE EL QUE se editó, no solo que se editó. Es la
   * diferencia entre «corrigió su borrador» y «tocó un pedido que ya estaba
   * confirmado», que son dos cosas de gravedad muy distinta.
   */
  PERFORM anotar_pedido(p_id, 'editado', p_actor, jsonb_build_object(
    'estado', v_pedido.estado,
    'renglones', v_escritas
  ));

  RETURN detalle_pedido(p_id);
END;
$$;

/* ── 7 · detalle_pedido, con las observaciones dentro ───────────────────
 *
 * Entera otra vez —`CREATE OR REPLACE` no sabe añadir una clave a un
 * `jsonb_build_object`—. Idéntica a la de 16-unificar-estados.sql salvo por
 * `observaciones`.
 */
CREATE OR REPLACE FUNCTION detalle_pedido(p_id BIGINT)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id',                 p.id,
    'proveedor_id',       p.proveedor_id,
    'proveedor_nombre',   pv.nombre,
    'cafeteria_id',       p.cafeteria_id,
    'cafeteria_nombre',   c.nombre,
    'cafeteria_ubicacion', COALESCE(c.ubicacion, ''),
    'tipo_documento',     p.tipo_documento,
    'categoria_marcada',  COALESCE(p.categoria_marcada, ''),
    'fecha_elaboracion',  p.fecha_elaboracion,
    'fecha_entrega',      p.fecha_entrega,
    'hora_entrega',       p.hora_entrega,
    'lugar_entrega',      p.lugar_entrega,
    'observaciones',      COALESCE(p.observaciones, ''),
    'estado',             p.estado,
    'enviado_en',         p.enviado_en,
    'confirmado_en',      p.confirmado_en,
    'creado_en',          p.creado_en,
    'elaborado_por',      COALESCE(pf.nombre, ''),
    'lineas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'producto_id',           l.producto_id,
               'codigo',                COALESCE(l.producto_codigo, ''),
               'nombre',                l.producto_nombre,
               'categoria',             COALESCE(l.producto_categoria, ''),
               'unidad_medida',         l.unidad_medida,
               'cantidad_solicitada',   l.cantidad_solicitada,
               'cantidad_devuelta',     l.cantidad_devuelta,
               'cantidad_adicional',    l.cantidad_adicional,
               'cantidad_total_salida', l.cantidad_total_salida
             ) ORDER BY l.orden, l.id)
      FROM pedido_linea l
      WHERE l.pedido_id = p.id
    ), '[]'::jsonb),
    -- Del más reciente al más antiguo: es como se lee un historial.
    'eventos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'ocurrido_en',  e.ocurrido_en,
               'accion',       e.accion,
               'autor_nombre', e.autor_nombre,
               'autor_rol',    e.autor_rol,
               'detalle',      e.detalle
             ) ORDER BY e.ocurrido_en DESC, e.id DESC)
      FROM pedido_evento e
      WHERE e.pedido_id = p.id
    ), '[]'::jsonb)
  )
  FROM pedido p
  JOIN proveedor pv ON pv.id = p.proveedor_id
  JOIN cafeteria c  ON c.id  = p.cafeteria_id
  LEFT JOIN perfil pf ON pf.usuario_id = p.creado_por
  WHERE p.id = p_id;
$$;

COMMIT;

/*
 * Comprobación, para leer en la salida.
 *
 * Lo que tiene que salir: ni un proveedor ni un pedido en FBE.34, ninguna
 * hoja sin categoría que marcar, y la columna de observaciones existiendo y
 * vacía en todos los pedidos anteriores a este cambio.
 */
SELECT tipo_documento, COUNT(*) AS proveedores,
       COUNT(*) FILTER (WHERE categoria_fija IS NULL) AS sin_categoria
  FROM proveedor
 GROUP BY tipo_documento;

SELECT tipo_documento, COUNT(*) AS pedidos,
       COUNT(*) FILTER (WHERE categoria_marcada IS NULL) AS sin_categoria,
       COUNT(*) FILTER (WHERE observaciones <> '')      AS con_observaciones
  FROM pedido
 GROUP BY tipo_documento;
