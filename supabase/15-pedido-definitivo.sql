-- reservasCafeterias · el pedido definitivo, el auxiliar y el historial
-- ===========================================================================
--
-- Se ejecuta DESPUÉS de 14-fusion-neofrut.sql.
--
-- Cuatro cosas que van juntas porque son la misma historia: lo que se pide no
-- siempre es lo que el proveedor puede entregar, y hasta ahora la aplicación
-- no tenía dónde decirlo.
--
--     borrador ──confirmar──► confirmado ──finalizar──► definitivo
--        │                        │                          │
--        └──anular──► anulado ◄───┴──────────────────────────┘
--
-- ── Por qué «definitivo» ─────────────────────────────────────────────────
--
-- El primer nombre que se le puso fue `ajustado`, y estaba mal: MUCHOS
-- PEDIDOS LLEGAN ENTEROS. Cuando el proveedor trae lo que se le pidió no se
-- ajusta nada, y un estado llamado «ajustado» sobre un pedido que nadie tocó
-- afirma algo que no pasó. El estado no es el ajuste — el ajuste es opcional
-- y ocurre antes. El estado es que el pedido YA ESTÁ LISTO.
--
-- `definitivo` dice eso y además hace pareja con `borrador`, que es como se
-- llaman las dos versiones de cualquier documento en una oficina: se trabaja
-- sobre el borrador y se archiva el definitivo. Quien lo lea sin haber visto
-- nunca este código sabe qué significa.
--
-- Se descartaron `cerrado` —dice que no se toca, no que esté listo—,
-- `despachado` y `enviado` —el pedido no se despacha aquí— y `finalizado`,
-- que es correcto pero se confunde con «terminó la entrega».
--
-- El VERBO sí es finalizar: `pedidos.finalizar` y `finalizado_en`. Es lo
-- normal en castellano —se confirma y queda confirmado, se finaliza y queda
-- definitivo— y en la pantalla el botón se llama «Envío final», que es como
-- lo dice quien lo pulsa.
--
-- ── Quién puede editar qué ───────────────────────────────────────────────
--
--   estado       mostrador   auxiliar   admin
--   borrador     su sede     sí         sí
--   confirmado   NO          sí         sí
--   definitivo   NO          NO         sí
--   anulado      NO          NO         NO
--
-- El mostrador se queda donde estaba: confirmar sigue siendo su punto de no
-- retorno, porque a partir de ahí puede haber papel impreso circulando. Lo
-- que cambia es que ahora hay alguien —el auxiliar— con el encargo explícito
-- de tocar ese papel cuando el proveedor llama.
--
-- Un anulado no lo edita NADIE, ni el administrador. No es un descuido de la
-- regla «administración edita en cualquier momento»: un pedido anulado es un
-- pedido que se decidió que no existe, y editarlo sería resucitarlo por la
-- puerta de atrás en vez de elaborar uno nuevo.

/* ═══ 1 · El rol nuevo ═══════════════════════════════════════════════════
 *
 * «Auxiliar Administrativo Cafeterías», que en la base es `auxiliar`.
 *
 * SIN SEDE, igual que el administrador. El trabajo que justifica el rol
 * —hablar con el proveedor y cuadrar lo que va a traer— es por proveedor y no
 * por cafetería: el mismo camión reparte en varias sedes, y un auxiliar atado
 * a una sola no podría ajustar el pedido de las demás. Por eso entra en la
 * rama del CHECK que exige `cafeteria_id IS NULL`.
 */
ALTER TABLE perfil DROP CONSTRAINT IF EXISTS perfil_rol_check;
ALTER TABLE perfil DROP CONSTRAINT IF EXISTS perfil_rol_valido;
ALTER TABLE perfil
  ADD CONSTRAINT perfil_rol_valido
  CHECK (rol IN ('mostrador', 'auxiliar', 'admin'));

ALTER TABLE perfil DROP CONSTRAINT IF EXISTS perfil_sede_segun_rol;
ALTER TABLE perfil
  ADD CONSTRAINT perfil_sede_segun_rol CHECK (
    (rol = 'mostrador' AND cafeteria_id IS NOT NULL) OR
    (rol IN ('auxiliar', 'admin') AND cafeteria_id IS NULL)
  );

/* ═══ 2 · El estado nuevo ════════════════════════════════════════════════ */

ALTER TABLE pedido ADD COLUMN IF NOT EXISTS finalizado_en TIMESTAMPTZ;

