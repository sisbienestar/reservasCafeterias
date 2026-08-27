# Contrato de la API · reservasCafeterias

Esto es lo que tiene que cumplir **cualquier** backend de este proyecto: hoy
Google Apps Script, mañana Node, Django, Laravel o lo que sea. Mientras se
respete, el frontend no se entera del cambio.

No describe cómo guardar los datos —eso es libre— sino **qué entra y qué sale**.

> Hay una versión ejecutable de este documento: `pruebas/contrato.mjs`.
> Apunta el nuevo backend ahí y, si sale en verde, la migración está hecha.

---

## 1. Transporte

**Un único endpoint.** Todo va por `POST` a la misma URL.

```jsonc
// petición
{ "accion": "reservas.crear", "params": { … } }
```

La respuesta es **siempre** el mismo sobre, incluso cuando algo falla:

```jsonc
{ "ok": true,  "data": … }
{ "ok": false, "error": { "codigo": "RESERVA_DUPLICADA", "mensaje": "…" } }
```

Reglas del transporte:

- **Un error de negocio devuelve HTTP 200** con `ok:false`. Los códigos HTTP se
  reservan para fallos de transporte. El cliente ya distingue las dos cosas.
- **Nunca devolver HTML.** Un error no capturado que salga como página de error
  del servidor llega al cliente como `RESPUESTA_INVALIDA` y no dice nada útil.
- `mensaje` es para leerlo una persona en el mostrador. `codigo` es para el
  código: es lo que la interfaz consulta para decidir qué hacer.

### Por qué un solo endpoint y no REST

Fue una decisión forzada por Apps Script, que solo expone `doGet`/`doPost`. Un
backend nuevo **puede** exponer REST si quiere; lo único obligatorio es que
`js/services/httpClient.js` siga hablando con él. Cambiar ese archivo es
cambiar un archivo, así que si REST encaja mejor, adelante — pero entonces el
contrato que manda es esta tabla de acciones, traducida a rutas.

---

## 2. Formas de los datos

**`snake_case` en el cable, `camelCase` en la interfaz.** La conversión la hace
cada servicio en su función `normalizar`, así que el backend habla siempre en
`snake_case`.

### Cafetería

```jsonc
{
  "id": "bienestar-pro",          // slug del nombre; NO editable
  "codigo": "01",                 // 2 dígitos; prefijo del id de sus reservas
  "nombre": "Bienestar Pro",
  "ubicacion": "Campus central",
  "imagen": "assets/img/bienestar-pro.jpg",
  "activa": true                  // booleano de verdad, no "TRUE"
}
```

### Carta de un día

```jsonc
{
  "fecha": "2026-08-19",
  "opciones": [ { "id": "ajiaco-santafereno", "nombre": "Ajiaco santafereño" } ]
}
```

La carta se indexa **solo por fecha**: las cuatro sedes sirven lo mismo.

### Reserva

```jsonc
{
  "id": "01-260823-001",          // ver «El identificador» más abajo
  "nombre": "Laura Camila Ardila",
  "telefono": "3001247856",       // diez dígitos, SIEMPRE cadena
  "cafeteria_id": "bienestar-pro",
  "fecha": "2026-08-19",
  "menu_id": "ajiaco-santafereno",
  "menu_nombre": "Ajiaco santafereño",   // copia, no referencia — ver §4
  "medio": "presencial",          // "presencial" | "telefono"
  "pago": "pagado",               // "pagado" | "debe"
  "estado": "activa",             // "activa" | "cancelada"
  "timestamp": "2026-08-19T12:06:00.000Z",
  "historial": [
    { "tipo": "creacion", "timestamp": "…", "cambios": [] },
    { "tipo": "modificacion", "timestamp": "…", "cambios": [
        { "campo": "menu", "antes": "Bandeja paisa", "despues": "Ajiaco" } ] },
    { "tipo": "cancelacion", "timestamp": "…", "cambios": [] }
  ]
}
```

`campo` es `"nombre"`, `"telefono"`, `"menu"`, `"medio"` o `"pago"`. `tipo` es `"creacion"`,
`"modificacion"` o `"cancelacion"`.

### El identificador de una reserva

    01-260823-001
    ▲   ▲      ▲
    │   │      └─ consecutivo de esa cafetería ESE día (3 dígitos)
    │   └──────── fecha AAMMDD
    └──────────── `codigo` de la cafetería (2 dígitos)

