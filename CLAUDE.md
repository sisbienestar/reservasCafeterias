# reservasCafeterias · UIS

Reserva de almuerzos para las cafeterías de la Universidad Industrial de
Santander. **Herramienta interna del personal de cafetería**, no una página
para los comensales: quien la usa anota la reserva a nombre de otra persona.

- `index.html` → `reserva.html` — mostrador: registra, corrige y envía el
  ticket de las reservas **de hoy**, de **su** sede. **No cancela.**
- `admin.html` — administración, detrás de una clave: histórico de todas las
  sedes, consolidados, exportación, catálogo. **Aquí sí se cancela.**

Hoy funciona **en producción** contra un backend de Google Apps Script +
Sheets (`FUENTE_DATOS = 'api'` en `js/config.js`).

## Antes de tocar nada

```bash
npm install     # solo la primera vez (trae jsdom)
npm test        # 603 comprobaciones · 0 fallos
```

**Correr `npm test` antes y después de cualquier cambio.** Es la red de
seguridad del proyecto: 23 suites que ejercitan desde la capa de datos hasta
las páginas completas en jsdom, incluido `apps-script/Codigo.gs` ejecutándose
en memoria. Si algo se rompe, lo dice en diez segundos.

Para ver el proyecto: `npx serve .` y abrir `http://localhost:3000`. Los
módulos ES no funcionan con `file://`.

## Reglas que no se negocian

1. **La UI nunca importa de `js/mock/`.** Solo llama a `js/services/`. Un
   único archivo —`js/services/api.js`— sabe que el mock existe. Romper esa
   capa es lo que haría imposible la migración a una base de datos real.
2. **Nada de dependencias en lo que llega al navegador.** Sin framework, sin
   build. `jsdom` está solo para las pruebas y nunca se sirve.
3. **Editar `apps-script/Codigo.gs` no basta**: hay que crear una **VERSIÓN
   NUEVA** de la implementación en Apps Script. Guardar deja la URL `/exec`
   sirviendo la versión anterior, y parece que los cambios no hacen nada.
   Este error ya costó una tarde.
4. **`pruebas/banco/` es contenido generado** por `pruebas/sincroniza.sh`. No
   se edita a mano; se borra y se rehace en cada ejecución.
5. **Todo en español**: código, nombres de variables, comentarios, interfaz y
   documentación. Los comentarios explican **por qué**, no qué.

## Dónde está lo demás

| Archivo | Qué contiene |
|---|---|
| `README.md` | La documentación completa: cada decisión y su porqué, el flujo de cada pantalla, el ticket, el consolidado, la puesta en marcha del backend y el estado actual. **Leerlo antes de un cambio de fondo.** |
| `CONTRATO.md` | Lo que debe cumplir cualquier backend: las 14 acciones, sus formas exactas y las reglas de negocio. Es lo que hace posible cambiar Sheets por una base de datos de verdad. |
| `pruebas/ejecutar.mjs` | El corredor. `node pruebas/ejecutar.mjs <suite>` corre una sola. |

## Dos cosas que conviene recordar

- **No hay autenticación en el servidor.** Quien tenga la URL `/exec` puede
  leer y escribir todo; la clave de admin es un pestillo del navegador, no
  una cerradura. Está asumido mientras esto viva en una red interna, pero no
  debe describirse como seguro.
- **El segundo de Apps Script no se puede quitar.** Una petición que no lee
  ni una celda tarda ~1000 ms: es peaje de la plataforma. Por eso las
  optimizaciones van siempre por el mismo sitio —hacer menos viajes y no
  encadenarlos—, y por eso hay dos suites (`lecturas` y `viajes`) que miden
  ese coste en vez de opinar sobre él.
