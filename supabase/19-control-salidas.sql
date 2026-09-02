-- reservasCafeterias · módulo de control de salidas
-- ===========================================================================
--
-- Se ejecuta UNA VEZ, entero, DESPUÉS de 18-observaciones-historicas.sql.
--
-- El cierre de caja: por cada cafetería y cada día, cuánto se VENDIÓ según la
-- caja y cuánto SALIÓ de verdad. La diferencia entre las dos cifras es el
-- hallazgo, y es para lo que existe todo esto.
--
-- ── «Salida» significa dos cosas en esta aplicación, y conviene saberlo ────
--
-- En el módulo de pedidos, la columna «Cant. Total Salida de almacén» del
-- FBE.04 es el producto que sale del ALMACÉN HACIA LA CAFETERÍA.
--
-- Aquí, una salida es el producto que sale de la CAFETERÍA HACIA QUIEN COME.
--
-- Son dos cosas distintas y NO se cruzan: ni una tabla de este archivo apunta
-- a `pedido`, `producto` ni `proveedor`, y el catálogo de abajo es propio. Lo
-- único compartido es `cafeteria`, que ya está a propósito fuera de todos los
-- módulos. La colisión de vocabulario es exactamente del tipo que costó tres
-- días con `borrador/confirmado/definitivo`, así que queda dicha aquí.
--
-- ── La forma ──────────────────────────────────────────────────────────────
--
-- Cada sede guarda LO SUYO por su cuenta —un cierre por (fecha, cafetería)— y
-- el documento del día se arma juntando las cinco. No hay ninguna entidad
-- «día»: el día es la consulta. Así una sede puede cerrar caja a su hora sin
-- esperar a las demás, y una que no cerró se ve como el hueco que es.
--
-- Sin ciclo de estados, a propósito: esto se guarda y se corrige. Añadir
-- estados después es aditivo; quitarlos, no.

BEGIN;

/* ── Quién responde por cada sede ───────────────────────────────────────
 *
 * OJO: esto NO es `perfil.cafeteria_id`, y la diferencia importa porque las
 * dos cosas se editan desde el mismo panel.
 *
 *   perfil.cafeteria_id      a qué sede tiene ACCESO una cuenta. Es un
 *                            permiso, y lo comprueba el servidor en cada
 *                            petición.
 *   cafeteria.responsable    quién RESPONDE por esa sede. Es un dato que se
 *                            copia dentro del cierre, y no abre ninguna
 *                            puerta.
 *
 * Puede haber varias cuentas con acceso a una sede y solo una responsable.
 *
 * `ON DELETE SET NULL`: borrar la cuenta no puede llevarse por delante la
 * cafetería. Los cierres ya escritos conservan el nombre copiado, así que no
 * pierden a quién atribuirse.
 */
ALTER TABLE cafeteria
  ADD COLUMN IF NOT EXISTS responsable_usuario_id UUID;

/*
 * La restricción va con NOMBRE PROPIO, y eso no es estilo: es necesario.
 *
 * Entre `cafeteria` y `perfil` hay ahora DOS caminos —este, y el
 * `perfil.cafeteria_id` de siempre— así que PostgREST no puede adivinar cuál
 * se le pide al incrustar el nombre del responsable. Hay que nombrárselo, y
 * para nombrárselo hay que saber cómo se llama.
 *
 * Con `ADD COLUMN … REFERENCES` el nombre lo inventa Postgres y el código
 * tendría que adivinarlo. Así se lee en las dos puntas: aquí y en
 * `api/_nucleo/acciones/cafeterias.ts`.
 */
ALTER TABLE cafeteria
  DROP CONSTRAINT IF EXISTS cafeteria_responsable_fkey;

ALTER TABLE cafeteria
  ADD CONSTRAINT cafeteria_responsable_fkey
  FOREIGN KEY (responsable_usuario_id)
  REFERENCES perfil(usuario_id) ON DELETE SET NULL;

COMMENT ON COLUMN cafeteria.responsable_usuario_id IS
  'Quién responde por esta sede en el control de salidas. NO es un permiso: el acceso lo da perfil.cafeteria_id.';