**Lo asigna el servidor, nunca el cliente.** El consecutivo depende de lo que
ya hay en la base de datos, y dos mostradores registrando a la vez calcularían
el mismo número. En Apps Script lo protege el bloqueo de script; en una base de
datos de verdad, la clave primaria y una transacción.

Tres reglas:

1. **El consecutivo es por cafetería y por día.** La primera reserva de la
   mañana en cada sede es la 001. El número suelto no identifica nada: por eso
   los tres campos van juntos.
2. **Nunca se reutiliza**, ni siquiera si la reserva se cancela. Se calcula
   sobre el **máximo existente**, no sobre la cantidad: si falta un número,
   contar daría uno ya usado y dos reservas compartirían identificador.
3. **Si pasara de 999, crece a cuatro dígitos.** Preferible a repetir.

Un identificador que no siga el formato —los de antes de este cambio— no debe
romper nada: la interfaz lo detecta y muestra el número vacío en vez de fallar.

### Medio de reserva y estado de pago

`medio` y `pago` son **obligatorios** y solo admiten los valores de arriba.
El servidor los valida además del formulario, y no por desconfianza del
navegador: «pagado» o «debe» es dinero, y un valor inventado por una petición
hecha a mano dejaría la contabilidad con un estado que ninguna pantalla sabe
pintar.

Ninguno tiene valor por defecto. En `pago`, uno preseleccionado acabaría
marcando como pagado lo que no lo está.

Una reserva anterior a estos campos llega sin ellos; la interfaz lo muestra
como «—» y obliga a elegir si se edita.

### Tipos que el frontend da por sentados

Estos cuatro han roto la pantalla al menos una vez. Que el backend los respete
no es cosmético:

| Campo | Debe llegar como | Si llega mal |
|---|---|---|
| `telefono` | **cadena** | Un número pierde ceros iniciales y `3001234567 !== "3001234567"` deja pasar duplicados |
| `activa` | **booleano** | La cadena `"FALSE"` es *truthy*: una cafetería cerrada aparecería abierta |
| `fecha` | **cadena `YYYY-MM-DD`** | Un `Date` serializado a UTC resta un día toda la tarde en Colombia |
| `opciones`, `historial` | **arreglo** | Si llegan como texto JSON, la interfaz pinta `[object Object]` o se rompe |

---

## 3. Las 14 acciones

### Cafeterías

| Acción | Params | Devuelve |
|---|---|---|
| `cafeterias.listar` | `incluir_inactivas?` | `Cafeteria[]` — sin el flag, solo las activas |
| `cafeterias.obtener` | `id` | `Cafeteria` |
| `cafeterias.crear` | `nombre`, `ubicacion?` | `Cafeteria` — el `id` y el `codigo` los asigna el servidor |
| `cafeterias.actualizar` | `id`, `nombre`, `ubicacion` | `Cafeteria` |
| `cafeterias.archivar` | `id` | `Cafeteria` con `activa:false` |
| `cafeterias.reactivar` | `id` | `Cafeteria` con `activa:true` |

### Menú

| Acción | Params | Devuelve |
|---|---|---|
| `menu.delDia` | `fecha` | `{fecha, opciones[]}` — sin carta, `opciones: []`, **no** un error |
| `menu.semana` | `lunes` | `{lunes, dias[7]}` — siempre siete, con `opciones: []` los vacíos |
| `menu.guardarSemana` | `lunes`, `dias[{fecha, platos[]}]` | `{lunes, dias[]}` |

### Reservas

| Acción | Params | Devuelve |
|---|---|---|
| `reservas.delDia` | `cafeteria_id`, `fecha` | `Reserva[]` **solo activas**, por orden de llegada |
| `reservas.crear` | `nombre`, `telefono`, `cafeteria_id`, `fecha`, `menu_id`, `medio`, `pago` | `Reserva` |
| `reservas.actualizar` | `id`, `nombre`, `telefono`, `menu_id`, `medio`, `pago` | `Reserva` |
| `reservas.cancelar` | `id` | `Reserva` con `estado:"cancelada"` |
| `reservas.buscar` | `desde`, `hasta`, `cafeteria_id?`, `estado?`, `texto?`, `limite?` | `{total, reservas[], resumen}` |

`reservas.actualizar` **no recibe `cafeteria_id` ni `fecha`**: no son editables,
y dejarlas fuera de la firma evita que una pantalla futura las cambie por
descuido.

