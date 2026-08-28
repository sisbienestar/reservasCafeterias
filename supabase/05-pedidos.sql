-- reservasCafeterias · módulo de pedidos a proveedores
-- ===========================================================================
--
-- Sustituye a las nueve plantillas de Excel con macros, una por proveedor.
-- Se ejecuta UNA VEZ, entero, DESPUÉS de 01-esquema.sql (referencia
-- `cafeteria` y `auth.users`). Incluye su propio cierre de RLS al final: son
-- tablas nuevas, y una tabla nueva sin RLS es una tabla pública. Ver 02-rls.sql.
--
-- Las dos plantillas institucionales que había:
--
--   FBE.04  «Control de Pedido y Salidas de Almacén (Bodegas)» · almacenes
--           propios. Pide cantidad solicitada, y el almacén anota después
--           devuelta, adicional y total de salida.
--   FBE.34  «Pedido Diario Adicional de Insumos y Productos» · proveedores
--           externos. Solo cantidad pedida, más fecha y hora de entrega.
--
-- Las dos caben en las mismas tablas: lo que no aplica a un tipo queda NULL.
-- El bloque «DATOS» oculto de las plantillas —que armaba el nombre del .xls—
-- no se traslada: aquí el pedido tiene identidad propia.

/* ── Proveedores ────────────────────────────────────────────────────────
 *
 * `id` es el slug y NO es editable, por lo mismo que en `cafeteria`: es la
 * clave con la que los pedidos históricos apuntan aquí, y renombrarlo los
 * dejaría huérfanos. El nombre visible sí se corrige.
 *
 * «Almacén» y «proveedor externo» no son dos tablas: la diferencia entre
 * ellos es exactamente `tipo_documento`, y separarlas obligaría a consultar
 * las dos para pintar una lista que el usuario ve como una sola.
 */
CREATE TABLE proveedor (
  id               TEXT PRIMARY KEY,               -- slug: 'almacen-aseo'
  nombre           TEXT NOT NULL,
  tipo_documento   TEXT NOT NULL
                   CHECK (tipo_documento IN ('FBE.04', 'FBE.34')),
  -- La casilla marcable del encabezado FBE.04. Es fija por almacén —Aseo
  -- siempre marca «Aseo y productos químicos»— y NULL en los FBE.34, cuya
  -- plantilla no la tiene.
  categoria_fija   TEXT,
  activo           BOOLEAN NOT NULL DEFAULT TRUE,

  -- Un FBE.34 con categoría marcable sería un formulario que no existe.
  CONSTRAINT proveedor_categoria_segun_tipo CHECK (
    tipo_documento = 'FBE.04' OR categoria_fija IS NULL
  )
);

/* ── Catálogo ───────────────────────────────────────────────────────────
 *
 * Aquí sí hay `id` sintético y no slug: dos proveedores venden «MENTAS», y
 * dentro de un mismo proveedor el nombre tampoco es único —Pulpas Camilo
 * tiene la misma fruta dosificada y sin dosificar—.
 *
 * `codigo` NO es único ni siquiera dentro de un proveedor: en el catálogo de
 * Nutresa, 1025339 aparece en dos productos distintos. Es una referencia para
 * imprimir, no una clave.
 */
CREATE TABLE producto (
  id             BIGSERIAL PRIMARY KEY,
  proveedor_id   TEXT NOT NULL REFERENCES proveedor(id),
  -- El de la plantilla, que agrupa por categoría. No alfabético: quien pide
  -- recorre la hoja con el dedo en el mismo orden de siempre.
  orden          INT  NOT NULL,
  codigo         TEXT,
  nombre         TEXT NOT NULL,
  -- Los encabezados de las plantillas: GALLETAS, CHOCOLATINAS, LACTEOS…
  -- NULL en los proveedores que no agrupan.
  categoria      TEXT,
  unidad_medida  TEXT NOT NULL,
  activo         BOOLEAN NOT NULL DEFAULT TRUE,

  -- Dos productos no pueden ocupar la misma fila de la plantilla. Y de paso
  -- es la clave por la que la siembra hace `upsert`: así volver a ejecutarla
  -- corrige el catálogo en vez de duplicarlo.
  CONSTRAINT producto_orden_unico UNIQUE (proveedor_id, orden)
);

