# reservasCafeterias · UIS

**Servicios Cafeterías Bienestar UIS.** Herramienta interna del personal de
las cafeterías de la Universidad Industrial de Santander, no una página para
los comensales.

La aplicación se divide en **módulos**, y el repositorio todavía se llama como
el primero de ellos. Hoy hay uno en servicio —reservas de almuerzos, donde
quien la usa anota la reserva a nombre de otra persona— y uno anunciado sin
construir, pedidos a proveedores.

## Dónde está esto hoy (27 de agosto de 2026)

La migración a **Supabase + Vercel + React** está **hecha y desplegada**.

| | |
|---|---|
| Producción | `https://reservas-kappa-ten.vercel.app` |
| Repositorio | `github.com/sisbienestar/reservasCafeterias` · rama `master` |
| Base de datos | Supabase, proyecto `fpladdbnrwcoskbmkzfk` (`us-east-1`) |
| Datos dentro | 5 cafeterías · 34 platos · 17 reservas · 32 asientos de historial |
| Cuentas | 2: una de mostrador (Camilo Torres) y una de administración |

**Lo único que queda de la migración es el paso 8** de `MIGRACION.md`: apagar
Apps Script. No se ha hecho, y tiene una condición previa anotada allí —un
identificador repetido que sigue mal en la hoja—.

Apps Script y `legado/` **siguen en pie** hasta entonces. Son la copia de
seguridad, no código muerto.

## Los módulos

La portada `/` es la lista de módulos y es la **única pantalla pública**:
enseña qué hay sin pedir nada, y a partir de ahí hay que entrar. Cada módulo
cuelga de su propio prefijo y se lleva dentro todo lo suyo, incluida su
administración.

| Ruta | Qué es | Quién entra |
|---|---|---|
| `/` | Los módulos | cualquiera |
| `/admin` | Usuarios, módulos, ajustes y registro | rol `admin` |
| `/reservas` | Las cafeterías del campus | con sesión |
| `/reservas/:cafeteriaId` | La pantalla de mostrador | con sesión, y solo a su sede |
| `/reservas/admin` | Administración de reservas | rol `admin` |
| `/pedidos` | Almacenes y proveedores | con sesión |
| `/pedidos/:proveedorId` | El formulario de pedido | con sesión, y con sede |
| `/pedidos/editar/:pedidoId` | El mismo formulario, con un pedido dentro | con sesión, y solo su sede |
| `/pedidos/historial` | Los pedidos hechos, filtrables | con sesión; el mostrador solo ve su sede |
| `/pedidos/admin` | Proveedores, productos y cuentas | rol `admin` |
| `/pedidos/documento/:pedidoId` | El pedido, listo para imprimir | con sesión |

**Hay tres roles.** `mostrador` lleva SIEMPRE una sede y solo ve la suya.
`admin` y `auxiliar` —«Auxiliar Administrativo Cafeterías»— van SIN sede y las
ven todas; el auxiliar vive solo en pedidos, donde modifica las cantidades a lo
que el proveedor va a entregar. El código decide alcance por `cafeteriaId` nulo
o no, **nunca enumerando roles**: así un rol nuevo sin sede no se queda fuera en
silencio.

`/reserva/:cafeteriaId` y `/admin` son las direcciones de antes y siguen
redirigiendo: el mostrador tiene la suya guardada en el navegador.

**Añadir un módulo son tres sitios**: una fila en la tabla `modulo`, sus rutas
en `src/App.tsx` envueltas en `<ExigeModulo>`, y su prefijo en `MODULO_DE` de
`api/_nucleo/enrutador.ts`. La portada no se toca: lee los módulos de
`app.contexto`. Sus páginas van en `src/paginas/<módulo>/`.

### Apagar un módulo lo cierra de verdad

No es esconder la tarjeta. `enrutador.ts` rechaza sus acciones con
`MODULO_INACTIVO` y `<ExigeModulo>` cierra sus rutas. Administración pasa por
las dos, para poder probarlo antes de publicarlo.

