-- reservasCafeterias · un solo vocabulario para los estados
-- ===========================================================================
--
-- Se ejecuta DESPUÉS de 15-pedido-definitivo.sql, y DESPUÉS de él hay que
-- volver a pegar 13-analisis-pedidos.sql. El porqué está más abajo.
--
-- ── Qué se arregla ───────────────────────────────────────────────────────
--
-- La pantalla y la base llamaban distinto a lo mismo, y la palabra que se
-- cruzaba era la peor posible:
--
--     base `confirmado`  →  pantalla «Enviado»
--     base `definitivo`  →  pantalla «Confirmado»
--
-- O sea que «Confirmado» en una captura NO era `confirmado` en la base. Se
-- aceptó a sabiendas para no migrar dos veces, quedó escrito en grande en
-- `PASOS_PEDIDO`, y duró tres días: la primera petición que llegó —«pon en
-- confirmado los pedidos hasta el 21»— ya era ambigua, y la lectura literal
-- no habría hecho nada porque en la base ya estaban todos así.
--
-- Manda el vocabulario de la PANTALLA, que es el que usa el personal:
--
--     borrador    →  creado
--     confirmado  →  enviado
--     definitivo  →  confirmado
--     anulado     →  anulado   (no cambia)
--
-- ── EL ORDEN DE LOS RENOMBRADOS NO ES NEGOCIABLE ─────────────────────────
--
-- `confirmado` existe ANTES y DESPUÉS con significados distintos. Hacerlo en
-- el orden natural destruiría datos:
--
--     definitivo → confirmado     ← ahora hay DOS clases de `confirmado`
--     confirmado → enviado        ← y las dos se van juntas a `enviado`
--
-- Al revés no se pisan, porque el primer paso deja `confirmado` vacío:
--
--     confirmado → enviado        ← ya no queda ningún `confirmado`
--     definitivo → confirmado     ← el hueco está libre
--
-- Lo mismo con las columnas: `confirmado_en` tiene que salir de en medio
-- antes de que `finalizado_en` ocupe su nombre.

BEGIN;

/* ═══ 1 · Fuera las restricciones que nombran los valores viejos ═════════
 *
 * Tienen que caer ANTES de tocar nada: un CHECK que solo conoce `borrador`,
 * `confirmado` y `definitivo` rechaza el primer UPDATE que escriba `enviado`.
 */
ALTER TABLE pedido DROP CONSTRAINT IF EXISTS pedido_estado_valido;
ALTER TABLE pedido DROP CONSTRAINT IF EXISTS pedido_fechas_segun_estado;
ALTER TABLE pedido ALTER COLUMN estado DROP DEFAULT;
ALTER TABLE pedido_evento DROP CONSTRAINT IF EXISTS pedido_evento_accion_valida;

/* ═══ 2 · Las columnas, en dos pasos por la colisión ═════════════════════
 *
 * `confirmado_en` guardaba «cuándo salió hacia administración», que en el
 * vocabulario nuevo es ENVIADO. Y `finalizado_en` guardaba «cuándo se dio por
 * definitivo», que ahora se llama CONFIRMADO. El segundo nombre lo ocupa el
 * primero, así que primero se libera.
 */
ALTER TABLE pedido RENAME COLUMN confirmado_en TO enviado_en;
ALTER TABLE pedido RENAME COLUMN finalizado_en TO confirmado_en;

/* ═══ 3 · Los valores, en el orden que no se pisa ════════════════════════ */

UPDATE pedido SET estado = 'enviado'    WHERE estado = 'confirmado';
UPDATE pedido SET estado = 'confirmado' WHERE estado = 'definitivo';
UPDATE pedido SET estado = 'creado'     WHERE estado = 'borrador';

-- El historial, igual. `creado` y `editado` no cambian: nombran el gesto y no
-- el estado, y ninguno choca con los nuevos.
UPDATE pedido_evento SET accion = 'enviado'    WHERE accion = 'confirmado';
UPDATE pedido_evento SET accion = 'confirmado' WHERE accion = 'definitivo';

/* ═══ 4 · Los pedidos hasta el 21 de agosto quedan confirmados ═══════════
 *
 * Lo pidió Fredy el 30 de agosto de 2026. Son los 348 que se cargaron en
 * bloque desde los Excel: están entregados y cerrados desde hace meses, y
 * dejarlos en «Enviado · falta confirmar» decía de ellos algo que no es.
 *
 * La fecha de confirmación es la de ELABORACIÓN del propio documento, no la
 * de hoy. Es lo que corresponde a un histórico migrado: el pedido se cerró en
 * su día, y fechar el cierre hoy inventaría que estos 348 se confirmaron
 * todos en el mismo minuto de agosto de 2026. La carga ya dejó `creado_en` y
 * el antiguo `confirmado_en` en esa misma fecha, así que las tres quedan
 * coherentes y ninguna cae antes que la anterior.
 */
UPDATE pedido
   SET estado = 'confirmado',
       confirmado_en = fecha_elaboracion::TIMESTAMPTZ
 WHERE fecha_elaboracion <= DATE '2026-08-21'
   AND estado = 'enviado';

/*
 * Y su asiento, porque para eso está el historial.
 *
 * SIN autor: no lo confirmó nadie una tarde, se decidió en bloque al migrar.
 * Poner ahí a quien pegó el SQL sería atribuirle 347 confirmaciones que no
 * hizo una a una. `migracion` en el detalle es lo que permitirá distinguir
 * estos asientos de los de verdad dentro de un año.
 */
