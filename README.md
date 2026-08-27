# reservasCafeterias · UIS

Prototipo web para que **el personal de las cafeterías** de la
**Universidad Industrial de Santander** registre y consulte las reservas de
almuerzo del día.

### Quién lo usa

Es una herramienta interna, **no una página para los comensales**. Tiene dos
públicos y dos pantallas:

| | Quién | Dónde | Qué hace |
|---|---|---|---|
| **Mostrador** | Personal de cafetería | `index.html` → `reserva.html` | Registra y corrige las reservas **de hoy**, de **su** cafetería, y envía el ticket. **No cancela** |
| **Administración** | Coordinación / Bienestar | `admin.html` | Consulta el **histórico** de todas las sedes, consolida, exporta y mantiene el catálogo |

En la de mostrador, quien la abre es quien atiende, y anota la reserva a nombre
de otra persona. Eso explica varias decisiones que de otro modo parecerían
arbitrarias:

- Los textos dicen «registrar reserva», no «reserva tu almuerzo», y los
  mensajes hablan de la persona en tercera persona.
- Los campos del formulario llevan `autocomplete="off"`: el navegador
  ofrecería los datos de quien teclea —el empleado— y no los del comensal, en
  un formulario que se rellena decenas de veces al día con datos ajenos.
- La tabla muestra el **móvil de contacto** de cada reserva, que es lo que la
  cafetería necesita para avisar a alguien. En una página pública eso sería un
  problema de privacidad; en una pantalla de mostrador es el dato útil.
- Cualquier reserva se puede editar desde la tabla, porque quien corrige un
  nombre mal escuchado es el personal, no el comensal.

HTML + CSS + JavaScript vanilla con módulos ES nativos. **Sin framework, sin
build y sin ninguna dependencia en lo que llega al navegador**: se sirve la
carpeta por HTTP y funciona. La única dependencia del repositorio es `jsdom`,
y solo la usan las pruebas.

---

## Cómo abrirlo

Los módulos ES **no funcionan con `file://`** (el navegador los bloquea por
CORS). Hay que servir la carpeta por HTTP:

```powershell
npx serve .
# o, si hay Python:
python -m http.server 8000
```

En VS Code también sirve la extensión **Live Server** (clic derecho sobre
`index.html` → *Open with Live Server*).

Luego: `http://localhost:3000` (o el puerto que indique el comando).

---

## Pruebas

**Una sola orden.** Antes de tocar nada y después de tocar algo:

```bash
npm test
```

Eso hace dos cosas: `bash pruebas/sincroniza.sh` prepara `pruebas/banco/` y
`node pruebas/ejecutar.mjs` corre las 23 suites y suma. Salida esperada:

```
✔ test            36 ok   · la capa de datos: mock → servicios
✔ dom             94 ok   · las páginas completas en jsdom
…
  603 comprobaciones · 0 fallos
```

Una sola suite, mientras se arregla algo concreto:

```bash
node pruebas/ejecutar.mjs ticket
```

La primera vez hace falta `npm install` (trae **jsdom**, la única dependencia,
y solo de pruebas). **La aplicación no usa nada de `node_modules`**: se sirve
la carpeta por HTTP y funciona. Si `node_modules` molesta en la sincronización
de OneDrive, se puede excluir esa carpeta; basta con volver a instalarla.

### Qué se prueba y con qué

| Cómo | Suites | Qué comprueban |
|---|---|---|
| **Sin navegador** | `test`, `cancelar`, `admin`, `identificador`, `fijos`, `opciones` | La capa de datos: mock → servicios |
| **`Codigo.gs` en memoria** | `appsscript`, `columnas`, `reparacion`, `cache`, `lecturas` | El backend entero, sin desplegarlo |
| **Frontend real ↔ backend real** | `integracion` | Que el uno entienda al otro |
| **Páginas en jsdom** | `dom`, `carga`, `resumen`, `ticket`, `viajes`, `tarjetas`, `acceso` | La interfaz, operándola de verdad |
| **Reglas y contrato** | `contrato`, `finde`, `interruptor`, `imports` | Lo que no puede romperse nunca |

Dos piezas sostienen todo esto:

- **`simulaAppsScript.mjs`** simula las APIs de Google —`SpreadsheetApp`,
  `LockService`, `CacheService`…— y ejecuta `apps-script/Codigo.gs` **tal
  cual**, sin copiarlo ni adaptarlo. Por eso una prueba que pasa aquí dice
  algo real sobre el backend desplegado.
- **`fechaFija.mjs`** congela «hoy». Sin eso, las suites se comportarían
  distinto en fin de semana —no hay servicio— y una prueba que pasa o falla
  según el día en que se ejecuta no sirve de nada. Se importa **la primera**
  en cada suite.

`pruebas/banco/` es **contenido generado**: una copia del proyecto con el mock
forzado, más una segunda copia (`banco/js-api/`) idéntica salvo una línea, la
que elige el transporte. Se borra y se rehace en cada ejecución; **no se edita
a mano**.

### Dos medidas, no dos impresiones

Dos suites no comprueban que algo funcione, sino **cuánto cuesta**, porque
«va lento» no es accionable y un número sí:

- **`lecturas`** cuenta cuántas veces lee la hoja cada acción del backend.
- **`viajes`** cronometra cuántos viajes al servidor cuesta cada gesto de la
  pantalla, con latencia simulada.

Si alguna sube, la regresión lo dice antes de que se note en el mostrador.

---

## Estructura