/* ── El catálogo ────────────────────────────────────────────────────────
 *
 * Se llama `salida_producto` y no `producto` porque `producto` YA EXISTE y es
 * el catálogo de proveedores del módulo de pedidos. Dos tablas con el mismo
 * nombre no caben, y dos catálogos con nombres parecidos se confunden solos.
 *
 * Cinco filas hoy y cualquiera mañana: el número de productos es un dato, no
 * una decisión del código. Nada de aquí está escrito en ningún `const`.
 */
CREATE TABLE IF NOT EXISTS salida_producto (
  id      BIGSERIAL PRIMARY KEY,
  nombre  TEXT NOT NULL,
  -- El de la pantalla y el del impreso. No alfabético: quien cierra la caja
  -- recorre la lista en el mismo orden todos los días.
  orden   INT  NOT NULL,
  activo  BOOLEAN NOT NULL DEFAULT TRUE,

  CONSTRAINT salida_producto_nombre_unico UNIQUE (nombre),
  CONSTRAINT salida_producto_orden_unico  UNIQUE (orden)
);

INSERT INTO salida_producto (nombre, orden) VALUES
  ('Desayunos',            1),
  ('Almuerzo Cafeterías',  2),
  ('Minilunch',            3),
  ('Ensaladas',            4),
  ('Bandeja Especial',     5)
ON CONFLICT (nombre) DO NOTHING;

/* ── El cierre de una sede en un día ────────────────────────────────────
 *
 * `UNIQUE (fecha, cafeteria_id)`: uno y solo uno. Volver a guardar corrige el
 * que hay, no añade otro — que es lo que se espera de un cierre de caja.
 *
 * `responsable_nombre` va COPIADO y no consultado, por lo mismo que
 * `producto_nombre` en las líneas: si mañana cambia quién responde por Camilo
 * Torres, el cierre de marzo tiene que seguir diciendo quién estaba en marzo.
 * Sin esta copia, cambiar el responsable reescribiría la historia entera.
 *
 * `guardado_por` es otra cosa y por eso son dos columnas: el responsable es
 * de quién es la sede ese día, y esto es quién tecleó. Suelen coincidir y no
 * tienen por qué —administración puede corregir un cierre ajeno—.
 */
CREATE TABLE IF NOT EXISTS salida_cierre (
  id                   BIGSERIAL PRIMARY KEY,
  fecha                DATE NOT NULL,
  cafeteria_id         TEXT NOT NULL REFERENCES cafeteria(id),

  responsable_nombre   TEXT NOT NULL DEFAULT '',

  guardado_por         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  guardado_por_nombre  TEXT NOT NULL DEFAULT '',
  guardado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT salida_cierre_unico UNIQUE (fecha, cafeteria_id)
);

-- Las dos consultas que existen: el día entero para el impreso, y un rango
-- por sede para el historial. El índice es exactamente la segunda; la primera
-- la resuelve el índice único de arriba.
CREATE INDEX IF NOT EXISTS salida_cierre_por_sede
  ON salida_cierre (cafeteria_id, fecha DESC);

/* ── Las dos cifras, por producto ───────────────────────────────────────
 *
 * INT y no NUMERIC, al revés que en `pedido_linea`. Allí se pide en LIBRAS y
 * media libra de queso es una cantidad legítima; aquí se cuentan ventas y
 * platos que salieron, y medio desayuno no existe. El tipo hace imposible el
 * valor equivocado en vez de dejarlo pasar.
 *
 * Las dos admiten NULL, y no es lo mismo que cero: cero dice «se contó y no
 * hubo ninguno» y vacío dice «no se contó». En un control de cierre esa
 * diferencia es justo lo que se viene a mirar.
 *
 * `diferencia` es una columna GENERADA: la calcula la base y nadie puede
 * dejarla descuadrada. Positiva significa que salió más de lo que la caja
 * registró, que es el hallazgo que este control busca.
 *
 * OJO: la definición de abajo lleva un COALESCE y está MAL — convierte «no se
 * contó» en cero, y un renglón a medio contar salía con un descuadre que nadie
 * tuvo. Lo corrige `20-diferencia-solo-si-se-conto.sql`, que la redeclara como
 * la resta a secas. Aquí se deja lo que se ejecutó: los archivos numerados son
 * el registro de lo que pasó.
 */
