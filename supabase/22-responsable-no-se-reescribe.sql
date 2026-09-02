-- reservasCafeterias · quién respondía aquel día no se reescribe al corregir
-- ===========================================================================
--
-- Se ejecuta UNA VEZ, entero, DESPUÉS de 21-dias-de-cierre.sql.
--
-- ── El fallo ──────────────────────────────────────────────────────────────
--
-- `salida_cierre.responsable_nombre` va COPIADO justamente para que cambiar
-- quién responde por una sede no reescriba la historia. Pero el UPSERT lo
-- pisaba en cada guardado:
--
--     ON CONFLICT (fecha, cafeteria_id) DO UPDATE SET
--       responsable_nombre = EXCLUDED.responsable_nombre,
--
-- O sea que la copia solo aguantaba mientras nadie tocara el cierre. En cuanto
-- alguien corregía una cifra de marzo estando en abril, el cierre de marzo
-- pasaba a decir el responsable de abril. Comprobado:
--
--     se cierra la caja        → «Fredy Giovanny Moreno Torres»
--     cambia el responsable…
--     alguien corrige aquello  → «Otra Persona»
--
-- Y es el peor tipo de error: no falla, no avisa, y deja un documento firmado
-- por alguien que no estaba. Que es exactamente lo que la columna copiada
-- venía a impedir.
--
-- ── El arreglo ────────────────────────────────────────────────────────────
--
-- El responsable se sella la PRIMERA vez que se cierra ese día, y a partir de
-- ahí no se toca. Corregir una cifra no cambia quién estaba en el mostrador:
-- son dos cosas distintas y solo una de ellas se está editando.
--
-- Con una excepción, y hace falta: si el día se cerró cuando la sede todavía
-- no tenía a nadie asignado, el nombre quedó vacío. Entonces sí se rellena al
-- volver a guardar — no se está reescribiendo nada, se está completando un
-- hueco.
--
-- `guardado_por` es otra cosa y SÍ se actualiza: ahí lo correcto es la última
-- persona que tecleó, que es lo que responde a «¿quién tocó esto?».

BEGIN;

/* Misma firma, así que `CREATE OR REPLACE` reemplaza de verdad. Entera porque
 * plpgsql no sabe cambiar una línea de una función existente. */
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
    /*
     * Se queda el que ya había. Solo se rellena si estaba vacío, que es el
     * caso de un día cerrado antes de asignar a nadie.
     *
     * `salida_cierre.` es la fila que YA existe y `EXCLUDED.` la que se
     * intentaba meter — sin cualificar, Postgres no sabría de cuál se habla.
     */
    responsable_nombre  = COALESCE(
                            NULLIF(salida_cierre.responsable_nombre, ''),
                            EXCLUDED.responsable_nombre
                          ),
    -- Quién tecleó SÍ se actualiza: es la última persona que tocó el cierre.
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

COMMENT ON COLUMN salida_cierre.responsable_nombre IS
  'Quién respondía por la sede el día del cierre, copiado al cerrarlo por primera vez. NO se reescribe al corregir: cambiar de responsable no cambia quién estaba. Solo se rellena si quedó vacío.';

COMMIT;

/*
 * Comprobación, para leer en la salida: los cierres que ya tienen nombre y los
 * que se cerraron sin responsable asignado y todavía lo pueden recibir.
 */
SELECT COUNT(*)                                            AS cierres,
       COUNT(*) FILTER (WHERE responsable_nombre <> '')    AS con_responsable,
       COUNT(*) FILTER (WHERE responsable_nombre =  '')    AS sin_responsable
  FROM salida_cierre;