```
reservasCafeterias/
├── index.html                 Inicio: las cafeterías activas
├── reserva.html               Plantilla única, lee ?cafeteria=<id>
├── admin.html                 Módulo de administración (3 pestañas)
│
├── CLAUDE.md                  Contexto que se carga solo en cada sesión
├── CONTRATO.md                LO QUE DEBE CUMPLIR CUALQUIER BACKEND
├── package.json               "type": module + jsdom para las pruebas.
│                              LA APLICACIÓN NO USA NADA DE node_modules
│
├── apps-script/
│   └── Codigo.gs              BACKEND: pegar en Apps Script (no se sirve)
│
├── pruebas/                   ← 23 suites · ~600 comprobaciones
│   ├── ejecutar.mjs           EL CORREDOR: las corre todas y suma
│   ├── sincroniza.sh          Prepara banco/ (copia con el mock forzado)
│   ├── contrato.mjs           CONTRATO.md, ejecutable
│   ├── integracion.mjs        El frontend REAL contra el backend REAL
│   ├── simulaAppsScript.mjs   Google simulado: ejecuta Codigo.gs en memoria
│   ├── fechaFija.mjs          Congela «hoy» para que no dependan del día
│   ├── vista*.mjs             Generan vistas previas HTML, no son pruebas
│   └── banco/                 GENERADO por sincroniza.sh. No editar a mano
│
├── assets/img/logo-uis.webp   Logo institucional
│
├── css/
│   ├── base.css               Reset + variables de diseño (:root)
│   ├── componentes.css        Marca, botón, tarjeta, tabla, modal, campos
│   ├── paginas.css            Cabecera, pie, index, reserva, móvil
│   └── admin.css              Solo el módulo de administración
│
└── js/
    ├── config.js              ← INTERRUPTOR: FUENTE_DATOS y API_BASE_URL
    │
    ├── services/              ← CAPA DE DATOS (la única que cambia al migrar)
    │   ├── api.js             Selector de transporte + ErrorServicio + pedir()
    │   ├── httpClient.js      fetch al backend real ← EN USO
    │   ├── cafeteriasService.js
    │   ├── menuService.js
    │   └── reservasService.js
    │
    ├── mock/                  ← DATOS SIMULADOS (se borra entera al migrar)
    │   ├── mockApi.js         Enrutador que imita el contrato de Apps Script
    │   ├── cafeterias.js
    │   ├── menuSemanal.js
    │   └── reservas.js
    │
    ├── ui/                    ← INTERFAZ (no conoce el mock ni el fetch)
    │   ├── dom.js             Helpers, bloques de estado, crearSVG
    │   ├── tarjetaCafeteria.js
    │   ├── tablaReservas.js        Tabla del mostrador
    │   ├── resumenDelDia.js        Consolidado en tarjetas, sobre la tabla
    │   ├── modalTicket.js          Enseña el ticket, copiar y WhatsApp
    │   ├── modalReserva.js         Comportamiento del formulario
    │   ├── modalConfirmacion.js    Confirmar acciones destructivas
    │   ├── accesoAdmin.js         Pestillo de admin.html (no es seguridad)
    │   ├── marcadoModalReserva.js  Su marcado, compartido por las 2 páginas
    │   ├── graficas.js             SVG a mano: columnas, barras, indicadores
    │   ├── adminReservas.js        Tabla de detalle del administrador
    │   ├── adminConsolidado.js     Indicadores + gráficas + tablas de totales
    │   └── adminCatalogo.js        Cafeterías y carta semanal
    │
    ├── utils/
    │   ├── fechas.js          Rangos, semanas, formatos
    │   ├── telefono.js        Normaliza y formatea el móvil
    │   ├── idReserva.js       El identificador 01-260823-001
    │   ├── ticket.js          Genera el ticket de confirmación
    │   ├── texto.js           Slugs y búsqueda sin acentos
    │   ├── csv.js             Exportación que Excel abre bien
    │   └── url.js
    │
    ├── paginaInicio.js        Entrada de index.html
    ├── paginaReserva.js       Entrada de reserva.html
    └── paginaAdmin.js         Entrada de admin.html
```

### La regla que sostiene todo

**La UI nunca importa de `js/mock/`.** Solo llama a funciones de
`js/services/`. Un solo archivo del proyecto —`js/services/api.js`— sabe que
el mock existe.

```
paginaReserva.js  →  reservasService.js  →  api.js  →  mockApi.js   (hoy)
                                                    ↘  httpClient.js (mañana)
```

---

## Flujo de la pantalla de mostrador

**`index.html`** pide `getCafeterias()` y pinta una tarjeta por cafetería. Cada
tarjeta enlaza a `reserva.html?cafeteria=<id>`.

**`reserva.html`** lee el `id` de la URL y:

1. **Tres consultas a la vez** —`getCafeteria(id)`, `getReservasDelDia(id)` y
   `getMenuDelDia(id)`— con `Promise.allSettled`. Ninguna depende de las
   otras, y cada viaje a Apps Script cuesta más de un segundo: encadenarlas
   triplicaba la espera. Si hoy es **sábado o domingo**, aviso de día sin
   servicio, botón deshabilitado y nada de tabla.
2. Se pinta el **consolidado del día** en tarjetas y debajo la tabla
   (N.º · Nombre · Menú · Móvil · Medio · Pago · Editar · Ticket).
3. **Registrar reserva** abre el modal **al instante**: la carta ya está en
   memoria desde el paso 1, así que no consulta nada.
4. Al confirmar: `crearReserva(...)`. El modal se cierra en cuanto el servidor
   responde y la fila se pinta **con lo que el servidor devolvió**; el
   refresco va por detrás sin hacer esperar a nadie.
5. **Editar** en una fila abre el mismo modal, ya relleno y con el historial.
6. **Ticket** en una fila abre el comprobante de esa reserva, con «Copiar» y
   «Abrir en WhatsApp».

**Desde el mostrador NO se cancela.** Anular una reserva es una decisión
administrativa y vive en `admin.html`, detrás de su clave. La regla no depende
de que la pantalla se acuerde: `paginaReserva.js` no pasa el callback
`alCancelar`, y sin él el modal esconde el botón.

La fila ofrece **«Editar» y «Ticket»**, las dos cosas que se hacen sobre una
reserva concreta y ninguna destructiva. Cancelar, en administración, vive un
nivel más adentro —dentro del modal— por lo mismo: no debe estar a un clic de
distancia en una lista de veinte filas, donde se pulsa la de al lado sin
querer.