CREATE TABLE IF NOT EXISTS salida_linea (
  id                  BIGSERIAL PRIMARY KEY,
  cierre_id           BIGINT NOT NULL REFERENCES salida_cierre(id) ON DELETE CASCADE,
  producto_id         BIGINT NOT NULL REFERENCES salida_producto(id),
  orden               INT  NOT NULL,

  -- Copiado del catálogo, igual que en las líneas de un pedido: corregir el
  -- nombre de un producto no puede cambiar lo que decía un cierre de marzo.
  producto_nombre     TEXT NOT NULL,

  ventas_registradas  INT CHECK (ventas_registradas >= 0),
  salidas             INT CHECK (salidas >= 0),

  diferencia          INT GENERATED ALWAYS AS
                        (COALESCE(salidas, 0) - COALESCE(ventas_registradas, 0)) STORED,

  -- Un producto dos veces en el mismo cierre serían dos cifras para la misma
  -- casilla del papel.
  CONSTRAINT salida_linea_sin_repetir UNIQUE (cierre_id, producto_id)
);

CREATE INDEX IF NOT EXISTS salida_linea_por_cierre
  ON salida_linea (cierre_id, orden);

/* ── Seguridad ──────────────────────────────────────────────────────────
 *
 * Lo mismo que en 02-rls.sql y 05-pedidos.sql: tablas nuevas sin RLS son
 * tablas públicas, porque la clave anónima es pública y Supabase expone una
 * API REST automática sobre ellas. La única puerta es `api/index.ts`.
 */
ALTER TABLE salida_producto ENABLE ROW LEVEL SECURITY;
ALTER TABLE salida_cierre   ENABLE ROW LEVEL SECURITY;
ALTER TABLE salida_linea    ENABLE ROW LEVEL SECURITY;

ALTER TABLE salida_producto FORCE ROW LEVEL SECURITY;
ALTER TABLE salida_cierre   FORCE ROW LEVEL SECURITY;
ALTER TABLE salida_linea    FORCE ROW LEVEL SECURITY;

REVOKE ALL ON salida_producto, salida_cierre, salida_linea FROM anon, authenticated;
REVOKE ALL ON SEQUENCE salida_producto_id_seq FROM anon, authenticated;
REVOKE ALL ON SEQUENCE salida_cierre_id_seq   FROM anon, authenticated;
REVOKE ALL ON SEQUENCE salida_linea_id_seq    FROM anon, authenticated;

/* ── El módulo ──────────────────────────────────────────────────────────
 *
 * Nace APAGADO. No es prudencia de más: `ExigeModulo` y el enrutador dejan
 * pasar a administración aunque esté apagado —para eso está pensado— así que
 * se puede probar entero antes de que aparezca la tarjeta en la portada. Se
 * enciende desde /admin cuando esté listo.
 */
INSERT INTO modulo (id, nombre, etiqueta, inicial, ruta, orden, activo) VALUES
  ('salidas', 'Control de salidas', 'En preparación', 'CS', '/salidas', 3, FALSE)
ON CONFLICT (id) DO NOTHING;

/* ── Guardar un cierre ──────────────────────────────────────────────────
 *
 * Atómica y en SQL por lo mismo que `crear_pedido`: la cabecera y sus líneas
 * son una sola cosa, y el texto que se imprime —el nombre del producto— se
 * copia del catálogo en vez de creerse el que llega por el cable.
 *
 * Es un UPSERT: guardar dos veces el mismo (fecha, sede) corrige, no duplica.
 * Las líneas se reemplazan enteras porque el formulario es la hoja entera,
 * igual que en `actualizar_pedido`.
 *
 * OJO: el `ON CONFLICT` de abajo pisa `responsable_nombre` en cada guardado, y
 * eso está MAL — corregir en abril un cierre de marzo le ponía el responsable
 * de abril, que es justo lo que la copia venía a impedir. Lo arregla
 * `22-responsable-no-se-reescribe.sql`. Aquí se deja lo que se ejecutó.
 *
 * A diferencia de un pedido, un cierre SÍ puede quedarse sin líneas: una sede
 * que abrió y no vendió nada es un cierre legítimo, y de hecho es justo lo
 * que hay que poder registrar.
 */
