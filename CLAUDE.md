# reservasCafeterias · UIS

Reserva de almuerzos para las cafeterías de la Universidad Industrial de
Santander. **Herramienta interna del personal de cafetería**, no una página
para los comensales: quien la usa anota la reserva a nombre de otra persona.

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
| `supabase/*.sql` | El esquema, numerado por orden de ejecución. Los comentarios dicen qué regla impone cada restricción. |
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
