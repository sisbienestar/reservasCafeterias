-- reservasCafeterias · el ciclo de vida del pedido
-- ===========================================================================
--
-- Se ejecuta DESPUÉS de 06-funciones-pedidos.sql.
--
-- Añade el paso que faltaba entre elaborar un pedido y que administración lo
-- imprima: el BORRADOR. Quien lo elabora lo ve como documento, lo corrige si
-- hace falta, y solo entonces lo confirma.
--
--     borrador  ──editar──┐
--        │  ▲             │
--        │  └─────────────┘
--        │
--        └──confirmar──►  confirmado  ──►  administración imprime y firma
--        │                     │
--        └──anular──►  anulado  ◄──anular (solo administración)
--
-- Este archivo es a la vez la MIGRACIÓN de la base que ya está desplegada y
-- parte del esquema de una instalación nueva. Por eso todo va guardado con
-- `IF EXISTS` y los `UPDATE` solo tocan filas que en una base nueva no
-- existen: se puede ejecutar sobre las dos sin romper ninguna.
--
-- 05-pedidos.sql ya quedó actualizado con el estado y la columna nuevos, así
-- que en una instalación desde cero esto no cambia nada. En la desplegada, sí.

/* ── El estado ──────────────────────────────────────────────────────────
 *
 * Antes era `('registrado', 'anulado')`. «Registrado» significaba lo que
 * ahora significa «confirmado» —terminado y guardado—, así que los pedidos
 * que ya existen migran ahí y no a borrador: nadie los está revisando.
 */

ALTER TABLE pedido ADD COLUMN IF NOT EXISTS confirmado_en TIMESTAMPTZ;

-- Los dos nombres posibles: el que Postgres inventó cuando la restricción no
-- lo tenía, y el que lleva desde que 05-pedidos.sql se lo puso.
ALTER TABLE pedido DROP CONSTRAINT IF EXISTS pedido_estado_check;
ALTER TABLE pedido DROP CONSTRAINT IF EXISTS pedido_estado_valido;

/*
 * El UPDATE va ANTES de volver a poner el CHECK: al revés, la restricción
 * nueva rechazaría las filas viejas y el ALTER fallaría entero.
 *
 * Un solo UPDATE y un solo WHERE, y las dos cosas a la vez. El editor SQL de
 * Supabase avisa de «UPDATE sin WHERE» analizando línea a línea, así que un
 * WHERE en el renglón siguiente le parece que no existe. Aquí cabe entero en
 * uno, y de paso se lee mejor: los pedidos que ya existen se dan por
 * confirmados EN el momento en que se crearon, que es lo que fueron.
 */
UPDATE pedido SET estado = 'confirmado', confirmado_en = creado_en WHERE estado = 'registrado';

ALTER TABLE pedido
  ADD CONSTRAINT pedido_estado_valido
  CHECK (estado IN ('borrador', 'confirmado', 'anulado'));

ALTER TABLE pedido ALTER COLUMN estado SET DEFAULT 'borrador';

-- Un pedido confirmado sin fecha de confirmación, o un borrador con ella,
-- serían un estado que no cuadra con su propia historia.
ALTER TABLE pedido DROP CONSTRAINT IF EXISTS pedido_confirmado_con_fecha;
ALTER TABLE pedido
  ADD CONSTRAINT pedido_confirmado_con_fecha
  CHECK (
    (estado = 'confirmado' AND confirmado_en IS NOT NULL) OR
    (estado <> 'confirmado' AND confirmado_en IS NULL)
  );

/* ── actualizar_pedido ──────────────────────────────────────────────────
 *
 * Cambia el encabezado y REEMPLAZA las líneas de un borrador.
 *
 * Reemplazar y no ir renglón a renglón porque el formulario es la hoja
 * entera: quien corrige un pedido vuelve a la misma pantalla, retoca las
 * casillas y guarda. Calcular qué renglón se añadió, cuál cambió y cuál se
 * borró sería reconstruir en el servidor una información que el cliente ya
 * tiene entera.
 *
 * El borrado y la inserción pasan en la misma transacción, así que un fallo a
 * medias no deja el pedido sin líneas.
 *
 * `estado = 'borrador'` es la cerradura, y está aquí y no solo en `api/`
 * porque es la regla que sostiene todo lo demás: un pedido confirmado que se
 * pudiera editar haría que el papel impreso y la base dijeran cosas distintas.
 */