CREATE OR REPLACE FUNCTION guardar_cierre_salidas(
  p_fecha              DATE,
  p_cafeteria_id       TEXT,
  p_responsable_nombre TEXT,
  p_guardado_por       UUID,
  p_guardado_nombre    TEXT,
  -- [{producto_id, ventas_registradas, salidas}]
  p_lineas             JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id        BIGINT;
  v_pedidas   INT;
  v_escritas  INT;
BEGIN
  v_pedidas := jsonb_array_length(p_lineas);

  INSERT INTO salida_cierre (
    fecha, cafeteria_id, responsable_nombre,
    guardado_por, guardado_por_nombre
  ) VALUES (
    p_fecha, p_cafeteria_id, COALESCE(p_responsable_nombre, ''),
    p_guardado_por, COALESCE(p_guardado_nombre, '')
  )
  ON CONFLICT (fecha, cafeteria_id) DO UPDATE SET
    responsable_nombre  = EXCLUDED.responsable_nombre,
    guardado_por        = EXCLUDED.guardado_por,
    guardado_por_nombre = EXCLUDED.guardado_por_nombre,
    actualizado_en      = now()
  RETURNING id INTO v_id;

  DELETE FROM salida_linea WHERE cierre_id = v_id;

  /*
   * El JOIN contra `salida_producto` es la comprobación, no solo la copia: un
   * producto que no exista o esté dado de baja no encuentra pareja y no
   * produce fila. Por eso después se cuenta.
   */
  INSERT INTO salida_linea (
    cierre_id, producto_id, orden, producto_nombre,
    ventas_registradas, salidas
  )
  SELECT v_id, sp.id, sp.orden, sp.nombre, l.ventas_registradas, l.salidas
    FROM jsonb_to_recordset(p_lineas) AS l(
      producto_id        BIGINT,
      ventas_registradas INT,
      salidas            INT
    )
    JOIN salida_producto sp ON sp.id = l.producto_id AND sp.activo;

  GET DIAGNOSTICS v_escritas = ROW_COUNT;

  IF v_escritas <> v_pedidas THEN
    RAISE EXCEPTION 'PRODUCTO_AJENO';
  END IF;

  RETURN detalle_cierre_salidas(p_fecha, p_cafeteria_id);
END;
$$;

/* ── Leer un cierre ─────────────────────────────────────────────────────
 *
 * Se pide por (fecha, sede) y no por id, porque así es como se llega: desde
 * el formulario de una cafetería en un día. El id es de la base, no del
 * trabajo de nadie.
 *
 * Devuelve NULL cuando esa sede no ha cerrado ese día, y eso NO es un error:
 * es el hueco que el control existe para enseñar. Quien llame decide qué
 * hacer con él.
 */
CREATE OR REPLACE FUNCTION detalle_cierre_salidas(p_fecha DATE, p_cafeteria_id TEXT)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id',                  c.id,
    'fecha',               c.fecha,
    'cafeteria_id',        c.cafeteria_id,
    'cafeteria_nombre',    caf.nombre,
    'responsable_nombre',  c.responsable_nombre,
    'guardado_por_nombre', c.guardado_por_nombre,
    'guardado_en',         c.guardado_en,
    'actualizado_en',      c.actualizado_en,
    'lineas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'producto_id',        l.producto_id,
               'nombre',             l.producto_nombre,
               'ventas_registradas', l.ventas_registradas,
               'salidas',            l.salidas,
               'diferencia',         l.diferencia
             ) ORDER BY l.orden, l.id)
        FROM salida_linea l WHERE l.cierre_id = c.id
    ), '[]'::jsonb)
  )
  FROM salida_cierre c
  JOIN cafeteria caf ON caf.id = c.cafeteria_id
  WHERE c.fecha = p_fecha AND c.cafeteria_id = p_cafeteria_id;
$$;