### Por qué la pantalla se adelanta al servidor

Antes se releía la tabla entera tras cada escritura, «para que lo que se ve
sea siempre lo que devolvió el servidor». Suena bien y costaba un viaje
completo con el modal abierto y el mostrador esperando.

Ahora la fila se pinta con **la reserva que devolvió el servidor**, que ya
está confirmada: no es una suposición del cliente, es la respuesta. La
relectura va detrás, sin bloquear, para recoger lo que hayan hecho otros.

Eso abre una carrera —registrar una segunda reserva antes de que vuelva el
refresco de la primera, que la borraría de la pantalla— y se cierra con un
sello: `estado.escrituras` cuenta los cambios propios, y un refresco que llega
con el sello viejo se descarta.

### El consolidado del día

Encima de la tabla, dos grupos de tarjetas pequeñas: **cuántos de cada plato**
y **cómo va el cobro**. Responden a las dos preguntas que se hacen en voz alta
detrás de un mostrador, y se calculan **en el navegador** sobre las reservas
que la página ya tiene: no cuestan ni un viaje.

Hay una tercera tarjeta, **«Sin registrar»**, que solo aparece si hay reservas
sin cobro anotado —las anteriores a que existiera el campo—. Sin ella,
«Pagado + Debe» no sumaría el total, y un consolidado cuyas partes no cuadran
es peor que no tener consolidado.

### Confirmar antes de destruir

Cancelar una reserva, cerrar una cafetería o descartar una carta a medio
escribir pasan por `ui/modalConfirmacion.js`, un `<dialog>` con el mismo
lenguaje visual que el formulario de reserva. Sustituye al `confirm()` del
navegador, que se ve como una alerta del sistema, dice «Aceptar» sin decir a
qué, y **bloquea el hilo** mientras está abierto.

Devuelve una promesa: `if (confirm(...))` pasa a ser `if (await confirmar(...))`.

Tres detalles que importan en una acción destructiva:

- **El botón dice qué hace** —«Sí, cancelar la reserva»— y no «Aceptar». Quien
  lee solo los botones tiene que poder decidir.
- **El foco arranca en «Volver»**, no en el botón rojo: un Enter reflejo sobre
  un diálogo recién aparecido no debe borrar nada.
- **Escape y el clic en el fondo cuentan como «no»**. El diálogo resuelve en un
  único punto —el evento `close`—, así que ninguna forma de cerrarlo puede
  dejar la promesa colgada ni ejecutar la acción por accidente.

`.boton--peligro` existe solo para ese botón: en la fila de una tabla, un rojo
repetido diez veces deja de significar «cuidado» y pasa a ser decoración.

### Un solo modal para crear y para editar

Los campos son los mismos, así que duplicar el formulario garantizaría que un
día se corrija la validación en uno y no en el otro. `ui/modalReserva.js` abre
en modo creación con `abrir({ menu })` y en modo edición con
`abrir({ menu, reserva })`; lo que cambia es el título, la nota, el texto del
botón, los valores de partida y si se muestra el historial.

---

## Ticket de confirmación

Cada reserva puede enviarse como comprobante por WhatsApp. Se abre con
**«Ticket»** desde cualquier fila, tanto en mostrador como en administración,
y también desde el aviso de «Reserva registrada» justo después de crearla.

```
================================
      RESERVA DE ALMUERZO
   AUTOSERVICIO BIENESTAR PRO
================================

          RESERVA N.º
         01-260825-002

  Martes, 25 de agosto de 2026

--------------------------------
NOMBRE              Daniel Durán
MÓVIL               313 204 7407
--------------------------------
MENÚ DEL DÍA
BROCHETAS DE CARNE
--------------------------------
MEDIO                 PRESENCIAL
PAGO                      PAGADO
--------------------------------

    PRESENTA ESTE TICKET AL
      RECLAMAR TU ALMUERZO

     GRACIAS POR TU VISITA

================================
```

### Texto, no imagen

`utils/ticket.js` genera **texto monoespaciado de 32 columnas**, no un PNG.
Tres razones, por orden de peso:

