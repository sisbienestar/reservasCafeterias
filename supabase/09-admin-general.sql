-- reservasCafeterias · el administrador de la aplicación
-- ===========================================================================
--
-- Se ejecuta DESPUÉS de 08-admin-pedidos.sql.
--
-- Tres tablas para tres cosas que hasta ahora vivían fuera de la base y por
-- eso no se podían cambiar sin desplegar:
--
--   modulo    qué módulos hay y cuáles están en servicio.
--             Era `src/modulos.ts`, una constante del programa.
--   ajuste    los interruptores de la aplicación. `PERMITIR_FIN_DE_SEMANA`
--             era una variable de entorno: cambiarla obligaba a redesplegar.
--   registro  quién hizo qué de lo que importa. No existía.
--
-- Las cuentas NO son una tabla nueva: siguen siendo `auth.users` más `perfil`,
-- que ya estaban. Lo que cambia es que ahora hay una puerta para gestionarlas
-- desde la aplicación en vez de desde el panel de Supabase.

/* ── Módulos ────────────────────────────────────────────────────────────
 *
 * `id` es el prefijo de sus rutas y de sus acciones —`reservas`, `pedidos`—
 * y NO es editable: es lo que une esta fila con el código que la sirve.
 *
 * Desactivar un módulo no es esconder su tarjeta. `api/_nucleo/enrutador.ts`
 * mira esta tabla antes de ejecutar cualquier acción del módulo y la rechaza
 * si está apagado, salvo para administración, que necesita poder probarlo
 * antes de publicarlo. Esconder una ruta no es protegerla — regla 3.
 */
CREATE TABLE IF NOT EXISTS modulo (
  id        TEXT PRIMARY KEY,
  nombre    TEXT NOT NULL,
  -- El sobretítulo de la tarjeta. Dice en qué estado está, no qué hace.
  etiqueta  TEXT NOT NULL DEFAULT '',
  -- Las letras del marcador de posición, mientras no haya icono.
  inicial   TEXT NOT NULL DEFAULT '',
  -- A dónde lleva. Vacía en un módulo anunciado que todavía no existe.
  ruta      TEXT NOT NULL DEFAULT '',
  orden     INT  NOT NULL,
  activo    BOOLEAN NOT NULL DEFAULT TRUE,

  CONSTRAINT modulo_orden_unico UNIQUE (orden)
);

/*
 * Los dos que ya existen, con los mismos textos que tenía la constante.
 * `ON CONFLICT DO NOTHING` para que volver a ejecutar este archivo no pise lo
 * que administración haya cambiado desde la pantalla.
 */
INSERT INTO modulo (id, nombre, etiqueta, inicial, ruta, orden) VALUES
  ('reservas', 'Reservas de almuerzos',  'En servicio', 'RA', '/reservas', 1),
  ('pedidos',  'Pedidos a proveedores',  'En servicio', 'PP', '/pedidos',  2)
ON CONFLICT (id) DO NOTHING;

/* ── Ajustes ────────────────────────────────────────────────────────────
 *
 * Clave y valor, en vez de una tabla de una fila con una columna por
 * interruptor. La diferencia importa: añadir un ajuste nuevo es un INSERT y
 * no un ALTER, así que no hace falta migrar la base cada vez que aparezca
 * uno.
 *
 * El valor es TEXT y lo interpreta quien lo lee. Un booleano guardado como
 * 'true' se lee igual de bien que uno guardado como BOOLEAN, y a cambio la
 * tabla sirve también para el nombre de la aplicación y para la versión.
 */
CREATE TABLE IF NOT EXISTS ajuste (
  clave          TEXT PRIMARY KEY,
  valor          TEXT NOT NULL DEFAULT '',
  -- Para qué sirve. Lo lee la PANTALLA del panel: sin esto, administración
  -- vería una lista de claves sin saber qué hace ninguna.
  descripcion    TEXT NOT NULL DEFAULT '',
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

/*
 * Los cuatro que hay hoy, con los valores que estaban en el código.
 *
 * `permitir_fin_de_semana` arranca en 'false', que es lo que debe ser en
 * producción. Si la variable de entorno estaba en 'true' para probar, hay que
 * volver a encenderlo aquí — a propósito: un interruptor de pruebas que
 * sobrevive a la migración sin que nadie lo decida es justo el que se queda
 * encendido meses.
 */
INSERT INTO ajuste (clave, valor, descripcion) VALUES
  ('permitir_fin_de_semana', 'false',
   'MODO PRUEBAS. Con «true» se pueden registrar reservas en sábado y domingo. En producción va en «false».'),
  ('nombre_aplicacion', 'Servicios Cafeterías Bienestar UIS',
   'El nombre que sale en la cabecera de todas las pantallas y en la pestaña del navegador.'),
  ('version', 'v1',
   'La versión del prototipo, arriba a la derecha de la cabecera.'),
  ('fecha_version', '19 de agosto de 2026',
   'La fecha de esa versión, debajo del número.')
ON CONFLICT (clave) DO NOTHING;

/* ── Registro ───────────────────────────────────────────────────────────
 *
 * Quién hizo qué de lo que importa: cuentas, roles, módulos y ajustes.
 *
 * NO registra las reservas ni los pedidos. Esos ya tienen su propio rastro
 * —`reserva_asiento`, `pedido.creado_por`— y meterlos aquí también dejaría la
 * misma información en dos sitios que se irían separando.
 *
 * Lo que se guarda es el gesto administrativo, que es el que no deja huella
 * en ninguna otra parte: si mañana alguien tiene un permiso que no debería,
 * esta tabla es lo único que puede decir quién se lo dio.
 */
CREATE TABLE IF NOT EXISTS registro (
  id          BIGSERIAL PRIMARY KEY,
  ocurrido_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Quién. NULL si la cuenta se borró después: el asiento se conserva igual,
  -- porque «alguien que ya no está hizo esto» sigue siendo información.
  autor       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Copia del nombre en el momento de hacerlo. Sin esto, borrar la cuenta
  -- dejaría un registro de acciones sin nadie a quien atribuirlas.
  autor_nombre TEXT NOT NULL DEFAULT '',
  -- La acción tal como la conoce el enrutador: 'usuarios.crear'.
  accion      TEXT NOT NULL,
  -- Sobre qué: el correo de la cuenta, el id del módulo, la clave del ajuste.
  objeto      TEXT NOT NULL DEFAULT '',
  -- Lo que cambió, en la forma que tenga sentido para cada acción.
  detalle     JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS registro_por_fecha ON registro (ocurrido_en DESC, id DESC);

/* ── Seguridad ──────────────────────────────────────────────────────────
 *
 * Lo mismo que en 02-rls.sql y 05-pedidos.sql, y aquí con más motivo: `ajuste`
 * lleva el interruptor que decide si se aceptan reservas en fin de semana, y
 * `registro` es precisamente el rastro que alguien querría borrar.
 */
ALTER TABLE modulo   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ajuste   ENABLE ROW LEVEL SECURITY;
ALTER TABLE registro ENABLE ROW LEVEL SECURITY;

ALTER TABLE modulo   FORCE ROW LEVEL SECURITY;
ALTER TABLE ajuste   FORCE ROW LEVEL SECURITY;
ALTER TABLE registro FORCE ROW LEVEL SECURITY;

REVOKE ALL ON modulo, ajuste, registro FROM anon, authenticated;
