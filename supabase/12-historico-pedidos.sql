-- reservasCafeterias · histórico de pedidos de las plantillas de Excel
-- ===========================================================================
--
-- Carga los pedidos que se hicieron entre febrero y agosto de 2026 con las
-- plantillas FBE.04, antes de que existiera el módulo. Se ejecuta DESPUÉS de
-- 05-pedidos.sql, y después de sembrar el catálogo con sembrar-pedidos.mjs.
--
-- Se puede ejecutar más de una vez: cada pedido lleva escrito de qué archivo,
-- hoja y bloque salió, y esa procedencia es única. Volver a ejecutarlo no
-- duplica nada, y por eso va todo dentro de una transacción.
--
-- Lo que NO entra, y por qué, está en `data/pedidos-historicos/INFORME.md`.

BEGIN;

/* ── De dónde salió cada pedido ─────────────────────────────────────────
 *
 * Los pedidos que crea la aplicación no tienen procedencia: nacen en el
 * formulario y su trazabilidad es `creado_por` + `creado_en`. Los importados
 * no tienen a quién atribuirse —se escribieron en una hoja de cálculo, sin
 * cuenta detrás—, así que lo que se guarda es el archivo del que vienen.
 *
 * Sirve para dos cosas, y las dos importan: hace la carga repetible sin
 * duplicar, y deja poder volver al Excel original cuando una cifra no cuadre.
 */
ALTER TABLE pedido
  ADD COLUMN IF NOT EXISTS origen_historico TEXT;

COMMENT ON COLUMN pedido.origen_historico IS
  'Archivo::hoja#bloque del Excel del que se importó. NULL en los pedidos creados por la aplicación.';

-- La clave que hace repetible la carga. Parcial, porque sólo los importados
-- tienen procedencia y NULL no choca con NULL en un índice único.
CREATE UNIQUE INDEX IF NOT EXISTS pedido_origen_historico_unico
  ON pedido (origen_historico) WHERE origen_historico IS NOT NULL;

/* ── «Servicios Especiales» ─────────────────────────────────────────────
 *
 * Una hoja de Vicky pide para «SERVICIOS ESPECIALES», que no es ninguna de
 * las cinco cafeterías pero sí es quien solicita, y `pedido.cafeteria_id` es
 * NOT NULL. Se da de alta como sede para que ese pedido pueda existir.
 *
 * Nace `activa = FALSE`, y no es un descuido: `cafeteria` NO está atada a
 * ningún módulo —la usan reservas y pedidos— así que darla de alta activa la
 * pondría a ofrecer almuerzos en /reservas, que no es lo que es. Inactiva
 * queda fuera de las dos listas y sus pedidos siguen siendo consultables,
 * que es exactamente lo que 01-esquema.sql previó para una sede cerrada.
 */
INSERT INTO cafeteria (id, codigo, nombre, ubicacion, imagen, activa) VALUES
  ('servicios-especiales', '06', 'Servicios Especiales', '', '', FALSE)
ON CONFLICT (id) DO NOTHING;

/* ── Proveedores que no estaban ─────────────────────────────────────────
 *
 * «Rapifritos» (los archivos EMPANADAS-RAPRITOS) es el que más pedidos tiene
 * de todo el histórico y no estaba en el catálogo.
 *
 * «Neofrut» se crea aparte aunque sus nueve pulpas se llamen exactamente
 * igual que las de `pulpas-camilo`: aquélla está dada de alta como FBE.34 y
 * estas hojas son FBE.04. Si resultan ser el mismo proveedor, fusionarlos
 * es un UPDATE; separar lo que ya se hubiera fusionado obliga a volver a
 * los Excel.
 *
 * Los dos son FBE.04 con «Alimentos y bebidas» marcada, como los almacenes.
 */
INSERT INTO proveedor (id, nombre, tipo_documento, categoria_fija, activo) VALUES
  ('rapifritos', 'Rapifritos', 'FBE.04', 'Alimentos y bebidas', TRUE),
  ('neofrut', 'Neofrut', 'FBE.04', 'Alimentos y bebidas', TRUE)
ON CONFLICT (id) DO NOTHING;

/* ── Productos que no estaban en el catálogo ────────────────────────────
 *
 * 28 en total. Los de Rapifritos son su catálogo entero; los de Coca-Cola
 * son presentaciones que el catálogo sembrado no recogía —la de 6 unidades
 * frente a la de 24, el Zero frente al Sin Azúcar, el Del Valle de 188 ml—.
 *
 * `orden` continúa donde acababa el proveedor, porque `producto_orden_unico`
 * es (proveedor_id, orden) y es la clave del `upsert` de la siembra: si se
 * reutilizaran números, volver a sembrar pisaría estos.
 */
INSERT INTO producto (proveedor_id, orden, codigo, nombre, categoria, unidad_medida, activo) VALUES
  ('rapifritos', 1, NULL, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL, 'UNIDAD', TRUE),
  ('rapifritos', 2, NULL, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL, 'UNIDAD', TRUE),
  ('rapifritos', 3, NULL, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL, 'UNIDAD', TRUE),
  ('rapifritos', 4, NULL, 'EMPANADA POLLO QUESO FRITA', NULL, 'UNIDAD', TRUE),
  ('rapifritos', 5, NULL, 'EMPANADA HAWAIANA FRITA', NULL, 'UNIDAD', TRUE),
  ('rapifritos', 6, NULL, 'EMPANADA MIXTA DE TRIGO', NULL, 'UNIDAD', TRUE),
  ('neofrut', 1, NULL, 'PULPA DE MARACUYA', NULL, 'LIBRAS', TRUE),
  ('neofrut', 2, NULL, 'PULPA DE LULO', NULL, 'LIBRAS', TRUE),
  ('neofrut', 3, NULL, 'PULPA DE MANGO', NULL, 'LIBRAS', TRUE),
  ('neofrut', 4, NULL, 'PULPA DE MORA', NULL, 'LIBRAS', TRUE),
  ('neofrut', 5, NULL, 'PULPA DE NARANJA', NULL, 'LIBRAS', TRUE),
  ('neofrut', 6, NULL, 'PULPA DE FRESA', NULL, 'LIBRAS', TRUE),
  ('neofrut', 7, NULL, 'PULPA DE LIMON', NULL, 'LIBRAS', TRUE),
  ('neofrut', 8, NULL, 'PULPA DE DURAZNO', NULL, 'LIBRAS', TRUE),
  ('neofrut', 9, NULL, 'PULPA DE PIÑA', NULL, 'LIBRAS', TRUE),
  ('cocacola', 24, NULL, 'FUZE TEA NEGRO LIMON X 400 ML X 6', NULL, 'BANDEJA', TRUE),
  ('cocacola', 25, NULL, 'COCACOLA ZERO 400 ML X 12', NULL, 'BANDEJA', TRUE),
  ('cocacola', 26, NULL, 'AGUA GAS BRISA LIMON 600 ML X 6', NULL, 'BANDEJA', TRUE),
  ('cocacola', 27, NULL, 'AGUA GAS BRISA 600 ML 6', NULL, 'BANDEJA', TRUE),
  ('cocacola', 28, NULL, 'AGUA BRISA LIMA LIMON 600 ML X 6', NULL, 'BANDEJA', TRUE),
  ('cocacola', 29, NULL, 'AGUA BRISA LIMÓN 600 ML 6', NULL, 'BANDEJA', TRUE),
  ('vicky', 12, NULL, 'PLATANO VERDE KAHOY 60 g', NULL, 'BOLSA', TRUE),
  ('vicky', 13, NULL, 'PAPA CEBOLLITAS', NULL, 'UNIDAD', TRUE),
  ('cocacola', 30, NULL, 'JUGO DEL VALLE 188 MANGO FRESA X24', NULL, 'BANDEJA', TRUE),
  ('cocacola', 31, NULL, 'JUGO DEL VALLE 188 ML MORA X24', NULL, 'BANDEJA', TRUE),
  ('cocacola', 32, NULL, 'JUGO DEL VALLE 500 ML MORA X24', NULL, 'BANDEJA', TRUE),
  ('cocacola', 33, NULL, 'AGUA BRISA LIMON -MANZANA 600 ML 6', NULL, 'BANDEJA', TRUE),
  ('cocacola', 34, NULL, 'POWER 500ML X6', NULL, 'BANDEJA', TRUE)
ON CONFLICT (proveedor_id, orden) DO NOTHING;

/* ── Fruver ─────────────────────────────────────────────────────────────
 *
 * La hoja «FRUVER DF» aparece repetida, idéntica y EN BLANCO, en cuatro de
 * los libros. No tiene ni un pedido, pero sí un catálogo de 34 frutas y
 * verduras que no se parece a ningún proveedor de la base.
 *
 * Se da de alta `activo = FALSE`: el proveedor existe y su catálogo queda
 * guardado, pero no sale en el mostrador hasta que se confirme de quién es.
 * Activarlo es un UPDATE de una línea.
 */
