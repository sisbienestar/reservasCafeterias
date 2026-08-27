# Puesta en marcha · Supabase + Vercel

Lo que hay que hacer, en orden, para pasar de Apps Script + Sheets a la pila
nueva. Nada de esto se puede hacer desde el repositorio: hace falta entrar a
Supabase y a Vercel.

**Hasta que se complete el paso 7, lo que está en producción sigue siendo la
app vanilla contra Apps Script.** Nada de lo que hay aquí la toca.

---

## Antes de empezar: qué está verificado y qué no

Conviene saberlo, porque cambia cuánto hay que desconfiar de cada paso.

| Pieza | Estado |
|---|---|
| El SQL de `supabase/` | **Ejecutado y funcionando** (27 de agosto de 2026). Las seis tablas y las funciones responden, y `npm run verificar` pasa 30 comprobaciones sobre los datos importados. |
| La importación | **Hecha**: 5 cafeterías, 34 platos, 17 reservas, 32 asientos de historial. |
| El backend de `api/` | Compila con `tsc` en modo estricto, y sus funciones de Postgres están probadas. **La capa de sesión y permisos no se ha ejecutado nunca**: eso es el paso 5. |
| El frontend de `src/` | Compila y empaqueta (`npm run construir`). **No se ha abierto en un navegador**: sin proyecto de Supabase no hay con qué entrar. |
| `legado/` + `npm test` | 603 comprobaciones en verde, como siempre. Es lo único de aquí que está probado de verdad. |

La prueba que convierte «compila» en «funciona» es el paso 5. Hasta ahí, no
hay motivo para creerse nada.

> Nota sobre `npm test`: la suite `viajes` mide tiempos de pared y falla de
> forma intermitente en máquinas cargadas —comprobado también sobre el commit
> anterior a la migración, así que no lo trajo este cambio—. Si falla solo esa
> y solo en la comprobación de «salen las tres a la vez», es eso.

---

## 1. Crear el proyecto de Supabase

Región la más cercana a Colombia. Anota de `Project Settings → API`:

- la URL del proyecto,
- la clave `anon` (pública, va al navegador),
- la clave `service_role` (**secreta**, solo servidor).

## 2. Ejecutar el esquema

Son cuatro archivos de la carpeta `supabase/` de este repositorio, y hay que
llevarlos al editor SQL de Supabase **en este orden y de uno en uno**:

1. `supabase/01-esquema.sql` — tablas, índices y restricciones
2. `supabase/02-rls.sql` — cierra el acceso directo por la API REST
3. `supabase/03-funciones.sql` — las escrituras atómicas y el resumen
4. `supabase/04-lecturas.sql` — las lecturas con la forma del contrato

Para cada uno: ábrelo en el editor, selecciona **todo** el contenido
(`Ctrl+A`), cópialo, pégalo en el editor SQL de Supabase y pulsa **Run**.

> Lo que se pega es el CONTENIDO del archivo, no su nombre. Pegar
> `supabase/01-esquema.sql` en el editor da `syntax error at or near
> "supabase"`, que es exactamente lo que Postgres debe decir cuando le mandas
> una ruta de archivo en vez de SQL.

De uno en uno y mirando el resultado de cada uno: si el tercero falla a medias,
saber cuál fue es la diferencia entre corregir una línea y volver a empezar.

Los cuatro terminan sin devolver filas. `Success. No rows returned` es el
resultado correcto: son órdenes que crean cosas, no consultas.

### Comprobar que el primero entró bien

Antes de seguir con el 02, pega esto y pulsa Run. Tienen que salir seis filas:
`cafeteria`, `carta_opcion`, `perfil`, `reserva`, `reserva_asiento` y
`reserva_cambio`.

```sql
select table_name from information_schema.tables
 where table_schema = 'public' order by table_name;
```

## 3. Sacar los datos de la hoja

No exportes las pestañas a CSV a mano — `opciones` e `historial` llevan comas
dentro y se rompen.

En el editor de Apps Script, guarda el archivo (`Ctrl+S`), elige
**`exportarADrive`** en el desplegable de funciones y pulsa Ejecutar. La
primera vez pedirá permiso para acceder a Drive. El registro dirá el nombre del
archivo y su enlace: ábrelo, descárgalo y **guárdalo como `volcado.json` en la
raíz de este repositorio** (al lado de `package.json`).