ALTER TABLE pedido DROP CONSTRAINT IF EXISTS pedido_estado_valido;
ALTER TABLE pedido
  ADD CONSTRAINT pedido_estado_valido
  CHECK (estado IN ('borrador', 'confirmado', 'definitivo', 'anulado'));

/*
 * Las dos fechas tienen que contar la misma historia que el estado.
 *
 * Sustituye a `pedido_confirmado_con_fecha`, que solo conocía dos estados y
 * habría rechazado cualquier `definitivo` por tener `confirmado_en` puesto.
 * Un definitivo CONSERVA su `confirmado_en`: pasó por ahí, y perder la fecha
 * borraría el paso intermedio del propio documento.
 *
 * El anulado se queda sin ninguna de las dos, que es lo que ya hacía: un
 * anulado que dijera «confirmado el 28» se lee como si siguiera vigente. La
 * fecha no se pierde — desde ahora está en `pedido_evento`, que es donde
 * viven las cosas que pasaron.
 */
ALTER TABLE pedido DROP CONSTRAINT IF EXISTS pedido_confirmado_con_fecha;
ALTER TABLE pedido DROP CONSTRAINT IF EXISTS pedido_fechas_segun_estado;
ALTER TABLE pedido
  ADD CONSTRAINT pedido_fechas_segun_estado CHECK (
    (estado = 'borrador'   AND confirmado_en IS NULL     AND finalizado_en IS NULL) OR
    (estado = 'confirmado' AND confirmado_en IS NOT NULL AND finalizado_en IS NULL) OR
    (estado = 'definitivo' AND confirmado_en IS NOT NULL AND finalizado_en IS NOT NULL) OR
    (estado = 'anulado'    AND confirmado_en IS NULL     AND finalizado_en IS NULL)
  );

/* ═══ 3 · El historial de modificaciones ═════════════════════════════════
 *
 * Una tabla propia y NO la tabla `registro` de 09-admin-general.sql, cuyo
 * comentario dice literalmente que no anota pedidos. Sigue teniendo razón:
 * `registro` guarda el gesto administrativo —quién dio un permiso, quién
 * apagó un módulo—, se lista entero en una sola pantalla y se lee por fecha.
 * Esto de aquí se lee SIEMPRE por pedido, cuelga de él y se borra con él.
 * Mezclarlos daría una tabla que crece con cada renglón corregido de cada
 * cafetería y en la que el gesto administrativo, que es raro y grave, se
 * perdería entre miles de ediciones rutinarias.
 */
CREATE TABLE IF NOT EXISTS pedido_evento (
  id          BIGSERIAL PRIMARY KEY,
  pedido_id   BIGINT NOT NULL REFERENCES pedido(id) ON DELETE CASCADE,
  ocurrido_en TIMESTAMPTZ NOT NULL DEFAULT now(),

  accion      TEXT NOT NULL,

  -- Quién. NULL si la cuenta se borró después, o si el asiento viene del
  -- histórico importado, que no tenía a quién atribuirse.
  autor       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Copia del nombre y del rol EN EL MOMENTO. Mismo motivo que
  -- `producto_nombre` en `pedido_linea`: si mañana a alguien se le cambia el
  -- rol, el historial tiene que seguir diciendo con qué sombrero hizo esto.
  autor_nombre TEXT NOT NULL DEFAULT '',
  autor_rol    TEXT NOT NULL DEFAULT '',

  -- Lo que cambió. En las ediciones, cuántos renglones quedaron; el resto de
  -- acciones no necesitan nada y llevan '{}'.
  detalle     JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT pedido_evento_accion_valida
    CHECK (accion IN ('creado', 'editado', 'confirmado', 'definitivo', 'anulado'))
);

-- Se lee siempre igual: los eventos de UN pedido, del más reciente al más
-- antiguo. El índice es exactamente esa consulta.
CREATE INDEX IF NOT EXISTS pedido_evento_por_pedido
  ON pedido_evento (pedido_id, ocurrido_en DESC, id DESC);

/* Misma cerradura que el resto: la única puerta es `api/index.ts`. */
ALTER TABLE pedido_evento ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_evento FORCE ROW LEVEL SECURITY;
REVOKE ALL ON pedido_evento FROM anon, authenticated;
REVOKE ALL ON SEQUENCE pedido_evento_id_seq FROM anon, authenticated;

