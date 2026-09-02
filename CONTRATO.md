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

**Y con sesión.** Toda petición lleva `Authorization: Bearer <token>`. Una
sin token, o con uno caducado, responde `NO_AUTENTICADO`; una cuyo perfil no
tenga permiso para esa acción responde `NO_AUTORIZADO`. Las dos con HTTP 200
y el sobre de siempre, como cualquier otro error de negocio.

Esto es nuevo: el backend de Apps Script no pedía nada, y por eso quien tuviera
la URL leía y escribía todo el campus. Un backend que no exija sesión **no
cumple este contrato**.

### Las dos excepciones

`cafeterias.listar` y `app.contexto` se sirven **sin sesión**. La portada
enseña las cafeterías del campus antes de entrar, y para eso necesita las dos:
la lista y la fecha de trabajo.

Ninguna devuelve datos de nadie, y las dos cambian de forma sin sesión:

| Acción | Con sesión | Sin sesión |
|---|---|---|
| ~~`cafeterias.listar`~~ | ya NO es pública: `/reservas` exige sesión | — |
| `app.contexto` | `perfil` con nombre, rol y sede | `perfil: null` |

Una sede archivada es una decisión de administración, así que fiarse del
parámetro habría bastado para sacarla. Y `perfil: null` no es un hueco: es lo
que le dice a la pantalla que hay que ofrecer el acceso.

**Lo demás sigue cerrado.** Toda otra acción toca reservas, y una reserva
lleva el nombre y el móvil de una persona.