> No hace falta crear una versión nueva de la implementación para esto. Esa
> regla vale para lo que se sirve por la URL `/exec`; una función ejecutada
> desde el editor usa el código guardado.

`volcado.json` está en `.gitignore`: lleva nombres y móviles de personas
reales y no puede acabar en un commit.

**Por qué a Drive y no copiando del registro.** También existe
`exportarTodo()`, que escribe el volcado en el registro del editor. El
problema es que ese registro **recorta los mensajes largos**, así que la
función tiene que trocear la salida y hay que pegar los trozos a mano, en orden
y sin colarse. Un JSON al que le falta el final no avisa de forma útil: dice
`Unexpected end of JSON input` y no dice por dónde se cortó. Con el archivo de
Drive no hay nada que pegar.

```bash
npm run importar volcado.json              # ensayo: comprueba y no escribe nada
npm run importar volcado.json -- --de-verdad   # escribe
```

El ensayo **no toca la base de datos**, así que se puede lanzar cuantas veces
haga falta. Si el archivo quedó mal pegado, lo dice ahí mismo con un error de
JSON en vez de a mitad de la importación.

Avisa además de dos cosas que hay que arreglar **en la hoja** antes de importar:

- una reserva que apunte a una cafetería que no existe;
- **dos reservas activas del mismo móvil el mismo día y sede.** El índice
  `reserva_sin_duplicado` no las admite. Apps Script aplicaba la regla, pero la
  hoja se editaba a veces a mano, así que puede haber parejas que la incumplan.
  Hay que cancelar una de las dos.

### Comprobar lo importado

```bash
npm run verificar
```

30 comprobaciones sobre los datos de verdad: que `telefono` sea cadena, que
`activa` sea booleano, que `fecha` salga como `'AAAA-MM-DD'`, que el historial
llegue anidado dentro de cada reserva, que `por_dia` traiga también los días
vacíos y que el límite recorte el detalle pero nunca los totales.

No sustituye a `pruebas/contrato.mjs` —no mira sesión, ni permisos, ni códigos
de error—, pero se puede lanzar aquí mismo, antes de que exista ninguna cuenta.

## 4. Crear las cuentas

`Authentication → Users → Add user` para cada persona. Después, **una fila en
`perfil` por cada una**: sin ella la cuenta entra pero no puede hacer nada, y
es a propósito — la cuenta es la identidad, el perfil es el permiso.

```sql
insert into perfil (usuario_id, nombre, rol, cafeteria_id) values
  ('<uuid del usuario>', 'Nombre de quien atiende', 'mostrador', 'bienestar-pro'),
  ('<uuid del usuario>', 'Nombre de administración', 'admin', null);
```

Un `mostrador` necesita sede y un `admin` no puede tenerla: lo impone el
`CHECK` de la tabla.

## 5. Comprobar que el backend cumple el contrato

Este es el paso que decide si la migración salió bien.

```bash
npm run backend-local          # ventana 1
```

Los guiones `backend-local` e `importar` cargan `.env.local` con
`--env-file`. Node no lo hace por su cuenta, así que llamarlos con `node` a
pelo falla diciendo que faltan las variables.

Hace falta un token de sesión **de un perfil `admin`**: el contrato ejercita
cancelar, buscar y guardar la carta, que un perfil de mostrador tiene
prohibidas y fallarían con `NO_AUTORIZADO` sin que eso signifique un
incumplimiento. Se saca entrando en la app, o desde la consola del navegador:

```js
(await supabase.auth.getSession()).data.session.access_token
```

Y entonces, en la ventana 2:

```bash
node pruebas/contrato.mjs http://localhost:3001 --token=<jwt>              # solo lee
node pruebas/contrato.mjs http://localhost:3001 --token=<jwt> --escribir   # completo
```

**Verde = el backend cumple.** Es la misma prueba que pasaban el mock y Apps
Script, así que no hay discusión sobre si «antes funcionaba».

`--escribir` trabaja entero dentro de una semana de enero de 2020, donde no
vive ninguna reserva real. Deja dos reservas canceladas con esa fecha: es
esperado, porque el borrado del sistema es lógico y debe serlo.

## 6. Levantar la aplicación en local

```bash
npm run backend-local    # ventana 1 · el backend en :3001
npm run dev              # ventana 2 · el frontend en :5173
```

