-- reservasCafeterias · lo que el panel de pedidos necesita de la base
-- ===========================================================================
--
-- Se ejecuta DESPUÉS de 07-flujo-pedidos.sql.
--
-- Casi todo el panel son lecturas y escrituras sueltas que `api/` hace
-- directamente. Aquí solo están las DOS operaciones que no se pueden partir
-- en dos pasos sin dejar el catálogo mal a mitad de camino.

/* ── detalle_producto ───────────────────────────────────────────────────
 *
 * Un producto en la forma del contrato. Existe para que `mover_producto`
 * devuelva lo mismo que devuelven las demás acciones del catálogo, en vez de
 * la fila cruda con sus nulos.
 */
CREATE OR REPLACE FUNCTION detalle_producto(p_id BIGINT)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id',            pr.id,
    'proveedor_id',  pr.proveedor_id,
    'orden',         pr.orden,
    'codigo',        COALESCE(pr.codigo, ''),
    'nombre',        pr.nombre,
    'categoria',     COALESCE(pr.categoria, ''),
    'unidad_medida', pr.unidad_medida,
    'activo',        pr.activo
  )
  FROM producto pr
  WHERE pr.id = p_id;
$$;

/* ── mover_producto ─────────────────────────────────────────────────────
 *
 * Sube o baja un producto una posición, intercambiándolo con su vecino.
 *
 * El `orden` es el de la plantilla de papel, y ahí importa: quien pide
 * recorre la hoja con el dedo en el orden de siempre. Por eso se mueve de uno
 * en uno y no se teclea un número — con números, cambiar de sitio el renglón
 * 3 obliga a renumerar los veinte de abajo a mano.
 *
 * `producto_orden_unico` impide que dos productos del mismo proveedor
 * compartan posición, así que un intercambio directo chocaría contra el
 * índice en el instante en que los dos valen lo mismo. De ahí el paso por un
 * hueco libre: se aparta uno, se mueve el otro, y se vuelve.
 */
CREATE OR REPLACE FUNCTION mover_producto(
  p_id         BIGINT,
  -- Negativo sube, positivo baja. Un número y no un texto porque es una
  -- dirección, no un nombre de operación.
  p_direccion  INT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prod    producto;
  v_vecino  producto;
  v_hueco   INT;
BEGIN
  SELECT * INTO v_prod FROM producto WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCTO_NO_ENCONTRADO';
  END IF;

  /*
   * El vecino se busca entre TODOS los del proveedor, activos o no. Saltarse
   * los archivados haría que subir un producto lo colocara por encima de uno
   * que sigue ocupando su renglón en la plantilla, y el día que se reactivara
   * aparecería en un sitio que nadie eligió.
   */
  IF p_direccion < 0 THEN
    SELECT * INTO v_vecino FROM producto
     WHERE proveedor_id = v_prod.proveedor_id AND orden < v_prod.orden
     ORDER BY orden DESC LIMIT 1 FOR UPDATE;
  ELSE
    SELECT * INTO v_vecino FROM producto
     WHERE proveedor_id = v_prod.proveedor_id AND orden > v_prod.orden
     ORDER BY orden ASC LIMIT 1 FOR UPDATE;
  END IF;

  -- Ya está en el extremo. No es un error: es que no hay a dónde moverlo, y
  -- devolver el producto tal cual deja la pantalla igual, que es lo correcto.
  IF NOT FOUND THEN
    RETURN detalle_producto(p_id);
  END IF;

  -- Un valor que seguro no usa nadie de este proveedor.
  SELECT COALESCE(MIN(orden), 0) - 1 INTO v_hueco
    FROM producto WHERE proveedor_id = v_prod.proveedor_id;

  UPDATE producto SET orden = v_hueco        WHERE id = v_prod.id;
  UPDATE producto SET orden = v_prod.orden   WHERE id = v_vecino.id;
  UPDATE producto SET orden = v_vecino.orden WHERE id = v_prod.id;

  RETURN detalle_producto(p_id);
END;
$$;

/* ── crear_productos ────────────────────────────────────────────────────
 *
 * Añade uno o VARIOS productos al final del catálogo de un proveedor.
 *
 * Una sola función para el alta suelta y para la carga en lote, porque son la
 * misma operación con distinto número de filas. Y en SQL, no en `api/`,
 * porque el `orden` sale de `MAX(orden) + 1`: calcularlo fuera y luego
 * insertar deja una ventana en la que otra alta se lleva el mismo número y
 * choca contra `producto_orden_unico`.
 *
 * `WITH ORDINALITY` conserva el orden en que llegaron: pegar veinte líneas de
 * un catálogo nuevo tiene que producirlas en ese mismo orden, no en el que a
 * Postgres le apetezca devolverlas.
 *
 * Y se recorre con `jsonb_array_elements`, sacando cada campo con `->>`, en
 * vez de con `jsonb_to_recordset`: Postgres NO admite `WITH ORDINALITY` junto
 * a una lista de definición de columnas —«cannot be used with a column
 * definition list»— así que con `to_recordset` habría que elegir entre tener
 * los campos tipados o tener el orden, y el orden es el dato que importa.
 */
CREATE OR REPLACE FUNCTION crear_productos(
  p_proveedor_id TEXT,
  -- [{codigo, nombre, categoria, unidad_medida}]
  p_productos    JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_desde INT;
BEGIN
  IF jsonb_array_length(p_productos) = 0 THEN
    RAISE EXCEPTION 'SIN_PRODUCTOS';
  END IF;

  PERFORM 1 FROM proveedor WHERE id = p_proveedor_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROVEEDOR_NO_ENCONTRADO';
  END IF;

  SELECT COALESCE(MAX(orden), 0) INTO v_desde
    FROM producto WHERE proveedor_id = p_proveedor_id;

  INSERT INTO producto (proveedor_id, orden, codigo, nombre, categoria, unidad_medida)
  SELECT
    p_proveedor_id,
    v_desde + l.ord::INT,
    -- Cadena vacía y ausencia son lo mismo aquí: un código en blanco no es un
    -- código, y guardarlo como '' haría que la columna se imprimiera vacía en
    -- vez de no imprimirse.
    NULLIF(TRIM(COALESCE(l.item ->> 'codigo', '')), ''),
    TRIM(l.item ->> 'nombre'),
    NULLIF(TRIM(COALESCE(l.item ->> 'categoria', '')), ''),
    TRIM(l.item ->> 'unidad_medida')
  FROM jsonb_array_elements(p_productos) WITH ORDINALITY AS l(item, ord);

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id',            pr.id,
             'proveedor_id',  pr.proveedor_id,
             'orden',         pr.orden,
             'codigo',        COALESCE(pr.codigo, ''),
             'nombre',        pr.nombre,
             'categoria',     COALESCE(pr.categoria, ''),
             'unidad_medida', pr.unidad_medida,
             'activo',        pr.activo
           ) ORDER BY pr.orden)
    FROM producto pr
    WHERE pr.proveedor_id = p_proveedor_id AND pr.orden > v_desde
  ), '[]'::jsonb);
END;
$$;