/* ── El día entero, para el impreso ─────────────────────────────────────
 *
 * Todas las sedes EN SERVICIO de un día, hayan cerrado o no. Las que no
 * cerraron salen con `cerrado: false` y sin líneas — omitirlas convertiría un
 * documento de control en uno que solo enseña lo que salió bien.
 *
 * El catálogo va aparte y no repetido dentro de cada sede: el impreso es una
 * matriz de sedes por productos, y las columnas las manda el catálogo, no lo
 * que cada sede haya rellenado.
 */
CREATE OR REPLACE FUNCTION dia_salidas(p_fecha DATE)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'fecha', p_fecha,
    'productos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('producto_id', sp.id, 'nombre', sp.nombre)
                       ORDER BY sp.orden)
        FROM salida_producto sp WHERE sp.activo
    ), '[]'::jsonb),
    'cafeterias', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'cafeteria_id',       caf.id,
               'cafeteria_nombre',   caf.nombre,
               'cerrado',            c.id IS NOT NULL,
               'responsable_nombre', COALESCE(c.responsable_nombre, ''),
               'lineas', COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                          'producto_id',        l.producto_id,
                          'nombre',             l.producto_nombre,
                          'ventas_registradas', l.ventas_registradas,
                          'salidas',            l.salidas,
                          'diferencia',         l.diferencia
                        ) ORDER BY l.orden, l.id)
                   FROM salida_linea l WHERE l.cierre_id = c.id
               ), '[]'::jsonb)
             ) ORDER BY caf.codigo)
        FROM cafeteria caf
        LEFT JOIN salida_cierre c
          ON c.cafeteria_id = caf.id AND c.fecha = p_fecha
       WHERE caf.activa
    ), '[]'::jsonb)
  );
$$;

/* ── El historial ───────────────────────────────────────────────────────
 *
 * La FICHA de cada cierre en un rango, no su contenido: fecha, sede,
 * responsable y los totales. Las líneas se piden al abrir uno, por la misma
 * disciplina que `pedidos.buscar`.
 *
 * `p_cafeteria_id` nulo o vacío significa todas. Quién puede pedir eso lo
 * decide `api/`, con la misma guarda de sede de siempre.
 */
CREATE OR REPLACE FUNCTION buscar_salidas(
  p_desde        DATE,
  p_hasta        DATE,
  p_cafeteria_id TEXT
) RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(f ORDER BY f->>'fecha' DESC, f->>'cafeteria_nombre'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
             'id',                 c.id,
             'fecha',              c.fecha,
             'cafeteria_id',       c.cafeteria_id,
             'cafeteria_nombre',   caf.nombre,
             'responsable_nombre', c.responsable_nombre,
             'renglones',          (SELECT COUNT(*) FROM salida_linea l WHERE l.cierre_id = c.id),
             'total_ventas',       (SELECT COALESCE(SUM(l.ventas_registradas), 0)
                                      FROM salida_linea l WHERE l.cierre_id = c.id),
             'total_salidas',      (SELECT COALESCE(SUM(l.salidas), 0)
                                      FROM salida_linea l WHERE l.cierre_id = c.id),
             'total_diferencia',   (SELECT COALESCE(SUM(l.diferencia), 0)
                                      FROM salida_linea l WHERE l.cierre_id = c.id)
           ) AS f
      FROM salida_cierre c
      JOIN cafeteria caf ON caf.id = c.cafeteria_id
     WHERE c.fecha BETWEEN p_desde AND p_hasta
       AND (p_cafeteria_id IS NULL OR p_cafeteria_id = '' OR c.cafeteria_id = p_cafeteria_id)
  ) AS s;
$$;

COMMIT;

/* Comprobación, para leer en la salida. */
SELECT (SELECT COUNT(*) FROM salida_producto)                        AS productos,
       (SELECT COUNT(*) FROM salida_cierre)                          AS cierres,
       (SELECT activo FROM modulo WHERE id = 'salidas')              AS modulo_activo,
       (SELECT COUNT(*) FROM cafeteria WHERE responsable_usuario_id IS NOT NULL)
                                                                     AS sedes_con_responsable;