-- La pantalla de pedido carga el catálogo de UN proveedor y lo pinta en el
-- orden de la plantilla, agrupado por categoría.
CREATE INDEX producto_por_proveedor
  ON producto (proveedor_id, orden);

/* ── Pedidos ────────────────────────────────────────────────────────────
 *
 * `cafeteria_id` es NOT NULL a propósito, aunque el plan no lo pedía. El
 * nombre del archivo que generaba la macro ya lo llevaba dentro
 * —COCACOLA_BIENESTAR_PRO_20102025—, la cuenta de mostrador ya está atada a
 * una sede en `perfil`, y el día que haya que responder «¿cuánto pidió
 * Camilo Torres este mes?» la respuesta tiene que estar en el dato, no en el
 * texto libre de `lugar_entrega`. Añadirlo ahora cuesta esta línea; añadirlo
 * cuando haya pedidos guardados cuesta decidir qué sede tenían los viejos.
 *
 * Solo se piden pedidos para sedes EN SERVICIO —de las cinco, una está
 * cerrada—, pero eso NO es una restricción de esta tabla y no puede serlo:
 * una sede puede cerrar después, y sus pedidos de antes tienen que seguir
 * siendo válidos y consultables. La regla es «al crear», así que la impone
 * `api/`, como todas las de negocio. La clave foránea apunta a `cafeteria` a
 * secas, esté activa o no.
 */
CREATE TABLE pedido (
  id                  BIGSERIAL PRIMARY KEY,
  proveedor_id        TEXT NOT NULL REFERENCES proveedor(id),
  cafeteria_id        TEXT NOT NULL REFERENCES cafeteria(id),

  -- Copia del tipo que tenía el proveedor al elaborar el pedido, no una
  -- consulta a `proveedor`. Mismo motivo que `reserva.menu_nombre`: un
  -- documento reimpreso dentro de un año tiene que salir con el formato con
  -- el que se elaboró, aunque el proveedor haya cambiado de plantilla.
  tipo_documento      TEXT NOT NULL
                      CHECK (tipo_documento IN ('FBE.04', 'FBE.34')),
  -- Y por lo mismo, la casilla marcada queda copiada aquí.
  categoria_marcada   TEXT,

  fecha_elaboracion   DATE NOT NULL,
  -- Solo FBE.34: la plantilla del almacén no pide cuándo se entrega.
  fecha_entrega       DATE,
  hora_entrega        TIME,
  lugar_entrega       TEXT NOT NULL DEFAULT '',

  /*
   * El ciclo de un pedido. Nace BORRADOR: quien lo elabora lo revisa impreso
   * y lo corrige antes de que exista para nadie más. Al confirmarlo pasa a
   * administración para imprimir y firmar, y deja de ser editable — si no,
   * el papel ya impreso y la base podrían acabar diciendo cosas distintas.
   *
   * Con nombre, y no con el que Postgres inventa: 07-flujo-pedidos.sql lo
   * reemplaza, y una restricción sin nombre no se puede soltar sin adivinar.
   */
  estado              TEXT NOT NULL DEFAULT 'borrador'
                      CONSTRAINT pedido_estado_valido
                      CHECK (estado IN ('borrador', 'confirmado', 'anulado')),
  -- Cuándo pasó a manos de administración. NULL mientras sea borrador.
  confirmado_en       TIMESTAMPTZ,

  -- Quién lo elaboró. NULL solo si algún día se importa un histórico de las
  -- plantillas viejas, escritas cuando no había a quién atribuirlas.
  creado_por          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  creado_en           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un FBE.04 con hora de entrega, o un FBE.34 con categoría marcada, serían
  -- un documento que no se puede imprimir: la plantilla no tiene esas casillas.
  CONSTRAINT pedido_campos_segun_tipo CHECK (
    (tipo_documento = 'FBE.34' AND categoria_marcada IS NULL) OR
    (tipo_documento = 'FBE.04' AND fecha_entrega IS NULL AND hora_entrega IS NULL)
  )
);

-- El historial: por proveedor y rango de fechas, que es como lo pide la vista
-- de listado, y como lo pedirá el módulo de reportes.
CREATE INDEX pedido_por_proveedor ON pedido (proveedor_id, fecha_elaboracion);
CREATE INDEX pedido_por_fecha     ON pedido (fecha_elaboracion);
CREATE INDEX pedido_por_sede      ON pedido (cafeteria_id, fecha_elaboracion);

