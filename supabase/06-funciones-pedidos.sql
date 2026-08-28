-- reservasCafeterias · funciones del módulo de pedidos
-- ===========================================================================
--
-- Se ejecuta DESPUÉS de 05-pedidos.sql. Como 03-funciones.sql, no se expone
-- por REST: se invoca desde `api/` con la clave de servicio. `crear_pedido`
-- sin comprobar antes quién llama sería un agujero exactamente igual de
-- grande que `crear_reserva` sin comprobarlo.

/* ── crear_pedido ───────────────────────────────────────────────────────
 *
 * El pedido y sus líneas, o ninguna de las dos cosas.
 *
 * Existe por lo mismo que `crear_reserva`: son dos escrituras que tienen que
 * pasar juntas, y la API REST de Supabase no tiene transacciones. Hacerlo en
 * dos llamadas desde `api/` dejaría, cada vez que fallara la segunda, un
 * pedido sin una sola línea — un documento en blanco en el historial, que
 * nadie sabría si es un error o un pedido que de verdad se hizo vacío.
 *
 * Y hay una segunda razón, que es de confianza: el texto que se IMPRIME
 * —nombre, código y unidad de cada producto— se copia aquí desde `producto`,
 * no llega en los parámetros. El cliente manda qué producto y cuánto; qué
 * dice el papel lo decide la base de datos. Así, un navegador manipulado no
 * puede hacer que salga impreso «PULPA DE MANGO» donde el catálogo dice otra
 * cosa.
 */
CREATE OR REPLACE FUNCTION crear_pedido(
  p_proveedor_id      TEXT,
  p_cafeteria_id      TEXT,
  p_tipo_documento    TEXT,
  p_categoria_marcada TEXT,
  p_fecha_elaboracion DATE,
  p_fecha_entrega     DATE,
  p_hora_entrega      TIME,
  p_lugar_entrega     TEXT,
  p_creado_por        UUID,
  -- [{producto_id, cantidad_solicitada, cantidad_devuelta, cantidad_adicional}]
  p_lineas            JSONB
-- JSONB y no `pedido`: la fila cruda no es la forma del contrato, igual que
-- en crear_reserva. Le faltan las líneas, que es la mitad del documento.
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
    fecha_elaboracion, fecha_entrega, hora_entrega, lugar_entrega, creado_por
  ) VALUES (
    p_proveedor_id, p_cafeteria_id, p_tipo_documento, p_categoria_marcada,
    p_fecha_elaboracion, p_fecha_entrega, p_hora_entrega,
    COALESCE(p_lugar_entrega, ''), p_creado_por
  )
  RETURNING * INTO v_pedido;

  /*
   * El JOIN contra `producto` es la comprobación, no solo la copia: un
   * producto que no sea de ESTE proveedor, o que esté dado de baja, no
   * encuentra pareja y no produce fila. Por eso después se cuenta.
   *
   * `orden` sale del catálogo y no de la pantalla: es lo que hace que el
   * documento impreso salga en el orden de la plantilla aunque el navegador
   * mandara las líneas en cualquier otro.
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

  -- Menos líneas escritas que pedidas: alguna apuntaba a un producto de otro
  -- proveedor o dado de baja. Se levanta la excepción y la transacción entera
  -- se deshace, pedido incluido. Guardar «las que sí valían» sería peor:
  -- saldría un documento al que le faltan renglones sin decirlo.
  IF v_escritas <> v_pedidas THEN
    RAISE EXCEPTION 'PRODUCTO_AJENO';
  END IF;

  RETURN detalle_pedido(v_pedido.id);
END;
$$;

/* ── detalle_pedido ─────────────────────────────────────────────────────
 *
 * El pedido con todo lo que hace falta para imprimirlo: sus líneas, y los
 * nombres del proveedor y de la sede.
 *
 * Va anidado —y no en tres consultas— porque el documento es una sola cosa.
 * Es la misma decisión que toma `reservas.buscar` al devolver detalle y
 * consolidado juntos.
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
    -- La ubicación va al documento: el FBE.04 imprime «Unidad de Servicio que
    -- solicita» como «CAFETERIA ADMINISTRACION 3 / EDIFICIO ADMINISTRACION 3
    -- PISO 6», que es el nombre y el sitio. Se saca aquí para que el documento
    -- siga saliendo de una sola llamada.
    'cafeteria_ubicacion', COALESCE(c.ubicacion, ''),
    'tipo_documento',     p.tipo_documento,
    'categoria_marcada',  COALESCE(p.categoria_marcada, ''),
    'fecha_elaboracion',  p.fecha_elaboracion,
    'fecha_entrega',      p.fecha_entrega,
    'hora_entrega',       p.hora_entrega,
    'lugar_entrega',      p.lugar_entrega,
    'estado',             p.estado,
    'creado_en',          p.creado_en,
    -- Quién lo elaboró, con nombre y no con el UUID: va impreso en el
    -- documento, encima de la tabla. Vacío si la cuenta se borró después o si
    -- algún día se importa un histórico sin autor.
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
  -- LEFT: `creado_por` admite NULL, y con un JOIN normal un pedido sin autor
  -- desaparecería del historial en vez de salir sin nombre.
  LEFT JOIN perfil pf ON pf.usuario_id = p.creado_por
  WHERE p.id = p_id;
$$;

-- Las dos excepciones de arriba salen con el SQLSTATE por defecto de plpgsql
-- (P0001) y se reconocen por el TEXTO. A propósito: prestarles el código de
-- una violación de clave foránea las habría hecho pasar por
-- `traducirError` como «no existe esa cafetería», que es justo lo que no son.