#### El resumen de `reservas.buscar`

```jsonc
{
  "totales": { "total": 0, "activas": 0, "canceladas": 0,
               "dias_con_servicio": 0, "promedio_diario": 0 },
  "por_dia": [ { "fecha": "2026-08-19", "activas": 12, "canceladas": 1 } ],
  "por_cafeteria": [ { "cafeteria_id": "…", "nombre": "…",
                       "activas": 0, "canceladas": 0 } ],
  "por_plato": [ { "nombre": "Ajiaco santafereño", "total": 8 } ]
}
```

Cuatro reglas del resumen, todas con motivo:

1. **Se calcula en el servidor.** El administrador puede pedir un trimestre;
   mandar miles de filas al navegador para que sume es justo lo que no hay que
   hacer.
2. **`limite` recorta `reservas`, nunca el resumen ni `total`.** Si no, la
   pantalla diría «1.240 reservas» sobre una tabla de 500 que no suma eso.
   `limite: 0` significa «todas», y es lo que pide la exportación a CSV.
3. **`por_dia` incluye TODOS los días del rango**, también los que no tuvieron
   ni una reserva. Un hueco es información; omitirlo junta dos fechas lejanas
   en la gráfica como si fueran consecutivas.
4. **`por_plato` cuenta solo las activas.** Un consolidado de consumo que sume
   las canceladas manda a cocinar de más.

---

## 4. Reglas de negocio

**Van en el servidor, no en la pantalla.** La interfaz las repite para avisar
antes, pero la que manda es esta. Un backend que no las aplique deja entrar
datos que el resto del sistema da por imposibles.

| Regla | Código de error |
|---|---|
| Un móvil no puede tener **dos reservas activas** la misma fecha y cafetería | `RESERVA_DUPLICADA` |
| Al editar, la reserva **se excluye a sí misma** de esa comprobación | — |
| Una reserva **cancelada** no cuenta para el duplicado: se puede volver a reservar | — |
| El plato debe estar en la carta **de esa fecha** | `MENU_INVALIDO` |
| **Sábado y domingo no hay servicio**: ni reservas ni carta | `SIN_SERVICIO` |
| Guardar sin cambiar nada **no** escribe un asiento vacío | `SIN_CAMBIOS` |
| Una cancelada no se edita ni se cancela dos veces | `RESERVA_CANCELADA` |
| Dos platos con el mismo nombre el mismo día | `MENU_DUPLICADO` |
| El nombre de una cafetería nueva ya existe | `CAFETERIA_DUPLICADA` |
| `desde` posterior a `hasta`, o día fuera de la semana | `RANGO_INVALIDO` |
| Faltan campos obligatorios | `DATOS_INCOMPLETOS` |
| `medio` o `pago` ausentes, o con un valor fuera de la lista | `DATOS_INCOMPLETOS` |
| No existe la cafetería / la reserva | `CAFETERIA_NO_ENCONTRADA`, `RESERVA_NO_ENCONTRADA` |
| Acción no reconocida | `ACCION_DESCONOCIDA` |

### Tres invariantes que no se ven en las firmas

**El borrado es siempre lógico.** Cancelar una reserva o cerrar una cafetería
marcan un estado; no borran la fila. Borrar de verdad tiraría el historial del
caso que más interesa auditar —«reservó y luego canceló»— y dejaría sin
referencia a las reservas históricas de una sede cerrada.

**`menu_nombre` es una copia, no una referencia.** La reserva guarda el nombre
del plato tal como estaba ese día. Si mañana se corrige la carta, un reporte de
hace tres meses tiene que seguir diciendo lo que se sirvió entonces. Lo mismo
con `antes`/`despues` del historial: guardan el valor visible, no el `id`.

**`menu.guardarSemana` es atómico.** Si el jueves trae un plato repetido, no se
escribe ninguno de los siete días. No puede quedar media semana publicada.

### El historial lo escribe el servidor

Nunca el cliente. Es el registro de lo que de verdad pasó, y el navegador no
puede saberlo: dos personas editando la misma reserva verían cada una solo su
propio cambio. Toda reserva nace con su asiento de `creacion`.

**Lo que hoy le falta:** no dice **quién** hizo cada cambio, porque no hay
identidad de usuario. Cuando haya autenticación, el sitio donde añadirlo es un
campo `autor` en cada asiento.

---

## 5. El día de la migración