INSERT INTO pedido_evento (pedido_id, ocurrido_en, accion, autor, detalle)
SELECT p.id, p.confirmado_en, 'confirmado', NULL,
       jsonb_build_object('migracion', '16-unificar-estados', 'desde', 'enviado')
  FROM pedido p
 WHERE p.fecha_elaboracion <= DATE '2026-08-21'
   AND p.estado = 'confirmado'
   AND NOT EXISTS (
     SELECT 1 FROM pedido_evento e
      WHERE e.pedido_id = p.id AND e.accion = 'confirmado'
   );

/* ═══ 5 · Las restricciones, con el vocabulario nuevo ════════════════════ */

ALTER TABLE pedido ALTER COLUMN estado SET DEFAULT 'creado';

ALTER TABLE pedido
  ADD CONSTRAINT pedido_estado_valido
  CHECK (estado IN ('creado', 'enviado', 'confirmado', 'anulado'));

/*
 * Las dos fechas cuentan la misma historia que el estado.
 *
 * Un confirmado CONSERVA su `enviado_en`: pasó por ahí. El anulado se queda
 * sin ninguna de las dos, que es lo que ya hacía — los dos momentos siguen
 * en `pedido_evento`, que es donde no se borran.
 */
ALTER TABLE pedido
  ADD CONSTRAINT pedido_fechas_segun_estado CHECK (
    (estado = 'creado'     AND enviado_en IS NULL     AND confirmado_en IS NULL) OR
    (estado = 'enviado'    AND enviado_en IS NOT NULL AND confirmado_en IS NULL) OR
    (estado = 'confirmado' AND enviado_en IS NOT NULL AND confirmado_en IS NOT NULL) OR
    (estado = 'anulado'    AND enviado_en IS NULL     AND confirmado_en IS NULL)
  );

ALTER TABLE pedido_evento
  ADD CONSTRAINT pedido_evento_accion_valida
  CHECK (accion IN ('creado', 'editado', 'enviado', 'confirmado', 'anulado'));

/* ═══ 6 · Las funciones que nombran estados ══════════════════════════════ */

/* ── puede_editar_pedido ────────────────────────────────────────────────
 *
 *   estado       mostrador   auxiliar   admin
 *   creado       su sede     sí         sí
 *   enviado      NO          sí         sí
 *   confirmado   NO          NO         sí
 *   anulado      NO          NO         NO
 *
 * Un anulado no lo edita NADIE, ni el administrador: es un pedido que se
 * decidió que no existe, y editarlo sería resucitarlo por la puerta de atrás.
 */
CREATE OR REPLACE FUNCTION puede_editar_pedido(p_estado TEXT, p_rol TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_estado
    WHEN 'creado'     THEN p_rol IN ('mostrador', 'auxiliar', 'admin')
    WHEN 'enviado'    THEN p_rol IN ('auxiliar', 'admin')
    WHEN 'confirmado' THEN p_rol = 'admin'
    ELSE FALSE
  END;
$$;

/* ── cambiar_estado_pedido ──────────────────────────────────────────────
 *
 *     creado     → enviado
 *     enviado    → confirmado
 *     creado     → anulado
 *     enviado    → anulado
 *     confirmado → anulado
 *
 * Sigue sin haber camino de vuelta: puede haber papel circulando con ese
 * contenido. Quién puede hacer cada una lo decide `api/`; aquí solo se
 * declara qué transiciones EXISTEN.
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

  IF p_nuevo = 'enviado' AND v_estado = 'creado' THEN
    UPDATE pedido SET estado = 'enviado', enviado_en = now() WHERE id = p_id;

  ELSIF p_nuevo = 'confirmado' AND v_estado = 'enviado' THEN
    UPDATE pedido SET estado = 'confirmado', confirmado_en = now() WHERE id = p_id;

  ELSIF p_nuevo = 'anulado' AND v_estado IN ('creado', 'enviado', 'confirmado') THEN
    -- Las dos fechas fuera: lo exige el CHECK, y un anulado que conserve
    -- «confirmado el…» se lee como si siguiera vigente.
    UPDATE pedido SET estado = 'anulado', enviado_en = NULL, confirmado_en = NULL
     WHERE id = p_id;

  ELSE
    RAISE EXCEPTION 'TRANSICION_INVALIDA';
  END IF;

  PERFORM anotar_pedido(p_id, p_nuevo, p_actor, jsonb_build_object('desde', v_estado));

  RETURN detalle_pedido(p_id);
END;
$$;

/* ── detalle_pedido ─────────────────────────────────────────────────────
 *
 * Entera otra vez —`CREATE OR REPLACE` no sabe cambiar una clave de un
 * `jsonb_build_object`— con `enviado_en` y `confirmado_en` en lugar de
 * `confirmado_en` y `finalizado_en`.
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
 * ── FALTA UN PASO: volver a pegar 13-analisis-pedidos.sql ────────────────
 *
 * El análisis filtra por estado, y ese filtro NO se puede renombrar palabra
 * por palabra. Decía `estado = 'confirmado'` con el sentido de «el pedido
 * salió de la cafetería», que en el vocabulario nuevo son DOS estados:
 * `enviado` y `confirmado`.
 *
 * Traducirlo a `estado = 'enviado'` habría dejado el análisis en los 7
 * pedidos que quedan sin confirmar, en vez de los 356 que hay. El archivo 13
 * ya está corregido a `IN ('enviado','confirmado')`; pégalo después de este.
 *
 * De paso arregla un fallo que ya existía: los pedidos que llegaban al estado
 * final quedaban FUERA del análisis. Con tres eran invisibles; con 348 no.
 */

/* Comprobación, para leer en la salida. */
SELECT estado, COUNT(*) AS pedidos
  FROM pedido
 GROUP BY estado
 ORDER BY estado;
