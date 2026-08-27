# reservasCafeterias · UIS

Reserva de almuerzos para las cafeterías de la Universidad Industrial de
Santander. **Herramienta interna del personal de cafetería**, no una página
para los comensales: quien la usa anota la reserva a nombre de otra persona.

## En medio de una migración

Hay **dos aplicaciones completas** en este repositorio, y hay que saber cuál
se está tocando antes de tocar nada.

| | En producción | La nueva |
|---|---|---|
| Frontend | `legado/` · HTML + JS sin build | `src/` · React + TypeScript sobre Vite |
| Backend | `apps-script/Codigo.gs` · Sheets | `api/` · Vercel Functions + Supabase |
| Acceso | un SHA-256 comparado en el navegador | sesión de Supabase, validada en el servidor |
| Probado | **sí**: 603 comprobaciones | compila; **nunca se ha ejecutado** |

`MIGRACION.md` tiene los ocho pasos para completar el cambio, y dice con
detalle qué está verificado y qué no. **Léelo antes de dar por supuesto que
algo de `api/` o `src/` funciona**: el SQL no se ha ejecutado nunca y el
frontend nuevo no se ha abierto en un navegador.

`legado/` no se borra todavía. Es lo que está en uso, y sus pruebas son la
única referencia para decidir cuándo React alcanzó paridad.

## Antes de tocar nada

```bash
npm install          # solo la primera vez
npm test             # 603 comprobaciones · 0 fallos  (ejercita legado/)
npm run tipos        # tsc --noEmit                   (ejercita api/ y src/)
```

**Correr los dos antes y después de cualquier cambio.** Se reparten el
proyecto: `npm test` cubre `legado/` y `apps-script/`, y no sabe nada de
TypeScript; `npm run tipos` cubre `api/` y `src/`, y no ejecuta nada.

Si falla solo `viajes`, y solo en «salen las tres a la vez», es una medida de
tiempo de pared que falla de forma intermitente en máquinas cargadas. Ya
fallaba antes de la migración.

Para ver el proyecto nuevo hacen falta dos ventanas y un `.env.local`:

```bash
npm run backend-local    # el backend en :3001
npm run dev              # el frontend en :5173
```

Para ver el que está en producción: `npx serve legado` y abrir el puerto que
diga. Los módulos ES no funcionan con `file://`.

## Reglas que no se negocian

1. **La clave de servicio de Supabase no puede llevar prefijo `VITE_`.**
   Cualquier variable `VITE_*` se empaqueta dentro del JavaScript que descarga
   el navegador. Esa clave se salta RLS y puede leer y escribir todo el campus.
2. **RLS está cerrado del todo y así se queda.** `supabase/02-rls.sql` no
   declara ni una política permisiva, porque la clave anónima es pública y
   Supabase expone una API REST automática sobre las mismas tablas. La única
   puerta es `api/index.ts`. Añadir una política es abrir esa segunda puerta,
   y hay que pensarlo, no hacerlo para salir del paso.
3. **El navegador nunca decide un permiso.** El contexto de sesión de React
   guarda el rol para saber qué pintar; quien autoriza es
   `api/_nucleo/sesion.ts`, en cada petición. Un `rol: 'admin'` falseado en
   las herramientas de desarrollo debe enseñar los botones y que todos fallen.
4. **Las reglas de negocio van en el servidor.** La interfaz las repite para
   avisar antes, pero la que manda es la del backend. `CONTRATO.md` es la
   lista.
5. **`pruebas/banco/` es contenido generado** por `pruebas/sincroniza.sh`. No
   se edita a mano; se borra y se rehace en cada ejecución.
6. **Todo en español**: código, nombres de variables, comentarios, interfaz y
   documentación. Los comentarios explican **por qué**, no qué.

### Y mientras Apps Script siga vivo

7. **Editar `apps-script/Codigo.gs` no basta**: hay que crear una **VERSIÓN
   NUEVA** de la implementación. Guardar deja la URL `/exec` sirviendo la
   versión anterior, y parece que los cambios no hacen nada. Este error ya
   costó una tarde.

## Dónde está lo demás

| Archivo | Qué contiene |
|---|---|
| `MIGRACION.md` | Los ocho pasos para completar el cambio, qué está verificado y qué queda pendiente. **Empezar por aquí.** |
| `CONTRATO.md` | Lo que debe cumplir cualquier backend: las acciones, sus formas exactas y las reglas de negocio. |
| `README.md` | La documentación larga: cada decisión y su porqué, el flujo de cada pantalla, el ticket, el consolidado. Describe todavía la app de `legado/`, que es la que está en uso. |
| `supabase/*.sql` | El esquema, numerado por el orden en que se ejecuta. Los comentarios explican qué regla impone cada restricción. |
| `pruebas/contrato.mjs` | El contrato ejecutable. Es lo que dice si el backend nuevo cumple. |
| `pruebas/ejecutar.mjs` | El corredor. `node pruebas/ejecutar.mjs <suite>` corre una sola. |

## Dos cosas que conviene recordar

- **El segundo de Apps Script era el argumento de la migración.** Una petición
  que no leía ni una celda tardaba ~1000 ms: peaje de la plataforma. Por eso
  las optimizaciones iban siempre por el mismo sitio —hacer menos viajes y no
  encadenarlos— y por eso el backend nuevo mantiene esa disciplina aunque ya
  no la necesite: `reservas.buscar` devuelve detalle y consolidado en una sola
  llamada, y la pantalla de mostrador abre el formulario sin consultar nada.
- **La deuda que la migración salda es la de la autenticación.** Hasta ahora,
  quien tuviera la URL del backend podía leer y escribir todo, y la clave de
  admin era un pestillo del navegador. Eso deja de ser cierto en el paso 7 de
  `MIGRACION.md`, **no antes**: mientras Apps Script siga sirviendo, sigue
  siendo cierto y no debe describirse como seguro.
