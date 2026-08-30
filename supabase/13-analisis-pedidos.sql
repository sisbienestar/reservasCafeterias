-- reservasCafeterias · análisis del histórico de pedidos
-- ===========================================================================
--
-- Se ejecuta DESPUÉS de 12-historico-pedidos.sql. Como el resto de funciones,
-- NO se expone por REST: se invoca desde `api/` con la clave de servicio. Lo
-- que devuelve es el catálogo de compras de la Universidad —quién compra qué,
-- a quién y cuánto—, así que vale lo mismo que decía 05-pedidos.sql sobre las
-- tablas: la única puerta es `api/index.ts`.
--
-- Una sola función que devuelve las SEIS vistas del panel a la vez, y no seis
-- funciones. Es la misma disciplina que `reservas.buscar`, y por el mismo
-- motivo que se explica en CLAUDE.md: la pantalla comparte un juego de filtros
-- entre todas las vistas, así que un cambio de filtro tendría que disparar
-- seis viajes en vez de uno. Los agregados son pequeños —decenas o cientos de
-- filas— aunque el detalle del que salen sean miles.
--
-- ── Dos decisiones que hay que conocer para leer los números ──────────────
--
-- 1. SOLO CUENTA LO QUE SALIÓ DE LA CAFETERÍA: los estados `enviado` y
--    `confirmado`. Un pedido `creado` todavía se está escribiendo y un
--    `anulado` no llegó a existir; meterlos inflaría el consumo con papel que
--    nadie despachó. La pantalla lo dice en letra.
--
--    Van LOS DOS y no solo el último: el pedido es igual de real en cuanto se
--    envía, y contar solo los confirmados dejaría fuera todo lo que está en
--    curso. Antes el filtro nombraba un solo estado y por eso los que llegaban
--    al final quedaban invisibles — con tres no se notaba, con 348 sí.
--
-- 2. `cantidad` SOLO SE SUMA ENTRE COSAS QUE COMPARTEN UNIDAD. Sumar 3
--    BANDEJAS con 8 LIBRAS da 11 de nada. Por eso todo agregado que cruza
--    productos trae ADEMÁS `lineas` y `pedidos`, que no tienen unidad y sí se
--    pueden comparar; y por eso los agregados por producto arrastran su
--    `unidad`. Quien pinta decide cuál de los tres enseña.
--
-- Se agrupa por `producto_id`, no por el `producto_nombre` copiado en la
-- línea. Es lo que dice 05-pedidos.sql: el texto copiado es lo que se imprime,
-- la clave foránea es «para agrupar y comparar». Además el histórico importado
-- trae el nombre tal como se escribió en cada hoja, con sus variantes.

/* ── analisis_pedidos ───────────────────────────────────────────────────
 *
 * Todos los filtros son opcionales: cadena vacía o 0 significan «sin filtrar».
 * Se pasan como texto y no como NULL para que la API no tenga que distinguir
 * entre «no lo mandó» y «lo mandó vacío», que desde el cable son lo mismo.
 */
CREATE OR REPLACE FUNCTION analisis_pedidos(
  p_desde         DATE,
  p_hasta         DATE,
  p_cafeteria_id  TEXT    DEFAULT '',
  p_proveedor_id  TEXT    DEFAULT '',
  p_categoria     TEXT    DEFAULT '',
  p_producto_id   BIGINT  DEFAULT 0,
  -- Cuántos productos trae el «top». Configurable desde la pantalla.
  p_top           INT     DEFAULT 20,
  -- Sin pedir desde hace tantos días = candidato a salir del catálogo activo.
  p_dias_desuso   INT     DEFAULT 90,
  -- 'mes' | 'semana'. La pantalla ofrece semana solo en rangos cortos.
  p_granularidad  TEXT    DEFAULT 'mes'
) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dias        INT  := (p_hasta - p_desde) + 1;
  -- El periodo inmediatamente anterior, del mismo largo, para la variación %.
  v_desde_prev  DATE := p_desde - v_dias;
  v_hasta_prev  DATE := p_desde - 1;
  /*
   * El grano de las series por fecha. Un semestre son 130 columnas de dos
   * píxeles y un mapa de calor de 130 × 6 celdas: ilegible, y además manda al
   * navegador ocho veces más filas de las que puede enseñar. A partir de dos
   * meses la unidad pasa a ser la semana. Es la misma regla que ya usa
   * `Consolidado.tsx` con TOPE_DIAS, subida al servidor porque aquí es donde
   * se puede evitar el viaje.
   */
  v_por_semana  BOOLEAN := v_dias > 62;
  v_resultado   JSONB;
