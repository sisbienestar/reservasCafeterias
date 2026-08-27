-- reservasCafeterias · esquema relacional
-- ===========================================================================
--
-- Sustituye a las tres pestañas de Google Sheets. Se ejecuta UNA VEZ, entero,
-- en el editor SQL de Supabase, y antes que 02-rls.sql y 03-funciones.sql.
--
-- La diferencia de fondo con la hoja: allí `opciones` e `historial` eran JSON
-- dentro de una celda porque una hoja no tiene arreglos. Aquí son tablas. La
-- API, en cambio, TIENE que seguir devolviéndolos anidados dentro de la carta
-- y de la reserva —así lo dice CONTRATO.md §2— porque el frontend no sabe
-- nada de tablas. Esa traducción la hace api/_nucleo/, no la base de datos.
--
-- Lo que sube de categoría al pasar a Postgres: dos reglas que en Apps Script
-- dependían de que el código se acordara de comprobarlas pasan a estar
-- declaradas en el esquema, donde no se pueden burlar.
--
--   · «un móvil no puede tener dos reservas activas el mismo día y sede»
--        -> reserva_sin_duplicado (índice único parcial)
--   · «el consecutivo nunca se repite ni se reutiliza»
--        -> reserva_consecutivo_unico + el candado de crear_reserva()

/* ── Cafeterías ─────────────────────────────────────────────────────────
 *
 * `id` es el slug del nombre y NO es editable: es la clave con la que las
 * reservas históricas apuntan a esta sede, y renombrarlo las dejaría
 * huérfanas. Por eso `cafeterias.actualizar` solo toca nombre y ubicación.
 */
CREATE TABLE cafeteria (
  id            TEXT PRIMARY KEY,                  -- slug: 'bienestar-pro'
  codigo        TEXT NOT NULL UNIQUE               -- prefijo del id de sus reservas
                CHECK (codigo ~ '^[0-9]{2,}$'),
  nombre        TEXT NOT NULL,
  ubicacion     TEXT NOT NULL DEFAULT '',
  imagen        TEXT NOT NULL DEFAULT '',
  activa        BOOLEAN NOT NULL DEFAULT TRUE,
  -- Productos permanentes de la sede (Mini Lunch, los especiales). No
  -- dependen del día, por eso viven aquí y no en la carta. Se ofrecen todos
  -- los días con servicio, haya carta publicada o no.
  platos_fijos  TEXT[] NOT NULL DEFAULT '{}'
);

COMMENT ON COLUMN cafeteria.codigo IS
  'Dos dígitos, como TEXTO. Si fuera entero, el 01 volvería como 1 y el identificador saldría «1-260823-001».';

/* ── La carta del día ───────────────────────────────────────────────────
 *
 * Se indexa SOLO por fecha: las cinco sedes sirven lo mismo. Lo que varía
 * por sede son los platos fijos de arriba.
 *
 * No hay una tabla `carta_dia` aparte, aunque CONTRATO.md §5 la dibujaba:
 * solo guardaría la fecha, y la API no distingue «día con carta vacía» de
 * «día sin carta» —los dos devuelven `opciones: []`—. Una tabla que nadie
 * puede observar es una tabla que hay que mantener a cambio de nada.
 */
CREATE TABLE carta_opcion (
  fecha   DATE NOT NULL,
  id      TEXT NOT NULL,                           -- slug del nombre
  nombre  TEXT NOT NULL,
  orden   INT  NOT NULL,                           -- el de la carta, no alfabético
  PRIMARY KEY (fecha, id)
);

-- La regla «dos platos con el mismo nombre el mismo día» (MENU_DUPLICADO) ya
-- la impone la clave primaria: el id es el slug del nombre, y dos nombres que
-- colisionan producen el mismo slug.

CREATE INDEX carta_opcion_por_fecha ON carta_opcion (fecha, orden);

/* ── Reservas ───────────────────────────────────────────────────────────
 *
 *   id = 01-260823-001
 *        ▲   ▲      ▲
 *        │   │      └─ consecutivo de esa cafetería ESE día
 *        │   └──────── fecha AAMMDD
 *        └──────────── codigo de la cafetería
 *
 * `consecutivo` se guarda además de ir dentro del `id` por una razón
 * concreta: es lo que permite declarar «nunca se repite» como restricción de
 * la base de datos en vez de como una comprobación del código. Sacarlo del
 * texto del id con una expresión regular en cada inserción sería más frágil,
 * y no serviría para los identificadores del formato antiguo.
 */