INSERT INTO proveedor (id, nombre, tipo_documento, categoria_fija, activo) VALUES
  ('fruver', 'Fruver', 'FBE.04', 'Alimentos y bebidas', FALSE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO producto (proveedor_id, orden, codigo, nombre, categoria, unidad_medida, activo) VALUES
  ('fruver', 1, NULL, 'AGUACATE', NULL, 'LIBRAS', TRUE),
  ('fruver', 2, NULL, 'ARVEJA VERDE DESGRANADA', NULL, 'LIBRAS', TRUE),
  ('fruver', 3, NULL, 'BANANO URABA', NULL, 'UNIDAD', TRUE),
  ('fruver', 4, NULL, 'BROCOLI', NULL, 'LIBRAS', TRUE),
  ('fruver', 5, NULL, 'CALABACIN AMARILLO', NULL, 'LIBRAS', TRUE),
  ('fruver', 6, NULL, 'CALABACIN VERDE', NULL, 'LIBRAS', TRUE),
  ('fruver', 7, NULL, 'CEBOLLA CABEZONA BLANCA', NULL, 'LIBRAS', TRUE),
  ('fruver', 8, NULL, 'CEBOLLA CABEZONA ROJA', NULL, 'LIBRAS', TRUE),
  ('fruver', 9, NULL, 'CEBOLLA JUNCA', NULL, 'LIBRAS', TRUE),
  ('fruver', 10, NULL, 'CHAMPIÑONES', NULL, 'LIBRAS', TRUE),
  ('fruver', 11, NULL, 'CILANTRO', NULL, 'LIBRAS', TRUE),
  ('fruver', 12, NULL, 'COLIFLOR', NULL, 'LIBRAS', TRUE),
  ('fruver', 13, NULL, 'ESPINACAS', NULL, 'LIBRAS', TRUE),
  ('fruver', 14, NULL, 'FRESA', NULL, 'LIBRAS', TRUE),
  ('fruver', 15, NULL, 'LECHUGA CRESPA', NULL, 'LIBRAS', TRUE),
  ('fruver', 16, NULL, 'MARACUYA', NULL, 'LIBRAS', TRUE),
  ('fruver', 17, NULL, 'MANGO TOMMI', NULL, 'LIBRAS', TRUE),
  ('fruver', 18, NULL, 'MANZANA ROJA', NULL, 'UNIDAD', TRUE),
  ('fruver', 19, NULL, 'MANZANA VERDE', NULL, 'UNIDAD', TRUE),
  ('fruver', 20, NULL, 'MAZORCA DESGRANDA', NULL, 'LIBRAS', TRUE),
  ('fruver', 21, NULL, 'MELON', NULL, 'LIBRAS', TRUE),
  ('fruver', 22, NULL, 'NARANJA VALENCIA', NULL, 'UNIDAD', TRUE),
  ('fruver', 23, NULL, 'PAPAYA', NULL, 'LIBRAS', TRUE),
  ('fruver', 24, NULL, 'PEPINO COHOMBRO', NULL, 'LIBRAS', TRUE),
  ('fruver', 25, NULL, 'PERAS', NULL, 'UNIDAD', TRUE),
  ('fruver', 26, NULL, 'PEREJIL', NULL, 'LIBRAS', TRUE),
  ('fruver', 27, NULL, 'PIÑA OROMIEL', NULL, 'LIBRAS', TRUE),
  ('fruver', 28, NULL, 'PIÑA OROMIEL PELADA', NULL, 'LIBRAS', TRUE),
  ('fruver', 29, NULL, 'REPOLLO MORADO', NULL, 'LIBRAS', TRUE),
  ('fruver', 30, NULL, 'TOMATE MANZANO VERDE', NULL, 'LIBRAS', TRUE),
  ('fruver', 31, NULL, 'TOMATE ROJO CHONTO MADURO', NULL, 'LIBRAS', TRUE),
  ('fruver', 32, NULL, 'TOMATE ROJO CHONTO PINTON', NULL, 'LIBRAS', TRUE),
  ('fruver', 33, NULL, 'LIMONES', NULL, 'UNIDAD', TRUE),
  ('fruver', 34, NULL, 'ZANAHORIA', NULL, 'LIBRAS', TRUE)
ON CONFLICT (proveedor_id, orden) DO NOTHING;

/* ── Los pedidos ────────────────────────────────────────────────────────
 *
 * 348 documentos, 1774 líneas, del 2 de febrero al 21 de agosto de 2026.
 *
 * · `estado` = confirmado. Son pedidos que se hicieron, se imprimieron y se
 *   despacharon hace meses; nacer como borrador los pondría a la espera de
 *   una confirmación que ya ocurrió fuera del sistema.
 * · `creado_por` = NULL. Lo previsto en 05-pedidos.sql para este caso: se
 *   escribieron cuando no había cuentas a las que atribuirlos.
 * · `confirmado_en` = la fecha de elaboración a mediodía. No se sabe la hora
 *   real, y dejarlo NULL contradiría a `estado`.
 * · `tipo_documento` = FBE.04 para todos, que es la plantilla con la que se
 *   escribieron, aunque hoy tres de esos proveedores estén dados de alta como
 *   FBE.34. Es lo que manda el esquema: el pedido guarda el formato con el
 *   que se elaboró, no el que tiene el proveedor ahora.
 */

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-02', '', 'confirmado', '2026-02-02 12:00:00+00', NULL, '2026-02-02 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-FEB 2 OKSJME#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-02-02', '', 'confirmado', '2026-02-02 12:00:00+00', NULL, '2026-02-02 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-FEB 2 OKSJME#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-02', '', 'confirmado', '2026-02-02 12:00:00+00', NULL, '2026-02-02 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-FEB 2 OKSJME#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-03', '', 'confirmado', '2026-02-03 12:00:00+00', NULL, '2026-02-03 12:00:00+00', 'ENE_-_MARZO_COCA_COLA.xlsx::SALIDAS COCA COLA- FEB 3 OK (2#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 129, 1, NULL::TEXT, 'AGUA BRISA PET GAS 600 ML X 24', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 28), 2, NULL::TEXT, 'AGUA BRISA LIMA LIMON 600 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 3, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 132, 4, NULL::TEXT, 'COCACOLA PET SIN AZUCAR 400 ML X 12', NULL::TEXT, 'BANDEJA', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 134, 5, NULL::TEXT, 'FUZE TEA MANGO- MANZANILL X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 136, 6, NULL::TEXT, 'FUZE TEA DURAZNO X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 137, 7, NULL::TEXT, 'FUZE TEA LIMON X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 138, 8, NULL::TEXT, 'JUGO DEL VALLE 500 MANGO X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 139, 9, NULL::TEXT, 'JUGO DEL VALLE 500 MANGO FRESA X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 141, 10, NULL::TEXT, 'JUGO DEL VALLE 500 MORA X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 142, 11, NULL::TEXT, 'JUGO DEL VALLE TETRA X 24 MANGO', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 143, 12, NULL::TEXT, 'JUGO DEL VALLE TETRA X 24 MANGO FRESA', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 145, 13, NULL::TEXT, 'JUGO DEL VALLE TETRA X 24 PIÑA MANDARINA', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 146, 14, NULL::TEXT, 'KOLA ROMAN 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 147, 15, NULL::TEXT, 'POWER ADE x 500 ML AZUL X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 148, 16, NULL::TEXT, 'POWER ADE x 500 ML ROJO X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 149, 17, NULL::TEXT, 'SPRITE PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-02-03', '', 'confirmado', '2026-02-03 12:00:00+00', NULL, '2026-02-03 12:00:00+00', 'ENE_-_MARZO_COCA_COLA.xlsx::SALIDAS COCA COLA- FEB 3 OK (2#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 129, 2, NULL::TEXT, 'AGUA BRISA PET GAS 600 ML X 24', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 28), 3, NULL::TEXT, 'AGUA BRISA LIMA LIMON 600 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 4, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 133, 5, NULL::TEXT, 'CUATRO PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 134, 6, NULL::TEXT, 'FUZE TEA MANGO- MANZANILL X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 136, 7, NULL::TEXT, 'FUZE TEA DURAZNO X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 137, 8, NULL::TEXT, 'FUZE TEA LIMON X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 138, 9, NULL::TEXT, 'JUGO DEL VALLE 500 MANGO X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 141, 10, NULL::TEXT, 'JUGO DEL VALLE 500 MORA X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 147, 11, NULL::TEXT, 'POWER ADE x 500 ML AZUL X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-03', '', 'confirmado', '2026-02-03 12:00:00+00', NULL, '2026-02-03 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB  3 OK#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-02-03', '', 'confirmado', '2026-02-03 12:00:00+00', NULL, '2026-02-03 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB  3 OK#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-03', '', 'confirmado', '2026-02-03 12:00:00+00', NULL, '2026-02-03 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB  3 OK#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 3, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 4, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 5, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-04', '', 'confirmado', '2026-02-04 12:00:00+00', NULL, '2026-02-04 12:00:00+00', 'FAMA_FEBRERO.xlsx::SALIDAS FAMA- FEB 4 BE Y CT (2#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 211, 1, NULL::TEXT, 'BARRITA CHOCORRAMO', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 212, 2, NULL::TEXT, 'BROWNIE AREQUIPE X 6 UND X 65 GR', NULL::TEXT, 'UNIDAD', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 213, 3, NULL::TEXT, 'CHOCORRAMO TJDA X 65 GR', NULL::TEXT, 'UNIDAD', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 214, 4, NULL::TEXT, 'GALA TAJADA X 60 GR', NULL::TEXT, 'UNIDAD', 15::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 215, 5, NULL::TEXT, 'GANSITO X 6 X 37 GR', NULL::TEXT, 'UNIDAD', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 216, 6, NULL::TEXT, 'LECHERITA X 8 GALLETAS', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-04', '', 'confirmado', '2026-02-04 12:00:00+00', NULL, '2026-02-04 12:00:00+00', 'FAMA_FEBRERO.xlsx::SALIDAS FAMA- FEB 4 BE Y CT (2#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 211, 1, NULL::TEXT, 'BARRITA CHOCORRAMO', NULL::TEXT, 'UNIDAD', 15::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 212, 2, NULL::TEXT, 'BROWNIE AREQUIPE X 6 UND X 65 GR', NULL::TEXT, 'UNIDAD', 24::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 213, 3, NULL::TEXT, 'CHOCORRAMO TJDA X 65 GR', NULL::TEXT, 'UNIDAD', 15::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 214, 4, NULL::TEXT, 'GALA TAJADA X 60 GR', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 215, 5, NULL::TEXT, 'GANSITO X 6 X 37 GR', NULL::TEXT, 'UNIDAD', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 216, 6, NULL::TEXT, 'LECHERITA X 8 GALLETAS', NULL::TEXT, 'UNIDAD', 16::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-04', '', 'confirmado', '2026-02-04 12:00:00+00', NULL, '2026-02-04 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB  4 OK#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-02-04', '', 'confirmado', '2026-02-04 12:00:00+00', NULL, '2026-02-04 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB  4 OK#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 2, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-04', '', 'confirmado', '2026-02-04 12:00:00+00', NULL, '2026-02-04 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB  4 OK#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-05', '', 'confirmado', '2026-02-05 12:00:00+00', NULL, '2026-02-05 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB5 OK#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-02-05', '', 'confirmado', '2026-02-05 12:00:00+00', NULL, '2026-02-05 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB5 OK#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 2, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-05', '', 'confirmado', '2026-02-05 12:00:00+00', NULL, '2026-02-05 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB5 OK#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-06', '', 'confirmado', '2026-02-06 12:00:00+00', NULL, '2026-02-06 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB6 OK#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-02-06', '', 'confirmado', '2026-02-06 12:00:00+00', NULL, '2026-02-06 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB6 OK#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-06', '', 'confirmado', '2026-02-06 12:00:00+00', NULL, '2026-02-06 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB6 OK#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-09', '', 'confirmado', '2026-02-09 12:00:00+00', NULL, '2026-02-09 12:00:00+00', '_NEOFRUT_.xlsm::NEOFRUTFEB 9 CT Y BE#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 7), 4, NULL::TEXT, 'PULPA DE LIMON', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 5, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 8), 6, NULL::TEXT, 'PULPA DE DURAZNO', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 7, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-09', '', 'confirmado', '2026-02-09 12:00:00+00', NULL, '2026-02-09 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB9 )#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-02-09', '', 'confirmado', '2026-02-09 12:00:00+00', NULL, '2026-02-09 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB9 )#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 2, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-09', '', 'confirmado', '2026-02-09 12:00:00+00', NULL, '2026-02-09 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB9 )#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-10', '', 'confirmado', '2026-02-10 12:00:00+00', NULL, '2026-02-10 12:00:00+00', 'ENE_-_MARZO_COCA_COLA.xlsx::SALIDAS COCA COLA- FEB10OK SJM#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 129, 2, NULL::TEXT, 'AGUA BRISA PET GAS 600 ML X 24', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 26), 3, NULL::TEXT, 'AGUA GAS BRISA LIMON 600 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 134, 4, NULL::TEXT, 'FUZE TEA MANGO- MANZANILL X 400 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 135, 5, NULL::TEXT, 'FUZE TEA MANZANA - LIMONARIA X 400 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 136, 6, NULL::TEXT, 'FUZE TEA DURAZNO X 400 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 137, 7, NULL::TEXT, 'FUZE TEA LIMON X 400 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 138, 8, NULL::TEXT, 'JUGO DEL VALLE 500 MANGO X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 139, 9, NULL::TEXT, 'JUGO DEL VALLE 500 MANGO FRESA X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 141, 10, NULL::TEXT, 'JUGO DEL VALLE 500 MORA X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 149, 11, NULL::TEXT, 'SPRITE PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-10', '', 'confirmado', '2026-02-10 12:00:00+00', NULL, '2026-02-10 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB10#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-02-10', '', 'confirmado', '2026-02-10 12:00:00+00', NULL, '2026-02-10 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB10#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 2, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-10', '', 'confirmado', '2026-02-10 12:00:00+00', NULL, '2026-02-10 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB10#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-11', '', 'confirmado', '2026-02-11 12:00:00+00', NULL, '2026-02-11 12:00:00+00', 'FAMA_FEBRERO.xlsx::SALIDAS FAMA-FEB 11CT PEN#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 211, 1, NULL::TEXT, 'BARRITA CHOCORRAMO', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 212, 2, NULL::TEXT, 'BROWNIE AREQUIPE X 6 UND X 65 GR', NULL::TEXT, 'CAJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 213, 3, NULL::TEXT, 'CHOCORRAMO TJDA X 65 GR', NULL::TEXT, 'UNIDAD', 20::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 214, 4, NULL::TEXT, 'GALA TAJADA X 60 GR', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 215, 5, NULL::TEXT, 'GANSITO X 6 X 37 GR', NULL::TEXT, 'PAQUETE', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 216, 6, NULL::TEXT, 'LECHERITA X 8 GALLETAS', NULL::TEXT, 'PAQUETE', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 217, 7, NULL::TEXT, 'GALLETAS LIMONCITAS X 8', NULL::TEXT, 'PAQUETE', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-11', '', 'confirmado', '2026-02-11 12:00:00+00', NULL, '2026-02-11 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB11#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-02-11', '', 'confirmado', '2026-02-11 12:00:00+00', NULL, '2026-02-11 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB11#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 2, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-11', '', 'confirmado', '2026-02-11 12:00:00+00', NULL, '2026-02-11 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB11#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-12', '', 'confirmado', '2026-02-12 12:00:00+00', NULL, '2026-02-12 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB12#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-02-12', '', 'confirmado', '2026-02-12 12:00:00+00', NULL, '2026-02-12 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB12#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 2, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-12', '', 'confirmado', '2026-02-12 12:00:00+00', NULL, '2026-02-12 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB12#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-13', '', 'confirmado', '2026-02-13 12:00:00+00', NULL, '2026-02-13 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB13#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-02-13', '', 'confirmado', '2026-02-13 12:00:00+00', NULL, '2026-02-13 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB13#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 2, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-13', '', 'confirmado', '2026-02-13 12:00:00+00', NULL, '2026-02-13 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB13#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-16', '', 'confirmado', '2026-02-16 12:00:00+00', NULL, '2026-02-16 12:00:00+00', '_NEOFRUT_.xlsm::NEOFRUT FEB 16#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 1, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 7), 2, NULL::TEXT, 'PULPA DE LIMON', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 8), 3, NULL::TEXT, 'PULPA DE DURAZNO', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 4, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 5, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-16', '', 'confirmado', '2026-02-16 12:00:00+00', NULL, '2026-02-16 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB16 #0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-02-16', '', 'confirmado', '2026-02-16 12:00:00+00', NULL, '2026-02-16 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB16 #1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 2, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-16', '', 'confirmado', '2026-02-16 12:00:00+00', NULL, '2026-02-16 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB16 #2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('almacen-colombina', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-17', '', 'confirmado', '2026-02-17 12:00:00+00', NULL, '2026-02-17 12:00:00+00', 'COLOMBINA_FEBRERO.xlsx::SALIDAS FEBRERO17 #0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 202, 1, NULL::TEXT, 'BOM BOM BUM 24', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 204, 2, NULL::TEXT, 'CHOCOBREAK 50', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 205, 3, NULL::TEXT, 'CREMA MUU 12', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 207, 4, NULL::TEXT, 'MAX COCO WAFER 10', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 209, 5, NULL::TEXT, 'NUCITA 18', NULL::TEXT, 'CAJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-17', '', 'confirmado', '2026-02-17 12:00:00+00', NULL, '2026-02-17 12:00:00+00', 'ENE_-_MARZO_COCA_COLA.xlsx::SALIDAS COCA COLA- FEB17#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 26), 2, NULL::TEXT, 'AGUA GAS BRISA LIMON 600 ML X 6', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 3, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 132, 4, NULL::TEXT, 'COCACOLA PET SIN AZUCAR 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 134, 5, NULL::TEXT, 'FUZE TEA MANGO- MANZANILL X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 135, 6, NULL::TEXT, 'FUZE TEA MANZANA - LIMONARIA X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 136, 7, NULL::TEXT, 'FUZE TEA DURAZNO X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 137, 8, NULL::TEXT, 'FUZE TEA LIMON X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 141, 9, NULL::TEXT, 'JUGO DEL VALLE 500 MORA X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 146, 10, NULL::TEXT, 'KOLA ROMAN 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 149, 11, NULL::TEXT, 'SPRITE PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-17', '', 'confirmado', '2026-02-17 12:00:00+00', NULL, '2026-02-17 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB17#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-02-17', '', 'confirmado', '2026-02-17 12:00:00+00', NULL, '2026-02-17 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB17#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 2, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-17', '', 'confirmado', '2026-02-17 12:00:00+00', NULL, '2026-02-17 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB17#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-18', '', 'confirmado', '2026-02-18 12:00:00+00', NULL, '2026-02-18 12:00:00+00', 'FAMA_FEBRERO.xlsx::SALIDAS FAMA-FEB 18BE Y CT (2#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 211, 1, NULL::TEXT, 'BARRITA CHOCORRAMO', NULL::TEXT, 'UNIDAD', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 212, 2, NULL::TEXT, 'BROWNIE AREQUIPE X 6 UND X 65 GR', NULL::TEXT, 'CAJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 213, 3, NULL::TEXT, 'CHOCORRAMO TJDA X 65 GR', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 214, 4, NULL::TEXT, 'GALA TAJADA X 60 GR', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 215, 5, NULL::TEXT, 'GANSITO X 6 X 37 GR', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 216, 6, NULL::TEXT, 'LECHERITA X 8 GALLETAS', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-18', '', 'confirmado', '2026-02-18 12:00:00+00', NULL, '2026-02-18 12:00:00+00', 'FAMA_FEBRERO.xlsx::SALIDAS FAMA-FEB 18BE Y CT (2#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 211, 1, NULL::TEXT, 'BARRITA CHOCORRAMO', NULL::TEXT, 'UNIDAD', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 212, 2, NULL::TEXT, 'BROWNIE AREQUIPE X 6 UND X 65 GR', NULL::TEXT, 'CAJA', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 213, 3, NULL::TEXT, 'CHOCORRAMO TJDA X 65 GR', NULL::TEXT, 'UNIDAD', 25::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 214, 4, NULL::TEXT, 'GALA TAJADA X 60 GR', NULL::TEXT, 'UNIDAD', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 215, 5, NULL::TEXT, 'GANSITO X 6 X 37 GR', NULL::TEXT, 'PAQUETE', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 216, 6, NULL::TEXT, 'LECHERITA X 8 GALLETAS', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 217, 7, NULL::TEXT, 'GALLETAS LIMONCITAS X 8', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-02-18', '', 'confirmado', '2026-02-18 12:00:00+00', NULL, '2026-02-18 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB18#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-18', '', 'confirmado', '2026-02-18 12:00:00+00', NULL, '2026-02-18 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB18#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-18', '', 'confirmado', '2026-02-18 12:00:00+00', NULL, '2026-02-18 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB18#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('vicky', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-02-18', '', 'confirmado', '2026-02-18 12:00:00+00', NULL, '2026-02-18 12:00:00+00', 'FEBRERO__VICKY_.xlsx::VIKCYDF 3#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 77, 1, NULL::TEXT, 'CHICHARRON CARNUDO NATURAL 30 g bolsa x 6', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 79, 2, NULL::TEXT, 'MIXTO BBQ 40 g bolsa x 6', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 85, 3, NULL::TEXT, 'TROCILLO SABOR POLLO 25 g', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'vicky' AND orden = 12), 4, NULL::TEXT, 'PLATANO VERDE KAHOY 60 g', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-02-19', '', 'confirmado', '2026-02-19 12:00:00+00', NULL, '2026-02-19 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB19#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-19', '', 'confirmado', '2026-02-19 12:00:00+00', NULL, '2026-02-19 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB19#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-19', '', 'confirmado', '2026-02-19 12:00:00+00', NULL, '2026-02-19 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB19#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-02-20', '', 'confirmado', '2026-02-20 12:00:00+00', NULL, '2026-02-20 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB20#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 2, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-20', '', 'confirmado', '2026-02-20 12:00:00+00', NULL, '2026-02-20 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB20#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-20', '', 'confirmado', '2026-02-20 12:00:00+00', NULL, '2026-02-20 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB20#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('vicky', 'servicios-especiales', 'FBE.04', 'Alimentos y bebidas', '2026-02-20', '', 'confirmado', '2026-02-20 12:00:00+00', NULL, '2026-02-20 12:00:00+00', 'FEBRERO__VICKY_.xlsx::VIKCYDF#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 83, 1, NULL::TEXT, 'PAPA POLLO x7', NULL::TEXT, 'DISPLAY', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'vicky' AND orden = 13), 2, NULL::TEXT, 'PAPA CEBOLLITAS', NULL::TEXT, 'UNIDAD', 33::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-23', '', 'confirmado', '2026-02-23 12:00:00+00', NULL, '2026-02-23 12:00:00+00', '_NEOFRUT_.xlsm::NEOFRUT FEB 23#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 9), 4, NULL::TEXT, 'PULPA DE PIÑA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 5, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 6, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 7, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 7), 8, NULL::TEXT, 'PULPA DE LIMON', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 8), 9, NULL::TEXT, 'PULPA DURAZNO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-02-23', '', 'confirmado', '2026-02-23 12:00:00+00', NULL, '2026-02-23 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB23 DF#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 2, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-23', '', 'confirmado', '2026-02-23 12:00:00+00', NULL, '2026-02-23 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB23 DF#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-23', '', 'confirmado', '2026-02-23 12:00:00+00', NULL, '2026-02-23 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB23 DF#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('vicky', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-02-23', '', 'confirmado', '2026-02-23 12:00:00+00', NULL, '2026-02-23 12:00:00+00', 'FEBRERO__VICKY_.xlsx::VIKCYDF (CF)#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 83, 1, NULL::TEXT, 'PAPA POLLO x7', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 84, 2, NULL::TEXT, 'ROSQUILLAS DE QUESO x6', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 85, 3, NULL::TEXT, 'TROCILLOS x6', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 86, 4, NULL::TEXT, 'PLATANO SALADO x6', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 87, 5, NULL::TEXT, 'PLATANO AGRIDULCE', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('vicky', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-23', '', 'confirmado', '2026-02-23 12:00:00+00', NULL, '2026-02-23 12:00:00+00', 'FEBRERO__VICKY_.xlsx::VIKCYDF (CF)#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 83, 1, NULL::TEXT, 'PAPA POLLO x7', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 84, 2, NULL::TEXT, 'ROSQUILLAS DE QUESO x6', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 85, 3, NULL::TEXT, 'TROCILLOS x6', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 86, 4, NULL::TEXT, 'PLATANO SALADO x6', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 87, 5, NULL::TEXT, 'PLATANO AGRIDULCE', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('vicky', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-23', '', 'confirmado', '2026-02-23 12:00:00+00', NULL, '2026-02-23 12:00:00+00', 'FEBRERO__VICKY_.xlsx::VIKCYDF (CF)#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 77, 1, NULL::TEXT, 'CHICHARRON CARNUDO NAT x6', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 78, 2, NULL::TEXT, 'CHICHARRON CARNUDO PICANTE x6', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 81, 3, NULL::TEXT, 'PAPA MAYONESA x6', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 82, 4, NULL::TEXT, 'PAPA BBQx6', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 83, 5, NULL::TEXT, 'PAPA POLLO x7', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 84, 6, NULL::TEXT, 'ROSQUILLAS DE QUESO x6', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 85, 7, NULL::TEXT, 'TROCILLOS x6', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 86, 8, NULL::TEXT, 'PLATANO SALADO x6', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 87, 9, NULL::TEXT, 'PLATANO AGRIDULCE', NULL::TEXT, 'BOLSA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-24', '', 'confirmado', '2026-02-24 12:00:00+00', NULL, '2026-02-24 12:00:00+00', 'ENE_-_MARZO_COCA_COLA.xlsx::SALIDAS COCA COLA- FEB24#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 26), 2, NULL::TEXT, 'AGUA GAS BRISA LIMON 600 ML X6', NULL::TEXT, 'BANDEJA', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 3, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 133, 4, NULL::TEXT, 'CUATRO PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 136, 5, NULL::TEXT, 'FUZE TEA DURAZNO X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 137, 6, NULL::TEXT, 'FUZE TEA LIMON X 400 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 138, 7, NULL::TEXT, 'JUGO DEL VALLE 500 MANGO X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 141, 8, NULL::TEXT, 'JUGO DEL VALLE 500 MORA X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-24', '', 'confirmado', '2026-02-24 12:00:00+00', NULL, '2026-02-24 12:00:00+00', '_NEOFRUT_.xlsm::NEOFRUT FEB 24#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 7), 4, NULL::TEXT, 'PULPA DE LIMON', NULL::TEXT, 'LIBRAS', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 9), 5, NULL::TEXT, 'PULPA DE PIÑA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 6, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 8), 7, NULL::TEXT, 'PULPA DE DURAZNO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 8, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 9, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-02-24', '', 'confirmado', '2026-02-24 12:00:00+00', NULL, '2026-02-24 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB24#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 2, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-24', '', 'confirmado', '2026-02-24 12:00:00+00', NULL, '2026-02-24 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB24#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-24', '', 'confirmado', '2026-02-24 12:00:00+00', NULL, '2026-02-24 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB24#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-25', '', 'confirmado', '2026-02-25 12:00:00+00', NULL, '2026-02-25 12:00:00+00', 'FAMA_FEBRERO.xlsx::SALIDAS FAMA-FEB 25 BE Y CT  (2#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 211, 1, NULL::TEXT, 'BARRITA CHOCORRAMO', NULL::TEXT, 'UNIDAD', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 212, 2, NULL::TEXT, 'BROWNIE AREQUIPE X 6 UND X 65 GR', NULL::TEXT, 'CAJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 213, 3, NULL::TEXT, 'CHOCORRAMO TJDA X 65 GR', NULL::TEXT, 'UNIDAD', 15::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 214, 4, NULL::TEXT, 'GALA TAJADA X 60 GR', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 215, 5, NULL::TEXT, 'GANSITO X 6 X 37 GR', NULL::TEXT, 'PAQUETE', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 216, 6, NULL::TEXT, 'LECHERITA X 8 GALLETAS', NULL::TEXT, 'PAQUETE', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 217, 7, NULL::TEXT, 'GALLETAS LIMONCITAS X 8', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-02-25', '', 'confirmado', '2026-02-25 12:00:00+00', NULL, '2026-02-25 12:00:00+00', 'FAMA_FEBRERO.xlsx::SALIDAS FAMA-FEB 25 BE Y CT  (2#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 211, 1, NULL::TEXT, 'BARRITA CHOCORRAMO', NULL::TEXT, 'UNIDAD', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 212, 2, NULL::TEXT, 'BROWNIE AREQUIPE X 6 UND X 65 GR', NULL::TEXT, 'UNIDAD', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 213, 3, NULL::TEXT, 'CHOCORRAMO TJDA X 65 GR', NULL::TEXT, 'UNIDAD', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 214, 4, NULL::TEXT, 'GALA TAJADA X 60 GR', NULL::TEXT, 'UNIDAD', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 215, 5, NULL::TEXT, 'GANSITO X 6 X 37 GR', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 216, 6, NULL::TEXT, 'LECHERITA X 8 GALLETAS', NULL::TEXT, 'PAQUETE', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 217, 7, NULL::TEXT, 'GALLETAS LIMONCITAS X 8', NULL::TEXT, 'PAQUETE', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-02-25', '', 'confirmado', '2026-02-25 12:00:00+00', NULL, '2026-02-25 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB25#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-25', '', 'confirmado', '2026-02-25 12:00:00+00', NULL, '2026-02-25 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB25#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-25', '', 'confirmado', '2026-02-25 12:00:00+00', NULL, '2026-02-25 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB25#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-02-26', '', 'confirmado', '2026-02-26 12:00:00+00', NULL, '2026-02-26 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB26#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-26', '', 'confirmado', '2026-02-26 12:00:00+00', NULL, '2026-02-26 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB26#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-26', '', 'confirmado', '2026-02-26 12:00:00+00', NULL, '2026-02-26 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB26#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-02-27', '', 'confirmado', '2026-02-27 12:00:00+00', NULL, '2026-02-27 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB27#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-02-27', '', 'confirmado', '2026-02-27 12:00:00+00', NULL, '2026-02-27 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB27#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-02-27', '', 'confirmado', '2026-02-27 12:00:00+00', NULL, '2026-02-27 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- FEB27#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-03-02', '', 'confirmado', '2026-03-02 12:00:00+00', NULL, '2026-03-02 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 02#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-02', '', 'confirmado', '2026-03-02 12:00:00+00', NULL, '2026-03-02 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 02#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-02', '', 'confirmado', '2026-03-02 12:00:00+00', NULL, '2026-03-02 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 02#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-03', '', 'confirmado', '2026-03-03 12:00:00+00', NULL, '2026-03-03 12:00:00+00', '_NEOFRUT_.xlsm::NEOFRUT MARZO 3#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 7), 4, NULL::TEXT, 'PULPA DE LIMON', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 9), 5, NULL::TEXT, 'PULPA DE PIÑA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 6, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 8), 7, NULL::TEXT, 'PULPA DE DURAZNO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 8, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 9, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-03-03', '', 'confirmado', '2026-03-03 12:00:00+00', NULL, '2026-03-03 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 03#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-03', '', 'confirmado', '2026-03-03 12:00:00+00', NULL, '2026-03-03 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 03#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-03', '', 'confirmado', '2026-03-03 12:00:00+00', NULL, '2026-03-03 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 03#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 2, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 3, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 4, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 5, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-04', '', 'confirmado', '2026-03-04 12:00:00+00', NULL, '2026-03-04 12:00:00+00', 'FAMA_FEBRERO.xlsx::SALIDAS FAMA-MARZO  BE Y CT  (2#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 211, 1, NULL::TEXT, 'BARRITA CHOCORRAMO', NULL::TEXT, 'UNIDAD', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 212, 2, NULL::TEXT, 'BROWNIE AREQUIPE X 6 UND X 65 GR', NULL::TEXT, 'CAJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 213, 3, NULL::TEXT, 'CHOCORRAMO TJDA X 65 GR', NULL::TEXT, 'UNIDAD', 15::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 214, 4, NULL::TEXT, 'GALA TAJADA X 60 GR', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 215, 5, NULL::TEXT, 'GANSITO X 6 X 37 GR', NULL::TEXT, 'PAQUETE', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 216, 6, NULL::TEXT, 'LECHERITA X 8 GALLETAS', NULL::TEXT, 'PAQUETE', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 217, 7, NULL::TEXT, 'GALLETAS LIMONCITAS X 8', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-04', '', 'confirmado', '2026-03-04 12:00:00+00', NULL, '2026-03-04 12:00:00+00', 'FAMA_FEBRERO.xlsx::SALIDAS FAMA-MARZO  BE Y CT  (2#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 211, 1, NULL::TEXT, 'BARRITA CHOCORRAMO', NULL::TEXT, 'UNIDAD', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 212, 2, NULL::TEXT, 'BROWNIE AREQUIPE X 6 UND X 65 GR', NULL::TEXT, 'CAJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 213, 3, NULL::TEXT, 'CHOCORRAMO TJDA X 65 GR', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 214, 4, NULL::TEXT, 'GALA TAJADA X 60 GR', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 215, 5, NULL::TEXT, 'GANSITO X 6 X 37 GR', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 216, 6, NULL::TEXT, 'LECHERITA X 8 GALLETAS', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-03-04', '', 'confirmado', '2026-03-04 12:00:00+00', NULL, '2026-03-04 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 4#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-04', '', 'confirmado', '2026-03-04 12:00:00+00', NULL, '2026-03-04 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 4#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-04', '', 'confirmado', '2026-03-04 12:00:00+00', NULL, '2026-03-04 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 4#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-05', '', 'confirmado', '2026-03-05 12:00:00+00', NULL, '2026-03-05 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 5#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-03-05', '', 'confirmado', '2026-03-05 12:00:00+00', NULL, '2026-03-05 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 5#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-05', '', 'confirmado', '2026-03-05 12:00:00+00', NULL, '2026-03-05 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 5#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-06', '', 'confirmado', '2026-03-06 12:00:00+00', NULL, '2026-03-06 12:00:00+00', 'ENE_-_MARZO_COCA_COLA.xlsx::SALIDAS COCA COLA- MARZO 6#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 130, 2, NULL::TEXT, 'AGUA GAS BRISA LIMON 600 ML X 24', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 3, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 132, 4, NULL::TEXT, 'COCACOLA PET SIN AZUCAR 400 ML X 12', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 24), 5, NULL::TEXT, 'FUZE TEA NEGRO - LIMON X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 135, 6, NULL::TEXT, 'FUZE TEA MANZANA X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 142, 7, NULL::TEXT, 'JUGO DEL VALLE TETRA X 24 MANGO', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 146, 8, NULL::TEXT, 'KOLA ROMAN 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 147, 9, NULL::TEXT, 'POWER ADE x 500 ML AZUL X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 148, 10, NULL::TEXT, 'POWER ADE x 500 ML ROJO X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-03-06', '', 'confirmado', '2026-03-06 12:00:00+00', NULL, '2026-03-06 12:00:00+00', 'ENE_-_MARZO_COCA_COLA.xlsx::SALIDAS COCA COLA- MARZO 6#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 28), 2, NULL::TEXT, 'AGUA BRISA LIMA LIMON 600 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 3, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 24), 4, NULL::TEXT, 'FUZE TEA NEGRO - LIMON X 400 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 137, 5, NULL::TEXT, 'FUZE TEA LIMON X 400 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 138, 6, NULL::TEXT, 'JUGO DEL VALLE 500 MANGO X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 141, 7, NULL::TEXT, 'JUGO DEL VALLE 500 MORA X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 148, 8, NULL::TEXT, 'POWER ADE x 500 ML ROJO X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-06', '', 'confirmado', '2026-03-06 12:00:00+00', NULL, '2026-03-06 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO006#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-03-06', '', 'confirmado', '2026-03-06 12:00:00+00', NULL, '2026-03-06 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO006#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-06', '', 'confirmado', '2026-03-06 12:00:00+00', NULL, '2026-03-06 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO006#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-09', '', 'confirmado', '2026-03-09 12:00:00+00', NULL, '2026-03-09 12:00:00+00', '_NEOFRUT_.xlsm::NEOFRUT MARZO 9#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 7), 4, NULL::TEXT, 'PULPA DE LIMON', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 9), 5, NULL::TEXT, 'PULPA DE PIÑA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 6, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 8), 7, NULL::TEXT, 'PULPA DE DURAZNO', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 8, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 9, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-09', '', 'confirmado', '2026-03-09 12:00:00+00', NULL, '2026-03-09 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO9#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-03-09', '', 'confirmado', '2026-03-09 12:00:00+00', NULL, '2026-03-09 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO9#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-09', '', 'confirmado', '2026-03-09 12:00:00+00', NULL, '2026-03-09 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO9#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-10', '', 'confirmado', '2026-03-10 12:00:00+00', NULL, '2026-03-10 12:00:00+00', 'ENE_-_MARZO_COCA_COLA.xlsx::SALIDAS COCA COLA- MARZO 10#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 26), 2, NULL::TEXT, 'AGUA GAS BRISA LIMON 600 ML X 6', NULL::TEXT, 'BANDEJA', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 3, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 132, 4, NULL::TEXT, 'COCACOLA PET SIN AZUCAR 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 136, 5, NULL::TEXT, 'FUZE TEA DURAZNO X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 137, 6, NULL::TEXT, 'FUZE TEA LIMON X 400 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 138, 7, NULL::TEXT, 'JUGO DEL VALLE 500 MANGO X 6', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 139, 8, NULL::TEXT, 'JUGO DEL VALLE 500 MANGO FRESA X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 141, 9, NULL::TEXT, 'JUGO DEL VALLE 500 MORA X 6', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 147, 10, NULL::TEXT, 'POWER ADE x 500 ML AZUL X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 148, 11, NULL::TEXT, 'POWER ADE x 500 ML ROJO X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-10', '', 'confirmado', '2026-03-10 12:00:00+00', NULL, '2026-03-10 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO10#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-03-10', '', 'confirmado', '2026-03-10 12:00:00+00', NULL, '2026-03-10 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO10#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-10', '', 'confirmado', '2026-03-10 12:00:00+00', NULL, '2026-03-10 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO10#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-11', '', 'confirmado', '2026-03-11 12:00:00+00', NULL, '2026-03-11 12:00:00+00', 'ENE_-_MARZO_COCA_COLA.xlsx::SALIDAS COCA COLA- MARZO 11#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 26), 2, NULL::TEXT, 'AGUA GAS BRISA LIMON 600 ML X 6', NULL::TEXT, 'BANDEJA', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 3, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 132, 4, NULL::TEXT, 'COCACOLA PET SIN AZUCAR 400 ML X 12', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 136, 5, NULL::TEXT, 'FUZE TEA DURAZNO X 400 ML X 6', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 137, 6, NULL::TEXT, 'FUZE TEA LIMON X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 138, 7, NULL::TEXT, 'JUGO DEL VALLE 500 MANGO X 6', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 139, 8, NULL::TEXT, 'JUGO DEL VALLE 500 MANGO FRESA X 6', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 141, 9, NULL::TEXT, 'JUGO DEL VALLE 500 MORA X 6', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-11', '', 'confirmado', '2026-03-11 12:00:00+00', NULL, '2026-03-11 12:00:00+00', 'FAMA_FEBRERO.xlsx::SALIDAS FAMA-MARZO 11 BE YCT#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 211, 1, NULL::TEXT, 'BARRITA CHOCORRAMO', NULL::TEXT, 'UNIDAD', 15::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 213, 2, NULL::TEXT, 'CHOCORRAMO TJDA X 65 GR', NULL::TEXT, 'UNIDAD', 20::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 214, 3, NULL::TEXT, 'GALA TAJADA X 60 GR', NULL::TEXT, 'UNIDAD', 18::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 215, 4, NULL::TEXT, 'GANSITO X 6 X 37 GR', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 216, 5, NULL::TEXT, 'LECHERITA X 8 GALLETAS', NULL::TEXT, 'PAQUETE', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 217, 6, NULL::TEXT, 'GALLETAS LIMONCITAS X 8', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-11', '', 'confirmado', '2026-03-11 12:00:00+00', NULL, '2026-03-11 12:00:00+00', 'FAMA_FEBRERO.xlsx::SALIDAS FAMA-MARZO 11 BE YCT#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 211, 1, NULL::TEXT, 'BARRITA CHOCORRAMO', NULL::TEXT, 'UNIDAD', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 212, 2, NULL::TEXT, 'BROWNIE AREQUIPE X 6 UND X 65 GR', NULL::TEXT, 'CAJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 213, 3, NULL::TEXT, 'CHOCORRAMO TJDA X 65 GR', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 214, 4, NULL::TEXT, 'GALA TAJADA X 60 GR', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 215, 5, NULL::TEXT, 'GANSITO X 6 X 37 GR', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 216, 6, NULL::TEXT, 'LECHERITA X 8 GALLETAS', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-11', '', 'confirmado', '2026-03-11 12:00:00+00', NULL, '2026-03-11 12:00:00+00', '_NEOFRUT_.xlsm::NEOFRUT MARZO 11#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 7), 4, NULL::TEXT, 'PULPA DE LIMON', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 9), 5, NULL::TEXT, 'PULPA DE PIÑA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 6, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 8), 7, NULL::TEXT, 'PULPA DE DURAZNO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 8, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 9, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-11', '', 'confirmado', '2026-03-11 12:00:00+00', NULL, '2026-03-11 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO11#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-03-11', '', 'confirmado', '2026-03-11 12:00:00+00', NULL, '2026-03-11 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO11#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-11', '', 'confirmado', '2026-03-11 12:00:00+00', NULL, '2026-03-11 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO11#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-12', '', 'confirmado', '2026-03-12 12:00:00+00', NULL, '2026-03-12 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 12#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 2, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 3, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 4, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 5, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-03-12', '', 'confirmado', '2026-03-12 12:00:00+00', NULL, '2026-03-12 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 12#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-12', '', 'confirmado', '2026-03-12 12:00:00+00', NULL, '2026-03-12 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 12#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 7::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 23::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-13', '', 'confirmado', '2026-03-13 12:00:00+00', NULL, '2026-03-13 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 13#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-03-13', '', 'confirmado', '2026-03-13 12:00:00+00', NULL, '2026-03-13 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 13#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-13', '', 'confirmado', '2026-03-13 12:00:00+00', NULL, '2026-03-13 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 13#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 7::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-03-16', '', 'confirmado', '2026-03-16 12:00:00+00', NULL, '2026-03-16 12:00:00+00', '_NEOFRUT_.xlsm::NEOFRUT MARZO 16 (2)#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 7), 4, NULL::TEXT, 'PULPA DE LIMON', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 9), 5, NULL::TEXT, 'PULPA DE PIÑA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 6, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 8), 7, NULL::TEXT, 'PULPA DE DURAZNO', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 8, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 9, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-16', '', 'confirmado', '2026-03-16 12:00:00+00', NULL, '2026-03-16 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 16#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 2, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 3, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 4, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 5, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-03-16', '', 'confirmado', '2026-03-16 12:00:00+00', NULL, '2026-03-16 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 16#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-16', '', 'confirmado', '2026-03-16 12:00:00+00', NULL, '2026-03-16 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 16#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 7::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-17', '', 'confirmado', '2026-03-17 12:00:00+00', NULL, '2026-03-17 12:00:00+00', 'ENE_-_MARZO_COCA_COLA.xlsx::SALIDAS COCA COLA- MARZO 17#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 130, 2, NULL::TEXT, 'AGUA GAS BRISA LIMON 600 ML X 24', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 3, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 133, 4, NULL::TEXT, 'CUATRO PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 134, 5, NULL::TEXT, 'FUZE TEA MANGO- MANZANILL X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 147, 6, NULL::TEXT, 'POWER ADE x 500 ML AZUL X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 149, 7, NULL::TEXT, 'SPRITE PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-17', '', 'confirmado', '2026-03-17 12:00:00+00', NULL, '2026-03-17 12:00:00+00', 'ENE_-_MARZO_COCA_COLA.xlsx::SALIDAS COCA COLA- MARZO 17#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 2, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 132, 3, NULL::TEXT, 'COCACOLA PET SIN AZUCAR 400 ML X 12', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 133, 4, NULL::TEXT, 'CUATRO PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 149, 5, NULL::TEXT, 'SPRITE PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-17', '', 'confirmado', '2026-03-17 12:00:00+00', NULL, '2026-03-17 12:00:00+00', '_NEOFRUT_.xlsm::NEOFRUT MARZO 17#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 7), 4, NULL::TEXT, 'PULPA DE LIMON', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 9), 5, NULL::TEXT, 'PULPA DE PIÑA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 6, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 8), 7, NULL::TEXT, 'PULPA DE DURAZNO', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 8, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 9, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-17', '', 'confirmado', '2026-03-17 12:00:00+00', NULL, '2026-03-17 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 17#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 2, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 3, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 4, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 5, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-03-17', '', 'confirmado', '2026-03-17 12:00:00+00', NULL, '2026-03-17 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 17#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-17', '', 'confirmado', '2026-03-17 12:00:00+00', NULL, '2026-03-17 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 17#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 7::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 24::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-18', '', 'confirmado', '2026-03-18 12:00:00+00', NULL, '2026-03-18 12:00:00+00', 'FAMA_FEBRERO.xlsx::SALIDAS FAMA-MARZO 18 BE,CT,A3#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 211, 1, NULL::TEXT, 'BARRITA CHOCORRAMO', NULL::TEXT, 'UNIDAD', 15::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 213, 2, NULL::TEXT, 'CHOCORRAMO TJDA X 65 GR', NULL::TEXT, 'UNIDAD', 50::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 214, 3, NULL::TEXT, 'GALA TAJADA X 60 GR', NULL::TEXT, 'UNIDAD', 18::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 215, 4, NULL::TEXT, 'GANSITO X 6 X 37 GR', NULL::TEXT, 'PAQUETE', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 216, 5, NULL::TEXT, 'LECHERITA X 8 GALLETAS', NULL::TEXT, 'PAQUETE', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 217, 6, NULL::TEXT, 'GALLETAS LIMONCITAS X 8', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-18', '', 'confirmado', '2026-03-18 12:00:00+00', NULL, '2026-03-18 12:00:00+00', 'FAMA_FEBRERO.xlsx::SALIDAS FAMA-MARZO 18 BE,CT,A3#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 212, 1, NULL::TEXT, 'BROWNIE AREQUIPE X 6 UND X 65 GR', NULL::TEXT, 'CAJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 213, 2, NULL::TEXT, 'CHOCORRAMO TJDA X 65 GR', NULL::TEXT, 'UNIDAD', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 215, 3, NULL::TEXT, 'GANSITO X 6 X 37 GR', NULL::TEXT, 'PAQUETE', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-03-18', '', 'confirmado', '2026-03-18 12:00:00+00', NULL, '2026-03-18 12:00:00+00', 'FAMA_FEBRERO.xlsx::SALIDAS FAMA-MARZO 18 BE,CT,A3#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 211, 1, NULL::TEXT, 'BARRITA CHOCORRAMO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 212, 2, NULL::TEXT, 'BROWNIE AREQUIPE X 6 UND X 65 GR', NULL::TEXT, 'UNIDAD', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 213, 3, NULL::TEXT, 'CHOCORRAMO TJDA X 65 GR', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 214, 4, NULL::TEXT, 'GALA TAJADA X 60 GR', NULL::TEXT, 'UNIDAD', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 215, 5, NULL::TEXT, 'GANSITO X 6 X 37 GR', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-18', '', 'confirmado', '2026-03-18 12:00:00+00', NULL, '2026-03-18 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 18#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-03-18', '', 'confirmado', '2026-03-18 12:00:00+00', NULL, '2026-03-18 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 18#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-18', '', 'confirmado', '2026-03-18 12:00:00+00', NULL, '2026-03-18 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 18#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 7::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-19', '', 'confirmado', '2026-03-19 12:00:00+00', NULL, '2026-03-19 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 19#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 4, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 5, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-03-19', '', 'confirmado', '2026-03-19 12:00:00+00', NULL, '2026-03-19 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 19#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 2, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 3, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 4, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 5, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-19', '', 'confirmado', '2026-03-19 12:00:00+00', NULL, '2026-03-19 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 19#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 7::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-20', '', 'confirmado', '2026-03-20 12:00:00+00', NULL, '2026-03-20 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 20#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-03-20', '', 'confirmado', '2026-03-20 12:00:00+00', NULL, '2026-03-20 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 20#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-20', '', 'confirmado', '2026-03-20 12:00:00+00', NULL, '2026-03-20 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 20#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-24', '', 'confirmado', '2026-03-24 12:00:00+00', NULL, '2026-03-24 12:00:00+00', 'ENE_-_MARZO_COCA_COLA.xlsx::SALIDAS COCA COLA- MARZO 24#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 131, 1, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 132, 2, NULL::TEXT, 'COCACOLA PET SIN AZUCAR 400 ML X 12', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 135, 3, NULL::TEXT, 'FUZE TEA MANZANA - LIMONARIA X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 136, 4, NULL::TEXT, 'FUZE TEA DURAZNO X 400 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 137, 5, NULL::TEXT, 'FUZE TEA LIMON X 400 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 138, 6, NULL::TEXT, 'JUGO DEL VALLE 500 MANGO X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 141, 7, NULL::TEXT, 'JUGO DEL VALLE 500 MORA X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 147, 8, NULL::TEXT, 'POWER ADE x 500 ML AZUL X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 148, 9, NULL::TEXT, 'POWER ADE x 500 ML ROJO X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-24', '', 'confirmado', '2026-03-24 12:00:00+00', NULL, '2026-03-24 12:00:00+00', '_NEOFRUT_.xlsm::NEOFRUT MARZO 24#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 7), 4, NULL::TEXT, 'PULPA DE LIMON', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 9), 5, NULL::TEXT, 'PULPA DE PIÑA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 6, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 8), 7, NULL::TEXT, 'PULPA DE DURAZNO', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 8, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 9, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-24', '', 'confirmado', '2026-03-24 12:00:00+00', NULL, '2026-03-24 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 24#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 2, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 3, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 4, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 5, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-03-24', '', 'confirmado', '2026-03-24 12:00:00+00', NULL, '2026-03-24 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 24#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-24', '', 'confirmado', '2026-03-24 12:00:00+00', NULL, '2026-03-24 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 24#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 7::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-25', '', 'confirmado', '2026-03-25 12:00:00+00', NULL, '2026-03-25 12:00:00+00', 'ENE_-_MARZO_COCA_COLA.xlsx::SALIDAS COCA COLA- MARZO25#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 26), 2, NULL::TEXT, 'AGUA GAS BRISA LIMON 600 ML X 6', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 3, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 132, 4, NULL::TEXT, 'COCACOLA PET SIN AZUCAR 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 135, 5, NULL::TEXT, 'FUZE TEA MANZANA - LIMONARIA X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 136, 6, NULL::TEXT, 'FUZE TEA DURAZNO X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 137, 7, NULL::TEXT, 'FUZE TEA LIMON X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 139, 8, NULL::TEXT, 'JUGO DEL VALLE 500 MANGO FRESA X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 142, 9, NULL::TEXT, 'JUGO DEL VALLE TETRA X 24 MANGO', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-25', '', 'confirmado', '2026-03-25 12:00:00+00', NULL, '2026-03-25 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 25#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 2, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 3, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 4, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 5, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-03-25', '', 'confirmado', '2026-03-25 12:00:00+00', NULL, '2026-03-25 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 25#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-25', '', 'confirmado', '2026-03-25 12:00:00+00', NULL, '2026-03-25 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 25#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 3, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 11::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 4, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 5, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 11::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-26', '', 'confirmado', '2026-03-26 12:00:00+00', NULL, '2026-03-26 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 26#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 2, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 3, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 4, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 5, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-26', '', 'confirmado', '2026-03-26 12:00:00+00', NULL, '2026-03-26 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 26#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 3, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 11::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 4, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 5, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-03-27', '', 'confirmado', '2026-03-27 12:00:00+00', NULL, '2026-03-27 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 27#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-03-27', '', 'confirmado', '2026-03-27 12:00:00+00', NULL, '2026-03-27 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 27#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-03-27', '', 'confirmado', '2026-03-27 12:00:00+00', NULL, '2026-03-27 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- MARZO 27#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-04-06', '', 'confirmado', '2026-04-06 12:00:00+00', NULL, '2026-04-06 12:00:00+00', 'ENE_-_MARZO_COCA_COLA.xlsx::SALIDAS COCA COLA- ABRIL 06#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 129, 2, NULL::TEXT, 'AGUA BRISA PET GAS 600 ML X 24', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 3, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 132, 4, NULL::TEXT, 'COCACOLA PET SIN AZUCAR 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 133, 5, NULL::TEXT, 'CUATRO PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 134, 6, NULL::TEXT, 'FUZE TEA MANGO- MANZANILL X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 137, 7, NULL::TEXT, 'FUZE TEA LIMON X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 139, 8, NULL::TEXT, 'JUGO DEL VALLE 500 MANGO FRESA X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 141, 9, NULL::TEXT, 'JUGO DEL VALLE 500 MORA X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 142, 10, NULL::TEXT, 'JUGO DEL VALLE TETRA X 24 MANGO', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 145, 11, NULL::TEXT, 'JUGO DEL VALLE TETRA X 24 PIÑA MANDARINA', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 146, 12, NULL::TEXT, 'KOLA ROMAN 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-04-06', '', 'confirmado', '2026-04-06 12:00:00+00', NULL, '2026-04-06 12:00:00+00', 'ENE_-_MARZO_COCA_COLA.xlsx::SALIDAS COCA COLA- ABRIL 06#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 129, 2, NULL::TEXT, 'AGUA BRISA PET GAS 600 ML X 24', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 130, 3, NULL::TEXT, 'AGUA GAS BRISA LIMON 600 ML X 24', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 4, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 132, 5, NULL::TEXT, 'COCACOLA PET SIN AZUCAR 400 ML X 12', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 134, 6, NULL::TEXT, 'FUZE TEA MANGO- MANZANILL X 400 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 136, 7, NULL::TEXT, 'FUZE TEA DURAZNO X 400 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 137, 8, NULL::TEXT, 'FUZE TEA LIMON X 400 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 140, 9, NULL::TEXT, 'JUGO DEL VALLE 500 MANGO PIÑA MANDARINA X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 147, 10, NULL::TEXT, 'POWER ADE x 500 ML AZUL X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 148, 11, NULL::TEXT, 'POWER ADE x 500 ML ROJO X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-04-06', '', 'confirmado', '2026-04-06 12:00:00+00', NULL, '2026-04-06 12:00:00+00', '_NEOFRUT_.xlsm::NEOFRUT ABRIL 06#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 7), 4, NULL::TEXT, 'PULPA DE LIMON', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 9), 5, NULL::TEXT, 'PULPA DE PIÑA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 6, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 7, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 8, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-04-06', '', 'confirmado', '2026-04-06 12:00:00+00', NULL, '2026-04-06 12:00:00+00', '_NEOFRUT_.xlsm::NEOFRUT ABRIL 06#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 7), 4, NULL::TEXT, 'PULPA DE LIMON', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 9), 5, NULL::TEXT, 'PULPA DE PIÑA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 6, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 8), 7, NULL::TEXT, 'PULPA DE DURAZNO', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 8, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 9, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-04-06', '', 'confirmado', '2026-04-06 12:00:00+00', NULL, '2026-04-06 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 6#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-04-06', '', 'confirmado', '2026-04-06 12:00:00+00', NULL, '2026-04-06 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 6#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-04-06', '', 'confirmado', '2026-04-06 12:00:00+00', NULL, '2026-04-06 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 6#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 5, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-04-06', '', 'confirmado', '2026-04-06 12:00:00+00', NULL, '2026-04-06 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 6#3')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 15::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-04-07', '', 'confirmado', '2026-04-07 12:00:00+00', NULL, '2026-04-07 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 7#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 2, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 3, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 4, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 5, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-04-07', '', 'confirmado', '2026-04-07 12:00:00+00', NULL, '2026-04-07 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 7#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-04-07', '', 'confirmado', '2026-04-07 12:00:00+00', NULL, '2026-04-07 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 7#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 3, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 11::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 4, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 5, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-04-08', '', 'confirmado', '2026-04-08 12:00:00+00', NULL, '2026-04-08 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 8#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-04-08', '', 'confirmado', '2026-04-08 12:00:00+00', NULL, '2026-04-08 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 8#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-04-09', '', 'confirmado', '2026-04-09 12:00:00+00', NULL, '2026-04-09 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 9#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-04-09', '', 'confirmado', '2026-04-09 12:00:00+00', NULL, '2026-04-09 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 9#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-04-09', '', 'confirmado', '2026-04-09 12:00:00+00', NULL, '2026-04-09 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 9#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-04-10', '', 'confirmado', '2026-04-10 12:00:00+00', NULL, '2026-04-10 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 10#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-04-10', '', 'confirmado', '2026-04-10 12:00:00+00', NULL, '2026-04-10 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 10#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-04-10', '', 'confirmado', '2026-04-10 12:00:00+00', NULL, '2026-04-10 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 10#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-04-13', '', 'confirmado', '2026-04-13 12:00:00+00', NULL, '2026-04-13 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 13#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-04-13', '', 'confirmado', '2026-04-13 12:00:00+00', NULL, '2026-04-13 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 13#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-04-13', '', 'confirmado', '2026-04-13 12:00:00+00', NULL, '2026-04-13 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 13#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-04-14', '', 'confirmado', '2026-04-14 12:00:00+00', NULL, '2026-04-14 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 14#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-04-14', '', 'confirmado', '2026-04-14 12:00:00+00', NULL, '2026-04-14 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 14#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-04-14', '', 'confirmado', '2026-04-14 12:00:00+00', NULL, '2026-04-14 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 14#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-04-15', '', 'confirmado', '2026-04-15 12:00:00+00', NULL, '2026-04-15 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 15#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-04-15', '', 'confirmado', '2026-04-15 12:00:00+00', NULL, '2026-04-15 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 15#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-04-15', '', 'confirmado', '2026-04-15 12:00:00+00', NULL, '2026-04-15 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 15#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-04-16', '', 'confirmado', '2026-04-16 12:00:00+00', NULL, '2026-04-16 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 16#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-04-16', '', 'confirmado', '2026-04-16 12:00:00+00', NULL, '2026-04-16 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 16#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 2, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 3, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 4, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 5, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-04-16', '', 'confirmado', '2026-04-16 12:00:00+00', NULL, '2026-04-16 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 16#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 3, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 11::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 4, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 15::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 5, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-04-17', '', 'confirmado', '2026-04-17 12:00:00+00', NULL, '2026-04-17 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx:: RAPIFRITOS- ABRIL 17#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-04-17', '', 'confirmado', '2026-04-17 12:00:00+00', NULL, '2026-04-17 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx:: RAPIFRITOS- ABRIL 17#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-04-20', '', 'confirmado', '2026-04-20 12:00:00+00', NULL, '2026-04-20 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx:: SALIDAS RAPIFRITOS- ABRIL 20#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-04-20', '', 'confirmado', '2026-04-20 12:00:00+00', NULL, '2026-04-20 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx:: SALIDAS RAPIFRITOS- ABRIL 20#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 2, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 3, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 4, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 5, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-04-20', '', 'confirmado', '2026-04-20 12:00:00+00', NULL, '2026-04-20 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx:: SALIDAS RAPIFRITOS- ABRIL 20#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 3, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 11::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 4, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 15::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 5, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-04-21', '', 'confirmado', '2026-04-21 12:00:00+00', NULL, '2026-04-21 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::  SALIDAS RAPIFRITOS- ABRIL 21#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-04-21', '', 'confirmado', '2026-04-21 12:00:00+00', NULL, '2026-04-21 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::  SALIDAS RAPIFRITOS- ABRIL 21#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-04-21', '', 'confirmado', '2026-04-21 12:00:00+00', NULL, '2026-04-21 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::  SALIDAS RAPIFRITOS- ABRIL 21#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 3, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 11::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 4, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 5, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-04-22', '', 'confirmado', '2026-04-22 12:00:00+00', NULL, '2026-04-22 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 22#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-04-22', '', 'confirmado', '2026-04-22 12:00:00+00', NULL, '2026-04-22 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 22#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-04-22', '', 'confirmado', '2026-04-22 12:00:00+00', NULL, '2026-04-22 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 22#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 11::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-04-23', '', 'confirmado', '2026-04-23 12:00:00+00', NULL, '2026-04-23 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::  SALIDAS RAPIFRITOS- ABRIL 23#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-04-23', '', 'confirmado', '2026-04-23 12:00:00+00', NULL, '2026-04-23 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::  SALIDAS RAPIFRITOS- ABRIL 23#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-04-23', '', 'confirmado', '2026-04-23 12:00:00+00', NULL, '2026-04-23 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::  SALIDAS RAPIFRITOS- ABRIL 23#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-04-24', '', 'confirmado', '2026-04-24 12:00:00+00', NULL, '2026-04-24 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx:: SALIDAS RAPIFRITOS- ABRIL 24#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-04-24', '', 'confirmado', '2026-04-24 12:00:00+00', NULL, '2026-04-24 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx:: SALIDAS RAPIFRITOS- ABRIL 24#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-04-24', '', 'confirmado', '2026-04-24 12:00:00+00', NULL, '2026-04-24 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx:: SALIDAS RAPIFRITOS- ABRIL 24#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-04-27', '', 'confirmado', '2026-04-27 12:00:00+00', NULL, '2026-04-27 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 27#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-04-27', '', 'confirmado', '2026-04-27 12:00:00+00', NULL, '2026-04-27 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 27#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-04-27', '', 'confirmado', '2026-04-27 12:00:00+00', NULL, '2026-04-27 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 27#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-04-28', '', 'confirmado', '2026-04-28 12:00:00+00', NULL, '2026-04-28 12:00:00+00', 'FAMA_FEBRERO.xlsx::SALIDAS FAMA-ABRIL28 BE,CT,A3#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 211, 1, NULL::TEXT, 'BARRITA CHOCORRAMO', NULL::TEXT, 'UNIDAD', 15::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 212, 2, NULL::TEXT, 'BROWNIE AREQUIPE X 6 UND X 65 GR', NULL::TEXT, 'UNIDAD', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 213, 3, NULL::TEXT, 'CHOCORRAMO TJDA X 65 GR', NULL::TEXT, 'UNIDAD', 15::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 215, 4, NULL::TEXT, 'GANSITO X 6 X 37 GR', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 216, 5, NULL::TEXT, 'LECHERITA X 8 GALLETAS', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 217, 6, NULL::TEXT, 'GALLETAS LIMONCITAS X 8', NULL::TEXT, 'PAQUETE', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-04-28', '', 'confirmado', '2026-04-28 12:00:00+00', NULL, '2026-04-28 12:00:00+00', 'FAMA_FEBRERO.xlsx::SALIDAS FAMA-ABRIL28 BE,CT,A3#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 211, 1, NULL::TEXT, 'BARRITA CHOCORRAMO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 212, 2, NULL::TEXT, 'BROWNIE AREQUIPE X 6 UND X 65 GR', NULL::TEXT, 'UNIDAD', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 213, 3, NULL::TEXT, 'CHOCORRAMO TJDA X 65 GR', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 214, 4, NULL::TEXT, 'GALA TAJADA X 60 GR', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-04-28', '', 'confirmado', '2026-04-28 12:00:00+00', NULL, '2026-04-28 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 28#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-04-28', '', 'confirmado', '2026-04-28 12:00:00+00', NULL, '2026-04-28 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 28#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-04-28', '', 'confirmado', '2026-04-28 12:00:00+00', NULL, '2026-04-28 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 28#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-04-29', '', 'confirmado', '2026-04-29 12:00:00+00', NULL, '2026-04-29 12:00:00+00', 'ENE_-_MARZO_COCA_COLA.xlsx::SALIDAS COCA COLA- ABRIL 29#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 129, 2, NULL::TEXT, 'AGUA BRISA PET GAS 600 ML X 24', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 130, 3, NULL::TEXT, 'AGUA GAS BRISA LIMON 600 ML X 24', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 4, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 132, 5, NULL::TEXT, 'COCACOLA PET SIN AZUCAR 400 ML X 12', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 134, 6, NULL::TEXT, 'FUZE TEA MANGO- MANZANILL X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 135, 7, NULL::TEXT, 'FUZE TEA MANZANA - LIMONARIA X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 136, 8, NULL::TEXT, 'FUZE TEA DURAZNO X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 137, 9, NULL::TEXT, 'FUZE TEA LIMON X 400 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 138, 10, NULL::TEXT, 'JUGO DEL VALLE 500 MANGO X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 139, 11, NULL::TEXT, 'JUGO DEL VALLE 500 MANGO FRESA X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 141, 12, NULL::TEXT, 'JUGO DEL VALLE 500 MORA X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 147, 13, NULL::TEXT, 'POWER ADE x 500 ML AZUL X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 148, 14, NULL::TEXT, 'POWER ADE x 500 ML ROJO X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-04-29', '', 'confirmado', '2026-04-29 12:00:00+00', NULL, '2026-04-29 12:00:00+00', 'ENE_-_MARZO_COCA_COLA.xlsx::SALIDAS COCA COLA- ABRIL 29#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 129, 2, NULL::TEXT, 'AGUA BRISA PET GAS 600 ML X 24', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 130, 3, NULL::TEXT, 'AGUA GAS BRISA LIMON 600 ML X 24', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 4, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 132, 5, NULL::TEXT, 'COCACOLA PET SIN AZUCAR 400 ML X 12', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 136, 6, NULL::TEXT, 'FUZE TEA DURAZNO X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 137, 7, NULL::TEXT, 'FUZE TEA LIMON X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 138, 8, NULL::TEXT, 'JUGO DEL VALLE 500 MANGO X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 141, 9, NULL::TEXT, 'JUGO DEL VALLE 500 MORA X 6', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 147, 10, NULL::TEXT, 'POWER ADE x 500 ML AZUL X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 149, 11, NULL::TEXT, 'SPRITE PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-04-29', '', 'confirmado', '2026-04-29 12:00:00+00', NULL, '2026-04-29 12:00:00+00', 'ENE_-_MARZO_COCA_COLA.xlsx::SALIDAS COCA COLA- ABRIL 29#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 130, 1, NULL::TEXT, 'AGUA GAS BRISA LIMON 600 ML X 24', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 2, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 132, 3, NULL::TEXT, 'COCACOLA PET SIN AZUCAR 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 134, 4, NULL::TEXT, 'FUZE TEA MANGO- MANZANILL X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 137, 5, NULL::TEXT, 'FUZE TEA LIMON X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-04-29', '', 'confirmado', '2026-04-29 12:00:00+00', NULL, '2026-04-29 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 29#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-04-29', '', 'confirmado', '2026-04-29 12:00:00+00', NULL, '2026-04-29 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 29#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-04-29', '', 'confirmado', '2026-04-29 12:00:00+00', NULL, '2026-04-29 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 29#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-04-30', '', 'confirmado', '2026-04-30 12:00:00+00', NULL, '2026-04-30 12:00:00+00', 'ENE_-_MARZO_COCA_COLA.xlsx::SALIDAS COCA COLA- ABRIL 30#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 26), 2, NULL::TEXT, 'AGUA GAS BRISA LIMON 600 ML 6', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 3, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 136, 4, NULL::TEXT, 'FUZE TEA DURAZNO X 400 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 137, 5, NULL::TEXT, 'FUZE TEA LIMON X 400 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 138, 6, NULL::TEXT, 'JUGO DEL VALLE 500 MANGO X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 141, 7, NULL::TEXT, 'JUGO DEL VALLE 500 MORA X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 147, 8, NULL::TEXT, 'POWER ADE x 500 ML AZUL X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-04-30', '', 'confirmado', '2026-04-30 12:00:00+00', NULL, '2026-04-30 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 30#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-04-30', '', 'confirmado', '2026-04-30 12:00:00+00', NULL, '2026-04-30 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 30#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-04-30', '', 'confirmado', '2026-04-30 12:00:00+00', NULL, '2026-04-30 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- ABRIL 30#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-05-04', '', 'confirmado', '2026-05-04 12:00:00+00', NULL, '2026-05-04 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx:: SALIDAS RAPIFRITOS- mayo 4#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-04', '', 'confirmado', '2026-05-04 12:00:00+00', NULL, '2026-05-04 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx:: SALIDAS RAPIFRITOS- mayo 4#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-04', '', 'confirmado', '2026-05-04 12:00:00+00', NULL, '2026-05-04 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx:: SALIDAS RAPIFRITOS- mayo 4#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-05', '', 'confirmado', '2026-05-05 12:00:00+00', NULL, '2026-05-05 12:00:00+00', '_NEOFRUT_.xlsm::NEOFRUT MAYO 5#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 7), 4, NULL::TEXT, 'PULPA DE LIMON', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 9), 5, NULL::TEXT, 'PULPA DE PIÑA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 6, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 8), 7, NULL::TEXT, 'PULPA DE DURAZNO', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 8, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 9, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-05-05', '', 'confirmado', '2026-05-05 12:00:00+00', NULL, '2026-05-05 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::  SALIDAS RAPIFRITOS- mayo 5#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-05', '', 'confirmado', '2026-05-05 12:00:00+00', NULL, '2026-05-05 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::  SALIDAS RAPIFRITOS- mayo 5#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-05', '', 'confirmado', '2026-05-05 12:00:00+00', NULL, '2026-05-05 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::  SALIDAS RAPIFRITOS- mayo 5#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 11::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-06', '', 'confirmado', '2026-05-06 12:00:00+00', NULL, '2026-05-06 12:00:00+00', 'FAMA_FEBRERO.xlsx::SALIDAS FAMA-6 MAYO #0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 211, 1, NULL::TEXT, 'BARRITA CHOCORRAMO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 212, 2, NULL::TEXT, 'BROWNIE AREQUIPE X 6 UND X 65 GR', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 213, 3, NULL::TEXT, 'CHOCORRAMO TJDA X 65 GR', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 214, 4, NULL::TEXT, 'GALA TAJADA X 60 GR', NULL::TEXT, 'UNIDAD', 9::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 216, 5, NULL::TEXT, 'LECHERITA X 8 GALLETAS', NULL::TEXT, 'PAQUETES', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 215, 6, NULL::TEXT, 'GANSITO X 6 X 37 GR', NULL::TEXT, 'PAQUETE', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 217, 7, NULL::TEXT, 'LIMONCITAS X8 GALLETAS', NULL::TEXT, 'PAQUETES', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-06', '', 'confirmado', '2026-05-06 12:00:00+00', NULL, '2026-05-06 12:00:00+00', 'FAMA_FEBRERO.xlsx::SALIDAS FAMA-6 MAYO #1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 211, 1, NULL::TEXT, 'BARRITA CHOCORRAMO', NULL::TEXT, 'UNIDAD', 15::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 212, 2, NULL::TEXT, 'BROWNIE AREQUIPE X 6 UND X 65 GR', NULL::TEXT, 'UNIDAD', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 213, 3, NULL::TEXT, 'CHOCORRAMO TJDA X 65 GR', NULL::TEXT, 'UNIDAD', 15::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 215, 4, NULL::TEXT, 'GANSITO X 6 X 37 GR', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 216, 5, NULL::TEXT, 'LECHERITA X 8 GALLETAS', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 217, 6, NULL::TEXT, 'LIMONCITAS X8 GALLETAS', NULL::TEXT, 'PAQUETES', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-06', '', 'confirmado', '2026-05-06 12:00:00+00', NULL, '2026-05-06 12:00:00+00', '_NEOFRUT_.xlsm::NEOFRUT MAYO 6#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 7), 4, NULL::TEXT, 'PULPA DE LIMON', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 9), 5, NULL::TEXT, 'PULPA DE PIÑA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 6, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 7, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 8, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-05-06', '', 'confirmado', '2026-05-06 12:00:00+00', NULL, '2026-05-06 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 6#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-06', '', 'confirmado', '2026-05-06 12:00:00+00', NULL, '2026-05-06 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 6#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 17::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-07', '', 'confirmado', '2026-05-07 12:00:00+00', NULL, '2026-05-07 12:00:00+00', '_NEOFRUT_.xlsm::NEOFRUT MAYO 7 11 (2)#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 7), 4, NULL::TEXT, 'PULPA DE LIMON', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 9), 5, NULL::TEXT, 'PULPA DE PIÑA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 6, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 8), 7, NULL::TEXT, 'PULPA DE DURAZNO', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 8, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 9, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-07', '', 'confirmado', '2026-05-07 12:00:00+00', NULL, '2026-05-07 12:00:00+00', '_NEOFRUT_.xlsm::NEOFRUT MAYO 7 11 (2)#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 7), 4, NULL::TEXT, 'PULPA DE LIMON', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 9), 5, NULL::TEXT, 'PULPA DE PIÑA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 6, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 7, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 8, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-07', '', 'confirmado', '2026-05-07 12:00:00+00', NULL, '2026-05-07 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx:: SALIDAS RAPIFRITOS-MAYO 7#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-07', '', 'confirmado', '2026-05-07 12:00:00+00', NULL, '2026-05-07 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx:: SALIDAS RAPIFRITOS-MAYO 7#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 2, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 3, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 14::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 4, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-05-08', '', 'confirmado', '2026-05-08 12:00:00+00', NULL, '2026-05-08 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx:: SALIDAS RAPIFRITOS-MAYO 8#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-08', '', 'confirmado', '2026-05-08 12:00:00+00', NULL, '2026-05-08 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx:: SALIDAS RAPIFRITOS-MAYO 8#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-08', '', 'confirmado', '2026-05-08 12:00:00+00', NULL, '2026-05-08 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx:: SALIDAS RAPIFRITOS-MAYO 8#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-05-11', '', 'confirmado', '2026-05-11 12:00:00+00', NULL, '2026-05-11 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 11 #0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-11', '', 'confirmado', '2026-05-11 12:00:00+00', NULL, '2026-05-11 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 11 #1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-11', '', 'confirmado', '2026-05-11 12:00:00+00', NULL, '2026-05-11 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 11 #2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 11::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-05-12', '', 'confirmado', '2026-05-12 12:00:00+00', NULL, '2026-05-12 12:00:00+00', 'ENE_-_MARZO_COCA_COLA.xlsx::SALIDAS COCA COLA- MAYO 12#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 26), 2, NULL::TEXT, 'AGUA GAS BRISA LIMON 600 ML 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 3, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 25), 4, NULL::TEXT, 'COCACOLA ZERO PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 134, 5, NULL::TEXT, 'FUZE TEA MANGO X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 24), 6, NULL::TEXT, 'FUZE TEA NEGRO LIMON X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-12', '', 'confirmado', '2026-05-12 12:00:00+00', NULL, '2026-05-12 12:00:00+00', 'ENE_-_MARZO_COCA_COLA.xlsx::SALIDAS COCA COLA- MAYO 12#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 26), 2, NULL::TEXT, 'AGUA GAS BRISA LIMON 600 ML 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 27), 3, NULL::TEXT, 'AGUA GAS BRISA 600 ML 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 4, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 25), 5, NULL::TEXT, 'COCACOLA ZERO 400 ML X 12', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 136, 6, NULL::TEXT, 'FUZE TEA DURAZNO X 400 ML X 6', NULL::TEXT, 'BANDEJA', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 135, 7, NULL::TEXT, 'FUZE TEA MANZANA X 400 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 147, 8, NULL::TEXT, 'POWER ADE x 500 ML AZUL X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 148, 9, NULL::TEXT, 'POWER ADE x 500 ML ROJO X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 133, 10, NULL::TEXT, 'GASEOSA CUATRO PET 400ML', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 146, 11, NULL::TEXT, 'GASEOSA KOLA ROMAN PET 400ML', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 141, 12, NULL::TEXT, 'JUGO DEL VALLE 500 MORA X 6', NULL::TEXT, 'BANDEJA', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-12', '', 'confirmado', '2026-05-12 12:00:00+00', NULL, '2026-05-12 12:00:00+00', 'ENE_-_MARZO_COCA_COLA.xlsx::SALIDAS COCA COLA- MAYO 12#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 27), 2, NULL::TEXT, 'AGUA GAS BRISA 600 ML 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 3, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 25), 4, NULL::TEXT, 'COCACOLA ZERO 400 ML X 12', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 136, 5, NULL::TEXT, 'FUZE TEA DURAZNO X 400 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 135, 6, NULL::TEXT, 'FUZE TEA MANZANA X 400 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 24), 7, NULL::TEXT, 'FUZE TEA NEGRO LIMON X 400 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 134, 8, NULL::TEXT, 'FUZE TEA MANGO X 400 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 147, 9, NULL::TEXT, 'POWER ADE x 500 ML AZUL X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 148, 10, NULL::TEXT, 'POWER ADE x 500 ML ROJO X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 146, 11, NULL::TEXT, 'GASEOSA KOLA ROMAN PET 400ML', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 141, 12, NULL::TEXT, 'JUGO DEL VALLE 500 MORA X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 138, 13, NULL::TEXT, 'JUGO DEL VALLE 500 MANGO X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-05-12', '', 'confirmado', '2026-05-12 12:00:00+00', NULL, '2026-05-12 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 12#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-12', '', 'confirmado', '2026-05-12 12:00:00+00', NULL, '2026-05-12 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 12#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-12', '', 'confirmado', '2026-05-12 12:00:00+00', NULL, '2026-05-12 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 12#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-13', '', 'confirmado', '2026-05-13 12:00:00+00', NULL, '2026-05-13 12:00:00+00', 'FAMA_FEBRERO.xlsx::SALIDAS FAMA-13 MAYO#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 211, 1, NULL::TEXT, 'BARRITA CHOCORRAMO', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 212, 2, NULL::TEXT, 'BROWNIE AREQUIPE X 6 UND X 65 GR', NULL::TEXT, 'CAJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 213, 3, NULL::TEXT, 'CHOCORRAMO TJDA X 65 GR', NULL::TEXT, 'UNIDAD', 15::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 214, 4, NULL::TEXT, 'GALA TAJADA X 60 GR', NULL::TEXT, 'UNIDAD', 20::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 215, 5, NULL::TEXT, 'GANSITO X 6 X 37 GR', NULL::TEXT, 'PAQUETE', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 216, 6, NULL::TEXT, 'LECHERITA X 8 GALLETAS', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 217, 7, NULL::TEXT, 'GALLETAS LIMONCITAS X 8', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-13', '', 'confirmado', '2026-05-13 12:00:00+00', NULL, '2026-05-13 12:00:00+00', 'FAMA_FEBRERO.xlsx::SALIDAS FAMA-13 MAYO#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 211, 1, NULL::TEXT, 'BARRITA CHOCORRAMO', NULL::TEXT, 'UNIDAD', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 216, 2, NULL::TEXT, 'LECHERITA X 8 GALLETAS', NULL::TEXT, 'PAQUETES', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 215, 3, NULL::TEXT, 'GANSITO X 6 X 37 GR', NULL::TEXT, 'PAQUETE', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-13', '', 'confirmado', '2026-05-13 12:00:00+00', NULL, '2026-05-13 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 13#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-13', '', 'confirmado', '2026-05-13 12:00:00+00', NULL, '2026-05-13 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 13#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-13', '', 'confirmado', '2026-05-13 12:00:00+00', NULL, '2026-05-13 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 13#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-14', '', 'confirmado', '2026-05-14 12:00:00+00', NULL, '2026-05-14 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 14#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-14', '', 'confirmado', '2026-05-14 12:00:00+00', NULL, '2026-05-14 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 14#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-14', '', 'confirmado', '2026-05-14 12:00:00+00', NULL, '2026-05-14 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 14#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-15', '', 'confirmado', '2026-05-15 12:00:00+00', NULL, '2026-05-15 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 15#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 11::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-15', '', 'confirmado', '2026-05-15 12:00:00+00', NULL, '2026-05-15 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 15#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-15', '', 'confirmado', '2026-05-15 12:00:00+00', NULL, '2026-05-15 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 15#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-19', '', 'confirmado', '2026-05-19 12:00:00+00', NULL, '2026-05-19 12:00:00+00', 'ENE_-_MARZO_COCA_COLA.xlsx::SALIDAS COCA COLA MAYO 19#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 27), 2, NULL::TEXT, 'AGUA GAS BRISA 600 ML 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 29), 3, NULL::TEXT, 'AGUA BRISA LIMÓN 600 ML 6', NULL::TEXT, 'BANDEJA', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 4, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 25), 5, NULL::TEXT, 'COCACOLA ZERO 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 136, 6, NULL::TEXT, 'FUZE TEA DURAZNO X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 135, 7, NULL::TEXT, 'FUZE TEA MANZANA X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 24), 8, NULL::TEXT, 'FUZE TEA NEGRO LIMON X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 134, 9, NULL::TEXT, 'FUZE TEA MANGO X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 147, 10, NULL::TEXT, 'POWER ADE x 500 ML AZUL X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 148, 11, NULL::TEXT, 'POWER ADE x 500 ML ROJO X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 149, 12, NULL::TEXT, 'GASEOSA SPRITE PET 400ML', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 141, 13, NULL::TEXT, 'JUGO DEL VALLE 500 MORA X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 138, 14, NULL::TEXT, 'JUGO DEL VALLE 500 MANGO X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 139, 15, NULL::TEXT, 'JUGO DEL VALLE 500 MANGO FRESA X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 30), 16, NULL::TEXT, 'JUGO DEL VALLE 188 MANGO FRESA X24', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-19', '', 'confirmado', '2026-05-19 12:00:00+00', NULL, '2026-05-19 12:00:00+00', '_NEOFRUT_.xlsm::NEOFRUT MAYO 19#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 9), 4, NULL::TEXT, 'PULPA DE PIÑA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 5, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 8), 6, NULL::TEXT, 'PULPA DE DURAZNO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 7, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 8, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-19', '', 'confirmado', '2026-05-19 12:00:00+00', NULL, '2026-05-19 12:00:00+00', '_NEOFRUT_.xlsm::NEOFRUT MAYO 19#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 7), 4, NULL::TEXT, 'PULPA DE LIMON', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 9), 5, NULL::TEXT, 'PULPA DE PIÑA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 6, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 8), 7, NULL::TEXT, 'PULPA DE DURAZNO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 8, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 9, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 16::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-05-19', '', 'confirmado', '2026-05-19 12:00:00+00', NULL, '2026-05-19 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 19#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-19', '', 'confirmado', '2026-05-19 12:00:00+00', NULL, '2026-05-19 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 19#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-19', '', 'confirmado', '2026-05-19 12:00:00+00', NULL, '2026-05-19 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 19#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 11::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-20', '', 'confirmado', '2026-05-20 12:00:00+00', NULL, '2026-05-20 12:00:00+00', 'FAMA_FEBRERO.xlsx::SALIDAS FAMA 20 MAYO#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 212, 1, NULL::TEXT, 'BROWNIE AREQUIPE X 6 UND X 65 GR', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 213, 2, NULL::TEXT, 'CHOCORRAMO TJDA X 65 GR', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 214, 3, NULL::TEXT, 'GALA TAJADA X 60 GR', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 216, 4, NULL::TEXT, 'LECHERITA X 8 GALLETAS', NULL::TEXT, 'PAQUETES', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 217, 5, NULL::TEXT, 'LIMONCITAS X8 GALLETAS', NULL::TEXT, 'PAQUETES', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-20', '', 'confirmado', '2026-05-20 12:00:00+00', NULL, '2026-05-20 12:00:00+00', 'FAMA_FEBRERO.xlsx::SALIDAS FAMA 20 MAYO#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 211, 1, NULL::TEXT, 'BARRITA CHOCORRAMO', NULL::TEXT, 'UNIDAD', 20::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 212, 2, NULL::TEXT, 'BROWNIE AREQUIPE X 6 UND X 65 GR', NULL::TEXT, 'UNIDAD', 13::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 213, 3, NULL::TEXT, 'CHOCORRAMO TJDA X 65 GR', NULL::TEXT, 'UNIDAD', 20::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 214, 4, NULL::TEXT, 'GALA X 60 GR', NULL::TEXT, 'PAQUETE', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 215, 5, NULL::TEXT, 'GANSITO X 6 X 37 GR', NULL::TEXT, 'PAQUETE', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 216, 6, NULL::TEXT, 'LECHERITA X 8 GALLETAS', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 217, 7, NULL::TEXT, 'LIMONCITAS X8 GALLETAS', NULL::TEXT, 'PAQUETES', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-05-20', '', 'confirmado', '2026-05-20 12:00:00+00', NULL, '2026-05-20 12:00:00+00', 'FAMA_FEBRERO.xlsx::SALIDAS FAMA 20 MAYO#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 211, 1, NULL::TEXT, 'BARRITA CHOCORRAMO', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 212, 2, NULL::TEXT, 'BROWNIE AREQUIPE X 6 UND X 65 GR', NULL::TEXT, 'UNIDAD', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 213, 3, NULL::TEXT, 'CHOCORRAMO TJDA X 65 GR', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 214, 4, NULL::TEXT, 'GALA TAJADA X 60 GR', NULL::TEXT, 'UNIDAD', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 215, 5, NULL::TEXT, 'GANSITO X 6 X 37 GR', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 216, 6, NULL::TEXT, 'LECHERITA X 8 GALLETAS', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-05-20', '', 'confirmado', '2026-05-20 12:00:00+00', NULL, '2026-05-20 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 20#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-20', '', 'confirmado', '2026-05-20 12:00:00+00', NULL, '2026-05-20 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 20#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-20', '', 'confirmado', '2026-05-20 12:00:00+00', NULL, '2026-05-20 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 20#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 11::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-05-21', '', 'confirmado', '2026-05-21 12:00:00+00', NULL, '2026-05-21 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 21#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-21', '', 'confirmado', '2026-05-21 12:00:00+00', NULL, '2026-05-21 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 21#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-21', '', 'confirmado', '2026-05-21 12:00:00+00', NULL, '2026-05-21 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 21#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 11::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-22', '', 'confirmado', '2026-05-22 12:00:00+00', NULL, '2026-05-22 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 22#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-22', '', 'confirmado', '2026-05-22 12:00:00+00', NULL, '2026-05-22 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 22#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 11::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-25', '', 'confirmado', '2026-05-25 12:00:00+00', NULL, '2026-05-25 12:00:00+00', '_NEOFRUT_.xlsm::NEOFRUT MAYO 25#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 9), 4, NULL::TEXT, 'PULPA DE PIÑA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 5, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 8), 6, NULL::TEXT, 'PULPA DE DURAZNO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 7, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 8, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-25', '', 'confirmado', '2026-05-25 12:00:00+00', NULL, '2026-05-25 12:00:00+00', '_NEOFRUT_.xlsm::NEOFRUT MAYO 25#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 7), 4, NULL::TEXT, 'PULPA DE LIMON', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 9), 5, NULL::TEXT, 'PULPA DE PIÑA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 6, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 8), 7, NULL::TEXT, 'PULPA DE DURAZNO', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 8, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 9, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-05-25', '', 'confirmado', '2026-05-25 12:00:00+00', NULL, '2026-05-25 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 25#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-25', '', 'confirmado', '2026-05-25 12:00:00+00', NULL, '2026-05-25 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 25#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-25', '', 'confirmado', '2026-05-25 12:00:00+00', NULL, '2026-05-25 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 25#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 11::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-26', '', 'confirmado', '2026-05-26 12:00:00+00', NULL, '2026-05-26 12:00:00+00', 'ENE_-_MARZO_COCA_COLA.xlsx::SALIDA COCA COLA MAYO 26#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 2, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-05-26', '', 'confirmado', '2026-05-26 12:00:00+00', NULL, '2026-05-26 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 26#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-26', '', 'confirmado', '2026-05-26 12:00:00+00', NULL, '2026-05-26 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 26#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-26', '', 'confirmado', '2026-05-26 12:00:00+00', NULL, '2026-05-26 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 26#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 11::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-27', '', 'confirmado', '2026-05-27 12:00:00+00', NULL, '2026-05-27 12:00:00+00', 'FAMA_FEBRERO.xlsx::SALIDAS FAMA 27 MAYO#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 211, 1, NULL::TEXT, 'BARRITA CHOCORRAMO', NULL::TEXT, 'UNIDAD', 10::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 212, 2, NULL::TEXT, 'BROWNIE AREQUIPE X 6 UND X 65 GR', NULL::TEXT, 'UNIDAD', 15::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 213, 3, NULL::TEXT, 'CHOCORRAMO TJDA X 65 GR', NULL::TEXT, 'UNIDAD', 15::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 214, 4, NULL::TEXT, 'GALA X 60 GR', NULL::TEXT, 'PAQUETE', 20::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 215, 5, NULL::TEXT, 'GANSITO X 6 X 37 GR', NULL::TEXT, 'PAQUETE', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 216, 6, NULL::TEXT, 'LECHERITA X 8 GALLETAS', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 217, 7, NULL::TEXT, 'LIMONCITAS X8 GALLETAS', NULL::TEXT, 'PAQUETES', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-05-27', '', 'confirmado', '2026-05-27 12:00:00+00', NULL, '2026-05-27 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 27#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-27', '', 'confirmado', '2026-05-27 12:00:00+00', NULL, '2026-05-27 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 27#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-27', '', 'confirmado', '2026-05-27 12:00:00+00', NULL, '2026-05-27 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 27#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-05-28', '', 'confirmado', '2026-05-28 12:00:00+00', NULL, '2026-05-28 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 28#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-28', '', 'confirmado', '2026-05-28 12:00:00+00', NULL, '2026-05-28 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 28#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-28', '', 'confirmado', '2026-05-28 12:00:00+00', NULL, '2026-05-28 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 28#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-05-29', '', 'confirmado', '2026-05-29 12:00:00+00', NULL, '2026-05-29 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 29#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-05-29', '', 'confirmado', '2026-05-29 12:00:00+00', NULL, '2026-05-29 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 29#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 1, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-05-29', '', 'confirmado', '2026-05-29 12:00:00+00', NULL, '2026-05-29 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS-MAYO 29#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-06-01', '', 'confirmado', '2026-06-01 12:00:00+00', NULL, '2026-06-01 12:00:00+00', '_NEOFRUT_.xlsm::NEOFRUT JUNIO 1#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 2, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 3, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-06-01', '', 'confirmado', '2026-06-01 12:00:00+00', NULL, '2026-06-01 12:00:00+00', '_NEOFRUT_.xlsm::NEOFRUT JUNIO 1#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 7), 4, NULL::TEXT, 'PULPA DE LIMON', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 5, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 8), 6, NULL::TEXT, 'PULPA DE DURAZNO', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 7, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 8, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-06-01', '', 'confirmado', '2026-06-01 12:00:00+00', NULL, '2026-06-01 12:00:00+00', '_NEOFRUT_.xlsm::NEOFRUT JUNIO 1#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 7), 4, NULL::TEXT, 'PULPA DE LIMON', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 9), 5, NULL::TEXT, 'PULPA DE PIÑA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 6, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 8), 7, NULL::TEXT, 'PULPA DE DURAZNO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 8, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 9, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-06-01', '', 'confirmado', '2026-06-01 12:00:00+00', NULL, '2026-06-01 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- JUNIO 1#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-06-01', '', 'confirmado', '2026-06-01 12:00:00+00', NULL, '2026-06-01 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_14MAYO.xlsx::SALIDAS RAPIFRITOS- JUNIO 1#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-08-06', '', 'confirmado', '2026-08-06 12:00:00+00', NULL, '2026-08-06 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 6#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-08-06', '', 'confirmado', '2026-08-06 12:00:00+00', NULL, '2026-08-06 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 6#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-08-06', '', 'confirmado', '2026-08-06 12:00:00+00', NULL, '2026-08-06 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 6#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-08-09', '', 'confirmado', '2026-08-09 12:00:00+00', NULL, '2026-08-09 12:00:00+00', '_NEOFRUT_.xlsm::NEOFRUTFEB 9 CT Y BE#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 9), 4, NULL::TEXT, 'PULPA DE PIÑA', NULL::TEXT, 'LIBRAS', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 5, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 6, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-08-10', '', 'confirmado', '2026-08-10 12:00:00+00', NULL, '2026-08-10 12:00:00+00', 'NEOFRUT_AGOSTO.xlsx::AGOSTO 10#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 7), 4, NULL::TEXT, 'PULPA DE LIMON', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 5, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 8), 6, NULL::TEXT, 'PULPA DE DURAZNO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 7, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 8, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-08-10', '', 'confirmado', '2026-08-10 12:00:00+00', NULL, '2026-08-10 12:00:00+00', 'NEOFRUT_AGOSTO.xlsx::AGOSTO 10#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 7), 4, NULL::TEXT, 'PULPA DE LIMON', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 9), 5, NULL::TEXT, 'PULPA DE PIÑA', NULL::TEXT, 'LIBRAS', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 6, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 8), 7, NULL::TEXT, 'PULPA DE DURAZNO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 8, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 9, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-08-10', '', 'confirmado', '2026-08-10 12:00:00+00', NULL, '2026-08-10 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 10#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-08-10', '', 'confirmado', '2026-08-10 12:00:00+00', NULL, '2026-08-10 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 10#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-08-10', '', 'confirmado', '2026-08-10 12:00:00+00', NULL, '2026-08-10 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 10#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-08-11', '', 'confirmado', '2026-08-11 12:00:00+00', NULL, '2026-08-11 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 11#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-08-11', '', 'confirmado', '2026-08-11 12:00:00+00', NULL, '2026-08-11 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 11#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-08-11', '', 'confirmado', '2026-08-11 12:00:00+00', NULL, '2026-08-11 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 11#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-08-12', '', 'confirmado', '2026-08-12 12:00:00+00', NULL, '2026-08-12 12:00:00+00', 'COCA_COLA_AGOSTO.xlsx::AGOSTO 12#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 2, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 25), 3, NULL::TEXT, 'COCACOLA ZERO 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 133, 4, NULL::TEXT, 'GASEOSA CUATRO PET 400ML', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-08-12', '', 'confirmado', '2026-08-12 12:00:00+00', NULL, '2026-08-12 12:00:00+00', 'COCA_COLA_AGOSTO.xlsx::AGOSTO 12#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 27), 2, NULL::TEXT, 'AGUA GAS BRISA 600 ML 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 29), 3, NULL::TEXT, 'AGUA BRISA LIMON 600 ML 6', NULL::TEXT, 'BANDEJA', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 4, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 25), 5, NULL::TEXT, 'COCACOLA ZERO 400 ML X 12', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 24), 6, NULL::TEXT, 'FUZE TEA NEGRO LIMON X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 136, 7, NULL::TEXT, 'FUZE TEA DURAZNO X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 133, 8, NULL::TEXT, 'GASEOSA CUATRO PET 400ML', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 141, 9, NULL::TEXT, 'JUGO DEL VALLE 500 MORA X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-08-12', '', 'confirmado', '2026-08-12 12:00:00+00', NULL, '2026-08-12 12:00:00+00', 'FAMA_AGOSTO.xlsx::AGOSTO 12#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 211, 1, NULL::TEXT, 'BARRITA CHOCORRAMO', NULL::TEXT, 'UNIDAD', 16::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 212, 2, NULL::TEXT, 'BROWNIE AREQUIPE X 6 UND X 65 GR', NULL::TEXT, 'UNIDAD', 22::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 213, 3, NULL::TEXT, 'CHOCORRAMO TJDA X 65 GR', NULL::TEXT, 'UNIDAD', 25::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 214, 4, NULL::TEXT, 'GALA X 60 GR', NULL::TEXT, 'PAQUETE', 21::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 215, 5, NULL::TEXT, 'GANSITO X 6 X 37 GR', NULL::TEXT, 'PAQUETE', 16::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 216, 6, NULL::TEXT, 'LECHERITA X 8 GALLETAS', NULL::TEXT, 'PAQUETE', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 217, 7, NULL::TEXT, 'LIMONCITAS X8 GALLETAS', NULL::TEXT, 'PAQUETES', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-08-12', '', 'confirmado', '2026-08-12 12:00:00+00', NULL, '2026-08-12 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 12#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-08-12', '', 'confirmado', '2026-08-12 12:00:00+00', NULL, '2026-08-12 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 12#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-08-12', '', 'confirmado', '2026-08-12 12:00:00+00', NULL, '2026-08-12 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 12#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-08-13', '', 'confirmado', '2026-08-13 12:00:00+00', NULL, '2026-08-13 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 13#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-08-13', '', 'confirmado', '2026-08-13 12:00:00+00', NULL, '2026-08-13 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 13#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-08-13', '', 'confirmado', '2026-08-13 12:00:00+00', NULL, '2026-08-13 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 13#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-08-14', '', 'confirmado', '2026-08-14 12:00:00+00', NULL, '2026-08-14 12:00:00+00', 'COCA_COLA_AGOSTO.xlsx::AGOSTO 14#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 27), 2, NULL::TEXT, 'AGUA GAS BRISA 600 ML 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 29), 3, NULL::TEXT, 'AGUA BRISA LIMON 600 ML 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 25), 4, NULL::TEXT, 'COCACOLA ZERO 400 ML X 12', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 5, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 5::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 24), 6, NULL::TEXT, 'FUZE TEA NEGRO LIMON X 400 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 149, 7, NULL::TEXT, 'GASEOSA SPRITE PET 400ML', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 31), 8, NULL::TEXT, 'JUGO DEL VALLE 188 ML MORA X24', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 30), 9, NULL::TEXT, 'JUGO DEL VALLE 188 ML MANGO FRESA X24', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 32), 10, NULL::TEXT, 'JUGO DEL VALLE 500 ML MORA X24', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-08-14', '', 'confirmado', '2026-08-14 12:00:00+00', NULL, '2026-08-14 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 14#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-08-14', '', 'confirmado', '2026-08-14 12:00:00+00', NULL, '2026-08-14 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 14#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-08-14', '', 'confirmado', '2026-08-14 12:00:00+00', NULL, '2026-08-14 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 14#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-08-18', '', 'confirmado', '2026-08-18 12:00:00+00', NULL, '2026-08-18 12:00:00+00', 'NEOFRUT_AGOSTO.xlsx::AGOSTO 18#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 7), 4, NULL::TEXT, 'PULPA DE LIMON', NULL::TEXT, 'LIBRAS', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 5, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 8), 6, NULL::TEXT, 'PULPA DE DURAZNO', NULL::TEXT, 'LIBRAS', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 7, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 8, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-08-18', '', 'confirmado', '2026-08-18 12:00:00+00', NULL, '2026-08-18 12:00:00+00', 'NEOFRUT_AGOSTO.xlsx::AGOSTO 18#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 7), 4, NULL::TEXT, 'PULPA DE LIMON', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 9), 5, NULL::TEXT, 'PULPA DE PIÑA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 6, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 8), 7, NULL::TEXT, 'PULPA DE DURAZNO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 8, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 9, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('neofrut', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-08-18', '', 'confirmado', '2026-08-18 12:00:00+00', NULL, '2026-08-18 12:00:00+00', 'NEOFRUT_AGOSTO.xlsx::AGOSTO 18#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 1), 1, NULL::TEXT, 'PULPA DE MARACUYA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 2), 2, NULL::TEXT, 'PULPA DE LULO', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 3), 3, NULL::TEXT, 'PULPA DE MANGO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 7), 4, NULL::TEXT, 'PULPA DE LIMON', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 9), 5, NULL::TEXT, 'PULPA DE PIÑA', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 6), 6, NULL::TEXT, 'PULPA DE FRESA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 8), 7, NULL::TEXT, 'PULPA DE DURAZNO', NULL::TEXT, 'LIBRAS', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 4), 8, NULL::TEXT, 'PULPA DE MORA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'neofrut' AND orden = 5), 9, NULL::TEXT, 'PULPA DE NARANJA', NULL::TEXT, 'LIBRAS', 12::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-08-18', '', 'confirmado', '2026-08-18 12:00:00+00', NULL, '2026-08-18 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 18#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-08-18', '', 'confirmado', '2026-08-18 12:00:00+00', NULL, '2026-08-18 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 18#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-08-18', '', 'confirmado', '2026-08-18 12:00:00+00', NULL, '2026-08-18 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 18#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-08-19', '', 'confirmado', '2026-08-19 12:00:00+00', NULL, '2026-08-19 12:00:00+00', 'COCA_COLA_AGOSTO.xlsx::AGOSTO 19#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 26), 1, NULL::TEXT, 'AGUA GAS BRISA LIMON 600 ML 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 25), 2, NULL::TEXT, 'COCACOLA ZERO PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'bienestar-pro', 'FBE.04', 'Alimentos y bebidas', '2026-08-19', '', 'confirmado', '2026-08-19 12:00:00+00', NULL, '2026-08-19 12:00:00+00', 'COCA_COLA_AGOSTO.xlsx::AGOSTO 19#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 24), 2, NULL::TEXT, 'FUZE TEA NEGRO LIMON X 400 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('cocacola', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-08-19', '', 'confirmado', '2026-08-19 12:00:00+00', NULL, '2026-08-19 12:00:00+00', 'COCA_COLA_AGOSTO.xlsx::AGOSTO 19#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 128, 1, NULL::TEXT, 'AGUA BRISA PET 600 ML X 24', NULL::TEXT, 'BANDEJA', 6::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 33), 2, NULL::TEXT, 'AGUA BRISA LIMON -MANZANA 600 ML 6', NULL::TEXT, 'BANDEJA', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 131, 3, NULL::TEXT, 'COCACOLA PET 400 ML X 12', NULL::TEXT, 'BANDEJA', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 25), 4, NULL::TEXT, 'COCACOLA ZERO 400 ML X 12', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 24), 5, NULL::TEXT, 'FUZE TEA NEGRO LIMON X 400 ML X 6', NULL::TEXT, 'BANDEJA', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 136, 6, NULL::TEXT, 'FUZE TEA DURAZNO X 400 ML X 6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'cocacola' AND orden = 34), 7, NULL::TEXT, 'POWER 500ML X6', NULL::TEXT, 'BANDEJA', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('ramo', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-08-19', '', 'confirmado', '2026-08-19 12:00:00+00', NULL, '2026-08-19 12:00:00+00', 'FAMA_AGOSTO.xlsx::AGOSTO 19#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, 211, 1, NULL::TEXT, 'BARRITA CHOCORRAMO', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 212, 2, NULL::TEXT, 'BROWNIE AREQUIPE X 6 UND X 65 GR', NULL::TEXT, 'UNIDAD', 14::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 213, 3, NULL::TEXT, 'CHOCORRAMO TJDA X 65 GR', NULL::TEXT, 'UNIDAD', 20::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 214, 4, NULL::TEXT, 'GALA X 60 GR', NULL::TEXT, 'PAQUETE', 15::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 215, 5, NULL::TEXT, 'GANSITO X 6 X 37 GR', NULL::TEXT, 'PAQUETE', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 216, 6, NULL::TEXT, 'LECHERITA X 8 GALLETAS', NULL::TEXT, 'PAQUETE', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, 217, 7, NULL::TEXT, 'LIMONCITAS X8 GALLETAS', NULL::TEXT, 'PAQUETES', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-08-19', '', 'confirmado', '2026-08-19 12:00:00+00', NULL, '2026-08-19 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 19#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-08-19', '', 'confirmado', '2026-08-19 12:00:00+00', NULL, '2026-08-19 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 19#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 2, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 3, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 4, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-08-19', '', 'confirmado', '2026-08-19 12:00:00+00', NULL, '2026-08-19 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 19#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 6, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'administracion-3', 'FBE.04', 'Alimentos y bebidas', '2026-08-20', '', 'confirmado', '2026-08-20 12:00:00+00', NULL, '2026-08-20 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 20#0')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 2, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 3, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-08-20', '', 'confirmado', '2026-08-20 12:00:00+00', NULL, '2026-08-20 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 20#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-08-20', '', 'confirmado', '2026-08-20 12:00:00+00', NULL, '2026-08-20 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 20#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 2, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 3, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 4, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 5, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'bienestar-universitario', 'FBE.04', 'Alimentos y bebidas', '2026-08-21', '', 'confirmado', '2026-08-21 12:00:00+00', NULL, '2026-08-21 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 21#1')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 5), 1, NULL::TEXT, 'EMPANADA HAWAIANA FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 2, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 3, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 4, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 5, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 1::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

WITH nuevo_pedido AS (
  INSERT INTO pedido (proveedor_id, cafeteria_id, tipo_documento, categoria_marcada,
                      fecha_elaboracion, lugar_entrega, estado, confirmado_en,
                      creado_por, creado_en, origen_historico)
  VALUES ('rapifritos', 'camilo-torres', 'FBE.04', 'Alimentos y bebidas', '2026-08-21', '', 'confirmado', '2026-08-21 12:00:00+00', NULL, '2026-08-21 12:00:00+00', 'EMPANADAS-RAPRITOS__SJME_DF_AGOSTO.xlsx::AGOSTO 21#2')
  ON CONFLICT (origen_historico) WHERE origen_historico IS NOT NULL DO NOTHING
  RETURNING id
)
INSERT INTO pedido_linea (pedido_id, producto_id, orden, producto_codigo,
                          producto_nombre, producto_categoria, unidad_medida,
                          cantidad_solicitada, cantidad_devuelta, cantidad_adicional)
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 3), 1, NULL::TEXT, 'EMPANADA DE YUCA (CARNE Y POLLO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 6), 2, NULL::TEXT, 'EMPANADA MIXTA DE TRIGO', NULL::TEXT, 'UNIDAD', 3::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 4), 3, NULL::TEXT, 'EMPANADA POLLO QUESO FRITA', NULL::TEXT, 'UNIDAD', 8::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 2), 4, NULL::TEXT, 'FLAUTA POLLO QUESO CHAMPIÑONES FRITA', NULL::TEXT, 'UNIDAD', 4::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
  UNION ALL
  SELECT id, (SELECT id FROM producto WHERE proveedor_id = 'rapifritos' AND orden = 1), 5, NULL::TEXT, 'PAPA DE (POLLO CARNE Y MEDIO HUEVO)', NULL::TEXT, 'UNIDAD', 2::NUMERIC(10,2), NULL::NUMERIC(10,2), NULL::NUMERIC(10,2) FROM nuevo_pedido
;

COMMIT;

-- Comprobación rápida después de ejecutar:
--   SELECT COUNT(*) FROM pedido       WHERE origen_historico IS NOT NULL;  -- 348
--   SELECT COUNT(*) FROM pedido_linea pl JOIN pedido p ON p.id = pl.pedido_id
--     WHERE p.origen_historico IS NOT NULL;                                -- 1774