### Sacar los datos

Ejecuta `exportarTodo()` en el editor de Apps Script y copia el JSON del
registro. Trae las tres tablas con las fechas y los móviles como cadenas y las
columnas JSON ya deserializadas.

No exportes las pestañas a CSV a mano: `opciones` e `historial` llevan comas
dentro y se rompen.

### Un esquema relacional de partida

En Sheets, `historial` y `opciones` son JSON dentro de una celda porque una
hoja no tiene arreglos. **En una base de datos de verdad no deberían serlo:**

```sql
CREATE TABLE cafeteria (
  id          TEXT PRIMARY KEY,       -- slug: 'bienestar-pro'
  nombre      TEXT NOT NULL,
  ubicacion   TEXT DEFAULT '',
  imagen      TEXT DEFAULT '',
  activa      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE carta_dia (
  fecha       DATE PRIMARY KEY        -- una carta por día, para todo el campus
);

CREATE TABLE carta_opcion (
  fecha       DATE REFERENCES carta_dia(fecha) ON DELETE CASCADE,
  id          TEXT NOT NULL,          -- slug del nombre
  nombre      TEXT NOT NULL,
  orden       INT  NOT NULL,
  PRIMARY KEY (fecha, id)
);

CREATE TABLE reserva (
  id            TEXT PRIMARY KEY,
  nombre        TEXT NOT NULL,
  telefono      TEXT NOT NULL,        -- TEXT, no INTEGER. Ver §2
  cafeteria_id  TEXT NOT NULL REFERENCES cafeteria(id),
  fecha         DATE NOT NULL,
  menu_id       TEXT NOT NULL,
  menu_nombre   TEXT NOT NULL,        -- copia deliberada. Ver §4
  estado        TEXT NOT NULL DEFAULT 'activa'
                CHECK (estado IN ('activa','cancelada')),
  creada_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- La regla del duplicado, impuesta por la base de datos y no solo por el
-- código: es la única forma de que dos peticiones simultáneas no la burlen.
CREATE UNIQUE INDEX reserva_sin_duplicado
  ON reserva (cafeteria_id, fecha, telefono)
  WHERE estado = 'activa';

CREATE INDEX reserva_por_fecha ON reserva (fecha);

CREATE TABLE reserva_asiento (
  id          BIGSERIAL PRIMARY KEY,
  reserva_id  TEXT NOT NULL REFERENCES reserva(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('creacion','modificacion','cancelacion')),
  ocurrido_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  autor       TEXT                    -- pendiente: hoy no hay identidad
);

CREATE TABLE reserva_cambio (
  asiento_id  BIGINT NOT NULL REFERENCES reserva_asiento(id) ON DELETE CASCADE,
  campo       TEXT NOT NULL CHECK (campo IN ('nombre','telefono','menu')),
  antes       TEXT,
  despues     TEXT
);
```

**Ojo con la diferencia entre almacenamiento y contrato.** Aunque el historial
viva en dos tablas, la API tiene que seguir devolviéndolo **anidado dentro de
la reserva**, como en §2. El frontend no sabe nada de tablas.

El índice único parcial merece un párrafo aparte: hoy la regla del duplicado la
aplica el código, protegida por un bloqueo. Con una base de datos de verdad,
declararla en el esquema es más barato y más fiable — deja de depender de que
todos los caminos de escritura se acuerden de comprobarla.

### Qué se toca en el frontend

| Archivo | Qué |
|---|---|
| `js/config.js` | `API_BASE_URL` a la nueva URL |
| `js/services/httpClient.js` | Solo si el transporte cambia (headers, REST, auth) |
| `js/mock/` | Borrar la carpeta, y su `import` en `api.js` |

**Nada más.** Ni las páginas, ni `js/ui/`, ni `js/utils/`, ni el CSS.

### Comprobarlo

```bash
node pruebas/contrato.mjs https://mi-backend-nuevo/api --escribir
```

Verde = el backend cumple. Es la misma prueba que pasa el mock, así que no hay
discusión sobre si «funcionaba antes».

### Y entonces sí: autenticación

Lo que hoy es un pestillo de cliente (`ui/accesoAdmin.js`) tiene que pasar a
ser una sesión que el servidor valide, y el servidor debe **negarse a devolver
datos** sin ella. Mientras eso no exista, cualquiera con la URL del backend
puede leerlo y escribirlo todo. Es la deuda más importante del proyecto.
