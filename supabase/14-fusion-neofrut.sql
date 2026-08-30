-- reservasCafeterias · fusión de «Pulpas Camilo» dentro de «Neofrut»
-- ===========================================================================
--
-- Cierra la pregunta que 12-historico-pedidos.sql dejó abierta y que el
-- informe de carga anotó «para revisar a mano»: si `neofrut` y `pulpas-camilo`
-- eran el mismo proveedor. Lo son. Fredy lo confirmó el 29 de agosto de 2026 y
-- eligió que el nombre que sobrevive es **Neofrut**.
--
-- La carga los dejó separados a propósito, y por eso esto es un archivo corto
-- en vez de una reconstrucción: fusionar era reversible, separar lo ya
-- fusionado habría exigido volver a los Excel.
--
-- ── Por qué sobrevive la fila `neofrut` y no la de `pulpas-camilo` ────────
--
-- Porque es donde están los datos. `neofrut` tiene los 29 pedidos confirmados
-- del histórico; `pulpas-camilo` tiene CERO pedidos y CERO líneas apuntando a
-- sus productos: es la ficha de catálogo que se dio de alta antes de la carga
-- y que nunca llegó a usarse. Fusionar en la otra dirección habría significado
-- mover 29 pedidos y reapuntar sus líneas producto a producto, con el riesgo
-- que eso trae, para acabar en el mismo sitio.
--
-- El nombre pedido —Neofrut— es además el que ya lleva la fila que se queda,
-- así que no hay que renombrar nada.
--
-- ── Lo que se conserva de «Pulpas Camilo» ────────────────────────────────
--
-- Sus 16 productos son las mismas 9 pulpas que ya tiene Neofrut, con cinco
-- repetidas dentro de su propio catálogo (MORA aparece dos veces, una con
-- doble espacio; y otro tanto con mango, limón, piña y fresa), más DOS que
-- Neofrut no tiene: GUANÁBANA y UVA.
--
-- Esas dos se mudan. No se han pedido nunca en todo el histórico, así que van
-- a salir en «Sin pedir: candidatos a revisar» marcadas «Nunca» — que es
-- exactamente para lo que está esa vista, y es mejor que borrar en silencio
-- productos que el proveedor sí vende. Si no las vende, se archivan desde la
-- pestaña Productos y no hace falta tocar SQL.
--
-- Las otras 14 se borran: son duplicados exactos de lo que ya existe, y no
-- hay ni una línea de pedido que las mencione.

BEGIN;

/*
 * Primero la red de seguridad, no después.
 *
 * Todo lo de abajo da por hecho que `pulpas-camilo` no tiene nada colgando.
 * Si esa suposición fuera falsa —porque alguien elaboró un pedido con ese
 * proveedor entre que se miró y que se ejecuta esto— el DELETE del final
 * fallaría por clave foránea, pero los productos ya se habrían movido y el
 * catálogo quedaría a medias. Comprobarlo antes convierte una fusión a medio
 * hacer en un error limpio dentro de la transacción.
 */
DO $$
DECLARE
  v_pedidos BIGINT;
  v_lineas  BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_pedidos FROM pedido WHERE proveedor_id = 'pulpas-camilo';
  SELECT COUNT(*) INTO v_lineas
    FROM pedido_linea pl
    JOIN producto pr ON pr.id = pl.producto_id
   WHERE pr.proveedor_id = 'pulpas-camilo';

  IF v_pedidos > 0 OR v_lineas > 0 THEN
    RAISE EXCEPTION
      'FUSION_INSEGURA: pulpas-camilo tiene % pedidos y % líneas. Hay que reapuntarlos antes de fusionar.',
      v_pedidos, v_lineas;
  END IF;
END;
$$;

/*
 * Las dos que Neofrut no tiene, al final de su plantilla impresa.
 *
 * `orden` es UNIQUE por proveedor (producto_orden_unico), y Neofrut usa del 1
 * al 9, así que 10 y 11 están libres. Se renumeran en vez de traerse el 13 y
 * el 19 que traían: los huecos en la plantilla impresa hacen dudar a quien la
 * recorre con el dedo de si falta una línea.
 */
UPDATE producto SET proveedor_id = 'neofrut', orden = 10
 WHERE proveedor_id = 'pulpas-camilo' AND nombre = 'PULPA DE GUANABANA';

UPDATE producto SET proveedor_id = 'neofrut', orden = 11
 WHERE proveedor_id = 'pulpas-camilo' AND nombre = 'PULPA DE UVA';

-- Y fuera los 14 duplicados. Sin líneas que los mencionen, es un borrado
-- limpio: no queda ningún pedido histórico apuntando al vacío.
DELETE FROM producto WHERE proveedor_id = 'pulpas-camilo';

/*
 * La imagen se hereda.
 *
 * `neofrut` nació sin imagen —la carga no tenía de dónde sacarla— y
 * `pulpas-camilo` sí llevaba una, elegida a mano para este mismo proveedor.
 * Si resulta ser el logotipo del distribuidor anterior y no el de Neofrut, se
 * cambia desde la pestaña Proveedores; aquí lo que se evita es perderla.
 *
 * `tipo_documento` se queda como está, en FBE.04, y esto sí es una decisión:
 * era la única diferencia real entre las dos fichas y por la que la carga las
 * dejó separadas. Manda lo que se imprimió de verdad — las 29 hojas del
 * histórico son FBE.04—, no lo que decía la ficha sin usar. Cambiarlo a
 * FBE.34 no tocaría ni un pedido pasado, porque `pedido.tipo_documento` es una
 * copia deliberada del tipo que había al elaborarlo (ver 05-pedidos.sql), pero
 * cambiaría la plantilla de los pedidos NUEVOS y obligaría además a poner
 * `categoria_fija` en NULL, que es lo que exige `proveedor_tipo_categoria`.
 */
UPDATE proveedor p
   SET imagen = (SELECT imagen FROM proveedor WHERE id = 'pulpas-camilo')
 WHERE p.id = 'neofrut'
   AND p.imagen = '';

DELETE FROM proveedor WHERE id = 'pulpas-camilo';

COMMIT;

/*
 * Comprobación, para leer en la salida y no fiarse de que fue bien:
 * Neofrut debe quedar con 11 productos y 29 pedidos, y `pulpas-camilo` no
 * debe existir.
 */
SELECT
  (SELECT COUNT(*) FROM producto  WHERE proveedor_id = 'neofrut')       AS productos_neofrut,
  (SELECT COUNT(*) FROM pedido    WHERE proveedor_id = 'neofrut')       AS pedidos_neofrut,
  (SELECT COUNT(*) FROM proveedor WHERE id = 'pulpas-camilo')           AS queda_pulpas_camilo;