`cafeterias.*` NO está atado a ningún módulo, y es deliberado: las sedes las
usan los dos, y atarlas habría hecho que apagar reservas rompiera pedidos. La
administración tampoco, o apagar un módulo cerraría la puerta para encenderlo.

### Lo que ya no está en el código

| Antes | Ahora |
|---|---|
| `src/modulos.ts` | tabla `modulo` |
| `PERMITIR_FIN_DE_SEMANA` en Vercel | `ajuste.permitir_fin_de_semana` |
| Nombre y versión en `Cabecera.tsx` | `ajuste.nombre_aplicacion`, `version`, `fecha_version` |

Los tres llegan dentro de `app.contexto`, que la aplicación ya espera antes de
pintar nada. **Si esas tablas no existen, NO ARRANCA**: ver `09-admin-general.sql`.

### Una sola hoja: el FBE.04

**Todos los pedidos se imprimen con el FBE.04**, sean del almacén o de un
proveedor de fuera. Antes había dos plantillas y el proveedor elegía; desde
`supabase/17-observaciones-y-formato-unico.sql` (1 de septiembre de 2026) la
hoja que se firma es una sola, y el histórico se reescribió para que un pedido
viejo se reimprima igual que uno nuevo.

**El FBE.34 no se borró.** Sigue siendo un valor válido de la columna, sigue
teniendo su plantilla en `Documento.tsx` y se puede elegir desde el panel de
proveedores. Simplemente hoy no lo usa nadie.

Dos consecuencias que cuesta ver hasta que muerden:

- **«Almacén interno» y «proveedor externo» ya no se pueden deducir de nada.**
  Era `tipo_documento`, y ahora es el mismo para los once proveedores. Las tres
  pantallas que lo enseñaban dejaron de hacerlo antes que llamar almacén de la
  Universidad a Ramo o a Coca-Cola. Si algún día hace falta la distinción, es
  una columna nueva, no una lectura del formato.
- **Un FBE.04 SÍ puede llevar fecha y hora de entrega guardadas**, aunque su
  plantilla no tenga dónde imprimirlas. Las traen los dos pedidos heredados del
  FBE.34, y `actualizar_pedido` las conserva en vez de escribir el `null` que
  manda un formulario que no las ofrece. Guardar y imprimir son dos cosas.

**«Observaciones» es un campo del pedido**, editable con las mismas llaves que
las cantidades y con el mismo tope escrito tres veces —el CHECK
`pedido_observaciones_cabe`, `MAX_OBSERVACIONES` en `api/` y el `maxLength` del
formulario—. Sale impreso dentro del recuadro, y el recuadro sigue siendo alto
aunque venga con texto: lo que se anota al elaborar no agota lo que se escribe
a mano al recibir.

### El ciclo de un pedido

`creado` → `enviado` → `confirmado`, y `anulado` desde cualquiera de los tres.
Se elabora, se revisa impreso, se corrige y se envía; al enviar se avisa por
correo a las cuentas `admin`, que son quienes imprimen y firman.

**`confirmado` es el pedido ya listo.** Existe porque lo que se pide no
siempre es lo que el proveedor puede traer: entre enviar y confirmar hay una
ventana para cuadrar las cantidades con lo que va a llegar de verdad. Pasar por
ahí no implica que se haya cambiado nada — muchos llegan enteros y se confirman
tal cual.

**La pantalla y la base usan LAS MISMAS PALABRAS, y eso costó llegar.** Los
estados se llamaron `borrador/confirmado/definitivo` en la base mientras la
pantalla decía «Creado/Enviado/Confirmado», así que «Confirmado» en una captura
no era `confirmado` en la base. Duró tres días: la primera petición que llegó
—«pon en confirmado los pedidos hasta el 21»— ya era ambigua. Lo unificó
`supabase/16-unificar-estados.sql`, y su cabecera explica por qué el ORDEN de
los renombrados no era negociable.