/*
 * Los pedidos que ya existen entran con lo que de verdad se sabe de ellos, y
 * ni un dato más.
 *
 * `creado_en` y `confirmado_en` son fechas reales guardadas en la fila, así
 * que esos dos asientos no se inventan. El AUTOR sí falta —`creado_por` es
 * NULL en los 348 importados del histórico— y se deja NULL con el nombre
 * vacío en vez de rellenarlo con «sistema» o con quien pegó la carga: un
 * historial que atribuye a alguien algo que no hizo es peor que uno que
 * reconoce no saberlo.
 *
 * `ON CONFLICT` no hace falta porque la tabla acaba de nacer, pero el
 * `WHERE NOT EXISTS` sí: sin él, volver a ejecutar este archivo duplicaría
 * todos los asientos.
 */
INSERT INTO pedido_evento (pedido_id, ocurrido_en, accion, autor, detalle)
SELECT p.id, p.creado_en, 'creado', p.creado_por,
       jsonb_build_object('reconstruido', TRUE)
  FROM pedido p
 WHERE NOT EXISTS (
   SELECT 1 FROM pedido_evento e WHERE e.pedido_id = p.id AND e.accion = 'creado'
 );

-- Y aquí SIN autor, a propósito: quién confirmó no se guardaba en ninguna
-- parte —solo la fecha—, y ponerle `creado_por` sería inventar que confirmó
-- quien elaboró, que muchas veces no es la misma persona.
INSERT INTO pedido_evento (pedido_id, ocurrido_en, accion, autor, detalle)
SELECT p.id, p.confirmado_en, 'confirmado', NULL,
       jsonb_build_object('reconstruido', TRUE)
  FROM pedido p
 WHERE p.confirmado_en IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM pedido_evento e WHERE e.pedido_id = p.id AND e.accion = 'confirmado'
   );

/* ── anotar_pedido ──────────────────────────────────────────────────────
 *
 * El único sitio que escribe en `pedido_evento`.
 *
 * El nombre y el rol se BUSCAN aquí en vez de recibirse, para que ninguna
 * función que llame pueda anotar un rol que no es el suyo. Lo único que se
 * pasa es el UUID, que la API ya ha validado contra la sesión.
 */