CREATE TABLE reserva (
  id            TEXT PRIMARY KEY,
  consecutivo   INT  NOT NULL,
  nombre        TEXT NOT NULL,
  -- TEXT y no un tipo numérico: como número pierde los ceros iniciales, y
  -- 3001234567 <> '3001234567' dejaría pasar duplicados. Ver CONTRATO.md §2.
  telefono      TEXT NOT NULL,
  cafeteria_id  TEXT NOT NULL REFERENCES cafeteria(id),
  fecha         DATE NOT NULL,
  menu_id       TEXT NOT NULL,
  -- Copia deliberada, no una referencia a carta_opcion: si mañana se corrige
  -- la carta, un reporte de hace tres meses tiene que seguir diciendo lo que
  -- se sirvió entonces. Por eso tampoco hay clave foránea contra la carta.
  menu_nombre   TEXT NOT NULL,
  -- NULL admitido solo por las reservas anteriores al 24 de agosto de 2026,
  -- creadas antes de que existieran los campos. La interfaz las pinta como
  -- «—». Toda reserva NUEVA los trae: lo exige la API, no el esquema, porque
  -- el esquema tiene que poder alojar el histórico tal como es.
  medio         TEXT CHECK (medio IN ('presencial','telefono')),
  pago          TEXT CHECK (pago  IN ('pagado','debe')),
  estado        TEXT NOT NULL DEFAULT 'activa'
                CHECK (estado IN ('activa','cancelada')),
  creada_en     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- El consecutivo es por cafetería y por día, y no se reutiliza NUNCA, ni
  -- siquiera si la reserva se cancela: reciclarlo haría que dos reservas
  -- distintas compartieran identificador.
  CONSTRAINT reserva_consecutivo_unico UNIQUE (cafeteria_id, fecha, consecutivo)
);

-- La regla del duplicado, impuesta por la base de datos y no solo por el
-- código. Es la única forma de que dos mostradores registrando a la vez no la
-- burlen: en Apps Script la protegía un bloqueo global de script; aquí la
-- protege el índice, que no se puede olvidar de comprobar.
--
-- Parcial sobre 'activa' a propósito: una reserva cancelada no cuenta, así
-- que quien canceló puede volver a reservar ese mismo día.
CREATE UNIQUE INDEX reserva_sin_duplicado
  ON reserva (cafeteria_id, fecha, telefono)
  WHERE estado = 'activa';

-- reservas.delDia filtra por sede + fecha + estado y ordena por llegada.
CREATE INDEX reserva_del_dia
  ON reserva (cafeteria_id, fecha, estado, creada_en);

-- reservas.buscar barre un rango de fechas de todas las sedes.
CREATE INDEX reserva_por_fecha ON reserva (fecha);

/* ── Historial ──────────────────────────────────────────────────────────
 *
 * Lo escribe SIEMPRE el servidor, nunca el cliente: es el registro de lo que
 * de verdad pasó, y el navegador no puede saberlo —dos personas editando la
 * misma reserva verían cada una solo su propio cambio—.
 *
 * Toda reserva nace con su asiento de 'creacion'.
 */
CREATE TABLE reserva_asiento (
  id          BIGSERIAL PRIMARY KEY,
  reserva_id  TEXT NOT NULL REFERENCES reserva(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('creacion','modificacion','cancelacion')),
  ocurrido_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Lo que le faltaba al historial en Apps Script: el «quién». Ahora hay
  -- identidad, así que se rellena. NULL solo en los asientos importados del
  -- histórico, escritos cuando no había a quién atribuirlos.
  autor       UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX reserva_asiento_por_reserva
  ON reserva_asiento (reserva_id, ocurrido_en, id);

CREATE TABLE reserva_cambio (
  id          BIGSERIAL PRIMARY KEY,
  asiento_id  BIGINT NOT NULL REFERENCES reserva_asiento(id) ON DELETE CASCADE,
  -- 'medio' y 'pago' faltaban en el borrador de CONTRATO.md §5: ese borrador
  -- es anterior a que los dos campos existieran.
  campo       TEXT NOT NULL CHECK (campo IN ('nombre','telefono','menu','medio','pago')),
  -- Guardan el valor VISIBLE, no el id: 'Bandeja paisa' se entiende dentro de
  -- un año, 'bandeja-paisa' obliga a cruzar tablas. Y «Presencial → Teléfono»
  -- se lee; «presencial → telefono» parece un error de escritura.
  antes       TEXT,
  despues     TEXT,
  orden       INT NOT NULL DEFAULT 0
);

CREATE INDEX reserva_cambio_por_asiento ON reserva_cambio (asiento_id, orden, id);

/* ── Identidad ──────────────────────────────────────────────────────────
 *
 * Lo que en el prototipo era un pestillo de navegador —un SHA-256 en
 * js/config.js que cualquiera se saltaba con las herramientas de desarrollo—.
 * Ahora la sesión la valida el servidor.
 *
 * `auth.users` lo gestiona Supabase. Esta tabla solo añade lo que es de este
 * proyecto: qué puede hacer cada quien y en qué sede.
 */
CREATE TABLE perfil (
  usuario_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL DEFAULT '',
  rol           TEXT NOT NULL CHECK (rol IN ('mostrador','admin')),
  -- La sede de quien atiende el mostrador. Su pantalla solo ve —y solo
  -- escribe— las reservas de aquí. NULL en los administradores, que las ven
  -- todas: es la diferencia entre los dos roles, junto con poder cancelar.
  cafeteria_id  TEXT REFERENCES cafeteria(id),
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un mostrador sin sede no podría ver nada; un admin con sede sugeriría un
  -- alcance que no tiene. Las dos cosas serían errores silenciosos.
  CONSTRAINT perfil_sede_segun_rol CHECK (
    (rol = 'mostrador' AND cafeteria_id IS NOT NULL) OR
    (rol = 'admin'     AND cafeteria_id IS NULL)
  )
);