Quién edita en cada estado es una matriz, y está escrita tres veces a
propósito: `puede_editar_pedido` en SQL —la que manda—, `EDITORES` en
`api/_nucleo/acciones/pedidos.ts` para poder explicar el porqué, y los botones
de `Documento.tsx` para no ofrecer lo que va a fallar. Si cambia, cambian las
tres. Está en `CONTRATO.md`.

Tres cosas que no se deshacen: **un enviado no vuelve a creado y un confirmado
no vuelve a enviado** —puede haber papel circulando—, **un anulado
no lo edita nadie, ni administración** —es un pedido que se decidió que no
existe— y **el aviso nunca tumba la confirmación**. Ver
`api/_nucleo/notificaciones.ts`: no lanza jamás, y añadir Slack o Telegram es
otra función en su lista `CANALES`.

Todo lo que le pasa a un pedido deja asiento en `pedido_evento`, y llega dentro
del propio pedido en `eventos[]`. Copia el nombre y el rol de quien lo hizo **en
ese momento**, por lo mismo que `producto_nombre` en las líneas.

El correo sale por la API HTTPS de Resend, sin dependencias. Necesita
`RESEND_API_KEY` y `RESEND_REMITENTE` en el entorno; sin ellas no envía y **no
falla**, que es lo correcto en un despliegue donde todavía no se ha configurado.

Tres cosas que conviene no deshacer:

- **El acceso vive en la portada de módulos, y en ningún otro sitio.** Los dos
  módulos exigen sesión desde su primera pantalla, así que `ExigeSesion` recibe
  siempre `portada="/"` y devuelve ahí con el destino guardado. Reservas tuvo su
  propio modal mientras `/reservas` era pública; al cerrarse, sobró.
- **La cabecera lleva el nombre de la APLICACIÓN**, nunca el del módulo. Es
  idéntica en todas las pantallas; quién dice dónde estás es el `<h1>` de cada
  portada.
- **Un tramo literal gana a uno con parámetro** en React Router: en
  `/reservas`, `admin` gana a `:cafeteriaId`, y en `/pedidos`, `historial` gana
  a `:proveedorId`. La consecuencia a recordar es que una cafetería llamada
  `admin` o un proveedor llamado `historial` quedarían inalcanzables.

## Las dos aplicaciones que conviven

| | En uso | Legado |
|---|---|---|
| Frontend | `src/` · React + TypeScript sobre Vite | `legado/` · HTML + JS sin build |
| Backend | `api/` · Vercel Functions + Supabase | `apps-script/Codigo.gs` · Sheets |
| Acceso | sesión de Supabase, validada en el servidor | un SHA-256 comparado en el navegador |

## Antes de tocar nada

```bash
npm install          # solo la primera vez
npm run tipos        # tsc --noEmit        · cubre api/ y src/
npm test             # 603 comprobaciones  · cubre legado/ y apps-script/
```

Los dos se reparten el proyecto y **ninguno cubre al otro**. Si falla solo
`viajes`, y solo en «salen las tres a la vez», es una medida de tiempo de
pared que falla de forma intermitente en máquinas cargadas; ya lo hacía antes
de la migración.

Con la base de datos delante hay dos más:

```bash
npm run verificar    # 30 · la forma de los datos importados
npm run permisos     # 35 · quién puede hacer qué (con el backend en marcha)
```

## Levantar el proyecto en local

```bash
npm run local        # backend en :3001 y frontend en :5173
```

**Un solo comando, y Ctrl+C para los dos.**