BEGIN
  IF p_granularidad NOT IN ('mes', 'semana') THEN
    RAISE EXCEPTION 'GRANULARIDAD_INVALIDA';
  END IF;

  WITH
  /*
   * El conjunto de trabajo: una fila por renglón de pedido, ya filtrado y con
   * todo lo que hace falta para agrupar. Todas las vistas salen de aquí, así
   * que el filtro se escribe UNA vez y no seis con la posibilidad de que una
   * se quede sin la guarda de estado.
   */
  lineas AS (
    SELECT
      pl.producto_id,
      pl.cantidad_solicitada           AS cantidad,
      p.id                             AS pedido_id,
      p.cafeteria_id,
      p.proveedor_id,
      p.fecha_elaboracion              AS fecha,
      p.categoria_marcada,
      pr.nombre                        AS producto_nombre,
      pr.unidad_medida                 AS unidad,
      pv.nombre                        AS proveedor_nombre,
      cf.nombre                        AS cafeteria_nombre
    FROM pedido_linea pl
    JOIN pedido    p  ON p.id  = pl.pedido_id
    JOIN producto  pr ON pr.id = pl.producto_id
    JOIN proveedor pv ON pv.id = p.proveedor_id
    JOIN cafeteria cf ON cf.id = p.cafeteria_id
    WHERE p.estado IN ('enviado', 'confirmado')
      AND p.fecha_elaboracion BETWEEN p_desde AND p_hasta
      AND (p_cafeteria_id = '' OR p.cafeteria_id   = p_cafeteria_id)
      AND (p_proveedor_id = '' OR p.proveedor_id   = p_proveedor_id)
      AND (p_categoria    = '' OR p.categoria_marcada = p_categoria)
      AND (p_producto_id  = 0  OR pl.producto_id   = p_producto_id)
  ),

  /* El mismo filtro sobre el periodo anterior, solo para la variación %. */
  lineas_prev AS (
    SELECT p.proveedor_id, pl.cantidad_solicitada AS cantidad, p.id AS pedido_id
    FROM pedido_linea pl
    JOIN pedido p ON p.id = pl.pedido_id
    WHERE p.estado IN ('enviado', 'confirmado')
      AND p.fecha_elaboracion BETWEEN v_desde_prev AND v_hasta_prev
      AND (p_cafeteria_id = '' OR p.cafeteria_id   = p_cafeteria_id)
      AND (p_proveedor_id = '' OR p.proveedor_id   = p_proveedor_id)
      AND (p_categoria    = '' OR p.categoria_marcada = p_categoria)
      AND (p_producto_id  = 0  OR pl.producto_id   = p_producto_id)
  ),

  /* Los productos que de verdad aparecen en el rango. Es lo que alimenta el
   * autocompletado del filtro: ofrecer los 283 del catálogo incluiría
   * doscientos que no devuelven ni una fila. */
  disponibles AS (
    SELECT DISTINCT producto_id AS id, producto_nombre AS nombre,
           unidad, proveedor_id, proveedor_nombre
    FROM lineas
  ),

  /* ── 1 · Consumo comparado por cafetería ───────────────────────────── */
  sede_categoria AS (
    SELECT cafeteria_id, cafeteria_nombre, categoria_marcada AS categoria,
           SUM(cantidad) AS cantidad, COUNT(*) AS lineas,
           COUNT(DISTINCT pedido_id) AS pedidos
    FROM lineas GROUP BY 1, 2, 3
  ),
  /* Acotado al top de productos: sede × catálogo entero serían 6 × 283 filas
   * que nadie va a leer. Los que más pesan son los que se comparan. */
  top_ids AS (
    SELECT producto_id FROM lineas
    GROUP BY producto_id ORDER BY SUM(cantidad) DESC, COUNT(*) DESC
    LIMIT GREATEST(p_top, 1)
  ),
  sede_producto AS (
    SELECT l.cafeteria_id, l.cafeteria_nombre, l.producto_id,
           l.producto_nombre, l.unidad,
           SUM(l.cantidad) AS cantidad, COUNT(*) AS lineas
    FROM lineas l
    WHERE l.producto_id IN (SELECT producto_id FROM top_ids)
    GROUP BY 1, 2, 3, 4, 5
  ),

  /* ── 2 · Tendencia por proveedor ───────────────────────────────────── */
  tendencia AS (
    SELECT
      CASE WHEN p_granularidad = 'semana'
           THEN date_trunc('week',  fecha)::DATE
           ELSE date_trunc('month', fecha)::DATE END AS periodo,
      proveedor_id, proveedor_nombre,
      SUM(cantidad) AS cantidad, COUNT(*) AS lineas,
      COUNT(DISTINCT pedido_id) AS pedidos
    FROM lineas GROUP BY 1, 2, 3
  ),
  tendencia_resumen AS (
    SELECT
      a.proveedor_id, a.proveedor_nombre,
      a.cantidad, a.lineas, a.pedidos,
      COALESCE(b.cantidad, 0) AS cantidad_prev,
      COALESCE(b.pedidos, 0)  AS pedidos_prev
    FROM (
      SELECT proveedor_id, proveedor_nombre, SUM(cantidad) AS cantidad,
             COUNT(*) AS lineas, COUNT(DISTINCT pedido_id) AS pedidos
      FROM lineas GROUP BY 1, 2
    ) a
    LEFT JOIN (
      SELECT proveedor_id, SUM(cantidad) AS cantidad,
             COUNT(DISTINCT pedido_id) AS pedidos
      FROM lineas_prev GROUP BY 1
    ) b ON b.proveedor_id = a.proveedor_id
  ),

  /* ── 3 · Top de productos y productos en desuso ────────────────────── */

  /*
   * El ranking va por RENGLONES, no por cantidad, y no es un detalle.
   *
   * Ordenar por SUM(cantidad) pone 911 unidades de empanada por encima de 212
   * libras de pulpa, que es exactamente la suma sin sentido contra la que
   * avisa toda la sección: son unidades distintas. Además la gráfica dibuja
   * renglones, así que con el orden por cantidad las barras salían
   * desordenadas -la primera más corta que la tercera- y una gráfica de barras
   * que no desciende se lee como rota aunque cada cifra sea correcta.
   *
   * COUNT(*) -en cuántos renglones de pedido apareció- no tiene unidad, se
   * puede comparar entre productos, y contesta mejor la pregunta de la vista:
   * a qué producto hay que prestarle atención. La cantidad sigue en la tabla,
   * con su unidad al lado, que es donde significa algo.
   */
  top_productos AS (
    SELECT producto_id, producto_nombre, unidad, proveedor_id, proveedor_nombre,
           SUM(cantidad) AS cantidad, COUNT(*) AS lineas,
           COUNT(DISTINCT pedido_id) AS pedidos,
           MAX(fecha) AS ultima
    FROM lineas GROUP BY 1, 2, 3, 4, 5
    ORDER BY COUNT(*) DESC, SUM(cantidad) DESC
    LIMIT GREATEST(p_top, 1)
  ),
  /*
   * Los que no se piden. Se mira el catálogo ACTIVO entero contra TODO el
   * histórico, no contra el rango: un producto que no salga en el rango
   * elegido puede haberse pedido la semana antes de que empiece, y sacarlo
   * del catálogo por eso sería un error. La pregunta es «¿hace cuánto que no
   * se pide esto?», y esa no depende del rango que se esté mirando.
   */
  ultima_vez AS (
    SELECT pl.producto_id,
           MAX(p.fecha_elaboracion) AS ultima,
           /*
            * La categoría con la que se ha pedido este producto.
            *
            * Hace falta porque la categoría es propiedad del PEDIDO
            * —`categoria_marcada`, la casilla del FBE.04— y no del producto,
            * y aquí se está filtrando un catálogo, no unos pedidos. Sin esto,
            * el filtro de categoría usaría `proveedor.categoria_fija`, que es
            * NULL en los proveedores FBE.34 (Coca-Cola, Vicky, Ramo…) cuya
            * plantilla no tiene esa casilla: filtrar por «Alimentos y
            * bebidas» los habría dejado fuera de esta lista mientras el resto
            * de las vistas los incluye, que es la clase de incoherencia que
            * hace desconfiar de un panel entero.
            */
           MAX(p.categoria_marcada) AS categoria
    FROM pedido_linea pl
    JOIN pedido p ON p.id = pl.pedido_id
    WHERE p.estado IN ('enviado', 'confirmado')
    GROUP BY 1
  ),
  desuso AS (
    SELECT pr.id AS producto_id, pr.nombre AS producto_nombre,
           pr.unidad_medida AS unidad, pr.proveedor_id,
           pv.nombre AS proveedor_nombre,
           uv.ultima,
           CASE WHEN uv.ultima IS NULL THEN NULL
                ELSE (p_hasta - uv.ultima) END AS dias
    FROM producto pr
    JOIN proveedor pv ON pv.id = pr.proveedor_id
    LEFT JOIN ultima_vez uv ON uv.producto_id = pr.id
    WHERE pr.activo
      AND pv.activo
      AND (p_proveedor_id = '' OR pr.proveedor_id = p_proveedor_id)
      -- Con qué se ha pedido; y si nunca se pidió, lo que declara su almacén.
      AND (p_categoria = '' OR COALESCE(uv.categoria, pv.categoria_fija) = p_categoria)
      -- Nunca pedido, o pedido por última vez hace más del umbral.
      AND (uv.ultima IS NULL OR uv.ultima < p_hasta - p_dias_desuso)
  ),

  /* ── 4 · Estacionalidad ────────────────────────────────────────────── */
  -- ISODOW: 1 = lunes … 7 = domingo. Se usa el ISO y no `dow` porque aquí la
  -- semana empieza en lunes, como en `lunesDeSemana` del frontend.
  dia_semana AS (
    SELECT EXTRACT(ISODOW FROM fecha)::INT AS dia,
           SUM(cantidad) AS cantidad, COUNT(*) AS lineas,
           COUNT(DISTINCT pedido_id) AS pedidos
    FROM lineas GROUP BY 1
  ),
  por_fecha AS (
    SELECT CASE WHEN v_por_semana THEN date_trunc('week', fecha)::DATE ELSE fecha END AS periodo,
           SUM(cantidad) AS cantidad, COUNT(*) AS lineas,
           COUNT(DISTINCT pedido_id) AS pedidos
    FROM lineas GROUP BY 1
  ),
  fecha_sede AS (
    SELECT CASE WHEN v_por_semana THEN date_trunc('week', fecha)::DATE ELSE fecha END AS periodo,
           cafeteria_id, cafeteria_nombre,
           SUM(cantidad) AS cantidad, COUNT(*) AS lineas,
           COUNT(DISTINCT pedido_id) AS pedidos
    FROM lineas GROUP BY 1, 2, 3
  ),

  /* ── 5 · Composición por categoría ─────────────────────────────────── */
  categoria AS (
    SELECT categoria_marcada AS categoria,
           SUM(cantidad) AS cantidad, COUNT(*) AS lineas,
           COUNT(DISTINCT pedido_id) AS pedidos
    FROM lineas GROUP BY 1
  ),
  categoria_sede AS (
    SELECT cafeteria_id, cafeteria_nombre, categoria_marcada AS categoria,
           SUM(cantidad) AS cantidad, COUNT(*) AS lineas
    FROM lineas GROUP BY 1, 2, 3
  ),
  /*
   * El reparto por PROVEEDOR dentro del filtro activo.
   *
   * No estaba en el encargo y se añade porque, con los datos de hoy, la
   * pregunta que hace la vista 5 —«¿cómo se reparte el pedido?»— no tiene
   * respuesta útil por categoría: 355 de 357 pedidos están marcados
   * «Alimentos y bebidas», así que el gráfico circular sale de una sola
   * porción. El reparto por proveedor contesta la misma pregunta y sí
   * distingue. La vista enseña una u otra según lo que haya.
   */
  proveedor_reparto AS (
    SELECT proveedor_id, proveedor_nombre,
           SUM(cantidad) AS cantidad, COUNT(*) AS lineas,
           COUNT(DISTINCT pedido_id) AS pedidos
    FROM lineas GROUP BY 1, 2
  ),

  /* ── 6 · Consistencia del pedido ───────────────────────────────────── */
  /*
   * Por producto y sede: cuántas veces se pidió, cuánto de media y cuánto
   * varía. El coeficiente de variación (desviación / media) es lo que hace
   * comparables dos productos de escalas distintas: una desviación de 3
   * unidades es enorme en algo que se pide de a 2 y despreciable en algo que
   * se pide de a 200.
   *
   * `stddev_samp` necesita al menos dos observaciones —con una sola devuelve
   * NULL— y con una sola tampoco habría nada que llamar variabilidad, así que
   * se exigen dos pedidos para entrar.
   */
  consistencia AS (
    SELECT producto_id, producto_nombre, unidad, proveedor_nombre,
           cafeteria_id, cafeteria_nombre,
           COUNT(DISTINCT pedido_id)              AS veces,
           AVG(cantidad)                          AS promedio,
           MIN(cantidad)                          AS minimo,
           MAX(cantidad)                          AS maximo,
           COALESCE(STDDEV_SAMP(cantidad), 0)     AS desviacion
    FROM lineas
    GROUP BY 1, 2, 3, 4, 5, 6
    HAVING COUNT(DISTINCT pedido_id) >= 2
  )

  SELECT jsonb_build_object(
    'desde',        p_desde,
    'hasta',        p_hasta,
    'dias',         v_dias,
    'granularidad', p_granularidad,
    -- Con qué grano vienen `porFecha` y `porFechaSede`, que no es el mismo
    -- que el de la tendencia: la pantalla tiene que rotularlo.
    'grano_fecha',  CASE WHEN v_por_semana THEN 'semana' ELSE 'dia' END,
    'periodo_previo', jsonb_build_object('desde', v_desde_prev, 'hasta', v_hasta_prev),

    'resumen', (
      SELECT jsonb_build_object(
        'pedidos',    COUNT(DISTINCT pedido_id),
        'lineas',     COUNT(*),
        'productos',  COUNT(DISTINCT producto_id),
        'sedes',      COUNT(DISTINCT cafeteria_id),
        'proveedores',COUNT(DISTINCT proveedor_id),
        'unidades',   COUNT(DISTINCT unidad)
      ) FROM lineas
    ),

    'productos_disponibles', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'nombre', nombre, 'unidad', unidad,
        'proveedor_id', proveedor_id, 'proveedor_nombre', proveedor_nombre
      ) ORDER BY nombre) FROM disponibles
    ), '[]'::JSONB),

    'por_sede_categoria', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.cafeteria_nombre, t.categoria) FROM sede_categoria t
    ), '[]'::JSONB),

    'por_sede_producto', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.cantidad DESC) FROM sede_producto t
    ), '[]'::JSONB),

    'tendencia', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.periodo, t.proveedor_nombre) FROM tendencia t
    ), '[]'::JSONB),

    'tendencia_resumen', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.cantidad DESC) FROM tendencia_resumen t
    ), '[]'::JSONB),

    'top_productos', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.lineas DESC, t.cantidad DESC) FROM top_productos t
    ), '[]'::JSONB),

    'en_desuso', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.ultima NULLS FIRST, t.producto_nombre) FROM desuso t
    ), '[]'::JSONB),

    'por_dia_semana', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.dia) FROM dia_semana t
    ), '[]'::JSONB),

    'por_fecha', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.periodo) FROM por_fecha t
    ), '[]'::JSONB),

    'por_fecha_sede', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.periodo, t.cafeteria_nombre) FROM fecha_sede t
    ), '[]'::JSONB),

    'por_categoria', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.cantidad DESC) FROM categoria t
    ), '[]'::JSONB),

    'por_categoria_sede', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.cafeteria_nombre, t.categoria) FROM categoria_sede t
    ), '[]'::JSONB),

    'por_proveedor', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.cantidad DESC) FROM proveedor_reparto t
    ), '[]'::JSONB),

    'consistencia', COALESCE((
      SELECT jsonb_agg(to_jsonb(t) ORDER BY t.veces DESC, t.producto_nombre) FROM consistencia t
    ), '[]'::JSONB)
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$$;

COMMENT ON FUNCTION analisis_pedidos IS
  'Las seis vistas del panel de análisis, en una sola llamada. Solo pedidos confirmados.';

/*
 * Índices de apoyo.
 *
 * 05-pedidos.sql ya trae `pedido_por_fecha`, `pedido_por_sede` y
 * `pedido_linea_por_producto`, que es lo que usan casi todos los agrupados de
 * aquí. Falta uno: el filtro de esta función SIEMPRE lleva `estado` y
 * `fecha_elaboracion` juntos, y con el histórico cargado el 99 % de la tabla
 * es 'confirmado' — un índice normal sobre `estado` no serviría de nada. El
 * parcial sí: indexa solo las filas que esta función mira.
 */
DROP INDEX IF EXISTS pedido_confirmado_por_fecha;
CREATE INDEX pedido_confirmado_por_fecha
  ON pedido (fecha_elaboracion, proveedor_id, cafeteria_id)
  WHERE estado IN ('enviado', 'confirmado');