Vite redirige `/api` al backend local, así que el navegador habla igual que en
producción y `VITE_API_URL` no cambia entre entornos.

Aquí es donde hay que **mirar la aplicación de verdad**: entrar con una cuenta
de mostrador y con una de administración, registrar una reserva, editarla, ver
el ticket, cancelar desde administración, publicar una carta. Es la primera vez
que este código se abre en un navegador.

## 7. Desplegar en Vercel

Importa el repositorio. Variables de entorno (`Project Settings → Environment
Variables`):

| Variable | Valor | Ojo |
|---|---|---|
| `SUPABASE_URL` | la URL del proyecto | |
| `SUPABASE_SERVICE_ROLE_KEY` | la clave de servicio | **Nunca con prefijo `VITE_`.** Una variable `VITE_*` se empaqueta dentro del JavaScript que descarga el navegador. |
| `SUPABASE_ANON_KEY` | la clave anónima | |
| `ORIGENES_PERMITIDOS` | `https://TU-APP.vercel.app` | Sin esto no se responde a nadie con credenciales |
| `PERMITIR_FIN_DE_SEMANA` | `false` | |
| `VITE_SUPABASE_URL` | la URL del proyecto | |
| `VITE_SUPABASE_ANON_KEY` | la clave anónima | |
| `VITE_API_URL` | `/api` | |

Y después, contra el despliegue:

```bash
node pruebas/contrato.mjs https://TU-APP.vercel.app/api --token=<jwt>
```

Sin `--escribir`: contra producción solo se lee.

## 8. Apagar lo viejo

**No antes de que el paso 7 esté en verde y alguien haya usado la aplicación
nueva un día entero de servicio.**

> ### Pendiente en la hoja, para antes de este paso
>
> El primer volcado traía dos reservas con el identificador `02-260823-001`:
> la del 23 de agosto, correcta, y una **cancelada del 19 de agosto** a la que
> `migrarAIdentificadorNuevo()` le puso la fecha en que se ejecutó la
> migración. `reserva.id` es clave primaria, así que Postgres rechaza la
> segunda.
>
> Se corrigió **en `volcado.json`, no en la hoja**, para no bloquear las
> pruebas: se le puso `02-260819-001`, que estaba libre y es el que le tocaba.
>
> **Antes de reexportar aquí hay que arreglarlo en la hoja también**, o el
> volcado nuevo traerá otra vez el identificador repetido — y lo hará en el
> peor momento, en mitad del cambio. Es una celda: en la pestaña Reservas,
> la fila con `02-260823-001` cuya fecha sea `2026-08-19` pasa a
> `02-260819-001`.

1. Retirar el acceso al despliegue de Apps Script (`Implementar → Gestionar
   implementaciones → Archivar`). No borrar el proyecto ni la hoja: son la
   copia de seguridad de los datos hasta que Supabase tenga historia propia.
2. Volver a exportar e importar, para recoger las reservas que entraran en la
   hoja entre el paso 3 y el apagado. `importar.mjs` usa `upsert`: repetirlo
   corrige en vez de duplicar.

---

## Lo que queda pendiente después de esto

Nada de lo de aquí bloquea el despliegue, pero conviene tenerlo escrito.

- **Las pruebas de interfaz siguen apuntando a `legado/`.** Las 603
  comprobaciones ejercitan la app vanilla, no la de React. Mientras las dos
  convivan eso está bien —son la referencia de paridad—, pero el día que se
  borre `legado/` hay que haber escrito antes su equivalente contra React, o la
  migración se queda sin forma de saber si salió bien. Las que NO dependen de
  la interfaz (`contrato`, `identificador`, `ticket`) siguen valiendo tal cual.
- **`apps-script/Codigo.gs` y las suites que lo prueban** (`appsscript`,
  `columnas`, `reparacion`, `cache`, `lecturas`) describen un backend que ya no
  se usa. Se quedan mientras Apps Script siga siendo la copia de seguridad, y
  se van con él.
- **El historial de las reservas importadas no tiene autor.** El campo existe
  y las nuevas lo rellenan; las viejas se escribieron cuando no había a quién
  atribuirlas, y ponerle uno inventado sería peor que dejarlo vacío.
- **La caducidad de la sesión no está pensada.** Hoy se renueva sola mientras
  el navegador esté abierto. En un equipo compartido de mostrador, quizá deba
  cerrarse al acabar el turno.