> ### Si la API «no reconoce» una acción que sí existe, el backend está rancio
>
> `ACCION_DESCONOCIDA` sobre una acción que está escrita en `enrutador.ts`
> significa una sola cosa: **el proceso de `:3001` se arrancó antes de que se
> escribiera**. No recarga solo. Ha pasado dos veces —con `pedidos.analisis` y
> con `pedidos.enviar`— y las dos se buscó el fallo en el sitio equivocado.
>
> Se distingue en un segundo preguntándole a él qué conoce:
>
> ```bash
> curl -s -X POST http://localhost:3001/api \
>   -H "Content-Type: application/json" \
>   -d '{"accion":"la.que.falla","params":{}}'
> ```
>
> `NO_AUTENTICADO` quiere decir que la conoce y el problema es otro.
> `ACCION_DESCONOCIDA` quiere decir que hay que matarlo y volver a levantarlo.
>
> Su pariente, cuando lo que no cuadra son los DATOS y no la acción: *la base
> va por detrás del código*, porque falta pegar un archivo de `supabase/`. Eso
> ya se dice solo — `traducirError` reconoce el `PGRST202` de PostgREST y
> responde con el nombre de la función que falta.

> ### Si la app carga pero los datos no llegan, lee esto primero
>
> Ha pasado cuatro veces y el síntoma nunca señala la causa: la pantalla se ve
> bien, el diseño está bien, y aparece un `ECONNREFUSED` del proxy o un
> `HTTP_404`. Siempre ha sido lo mismo — **un Vite vivo con una configuración
> vieja**, casi siempre por un cambio de rama que le quitó `vite.config.ts` de
> debajo mientras corría.
>
> Se reconoce en un segundo:
>
> ```bash
> curl http://localhost:5173/api
> ```
>
> Si devuelve `{"ok":true,…}`, el proxy está bien y el problema es otro. Si
> devuelve **código fuente de JavaScript**, ese Vite no tiene proxy: hay que
> matarlo, no reiniciarlo desde el editor.
>
> ```powershell
> Get-NetTCPConnection -LocalPort 5173,3001 -State Listen |
>   Select-Object -ExpandProperty OwningProcess -Unique |
>   ForEach-Object { Stop-Process -Id $_ -Force }
> ```
>
> Y después `npm run local`, que se niega a arrancar si el puerto está ocupado
> en vez de irse al 5174 «para no molestar» — que es justo lo que acaba dando
> dos instancias sirviendo aplicaciones distintas.

## Desplegar

`git push` a `master`. Vercel construye y publica solo. Cualquier otra rama da
una URL de vista previa, que es donde conviene probar antes de tocar
producción.

Las variables de entorno **no** están en el repositorio: viven en `.env.local`
—ignorado por git— y en el panel de Vercel. Si añades una `VITE_*`, hay que
**redesplegar sin caché**: esas se incrustan al construir, no se leen al
arrancar, así que añadirlas sin reconstruir no cambia nada.

## Reglas que no se negocian

1. **La clave de servicio de Supabase no puede llevar prefijo `VITE_`.**
   Cualquier variable `VITE_*` acaba dentro del JavaScript que descarga el
   navegador, y esa clave se salta RLS: lee y escribe todo el campus.
2. **RLS está cerrado del todo y así se queda.** `supabase/02-rls.sql` no
   declara ni una política permisiva, porque la clave anónima es pública y
   Supabase expone una API REST automática sobre las mismas tablas. La única
   puerta es `api/index.ts`.
3. **El navegador nunca decide un permiso.** El contexto de sesión guarda el
   rol para saber qué pintar; quien autoriza es `api/_nucleo/sesion.ts`, en
   cada petición.
4. **Las reglas de negocio van en el servidor.** La interfaz las repite para
   avisar antes, pero la que manda es la del backend. `CONTRATO.md` es la
   lista.
5. **Antes de añadir una clase al CSS, búscala en las otras cuatro hojas.**
   `src/estilos/react.css` llegó a tener cincuenta reglas y casi todas eran
   nombres paralelos de cosas que ya existían —`.tabla__envoltorio` por
   `.tabla-envoltorio`, `.radio` por `.opcion`—. El resultado fue una interfaz
   con dos sistemas de diseño discutiendo, y hubo que deshacerlo entero.
6. **`pruebas/banco/` es contenido generado** por `pruebas/sincroniza.sh`. No
   se edita a mano.
7. **Todo en español**: código, variables, comentarios, interfaz y
   documentación. Los comentarios explican **por qué**, no qué.

### Y mientras Apps Script siga vivo