Una cuenta válida SIN fila en `perfil` recibe `NO_AUTORIZADO`, nunca
`NO_AUTENTICADO`. La diferencia no es cosmética: lo segundo la mandaría a
identificarse otra vez con unas credenciales que son buenas, en un bucle del
que no puede salir sola.

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
  "activa": true,                 // booleano de verdad, no "TRUE"
  "platos_fijos": ["Mini Lunch"]  // arreglo; productos permanentes de la sede
}
```

`platos_fijos` son los productos que esa sede ofrece **todos los días con
servicio**, haya carta publicada o no. No dependen del día, y por eso viven en
la cafetería y no en la carta.

### Carta de un día

```jsonc
{
  "fecha": "2026-08-19",
  "opciones": [ { "id": "ajiaco-santafereno", "nombre": "Ajiaco santafereño" } ]
}
```

La carta se indexa **solo por fecha**: todas las sedes sirven lo mismo. Lo que
varía por sede son los `platos_fijos` de arriba, que `menu.delDia` añade a la
carta cuando se le pasa `cafeteria_id`.

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

## 3. Las 45 acciones

### Sesión

| Acción | Params | Devuelve |
|---|---|---|
| `app.contexto` | — | `{hoy, permitir_fin_de_semana, aplicacion{nombre, version, fecha_version}, modulos[], perfil | null}` |

La acción que el backend anterior no podía tener. `hoy` es la fecha **según el
servidor**, en la zona de Colombia: sacarla del reloj del navegador hacía que
un equipo con la hora mal puesta registrara el día equivocado sin avisar.
`permitir_fin_de_semana` estaba duplicado en el frontend y en el backend y
había que acordarse de apagar los dos; ahora solo existe el del servidor.

`rol` es `"mostrador"`, `"auxiliar"` o `"admin"`. Es información para decidir
**qué pintar**, nunca qué permitir: eso lo vuelve a comprobar el servidor en
cada acción.

El `mostrador` lleva SIEMPRE una sede y solo ve la suya; los otros dos van
siempre SIN sede y las ven todas. Esa es la distinción con la que el código
decide alcance —`cafeteria_id` nulo o no—, y no la lista de roles: así un rol
nuevo sin sede no se queda fuera en silencio.

`auxiliar` es «Auxiliar Administrativo Cafeterías». Vive solo en el módulo de
pedidos: ve el historial de todas las sedes y ajusta las cantidades a lo que el
proveedor va a entregar de verdad. No anula, no toca el catálogo y no entra al
análisis.

### Cafeterías

| Acción | Params | Devuelve |
|---|---|---|
| `cafeterias.listar` | `incluir_inactivas?` | `Cafeteria[]` — sin el flag, solo las activas |
| `cafeterias.obtener` | `id` | `Cafeteria` |
| `cafeterias.crear` | `nombre`, `ubicacion?`, `platos_fijos?` | `Cafeteria` — el `id` y el `codigo` los asigna el servidor |
| `cafeterias.actualizar` | `id`, `nombre`, `ubicacion`, `platos_fijos`, `responsable_usuario_id?` | `Cafeteria` |
| `cafeterias.archivar` | `id` | `Cafeteria` con `activa:false` |
| `cafeterias.reactivar` | `id` | `Cafeteria` con `activa:true` |

### Menú

| Acción | Params | Devuelve |
|---|---|---|
| `menu.delDia` | `fecha`, `cafeteria_id?` | `{fecha, opciones[]}` — sin carta, `opciones: []`, **no** un error |
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

### Proveedores · módulo de pedidos

| Acción | Params | Devuelve |
|---|---|---|
| `proveedores.listar` | `incluir_inactivos?` | `Proveedor[]` — sin el flag, solo los activos |
| `proveedores.obtener` | `id` | `Proveedor` **con `productos[]`** |

Ninguna de las dos es pública, al revés que `cafeterias.listar`. Las sedes del
campus están en la señalización de la Universidad; a quién le compra Bienestar,
no. Ver §1.

`proveedores.obtener` devuelve el catálogo **dentro** del proveedor, no en una
llamada aparte: la pantalla de pedido necesita las dos cosas para dibujar el
formulario, y es la misma disciplina de un viaje por gesto que sigue
`reservas.buscar`. Los productos vienen en el orden de la PLANTILLA, no
alfabético: quien pide recorre la hoja con el dedo en el orden de siempre.

`tipo_documento` decide qué columnas tiene el formulario y el documento
impreso: `FBE.04` —solicitada, devuelta, adicional y total de salida— y
`FBE.34`, que solo lleva cantidad pedida.

**Hoy todos los proveedores son `FBE.04`.** Se unificó el 1 de septiembre de
2026: la hoja institucional que se firma es una sola, y el histórico se
reescribió para que un pedido viejo se reimprima igual que uno nuevo. El
`FBE.34` NO se ha borrado —sigue siendo un valor válido, sigue teniendo su
plantilla en `Documento.tsx` y se puede elegir desde el panel— pero hoy no lo
usa nadie. Ver `supabase/17-observaciones-y-formato-unico.sql`.

Esa unificación deja el par «almacén interno / proveedor externo» sin poder
leerse del tipo de documento, y **no hay ningún otro campo que lo diga**. Las
pantallas que lo enseñaban dejaron de hacerlo antes que llamar almacén de la
Universidad a Ramo o a Coca-Cola.

### Pedidos

| Acción | Params | Devuelve |
|---|---|---|
| `pedidos.crear` | `proveedor_id`, `cafeteria_id`, `fecha_elaboracion`, `fecha_entrega?`, `hora_entrega?`, `lugar_entrega?`, `observaciones?`, `lineas[]` | `Pedido` con sus `lineas[]` |
| `pedidos.obtener` | `id` | `Pedido` con sus `lineas[]` |
| `pedidos.buscar` | `desde`, `hasta`, `proveedor_id?`, `cafeteria_id?`, `estado?`, `limite?` | `{total, pedidos[]}` — la FICHA de cada uno, sin sus líneas |
| `pedidos.actualizar` | `id`, `fecha_entrega?`, `hora_entrega?`, `lugar_entrega?`, `observaciones?`, `lineas[]` | `Pedido` — según la matriz de abajo |
| `pedidos.enviar` | `id` | `Pedido` en `enviado`, y avisa a administración |
| `pedidos.confirmar` | `id` | `Pedido` en `confirmado`. Lo cierra, y NO manda correo |
| `pedidos.anular` | `id` | `Pedido` en `anulado` |
| `pedidos.eliminar` | `id` | El `Pedido` que **ya no existe**. Solo `admin` |

### Control de salidas

**«Salida» aquí NO es la del FBE.04.** En pedidos es lo que sale del almacén
hacia la cafetería; aquí es lo que sale de la cafetería hacia quien come. Son
dos cosas distintas y ninguna acción las cruza.

| Acción | Params | Devuelve |
|---|---|---|
| `salidas.guardar` | `fecha`, `cafeteria_id`, `lineas[]` | El `Cierre` con sus `lineas[]` |
| `salidas.obtener` | `fecha`, `cafeteria_id` | El `Cierre`, o **`null`** si esa sede no ha cerrado |
| `salidas.buscar` | `desde`, `hasta`, `cafeteria_id?` | La FICHA de cada cierre, con sus totales |
| `salidas.dia` | `fecha` | El día entero: productos y las cinco sedes. Solo sin sede propia |
| `salidasProductos.listar` | `solo_activos?` | `ProductoSalida[]` |
| `salidasProductos.crear` / `.actualizar` | `nombre` (y `id` al corregir) | `ProductoSalida` |
| `salidasProductos.archivar` / `.reactivar` | `id` | `ProductoSalida` |

Cada línea es `{producto_id, ventas_registradas, salidas}`, las dos cifras
**enteras** y **anulables**. `null` NO es cero: cero dice «se contó y no hubo
ninguno» y vacío dice «no se contó». Un renglón con las dos vacías se descarta
—no es un renglón, es una casilla que no se tocó— y uno con un cero SÍ entra.

**No se manda `diferencia`**: es una columna generada, la calcula Postgres como
`salidas − ventas_registradas`. Positiva significa que salió más de lo que la
caja registró.

**No se manda el responsable.** Lo resuelve el servidor desde
`cafeteria.responsable_usuario_id` y lo copia dentro del cierre. Quien teclea
puede ser administración corrigiendo un cierre ajeno, y entonces poner su
propio nombre diría que estuvo en un mostrador donde no estuvo — eso se guarda
aparte, en `guardado_por`.

**Guardar y corregir son la misma acción.** `salidas.guardar` dos veces sobre
el mismo (fecha, sede) corrige en vez de duplicar: lo impone el índice único
`salida_cierre_unico`, y las líneas se reemplazan enteras porque el formulario
es la hoja entera.

**`salidas.obtener` devolviendo `null` no es un error**, y por eso no hay
`SALIDA_NO_ENCONTRADA`: un cierre que no existe es el formulario en blanco de
esa sede ese día, que es con lo que empieza cada mañana.

`salidas.dia` **cruza sedes por definición** —el control consiste en verlas
juntas— así que no es del mostrador, por lo mismo que `pedidos.analisis`.
Devuelve TODAS las sedes en servicio, hayan cerrado o no: las que no llevan
`cerrado: false` y ninguna línea. Omitirlas convertiría un documento de control
en uno que solo enseña lo que salió bien.

En `salidas.guardar`, `.obtener` y `.buscar`, **`cafeteria_id` solo lo obedece
quien no tiene sede propia**: al mostrador se le impone la suya. Es la misma
regla de `sedePermitida` de siempre.

### El panel del módulo · solo `admin`

| Acción | Params | Devuelve |
|---|---|---|
| `proveedores.crear` | `nombre`, `tipo_documento`, `categoria_fija?` | `Proveedor` — el `id` sale del nombre |
| `proveedores.actualizar` | `id`, `nombre`, `tipo_documento`, `categoria_fija?` | `Proveedor` |
| `proveedores.archivar` / `.reactivar` | `id` | `Proveedor` con `activo` cambiado |
| `productos.listar` | `proveedor_id` | `Producto[]` — **incluye los archivados** |
| `productos.crear` | `proveedor_id`, `productos[]` | `Producto[]` — se añaden al final |
| `productos.actualizar` | `id`, `nombre`, `unidad_medida`, `categoria?`, `codigo?` | `Producto` |
| `productos.archivar` / `.reactivar` | `id` | `Producto` |
| `productos.mover` | `id`, `direccion` (`subir`|`bajar`) | `Producto` |
| `cuentas.listar` | — | `{nombre, rol, cafeteria_id, cafeteria_nombre}[]` |

`productos.listar` se diferencia de `proveedores.obtener` en una cosa: aquella
sirve el formulario de pedido y solo puede enseñar lo que se puede pedir; esta
sirve el panel, donde hay que ver lo archivado para poder reactivarlo.

**Nunca se borra, siempre se archiva.** Los pedidos apuntan al proveedor con
una clave foránea, así que borrarlo dejaría documentos sin emisor; y el nombre
del producto está copiado en cada línea, así que archivarlo no altera ni un
pedido viejo.

`productos.crear` acepta uno o muchos porque son la misma operación con
distinto número de filas. El `orden` lo asigna el SERVIDOR —`MAX(orden) + 1`,
dentro de `crear_productos`— y no llega en los parámetros: calcularlo en el
cliente deja una ventana en la que otra alta se lleva el mismo número.

`productos.mover` con el producto ya en un extremo **no es un error**: devuelve
el producto sin tocarlo. Así la pantalla no tiene que llevar la cuenta de dónde
empieza y acaba la lista.

`cuentas.listar` **no devuelve correos**. Se podrían sacar de `auth.users` con
la clave de servicio —`notificaciones.ts` lo hace para poder enviar— pero no
hacen falta para responder «quién tiene acceso», y un dato personal que no hace
falta no se sirve.

`pedidos.crear` **no recibe `tipo_documento`**: lo dice el proveedor. Mandarlo
habría permitido pedirle a Coca-Cola con la plantilla del almacén.

Cada línea es `{producto_id, cantidad_solicitada, cantidad_devuelta?,
cantidad_adicional?}`. Las dos últimas **solo cuentan en un FBE.04**; en un
FBE.34 se descartan aunque lleguen, porque la plantilla no tiene dónde
imprimirlas. Y **no se manda `cantidad_total_salida`**: es una columna
generada, la calcula Postgres como `solicitada − devuelta + adicional`.

El texto que se imprime —nombre, código y unidad de cada producto— **no viaja
en los parámetros**: lo copia `crear_pedido` desde el catálogo. El cliente dice
qué producto y cuánto; qué dice el papel lo decide la base de datos.

`observaciones` es lo que sale impreso en el recuadro «Observaciones» de la
hoja. Es opcional, se recorta por los extremos y **no puede pasar de 1000
caracteres**: lo que va ahí cabe en un recuadro de una hoja carta, y un texto
más largo empujaría las firmas a una segunda página. El tope está escrito tres
veces —el CHECK `pedido_observaciones_cabe`, `MAX_OBSERVACIONES` en `api/` y el
`maxLength` del formulario— y la que manda es la primera.

En `pedidos.actualizar`, **omitir `observaciones` no es lo mismo que mandarlo
vacío**: omitirlo las deja como estaban y `''` las borra. La pantalla manda
siempre el campo, así que vaciar el área de texto las vacía de verdad; una
llamada futura que solo cuadre cantidades no borra de paso lo que alguien
anotó.

Las observaciones se corrigen con **la misma matriz** que las cantidades —la de
más abajo—, y no con una propia: son parte del mismo documento y se descubre
que faltan en el mismo momento, al revisarlo impreso.

En un `FBE.04`, `pedidos.actualizar` **no escribe `fecha_entrega` ni
`hora_entrega`: las conserva**. Esa plantilla no tiene esas casillas, así que
el formulario no las ofrece y manda `null`; escribir ese `null` borraría, al
primer guardado, la fecha de entrega que traen dentro los pedidos heredados del
`FBE.34`. Lo decide el tipo del pedido, no lo que llegue por el cable.

`pedidos.buscar` devuelve la **ficha** de cada pedido —fecha, proveedor, sede,
estado y cuántos renglones lleva—, no sus líneas: un listado de treinta pedidos
con todos sus productos dentro sería un cuarto de megabyte para pintar treinta
filas. Las líneas se piden con `pedidos.obtener` al abrir uno.

`total` es el del RANGO y puede ser mayor que `pedidos.length` si se topó el
límite. Es lo que permite decir «se muestran los 500 más recientes» en vez de
cortar la lista en silencio.

En `pedidos.crear` y en `pedidos.buscar`, **`cafeteria_id` solo lo obedece un
`admin`**: a un mostrador se le impone la suya, mande lo que mande. Es la misma
regla de `sedePermitida` que ya usan las reservas.

#### El ciclo de un pedido

```
creado ──enviar──► enviado ──confirmar──► confirmado
   │                   │                        │
   └──anular──► anulado ◄───┴────────────────────┘