1. WhatsApp tiene formato monoespaciado nativo (` ``` `), así que el texto ya
   se ve como un recibo sin depender de nada más.
2. Un texto viaja por cualquier vía —la API de WhatsApp Business, un enlace
   `wa.me`, un SMS, un correo—; una imagen hay que alojarla en algún sitio y
   ese sitio hay que mantenerlo.
3. Si algún día hace falta el PNG, se dibuja en un canvas a partir de estas
   mismas líneas. El texto es el paso previo de las dos rutas.

32 es además el ancho de una impresora térmica de 58 mm, así que si algún día
se imprime, sale sin tocar nada.

**Ninguna línea puede pasarse del ancho**: una sola descuadra el recibo
entero, no solo esa fila. Por eso `par()` y `envolver()` parten los valores
largos —un nombre completo, un plato de cinco palabras— y la suite `ticket`
lo comprueba en todos los casos límite.

El nombre de la sede sale **tal como está guardado**, sin componerlo aquí: si
el ticket debe decir «Autoservicio Bienestar Pro», eso es lo que tiene que
llamarse la cafetería, o el ticket diría algo distinto del inicio y de los
informes.

### El envío, hoy y mañana

`enlaceWhatsApp()` produce `https://wa.me/57<móvil>?text=<ticket>`, que abre
la conversación con el mensaje escrito y **quien atiende pulsa enviar**. Nada
sale por su cuenta.

Eso es deliberado mientras no exista la automatización, que necesitará: una
cuenta de **WhatsApp Business API**, una **plantilla aprobada** por Meta —los
mensajes que inicia el negocio no pueden ser texto libre— y **consentimiento**
del destinatario. Cuando llegue, el envío será una llamada HTTP desde
`reservas.crear` en Apps Script; `utils/ticket.js` seguirá sirviendo para el
cuerpo del mensaje y para la vista en pantalla, porque no depende del DOM ni
de la red.

Una reserva **cancelada no tiene botón de ticket**: el comprobante dice
«presenta este ticket al reclamar tu almuerzo», y ese almuerzo ya no existe.

---

## Módulo de administración (`admin.html`)

### La clave de acceso es un pestillo, no una cerradura

`admin.html` pide una clave antes de mostrar nada. **Léase esto antes de
confiar en ella:** sin backend, todo el código y todos los datos viajan al
navegador de quien abra la página, así que **cualquiera con las herramientas
de desarrollo se la salta en veinte segundos**. Su único trabajo es que quien
llegue por casualidad a la URL no se encuentre dentro del histórico.

La protección real solo puede vivir en el servidor. Cuando Apps Script esté en
marcha, es él quien tiene que validar la sesión y **negarse a devolver datos**
sin ella; entonces esto se sustituye, no se complementa.

Con esa advertencia hecha, lo que sí hace bien:

- **Falla cerrado.** `#contenido` lleva `hidden` en el propio HTML, así que si
  el módulo de acceso no cargara, la pantalla se queda cerrada, no abierta.
- **Guarda el SHA-256, no la clave.** No lo hace más fuerte; evita que la
  clave —que casi seguro se reutiliza en otro sitio— quede escrita en claro en
  el repositorio.
- **La sesión vive en `sessionStorage`**, no en `localStorage`: se cierra al
  cerrar la pestaña. En un equipo compartido, dejarla abierta para siempre es
  peor que pedir la clave cada mañana. Hay además un botón de **Cerrar
  sesión**, que recarga la página para no dejar en memoria lo que se estaba
  consultando.
- **No da pistas**: la clave falla siempre con el mismo mensaje.

**La clave actual es `AdminSilvia` y hay que cambiarla.** Se pega esto
en la consola del navegador y el resultado va a `HASH_CLAVE_ADMIN` en
`js/config.js`:

```js
crypto.subtle.digest('SHA-256', new TextEncoder().encode('MI-CLAVE'))
  .then(b => console.log([...new Uint8Array(b)]
    .map(x => x.toString(16).padStart(2, '0')).join('')));
```

Un detalle que muerde: `crypto.subtle` **solo existe en contexto seguro** —
https, o http en `localhost` y `127.0.0.1`. Servida desde una IP de la red
local por http, no está, y la pantalla lo dice con esas palabras en vez de
fallar en silencio.


Tres pestañas. Las dos primeras comparten la barra de filtros; en la tercera se
retira, porque allí no pinta nada.

### Reservas

Filtro por **rango de fechas** (con presets: hoy, esta semana, la pasada,
últimos 30 días, este mes, el pasado, todo), **cafetería**, **estado** y
**texto** (nombre o móvil, sin distinguir acentos). Tabla de detalle con
Fecha · Cafetería · Nombre · Móvil · Menú · Estado, y el botón de editar en
cada fila activa. Cancelar está dentro de ese modal, igual que en mostrador.

**La tabla muestra como mucho 500 filas**, pero el pie dice siempre cuántas
casan de verdad con el filtro, y **la exportación se lleva todas**. Pedir
`limite: 0` solo al exportar es deliberado: renderizar mil quinientas filas
para mirarlas por encima no sirve de nada, pero exportar una página en vez del
reporte completo sería la peor clase de error, porque el archivo *parece*
correcto.

### Consolidado

Cuatro indicadores, y tres bloques de **gráfica + tabla con los mismos
números**: activas por día, por cafetería y platos más pedidos. La tabla no es
redundancia — la gráfica da la forma de un vistazo, la tabla da el valor exacto
que se copia a un informe, y es lo que hace la pantalla utilizable con lector
de pantalla, donde un SVG no dice nada.

Las gráficas son SVG dibujado a mano, sin librerías. Todas son de **serie
única** y de un solo color (el verde institucional): lo que hay que leer aquí
es la magnitud, no distinguir series entre sí, y una sola tonalidad se lee
mejor y no depende de distinguir colores. Las canceladas no van como segunda
serie: están en los indicadores, en las tablas y en el filtro de estado.

Si el rango pasa de seis semanas, la serie diaria **se agrupa por semanas** y
el subtítulo lo dice — noventa columnas de dos píxeles no se leen.

Los platos se cuentan **solo sobre reservas activas**: un consolidado de
consumo que sume las canceladas manda a cocinar de más.

### Catálogo

- **Cafeterías**: crear, editar, cerrar y reabrir. El `id` sale del nombre y
  **no es editable**: es la clave con la que miles de reservas históricas
  apuntan a esa cafetería. Cerrar es otro borrado lógico (`activa: false`).
- **Carta semanal**: una sola carta para todo el campus. Se elige la semana y
  se editan los siete días de una vez. Cuatro decisiones para que actualizarla
  cada semana no duela:
  - **Una caja de texto por día, un plato por línea**, y no campos numerados
    con botones de añadir y quitar: el número de platos cambia de un día a
    otro, y así además se puede pegar la carta desde un documento de un tirón.
  - **Un solo botón «Guardar semana»**. Publicar la carta es una tarea
    semanal, no siete diarias. La escritura es atómica: si un día trae un
    plato repetido, no se guarda ninguno — no puede quedar media semana
    publicada.
  - **«Copiar semana anterior»**, que es el atajo que de verdad ahorra
    trabajo: la mayoría de las semanas se parecen a la anterior, y corregir
    cuatro platos es mucho menos que escribir veintiuno. Deja los días
    marcados como pendientes, porque copiar no es publicar.
  - **Los días con cambios sin guardar se marcan**, y cambiar de semana,
    copiar encima o cerrar la pestaña pide confirmación antes de perderlos.
  - **Sábado y domingo son de solo lectura**: no hay servicio, así que no hay
    carta que publicar. «Copiar semana anterior» también los respeta.

  Dejar un día laborable vacío es la forma de decir «ese día no hay carta».

### Exportación a CSV

Pensada para que Excel la abra bien: **BOM UTF-8** (sin él «Cafetería» sale
como «CafeterÃ­a») y una primera línea `sep=;` (sin ella, un CSV de comas cae
entero en la primera columna en un Excel configurado en español). El precio es
que un lector que no entienda `sep=` verá esa línea como una fila más.

---

## Modelo de datos

Los mocks usan **`snake_case`**, igual que las columnas de una hoja de cálculo.
La conversión a `camelCase` la hace cada servicio en su función `normalizar`,
que es la frontera entre la forma de la API y la forma de la UI.

| Hoja / tabla   | Campos |
|---|---|
| `Cafeterias`   | `id` · `codigo` · `nombre` · `ubicacion` · `imagen` · `activa` |
| `MenuSemanal`  | `id` · `fecha` · `opciones[{id, nombre}]` |
| `Reservas`     | `id` · `nombre` · `telefono` · `cafeteria_id` · `fecha` · `menu_id` · `menu_nombre` · `medio` · `pago` · `estado` · `timestamp` · `historial[]` |

Las fechas viajan como `'YYYY-MM-DD'` en hora local. `utils/fechas.js` no usa
`toISOString()`: convierte a UTC y en Colombia (UTC−5) devolvería el día
anterior toda la mañana y la tarde.

### Sábados y domingos no hay servicio

La regla vive en **un solo sitio**, `utils/fechas.js`:

```js
export const DIAS_SIN_SERVICIO = [5, 6];   // 0 = lunes … 6 = domingo
export function esDiaDeServicio(fechaISO) { … }
```

Si algún día se abre los sábados, se quita el `5` de ahí y se acabó. Lo usan
las cuatro capas que tienen algo que decir al respecto:

- **`mock/menuSemanal.js`** no publica carta en fin de semana: sin servicio no
  hay nada que publicar, y una carta ahí haría creer que se puede reservar.
- **`mock/reservas.js`** no genera historial esos días — sembrar datos que la
  propia API rechazaría sería una trampa que se paga en la primera prueba.
- **`mockApi.js`** rechaza `reservas.crear` con `SIN_SERVICIO`, y rechaza
  publicar platos en un día sin servicio. Se comprueba en el servidor y no
  solo en la pantalla: el fin de semana tampoco hay carta, así que sin esta
  regla el rechazo llegaría como `MENU_INVALIDO` —«ese plato no está en la
  carta»—, que es cierto pero no explica nada a quien está en el mostrador.
- **`reserva.html`** deshabilita el botón y sustituye la tabla por una
  explicación. Sin eso quedaría un «Todavía no hay reservas para hoy · Usa
  Registrar reserva para anotar la primera» que invita a algo imposible.

En el editor de la carta, sábado y domingo aparecen apagados y **de solo
lectura**. Se dejan a la vista, y no ocultos, para que la semana se lea
completa y no parezca que falta un día por rellenar.

#### Probar en fin de semana

Hay un interruptor para poder validar el sistema un sábado o un domingo:
`PERMITIR_FIN_DE_SEMANA`, con una constante **en cada lado**.

| Dónde | Qué |
|---|---|
| `js/config.js` | `export const PERMITIR_FIN_DE_SEMANA = …` |
| `apps-script/Codigo.gs` | `const PERMITIR_FIN_DE_SEMANA = …` + **versión nueva** de la implementación |

Son dos porque la regla se aplica en los dos sitios a propósito: el frontend
avisa y **el backend decide**. Cambiar solo uno no sirve de nada.

Mientras está encendido, tres cosas lo recuerdan para que no se quede así:

- La pantalla de mostrador muestra una banda de aviso en cada carga.
- `node pruebas/contrato.mjs` **falla** y dice por qué, salvo que se le pase
  `--sin-regla-fin-de-semana` para reconocerlo a propósito.
- `pruebas/contrato.mjs` comprueba además que las dos constantes declaren lo
  mismo.

Si se queda encendido en producción, el personal podrá registrar reservas de
sábado y domingo que la cocina no va a ver nunca.

### La carta es del día, no de la cafetería

Las cuatro sedes sirven el mismo menú, así que `MenuSemanal` se indexa **solo
por fecha**. Antes había una columna `cafeteria_id` y una carta por sede; se
quitó porque una columna que repite el mismo valor cuatro veces no es un dato,
es una mentira que confunde a quien abra la hoja — y porque multiplicaba por
cuatro el trabajo de publicar la carta cada semana.

Si algún día las cartas vuelven a divergir por sede, esto es lo que hay que
deshacer: la columna vuelve a la hoja, las tres acciones `menu.*` vuelven a
recibir el id y `menuService.js` lo vuelve a pasar. **La interfaz no cambia**,
porque pide la carta al servicio y pinta lo que llegue.

Los móviles se guardan **normalizados a diez dígitos sin separadores**
(`'3001234567'`). `utils/telefono.js` acepta espacios, guiones y el prefijo
`+57` al escribir, y devuelve siempre esa forma: es lo que permite comparar dos
números para detectar una reserva duplicada. El formato bonito
(`300 123 4567`) es solo de presentación.

### Historial de cada reserva

Cada reserva lleva un `historial[]` de asientos, del más antiguo al más
reciente:

```jsonc
{
  "tipo": "creacion" | "modificacion" | "cancelacion",
  "timestamp": "2025-08-23T13:05:00.000Z",
  "cambios": [ { "campo": "menu", "antes": "Bandeja paisa", "despues": "Lasaña" } ]
}
```

Cuatro decisiones deliberadas:

- **Lo escribe el servidor, no el cliente.** El historial es el registro de lo
  que de verdad pasó, y el navegador no puede saberlo: dos personas editando la
  misma reserva verían cada una solo su propio cambio.
- **`cambios` guarda el valor visible, no el id.** `'Bandeja paisa'` se entiende
  dentro de un año; `'bandeja-paisa'` obliga a cruzar tablas.
- **La creación es el primer asiento.** Así el historial nunca está vacío y la
  fecha de alta no depende de un campo aparte.
- **Guardar sin cambiar nada devuelve `SIN_CAMBIOS`** en vez de escribir un
  asiento vacío, que es justo lo que un registro de cambios no debe tener.

En Google Sheets `historial` es una columna JSON, igual que `opciones` en
`MenuSemanal`: una hoja no tiene arreglos, así que se guarda serializada.

### Contrato de la API

Un único endpoint que recibe `{ accion, params }` y responde **siempre** con el
mismo sobre:

```jsonc
{ "ok": true,  "data": … }
{ "ok": false, "error": { "codigo": "RESERVA_DUPLICADA", "mensaje": "…" } }
```

Acciones implementadas en el mock (y que deberá implementar el backend):

| Acción | Params | Devuelve |
|---|---|---|
| `cafeterias.listar` | — | array de cafeterías |
| `cafeterias.obtener` | `id` | una cafetería |
| `menu.delDia` | `fecha` | `{fecha, opciones[]}` |
| `reservas.delDia` | `cafeteria_id`, `fecha` | array de reservas, en orden de llegada |
| `reservas.crear` | los campos de la reserva | la reserva creada |
| `reservas.actualizar` | `id`, `nombre`, `telefono`, `menu_id` | la reserva ya modificada, con el nuevo asiento en su historial |
| `reservas.cancelar` | `id` | la reserva ya cancelada |
| `reservas.buscar` | `desde`, `hasta`, `cafeteria_id?`, `estado?`, `texto?`, `limite?` | `{total, reservas[], resumen}` |
| `cafeterias.crear` | `nombre`, `ubicacion?` | la cafetería creada |
| `cafeterias.actualizar` | `id`, `nombre`, `ubicacion` | la cafetería modificada |
| `cafeterias.archivar` / `.reactivar` | `id` | la cafetería con su nuevo estado |
| `menu.semana` | `lunes` | los 7 días de esa semana |
| `menu.guardarSemana` | `lunes`, `dias[{fecha, platos[]}]` | la semana ya guardada |

`cafeterias.listar` acepta además `incluir_inactivas`: la pantalla de mostrador
no debe ofrecer una cafetería cerrada, pero el administrador tiene que verlas
todas o no podría consultar el histórico de una que ya cerró.

`reservas.actualizar` no recibe `cafeteria_id` ni `fecha`: no son editables, y
dejarlas fuera de la firma evita que una pantalla futura las cambie por
descuido.

Códigos de error de negocio ya manejados por la UI:
`CAFETERIA_NO_ENCONTRADA`, `CAFETERIA_DUPLICADA`, `RESERVA_NO_ENCONTRADA`,
`RESERVA_CANCELADA`, `DATOS_INCOMPLETOS`, `MENU_INVALIDO`, `MENU_DUPLICADO`,
`RESERVA_DUPLICADA`, `SIN_CAMBIOS`, `RANGO_INVALIDO`, `SIN_SERVICIO`.

### La cancelación es un borrado lógico

`reservas.cancelar` **no borra la fila**: le pone `estado: 'cancelada'` y le
añade un asiento de tipo `cancelacion`. La reserva desaparece de la pantalla
porque `reservas.delDia` filtra por estado, así que se ve igual que un borrado,
pero el registro sobrevive.

Borrar de verdad tiraría el historial justo del caso que más interesa auditar
—«esta persona reservó y luego se canceló»— y en una hoja de cálculo compartida
no habría forma de recuperarlo.

Dos consecuencias que el mock ya respeta:

- Una reserva cancelada **no bloquea** un duplicado: si alguien canceló por la
  mañana y vuelve al mostrador, puede reservar otra vez con el mismo móvil.
- Una reserva cancelada **no se puede editar**: devuelve `RESERVA_CANCELADA`.

El mock **valida duplicados, menú y cambios** a propósito: son reglas que el
backend tendrá que aplicar de todos modos, y tenerlas hoy obliga a que el
frontend ya sepa mostrar esos mensajes. Un duplicado es *el mismo móvil, la
misma cafetería y el mismo día*; al editar, la reserva se excluye a sí misma de
esa comprobación, o no se podría guardar sin cambiar de número.

---

## Migración al backend real

> **El contrato completo está en [CONTRATO.md](CONTRATO.md)**, con las formas
> exactas, las reglas de negocio y un esquema SQL de partida. Y es ejecutable:
>
> ```bash
> node pruebas/contrato.mjs                    # contra el mock
> node pruebas/contrato.mjs <URL>              # solo lectura: seguro en producción
> node pruebas/contrato.mjs <URL> --escribir   # incluye las de escritura
> ```
>
> Verde = ese backend sirve. Es la misma prueba que pasan el mock y Apps
> Script, así que no hay discusión sobre si «antes funcionaba».

El backend ya está escrito: **`apps-script/Codigo.gs`**. Implementa las mismas
14 acciones, con el mismo sobre y las mismas reglas de negocio.

### Puesta en marcha, paso a paso

1. Crea una hoja de cálculo nueva en Google Sheets.
2. **Extensiones → Apps Script**, y pega `apps-script/Codigo.gs` entero.
3. Ejecuta una vez la función **`configurarHojas`** desde el editor. Crea las
   tres pestañas con sus cabeceras exactas y siembra las cafeterías iniciales.
   Es idempotente: ejecutarla dos veces no duplica nada.
4. Ejecuta **`probarDesdeElEditor`** y mira el registro. Si algo está mal
   montado, sale ahí antes de desplegar.
5. **Implementar → Nueva implementación → Aplicación web**, con
   *Ejecutar como: Yo* y **Quién tiene acceso: cualquier usuario**.
6. En `js/config.js`: `FUENTE_DATOS = 'api'` y `API_BASE_URL = '<URL /exec>'`.

Eso es todo: **dos líneas en el frontend**. Borrar `js/mock/` y su `import` en
`api.js` es limpieza posterior, no un requisito para que funcione.

Lo primero que hay que hacer con el sistema en marcha es **publicar la carta
de la semana** desde Catálogo: sin carta no se puede registrar nada, y la hoja
empieza vacía.

### Las otras funciones del editor

`Codigo.gs` trae tres funciones más que **no se llaman desde la aplicación**:
se ejecutan a mano desde el editor de Apps Script, y ninguna destruye nada.

| Función | Cuándo | Qué hace |
|---|---|---|
| `exportarTodo` | Antes de migrar, o para tener una copia | Vuelca las tres pestañas a JSON en el registro, con las columnas JSON ya deserializadas. Exportar a CSV a mano rompe el historial, que lleva comas dentro. |
| `migrarAIdentificadorNuevo` | Una vez, sobre una hoja anterior a los cambios | Añade las columnas que falten (`codigo`, `platos_fijos`, `medio`, `pago`) y reescribe los identificadores viejos al formato `NN-AAMMDD-CCC`. Idempotente. |
| `repararFilasDescolocadas` | Una vez, si hubo filas escritas con el fallo de columnas | Devuelve a su sitio los valores corridos. Solo toca filas cuya firma es inequívoca, así que una sana no se reconoce; ejecutarla dos veces no hace nada la segunda. |

`repararFilasDescolocadas` solo reconoce el desplazamiento **simple**. Una fila
escrita **dos veces** por el código defectuoso quedó corrida el doble y no la
reconoce. No se amplió a propósito: el fallo está corregido, no pueden
aparecer filas nuevas así, y las que quedaran se arreglan a mano.

### Tres cosas que muerden

- **Apps Script no responde al preflight de CORS.** Por eso `httpClient.js`
  manda `Content-Type: text/plain`: así la petición es «simple» y no lo
  dispara. `e.postData.contents` llega igual.
- **Si el despliegue no es «cualquier usuario»**, el `fetch` recibe el HTML de
  la pantalla de login de Google en vez de JSON. El síntoma es
  `RESPUESTA_INVALIDA`; la causa es esa.
- **Editar el script no basta: hay que crear una versión nueva** de la
  implementación. Guardar deja la URL `/exec` sirviendo la versión anterior, y
  parece que los cambios no hacen nada.

### Detalles que ya están resueltos en el script

- **Bloqueo solo en las escrituras.** Dos reservas simultáneas del mismo móvil
  podrían pasar las dos la comprobación de duplicado si cada una lee antes de
  que la otra escriba, así que toda acción que escriba toma el bloqueo de
  script. Las consultas no: dos lecturas no pueden pisarse, y tomarlo también
  para ellas ponía en cola a todas las cafeterías unas detrás de otras.
  Qué acción escribe está declarado en `ACCIONES_QUE_ESCRIBEN`; **una acción
  nueva que escriba y no se apunte ahí se queda sin bloqueo**.
  `TIMEOUT_HTTP_MS` está por encima de esa espera a propósito: si el cliente
  se rindiera antes, el trabajo seguiría en Google y quien atiende volvería a
  pulsar el botón.
- **Dos cachés, para no releer lo mismo.** Una dura una petición y evita que
  una acción lea dos veces la misma pestaña. La otra dura `VIDA_CACHE_S` (dos
  minutos) y se comparte entre peticiones, pero solo para `Cafeterias` y
  `MenuSemanal` —nunca `Reservas`, que cambia con cada registro— y nunca para
  la tabla que la acción va a escribir: los objetos llevan `_fila`, y escribir
  con un `_fila` caducado es escribir en la fila de al lado. Toda escritura
  invalida su tabla, así que un cambio hecho desde la aplicación se ve al
  instante. **Un cambio hecho a mano en la hoja puede tardar hasta dos minutos
  en verse**, porque editar una celda no puede avisar a nadie.
- **Fechas y móviles como texto.** Si la hoja los interpreta, `'2026-08-24'`
  vuelve como objeto `Date` —y `toISOString()` en Colombia resta un día toda
  la tarde— y el móvil pierde cualquier cero inicial. Además se normalizan al
  leer, por si alguien cambia el formato de una columna a mano.
- **`opciones` e `historial` van serializados** como JSON: una hoja no tiene
  arreglos.
- **Cualquier fallo inesperado sale como sobre**, no como el HTML de error de
  Apps Script, que el cliente interpretaría como respuesta inválida.

### Qué hay que tocar

| Archivo | Qué se hace |
|---|---|
| `js/config.js` | `FUENTE_DATOS = 'api'` y `API_BASE_URL = '<url del despliegue>'` |
| `js/services/api.js` | borrar el `import` de `mockApi.js` y el ternario |
| `js/mock/` | **borrar la carpeta entera** |

**Nada más.** Ni las páginas, ni `js/ui/`, ni `js/utils/`, ni el CSS.

`api.js` después de la migración:

```js
import { enviar } from './httpClient.js';
```

### Qué debe hacer el backend

Google Apps Script con un `doPost(e)` que lea `JSON.parse(e.postData.contents)`,
enrute por `accion` y devuelva el sobre `{ok, data}` / `{ok, error}` con
`ContentService.createTextOutput(...).setMimeType(ContentService.MimeType.JSON)`.

Tres detalles que muerden:

- **Apps Script no responde a preflight CORS.** Por eso `httpClient.js` manda
  `Content-Type: text/plain` en vez de `application/json`: así la petición es
  "simple" y no dispara el preflight. `e.postData.contents` llega igual.
- **Apps Script redirige** a `googleusercontent.com`, de ahí el
  `redirect: 'follow'` en el `fetch`.
- **El despliegue debe ser "cualquier usuario"**, o el `fetch` recibirá el HTML
  de la pantalla de inicio de sesión de Google en vez de JSON. `httpClient.js`
  ya lo detecta y devuelve `RESPUESTA_INVALIDA`.

Si más adelante se cambia Apps Script por Node/Express + base de datos, el
frontend no se entera mientras se respete el mismo contrato.

---

## Identidad visual

- **Títulos:** Segoe UI · **Textos:** Open Sans (Google Fonts).
  Ambas en `--fuente-titulo` y `--fuente-texto` (`css/base.css`).
  Segoe UI no está en Google Fonts y solo viene con Windows, así que las dos
  pilas llevan una cola explícita —`-apple-system`, `system-ui`,
  `Helvetica Neue`, `Arial`— para que macOS caiga en SF Pro y Linux no acabe
  en DejaVu Sans. Esa cola también cubre a `--fuente-texto` si Google Fonts
  no responde.
- **Acento:** verde institucional `--c-acento: #00693c`.
- Dirección minimalista: neutros fríos, mucho aire, esquinas redondeadas,
  sombras muy suaves.

Toda la escala de color, espaciado, tipografía, radios y sombras vive como
custom property en el `:root` de `css/base.css`. Ajustar la dirección visual es
cambiar valores ahí, no reescribir reglas.

---

## Estado actual y límites conocidos

### Dónde está el proyecto hoy (26 de agosto de 2026)

**En uso real**, contra el backend de Apps Script. `FUENTE_DATOS = 'api'` y
`PERMITIR_FIN_DE_SEMANA = false` en `js/config.js`. Para retomar el trabajo:

```bash
npm install        # solo la primera vez
npm test           # 603 comprobaciones · 0 fallos
npx serve .        # y abrir http://localhost:3000
```

Lo último que se hizo, por orden: se corrigió el backend para que escribiera
en la columna correcta, se bajó el tiempo de respuesta, se añadió el
consolidado del mostrador y se añadió el ticket.

**Lo siguiente que estaba sobre la mesa:** automatizar el envío del ticket por
WhatsApp (ver arriba lo que hace falta) y, más adelante, migrar a una base de
datos de verdad (ver *Migración al backend real*).

**Dos desajustes conocidos** entre los datos reales y los simulados:

- Hay **cinco cafeterías** en la hoja —se añadió «Cafetería de Salud», código
  05— y los nombres cambiaron de forma: «Autoservicio Bienestar Pro», «Café
  Camilo Torres», «Bienestar Estudiantil», «Cafetería Administración 3».
  `js/mock/cafeterias.js` sigue teniendo las cuatro antiguas, así que al
  volver a `FUENTE_DATOS = 'mock'` se ven otras. No afecta a nada real: el
  `id` de cada una no cambió, y las reservas históricas siguen enlazadas.
- Las reservas anteriores al 24 de agosto **no tienen `medio` ni `pago`**,
  porque los campos no existían. Se ven como «—» en la tabla y se cuentan
  aparte en el consolidado.

### Límites de diseño

- **No hay límite de aforo.** Al quitar los turnos se quitó también la
  capacidad: hoy cualquiera reserva siempre, sin tope por cafetería ni por día.
  Si se quiere recuperar, es un campo `capacidad_diaria` en `Cafeterias`, un
  contador en `reservas.crear` y un código `CUPO_AGOTADO`.
- **El historial no dice quién hizo cada cambio.** Guarda qué cambió y cuándo,
  pero no el autor: sin identidad de usuario no hay de dónde sacarlo. En una
  herramienta que comparten varios turnos de personal, ese «quién» es justo lo
  que se acaba necesitando. Añadirlo es un campo `autor` en cada asiento, y
  antes un inicio de sesión por sencillo que sea.
- **La clave de admin no es seguridad.** Es un pestillo de cliente y se salta
  con las herramientas de desarrollo; ver arriba. `reserva.html` no pide nada,
  así que cualquiera con la URL sigue viendo los móviles de contacto y puede
  editar reservas. Mientras el backend no valide la sesión, esto solo debería
  vivir en una red interna.
- **El histórico del prototipo es generado.** `mock/reservas.js` fabrica unas
  seis semanas de reservas con un generador **con semilla fija**: si usara
  `Math.random()`, los totales cambiarían en cada recarga y sería imposible
  saber si un número que cambió es un dato o un artefacto. Al migrar al backend
  real, esa carpeta se borra entera y los datos son los de verdad.
- **El segundo de Apps Script no se puede quitar.** Medido contra el
  despliegue real, una petición que no lee ni una celda tarda unos 1000 ms:
  es el peaje de la plataforma —la redirección a `googleusercontent`, el
  arranque del script— y no depende de lo que haga el código. Por eso la
  optimización va toda por el mismo sitio: **hacer menos viajes y no
  encadenarlos**. Registrar una reserva pasó de dos viajes en fila a uno, y
  abrir el formulario de uno a ninguno; por debajo de ahí no se baja sin
  cambiar de backend, y ese es el argumento de la migración.
- **La tabla de detalle se corta en 500 filas.** El total real siempre se
  muestra y la exportación las lleva todas, pero no hay paginación para
  recorrerlas en pantalla.
- **Las reservas creadas y las ediciones se pierden al recargar**: el mock vive
  en memoria. El historial también.
- Solo se reserva para **hoy**. El parámetro `fecha` ya está en todas las firmas
  de los servicios, así que permitir fechas futuras es dejar de usar el valor
  por defecto y añadir el selector.
- **Una cancelación no se puede deshacer desde la interfaz.** La reserva
  cancelada existe en los datos, pero ninguna pantalla la muestra, así que no
  hay forma de revertirla ni de consultar su historial. Sería una acción
  `reservas.reactivar` y algún filtro para ver las canceladas del día.
- No hay deshacer general: cada acción destructiva se confirma antes, pero una
  vez confirmada no se revierte desde la interfaz.
- Las cafeterías no tienen foto: la tarjeta muestra la inicial sobre un degradado.
  Poner una ruta en el campo `imagen` de `mock/cafeterias.js` la sustituye.
- El header oculta el logo si el archivo no existe (`ui/dom.js#prepararLogo`) y
  deja solo el wordmark de texto, para no mostrar un ícono de imagen rota.