8. **Editar `apps-script/Codigo.gs` no basta**: hay que crear una **VERSIÓN
   NUEVA** de la implementación. Guardar deja la URL `/exec` sirviendo la
   versión anterior. Este error ya costó una tarde.

## La deuda

### 1 · El nombre de usuario solo sirve con un dominio

**Pendiente de decidir. Planteado por Fredy el 27 de agosto de 2026.**

Hoy el nombre de usuario no se guarda en ninguna parte: se completa con
`VITE_DOMINIO_USUARIOS` y ya. «silvia» entra como `silvia@reservas.uis`.

Eso **solo funciona si todas las cuentas usan ese dominio**, y no va a ser el
caso: habrá cuentas de gmail, de `@uis.edu.co` y de donde sea. Entonces unas
personas entran escribiendo su nombre y otras tienen que escribir el correo
entero, sin que nada en la pantalla explique la diferencia. Es exactamente el
tipo de cosa que en un mostrador acaba en «a mí no me funciona».

Se eligió así por dos razones que siguen siendo válidas y que hay que pesar
contra la comodidad antes de cambiarlo:

- Resolver el usuario contra la base de datos exige una consulta **pública**
  —hace falta ANTES de tener sesión—, y eso es una puerta para averiguar qué
  usuarios existen probando nombres.
- Completar el correo en el navegador mantiene el inicio de sesión dentro de
  Supabase, que limita los intentos por dirección. Si pasara por nuestra
  función, todos llegarían desde la misma IP de Vercel y ese límite dejaría de
  proteger a nadie.

Las salidas, por orden de coste: (a) exigir que todas las cuentas del personal
usen el dominio interno y dejar los correos reales solo para administración;
(b) una acción de acceso en el servidor que reciba usuario y contraseña, con
mensaje de error uniforme y un límite de intentos propio; (c) renunciar al
nombre de usuario y entrar siempre por correo.

### 2 · Las pruebas

**Las 603 comprobaciones ejercitan `legado/`, no React.** Es lo más importante
que dejó pendiente la migración.

Lo que sigue valiendo para la aplicación nueva: `contrato` (75), `verificar`
(30), `permisos` (35), `identificador` y `ticket`. Las que montan páginas en
jsdom —`dom`, `admin`, `tarjetas`, `carga`, `resumen`— describen una interfaz
que ya no se sirve.

**El día que se borre `legado/` hay que haber escrito antes su equivalente
contra React.** Borrarlas sin sustituirlas deja la migración sin forma de
saber si salió bien.

## Dónde está lo demás

| Archivo | Qué contiene |
|---|---|
| `MIGRACION.md` | Los ocho pasos, qué está verificado y qué queda. El 8 sigue abierto. |
| `CONTRATO.md` | Las 15 acciones, sus formas exactas y las reglas de negocio. Incluye qué se sirve sin sesión y por qué. |
| `README.md` | La documentación larga. **Describe todavía la app de `legado/`**: las decisiones de producto siguen valiendo, la parte técnica no. |
| `supabase/*.sql` | El esquema, numerado por orden de ejecución. Los comentarios dicen qué regla impone cada restricción. El 05 y el 06 son del módulo de pedidos. |
| `pruebas/contrato.mjs` | El contrato ejecutable. Es lo que dice si un backend cumple. |

## Dos cosas que conviene recordar

- **El argumento de la migración era el segundo de Apps Script.** Una petición
  que no leía ni una celda tardaba ~1000 ms. Por eso el backend nuevo mantiene
  la misma disciplina aunque ya no la necesite: `reservas.buscar` devuelve
  detalle y consolidado en una sola llamada, y el mostrador abre el formulario
  sin consultar nada.
- **La deuda que la migración salda es la de la autenticación.** Hasta ahora,
  quien tuviera la URL del backend leía y escribía todo. Dejó de ser cierto al
  desplegar — pero **mientras Apps Script siga sirviendo, sigue siendo cierto
  para él**, y no debe describirse como seguro.