CREATE OR REPLACE FUNCTION anotar_pedido(
  p_pedido_id BIGINT,
  p_accion    TEXT,
  p_actor     UUID,
  p_detalle   JSONB DEFAULT '{}'::jsonb
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO pedido_evento (pedido_id, accion, autor, autor_nombre, autor_rol, detalle)
  SELECT p_pedido_id, p_accion, p_actor,
         COALESCE(pf.nombre, ''), COALESCE(pf.rol, ''), p_detalle
    FROM (SELECT 1) _
    LEFT JOIN perfil pf ON pf.usuario_id = p_actor;
END;
$$;

/* ── puede_editar_pedido ────────────────────────────────────────────────
 *
 * La matriz de arriba, escrita UNA vez. La usan `actualizar_pedido` y la API,
 * y tenerla en una función y no repetida en los dos sitios es lo que evita
 * que dentro de seis meses digan cosas distintas.
 */
CREATE OR REPLACE FUNCTION puede_editar_pedido(p_estado TEXT, p_rol TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_estado
    WHEN 'borrador'   THEN p_rol IN ('mostrador', 'auxiliar', 'admin')
    WHEN 'confirmado' THEN p_rol IN ('auxiliar', 'admin')
    WHEN 'definitivo' THEN p_rol = 'admin'
    ELSE FALSE
  END;
$$;

/* ═══ 4 · Las funciones del flujo, con actor y con el estado nuevo ═══════
 *
 * Las dos cambian de FIRMA —les entra quién lo hace—, así que hay que
 * SOLTARLAS antes. `CREATE OR REPLACE` con parámetros distintos no reemplaza:
 * crea una segunda función con el mismo nombre, y entonces la API llamaría a
 * la vieja o a la nueva según cómo nombre los argumentos. Es un fallo que no
 * da error, solo comportamiento viejo.
 */
DROP FUNCTION IF EXISTS actualizar_pedido(BIGINT, DATE, TIME, TEXT, JSONB);
DROP FUNCTION IF EXISTS cambiar_estado_pedido(BIGINT, TEXT);

/* ── actualizar_pedido ──────────────────────────────────────────────────
 *
 * Igual que en 07-flujo-pedidos.sql —reemplaza las líneas enteras, porque el
 * formulario es la hoja entera— con dos diferencias: la cerradura ya no es
 * «es borrador» sino la matriz de `puede_editar_pedido`, y cada guardado deja
 * su asiento.
 */
CREATE OR REPLACE FUNCTION actualizar_pedido(
  p_id                BIGINT,
  p_fecha_entrega     DATE,
  p_hora_entrega      TIME,
  p_lugar_entrega     TEXT,
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
    fecha_entrega = p_fecha_entrega,
    hora_entrega  = p_hora_entrega,
    lugar_entrega = COALESCE(NULLIF(p_lugar_entrega, ''), lugar_entrega)
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
   * confirmado», que son dos cosas de gravedad muy distinta y las dos se
   * llaman «editado».
   */
  PERFORM anotar_pedido(p_id, 'editado', p_actor, jsonb_build_object(
    'estado', v_pedido.estado,
    'renglones', v_escritas
  ));

  RETURN detalle_pedido(p_id);
END;
$$;

/* ── cambiar_estado_pedido ──────────────────────────────────────────────
 *
 * Las transiciones que valen, y ninguna más:
 *
 *     borrador   → confirmado
 *     confirmado → definitivo    ← el envío final
 *     borrador   → anulado
 *     confirmado → anulado
 *     definitivo → anulado
 *
 * Sigue sin haber camino de vuelta. Un definitivo no regresa a confirmado por
 * el mismo motivo por el que un confirmado no regresa a borrador: puede haber
 * papel circulando con ese contenido.
 *
 * Quién puede hacer cada una lo decide `api/_nucleo/sesion.ts` y
 * `acciones/pedidos.ts`; aquí solo se declara qué transiciones EXISTEN.
 */
CREATE OR REPLACE FUNCTION cambiar_estado_pedido(
  p_id     BIGINT,
  p_nuevo  TEXT,
  p_actor  UUID
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

  ELSIF p_nuevo = 'definitivo' AND v_estado = 'confirmado' THEN
    UPDATE pedido SET estado = 'definitivo', finalizado_en = now() WHERE id = p_id;

  ELSIF p_nuevo = 'anulado' AND v_estado IN ('borrador', 'confirmado', 'definitivo') THEN
    -- Las dos fechas fuera: lo exige el CHECK, y un anulado que conserve
    -- «finalizado el…» se lee como si siguiera vigente. Los dos momentos
    -- quedan en `pedido_evento`, que es donde no se borran.
    UPDATE pedido SET estado = 'anulado', confirmado_en = NULL, finalizado_en = NULL
     WHERE id = p_id;

  ELSE
    RAISE EXCEPTION 'TRANSICION_INVALIDA';
  END IF;

  PERFORM anotar_pedido(p_id, p_nuevo, p_actor, jsonb_build_object('desde', v_estado));

  RETURN detalle_pedido(p_id);
END;
$$;

/* ── crear_pedido, con su asiento ───────────────────────────────────────
 *
 * Misma firma que en 06-funciones-pedidos.sql —no cambia, así que
 * `CREATE OR REPLACE` sí reemplaza— con el asiento de creación al final.
 * Se declara entera porque plpgsql no sabe añadir una línea a una función
 * existente.
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

  PERFORM anotar_pedido(v_pedido.id, 'creado', p_creado_por,
                        jsonb_build_object('renglones', v_escritas));

  RETURN detalle_pedido(v_pedido.id);
END;
$$;

/* ── detalle_pedido, con la fecha final y su historial ──────────────────
 *
 * Entera otra vez —`CREATE OR REPLACE` no sabe añadir una clave a un
 * `jsonb_build_object`— con `finalizado_en` y con los eventos dentro.
 *
 * Los eventos VIENEN AQUÍ y no en una acción aparte por la misma disciplina
 * que explica CLAUDE.md: abrir un pedido tiene que costar un viaje, no dos.
 * Son unos pocos asientos por pedido, no una tabla que crezca sin techo.
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
    'finalizado_en',      p.finalizado_en,
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

COMMENT ON TABLE pedido_evento IS
  'Historial de un pedido: cuándo se creó, se editó, se confirmó, se ajustó o se anuló.';

/*
 * Comprobación, para leer en la salida:
 * los tres roles válidos, los cuatro estados, y un asiento por pedido como
 * mínimo (los reconstruidos de la carga).
 */
SELECT
  (SELECT COUNT(*) FROM pedido)                          AS pedidos,
  (SELECT COUNT(*) FROM pedido_evento)                   AS asientos,
  (SELECT COUNT(*) FROM pedido_evento WHERE accion = 'creado')     AS creados,
  (SELECT COUNT(*) FROM pedido_evento WHERE accion = 'confirmado') AS confirmados;