```

Un pedido nace **`creado`**: quien lo elabora lo revisa como documento y lo
corrige antes de que exista para nadie más. `pedidos.actualizar` no recibe
`proveedor_id` ni `cafeteria_id` —cambiar el proveedor invalidaría todos los
renglones—.

Al **enviar** se avisa a las cuentas con rol `admin`, que son quienes imprimen
y firman. **El aviso no puede tumbar el envío**: se manda después de cambiar el
estado y sus fallos se registran sin deshacer nada.

**`confirmado`** es el pedido ya listo. Existe porque lo que se pide no
siempre es lo que el proveedor puede traer: entre enviar y confirmar hay una
ventana en la que el auxiliar administrativo cuadra las cantidades con lo que
va a llegar de verdad, y `pedidos.confirmar` la cierra.

**Pasar por ahí no implica que se haya cambiado nada.** Muchos pedidos llegan
enteros y se confirman tal cual: la modificación es opcional y ocurre antes.

No manda correo, al revés que enviar: lo hace quien ya estaba mirando el
pedido.

#### Quién edita qué

| estado | `mostrador` | `auxiliar` | `admin` |
|---|---|---|---|
| `creado` | su sede | sí | sí |
| `enviado` | no | sí | sí |
| `confirmado` | no | no | sí |
| `anulado` | no | no | no |

Un **anulado no lo edita nadie**, ni administración: es un pedido que se decidió
que no existe, y editarlo sería resucitarlo por la puerta de atrás.

#### Anular y eliminar no son lo mismo

| | `pedidos.anular` | `pedidos.eliminar` |
|---|---|---|
| Quién | `mostrador` el suyo en `creado`; `admin` en cualquiera | **solo `admin`** |
| Qué pasa | el pedido queda en `anulado` | la fila se borra de la base |
| Historial | sigue, y con el asiento de quién lo anuló | **desaparece**: `pedido_evento` cae por CASCADE |
| Análisis | sigue saliendo, como anulado | deja de existir |
| Rastro | `pedido_evento` | `registro`, y solo eso |

**Anular es la respuesta de negocio** y es lo que hay que usar casi siempre: el
pedido existió, se decidió que no valía, y queda diciéndolo. **Eliminar es una
herramienta de limpieza** — el pedido de prueba, el duplicado de un doble clic,
lo que nunca debió estar en el histórico. Anular eso lo dejaría en el listado
para siempre explicando algo que no pasó.

`pedidos.eliminar` **queda anotado en `registro`** con el proveedor, la sede, la
fecha, el estado y cuántos renglones llevaba, leídos ANTES de borrar.
`09-admin-general.sql` dice que el registro no anota pedidos porque ya tienen su
propio rastro; esta es la excepción exacta que esa frase describe al revés, y la
razón por la que hay que mantenerla: un pedido borrado deja de tener rastro
propio, porque su rastro se borra con él. Sin ese asiento, un pedido
desaparecido sería indistinguible de uno que nunca existió.

**No hay guarda de estado.** Se puede eliminar un `confirmado` igual que un
`anulado`. Lo que separa el clic del borrado es el modal, que enseña el número,
el proveedor, la sede, la fecha, los renglones y el estado: un «¿seguro?»
genérico se acepta sin leer, y eso sí se lee.

Auxiliar administrativo: **ni una ni otra**. Su encargo es cuadrar cantidades
con lo que el proveedor va a traer, no dar de baja pedidos.

La matriz está escrita tres veces —`puede_editar_pedido` en SQL, `EDITORES` en
`api/`, y los botones del documento— y la que manda es la primera. Las otras dos
existen para dar un mensaje que explique por qué, y para no ofrecer un botón que
va a fallar.

No hay camino de vuelta: un enviado no regresa a creado y un confirmado no
regresa a enviado, porque a esas alturas puede haber papel circulando con ese
contenido. Se anula y se elabora otro. Uno recién creado lo anula quien lo hizo;
en cuanto se envió, solo administración.

#### El historial del pedido

Cada creación, edición, envío, confirmación y anulación deja un asiento en
`pedido_evento`, y `pedidos.obtener` los devuelve dentro del propio `Pedido`,
en `eventos[]`, del más reciente al más antiguo. Van ahí y no en una acción
aparte por la disciplina de un viaje por gesto: son unos pocos por pedido.

Cada asiento copia el **nombre y el rol de quien lo hizo en ese momento**, igual
que `producto_nombre` en las líneas: si mañana a alguien le cambian el rol, el
historial tiene que seguir diciendo con qué sombrero hizo aquello.

Los asientos de los pedidos que ya existían al crear la tabla llegan **sin
autor**: la fecha estaba guardada y el autor no. Se dice así en la pantalla en
vez de dejar el hueco en blanco.

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
| No existe el proveedor / el pedido | `PROVEEDOR_NO_ENCONTRADO`, `PEDIDO_NO_ENCONTRADO` |
| Pedido sin productos, producto ajeno al proveedor, sede cerrada o proveedor de baja | `PEDIDO_INVALIDO` |
| En `pedidos.buscar`: `desde` posterior a `hasta`, o rango de más de un año | `RANGO_INVALIDO` |
| Editar o confirmar un pedido en un estado que no lo permite | `PEDIDO_INVALIDO` |
| Tocar un pedido de otra cafetería, o anular un confirmado sin ser `admin` | `NO_AUTORIZADO` |
| El nombre de un proveedor nuevo ya existe | `PROVEEDOR_DUPLICADO` |
| No existe el producto | `PRODUCTO_NO_ENCONTRADO` |
| Un FBE.34 con categoría, o una categoría fuera de las tres del FBE.04 | `DATOS_INCOMPLETOS` |
| Acción no reconocida | `ACCION_DESCONOCIDA` |
| Falta el token de sesión, o caducó | `NO_AUTENTICADO` |
| La sesión es válida pero su perfil no puede hacer eso | `NO_AUTORIZADO` |

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

**Ya ocurrió, y los pasos están en `MIGRACION.md`.** Lo que había aquí era un
esquema relacional de partida y una lista de archivos que tocar; las dos cosas
existen ahora de verdad y en su sitio:

| Lo que decía esta sección | Dónde está ahora |
|---|---|
| «Un esquema relacional de partida» | `supabase/01-esquema.sql`, ejecutable, con las diferencias explicadas en sus comentarios |
| «Sacar los datos» | `supabase/importar.mjs`, que además comprueba el volcado antes de escribir |
| «Qué se toca en el frontend» | El frontend se reescribió entero en `src/`; `legado/` conserva el anterior |
| «Y entonces sí: autenticación» | `api/_nucleo/sesion.ts` y `supabase/02-rls.sql` |

Tres cosas del borrador salieron mal y conviene dejarlas anotadas, porque son
el tipo de detalle que un esquema escrito de memoria siempre falla:

- **Le faltaba `codigo` en `cafeteria`.** Sin él no se puede construir el
  identificador de una reserva.
- **Le faltaban `medio` y `pago` en `reserva`**, y por tanto también en el
  `CHECK` de `reserva_cambio.campo`. El borrador es anterior a que existieran.
- **Le faltaba `platos_fijos`.** La carta por sede se añadió después.

### Comprobarlo

```bash
node pruebas/contrato.mjs https://mi-backend/api --token=<jwt> --escribir
```

Verde = el backend cumple. Es la misma prueba que pasaron el mock y Apps
Script, así que no hay discusión sobre si «funcionaba antes».

El token tiene que ser de un perfil `admin`: el contrato ejercita cancelar,
buscar y guardar la carta, que un perfil de mostrador tiene prohibidas.