/* ── Líneas del pedido ──────────────────────────────────────────────────
 *
 * `producto_nombre`, `producto_codigo` y `unidad_medida` van COPIADOS, igual
 * que `reserva.menu_nombre`. La clave foránea a `producto` sirve para agrupar
 * y comparar; el texto copiado es lo que se imprime. Si mañana se corrige el
 * nombre de un producto, el documento de hace tres meses tiene que seguir
 * diciendo lo que se pidió entonces.
 *
 * Las cantidades son NUMERIC y no INT: se pide en LIBRAS y en GALON, y media
 * libra de queso es una cantidad legítima.
 */
CREATE TABLE pedido_linea (
  id                     BIGSERIAL PRIMARY KEY,
  pedido_id              BIGINT NOT NULL REFERENCES pedido(id) ON DELETE CASCADE,
  producto_id            BIGINT NOT NULL REFERENCES producto(id),
  orden                  INT NOT NULL,

  producto_codigo        TEXT,
  producto_nombre        TEXT NOT NULL,
  producto_categoria     TEXT,
  unidad_medida          TEXT NOT NULL,

  -- La única cantidad que existe en los dos formatos, y la única que teclea
  -- quien elabora el pedido.
  cantidad_solicitada    NUMERIC(10,2) NOT NULL CHECK (cantidad_solicitada > 0),

  -- Solo FBE.04, y las rellena el ALMACÉN después de despachar. Por eso son
  -- NULL al guardar: un pedido recién elaborado todavía no sabe qué se
  -- devolvió.
  cantidad_devuelta      NUMERIC(10,2) CHECK (cantidad_devuelta  >= 0),
  cantidad_adicional     NUMERIC(10,2) CHECK (cantidad_adicional >= 0),

  -- La última columna del FBE.04 era una fórmula en la plantilla, y lo sigue
  -- siendo aquí: la calcula la base de datos y nadie puede dejarla
  -- descuadrada. No se inserta ni se actualiza; se lee.
  --
  -- COALESCE porque las dos casillas del almacén están vacías mientras no
  -- despache, y un NULL contagiaría la resta entera.
  cantidad_total_salida  NUMERIC(10,2)
                         GENERATED ALWAYS AS (
                           cantidad_solicitada
                           - COALESCE(cantidad_devuelta, 0)
                           + COALESCE(cantidad_adicional, 0)
                         ) STORED,

  -- Un producto no puede ir dos veces en el mismo pedido: serían dos
  -- cantidades para la misma casilla de la hoja impresa.
  CONSTRAINT pedido_linea_sin_repetir UNIQUE (pedido_id, producto_id),

  -- Devolver más de lo que salió no es un pedido, es un error de tecleo. Va
  -- como restricción de tabla y no de columna porque mira dos columnas.
  CONSTRAINT pedido_linea_devuelta_posible CHECK (
    COALESCE(cantidad_devuelta, 0)
      <= cantidad_solicitada + COALESCE(cantidad_adicional, 0)
  )
);

CREATE INDEX pedido_linea_por_pedido   ON pedido_linea (pedido_id, orden, id);
-- Para el futuro módulo de reportes: «cuánto se pidió de este producto».
CREATE INDEX pedido_linea_por_producto ON pedido_linea (producto_id);

/* ── Seguridad ──────────────────────────────────────────────────────────
 *
 * Lo mismo que 02-rls.sql, y por lo mismo: la clave `anon` es pública y
 * Supabase publica una API REST automática sobre estas tablas. RLS activo y
 * SIN políticas deja la puerta REST tapiada; la única entrada es
 * `api/index.ts` con la clave de servicio.
 *
 * Aquí está además el catálogo de precios de nadie, pero sí el de compras de
 * la Universidad: quién le compra qué, y cuánto.
 */
ALTER TABLE proveedor    ENABLE ROW LEVEL SECURITY;
ALTER TABLE producto     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_linea ENABLE ROW LEVEL SECURITY;

ALTER TABLE proveedor    FORCE ROW LEVEL SECURITY;
ALTER TABLE producto     FORCE ROW LEVEL SECURITY;
ALTER TABLE pedido       FORCE ROW LEVEL SECURITY;
ALTER TABLE pedido_linea FORCE ROW LEVEL SECURITY;

REVOKE ALL ON proveedor, producto, pedido, pedido_linea
  FROM anon, authenticated;