CREATE OR REPLACE FUNCTION actualizar_pedido(
  p_id                BIGINT,
  p_fecha_entrega     DATE,
  p_hora_entrega      TIME,
  p_lugar_entrega     TEXT,
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

  /*
   * `FOR UPDATE` bloquea la fila hasta el final de la transacción. Sin él,
   * dos pestañas guardando a la vez podrían pasar las dos por el «es
   * borrador» antes de que ninguna escribiera, y la segunda machacaría a la
   * primera sin que nadie se enterara.
   */
  SELECT * INTO v_pedido FROM pedido WHERE id = p_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PEDIDO_NO_ENCONTRADO';
  END IF;

  IF v_pedido.estado <> 'borrador' THEN
    RAISE EXCEPTION 'PEDIDO_NO_EDITABLE';
  END IF;

  UPDATE pedido SET
    -- Solo en los FBE.34; en los FBE.04 llegan en NULL y el CHECK del esquema
    -- lo exige, así que no hace falta repetirlo aquí.
    fecha_entrega = p_fecha_entrega,
    hora_entrega  = p_hora_entrega,
    lugar_entrega = COALESCE(NULLIF(p_lugar_entrega, ''), lugar_entrega)
  WHERE id = p_id;

  DELETE FROM pedido_linea WHERE pedido_id = p_id;

  -- Idéntico al de `crear_pedido`, y por lo mismo: el texto que se imprime se
  -- copia del catálogo, y el JOIN es a la vez la copia y la comprobación de
  -- que el producto es de ESTE proveedor y sigue activo.
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

  RETURN detalle_pedido(p_id);
END;
$$;

/* ── cambiar_estado_pedido ──────────────────────────────────────────────
 *
 * Confirmar y anular son el mismo gesto con distinto destino, y las dos
 * transiciones que valen están declaradas aquí y en ningún otro sitio:
 *
 *     borrador   → confirmado    (lo hace quien elabora)
 *     borrador   → anulado       (lo hace quien elabora)
 *     confirmado → anulado       (solo administración; lo comprueba `api/`)
 *
 * Lo que NO existe es volver atrás. Un confirmado que pudiera regresar a
 * borrador dejaría a administración con un papel impreso de algo que ya no
 * está confirmado.
 *
 * `confirmado_en` lo pone la BASE con `now()`, no el cliente: es la hora de
 * cuando pasó, y el reloj del navegador no la sabe.
 */
CREATE OR REPLACE FUNCTION cambiar_estado_pedido(
  p_id     BIGINT,
  p_nuevo  TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_estado TEXT;
BEGIN
  SELECT estado INTO v_estado FROM pedido WHERE id = p_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PEDIDO_NO_ENCONTRADO';
  END IF;

  IF p_nuevo = 'confirmado' AND v_estado = 'borrador' THEN
    UPDATE pedido SET estado = 'confirmado', confirmado_en = now() WHERE id = p_id;

  ELSIF p_nuevo = 'anulado' AND v_estado IN ('borrador', 'confirmado') THEN
    -- Se limpia la fecha de confirmación: la exige el CHECK, y además un
    -- anulado que conserve «confirmado el…» se lee como si siguiera vigente.
    UPDATE pedido SET estado = 'anulado', confirmado_en = NULL WHERE id = p_id;

  ELSE
    RAISE EXCEPTION 'TRANSICION_INVALIDA';
  END IF;

  RETURN detalle_pedido(p_id);
END;
$$;

/* ── detalle_pedido, con la fecha de confirmación ───────────────────────
 *
 * Se vuelve a declarar entera —`CREATE OR REPLACE` no sabe añadir una clave a
 * un `jsonb_build_object`— con `confirmado_en` dentro. Es lo que le permite a
 * la pantalla decir «Confirmado el 28 de agosto» en vez de solo «Confirmado».
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
    'estado',             p.estado,
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
    ), '[]'::jsonb)
  )
  FROM pedido p
  JOIN proveedor pv ON pv.id = p.proveedor_id
  JOIN cafeteria c  ON c.id  = p.cafeteria_id
  LEFT JOIN perfil pf ON pf.usuario_id = p.creado_por
  WHERE p.id = p_id;
$$;

-- Las excepciones de este archivo —PEDIDO_NO_EDITABLE, TRANSICION_INVALIDA,
-- PEDIDO_NO_ENCONTRADO— salen con el SQLSTATE por defecto de plpgsql (P0001)
-- y `api/_nucleo/acciones/pedidos.ts` las reconoce por el texto, igual que las
-- de 06.
