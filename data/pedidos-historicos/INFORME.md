# El histórico de pedidos · qué entra, qué no, y por qué

Lo que sale de los siete archivos de `data/pedidos-historicos/` y va a
`supabase/12-historico-pedidos.sql`. Los guiones que lo producen están en
`data/pedidos-historicos/carga/`, y se vuelven a ejecutar en este orden:

```bash
node --env-file=.env.local data/pedidos-historicos/carga/catalogo.mjs   # baja el catálogo de la base
node data/pedidos-historicos/carga/extraer.mjs                          # archivos planos -> pedidos.json
node data/pedidos-historicos/carga/emparejar.mjs                        # nombres -> productos del catálogo
node data/pedidos-historicos/carga/validar.mjs                          # contra las restricciones del esquema
node data/pedidos-historicos/carga/generar-sql.mjs                      # escribe el .sql
node data/pedidos-historicos/carga/cuadre.mjs                           # cada fila de entrada, contada
```

## Lo que entra

| | |
|---|---|
| Pedidos | **348** |
| Líneas | **1 774** |
| Fechas | 2 de febrero → 21 de agosto de 2026 |
| Proveedores nuevos | **3** · `rapifritos`, `neofrut`, y `fruver` inactivo |
| Productos nuevos | **28**, más los 34 del catálogo de `fruver` |
| Sedes | las 4 en servicio, más `servicios-especiales` nueva e inactiva |

Por proveedor: `rapifritos` 257 · `cocacola` 30 · `neofrut` 29 ·
`ramo` 26 · `vicky` 5 · `almacen-colombina` 1.

## El modelo: ninguna tabla nueva

Los pedidos históricos son pedidos. Entran en `pedido` y `pedido_linea` tal
como están, y el esquema ya lo tenía previsto —05-pedidos.sql dice de
`creado_por` que es «NULL solo si algún día se importa un histórico de las
plantillas viejas, escritas cuando no había a quién atribuirlas»—.

**Un pedido = un bloque de una hoja**, que es un documento FBE.04 impreso: su
encabezado, su sede y su fecha. No se agrupa por (proveedor, sede, fecha),
porque hay cinco casos de dos documentos para la misma sede —Camilo Torres
tiene pedido de mañana y de tarde, `CAM` y `CAMT` en el catálogo de puntos de
venta— y fundirlos habría inventado un pedido que nunca existió.

Lo único que se añade es una columna:

```sql
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS origen_historico TEXT;
CREATE UNIQUE INDEX pedido_origen_historico_unico
  ON pedido (origen_historico) WHERE origen_historico IS NOT NULL;
```

Guarda `archivo::hoja#bloque`. Hace la carga repetible sin duplicar —ejecutar
el SQL dos veces no añade nada— y deja volver al Excel cuando una cifra no
cuadre. Es NULL en los pedidos que crea la aplicación.

Los valores que se fijan, y por qué:

- `estado = 'confirmado'` · se pidieron, se imprimieron y se despacharon hace
  meses. Dejarlos en borrador los pondría a esperar una confirmación que ya
  ocurrió fuera del sistema.
- `creado_por = NULL` · lo previsto en el esquema.
- `confirmado_en` = la fecha de elaboración a mediodía. No se sabe la hora, y
  NULL contradiría a `estado`.
- `tipo_documento = 'FBE.04'` para todos, que es la plantilla con la que se
  escribieron —aunque `vicky` y `ramo` hoy estén dados de alta como FBE.34—.
  Es lo que manda el esquema: el pedido guarda el formato con el que se
  elaboró, no el que tiene el proveedor ahora.
- `producto_nombre` y `unidad_medida` van **copiados tal como se escribieron
  en la hoja**, aunque la línea apunte a un producto del catálogo con el
  nombre corregido. Es la misma regla que `reserva.menu_nombre`.

## Dos proveedores que ya estaban con otro nombre

Se comprobó comparando catálogos, no nombres de archivo:

| Archivo | Va a | Prueba |
|---|---|---|
| `ENERO_RECETTA_.xlsx` | `almacen-nutresa` | **55 de 55** productos idénticos, sin sobras |
| `FAMA_*.xlsx` | `ramo` | 7 de 9 idénticos; FAMA distribuye Ramo |

Y uno que se queda aparte a propósito: las nueve pulpas de `NEOFRUT*` se
llaman **exactamente igual** que las nueve de «PULPA SIN DOSIFICAR» de
`pulpas-camilo`, pero en la base ese proveedor está dado de alta como FBE.34 y
estas hojas son FBE.04. Se crea **`neofrut` como proveedor nuevo** con sus 9
pulpas, y allí van sus 29 pedidos.

Es la dirección reversible: si luego resultan ser el mismo proveedor,
fusionarlos son dos UPDATE. Al revés —separar lo que ya se hubiera fusionado—
habría que volver a los Excel. Se cambia en una línea de
`data/pedidos-historicos/carga/emparejar.mjs` (`PROVEEDOR_REAL`).

## Los nombres de producto

86 nombres históricos distintos contra el catálogo:

| Cómo se resolvió | |
|---|---|
| Iguales una vez normalizado | 29 |
| Alias escrito a mano | 21 |
| Por parecido | 2 |
| Producto nuevo | 28 |

El parecido compara palabras (Jaccard) **y exige que los números sean los
mismos**: `600 ML X 24` y `600 ML X 6` son dos referencias, no una escrita de
dos formas. Por eso la presentación de 6 unidades de Coca-Cola entra como
producto nuevo en vez de fundirse con la de 24.

Sobre eso hay una regla que vale más que cualquier medida de texto:

> **Dos nombres que aparecen en el MISMO documento nunca son el mismo
> producto.**

Una hoja de Coca-Cola escribe `FUZE TEA NEGRO - LIMON` en un renglón y
`FUZE TEA LIMON` en el siguiente, con cantidades distintas: para quien la
rellenó son dos cosas. Esa regla corrigió un alias que estaba mal y que
además habría roto `pedido_linea_sin_repetir`.

Las **2 por parecido** son las que conviene mirar, porque son un juicio:

| Histórico | Se empareja con | |
|---|---|---|
| `FUZE TEA MANZANA X 400 ML X 6` | `FUZE TEA MANZANA - LIMONARIA X 400 ML X 6` | 0,80 |
| `FUZE TEA MANGO X 400 ML X 6` | `FUZE TEA MANGO- MANZANILL X 400 ML X 6` | 0,80 |

A favor: la forma corta y la larga **nunca salen en la misma hoja** (0 de 348),
que es lo que se esperaría de una abreviatura.

Los **28 productos nuevos**: 6 de Rapifritos y 9 de Neofrut (sus catálogos
enteros), 11 de Coca-Cola —presentaciones que la siembra no recogía: la de 6
frente a la de 24, el Zero frente al Sin Azúcar, el Del Valle de 188 ml— y 2
de Vicky (`PLATANO VERDE KAHOY 60 g`, que no es ni el salado ni el agridulce,
y `PAPA CEBOLLITAS`).

## Lo que NO entra

### `pedidos_matriz_mensual.csv` · 30 600 filas, 0 pedidos

Las seis hojas de tipo matriz están **en blanco**. Comprobado contra
`respaldo_crudo_completo_todas_las_hojas.json`: lo único no vacío es la fila
de cabecera —los días 1 a 30— y la columna TOTAL, que vale 0 en todas. No hay
ni fechas: las casillas «Fecha desde / Fecha hasta» están vacías.

Lo aprovechable de ellas es el catálogo, y ya está resuelto: los 55 productos
de RECETTA son exactamente `almacen-nutresa`.

La hoja `FRUVER DF` —repetida idéntica en cuatro libros— trae además un
catálogo de **34 productos de fruta y verdura** (aguacate, brócoli, cebolla
junca, tomate chonto…) que **no se parece a ningún proveedor de la base**.

Se da de alta como proveedor `fruver` con **`activo = FALSE`**: el catálogo
queda guardado y no se pierde, pero no sale en el mostrador hasta que se
confirme de quién es. No tiene ni un pedido. Activarlo es un UPDATE de una
línea. La lista sale de `data/pedidos-historicos/carga/fruver.json`.

### `hojas_sin_clasificar_raw.json` · la hoja `PEDIDO DIARIO`

Se descifró entera —bandas de tres días, productos en filas y las cuatro
sedes en columnas (`A3`, `CAM`, `BIE`, `BPRO`), fechas en texto largo— y da
78 pedidos. **No se cargan**, por dos razones:

1. **72 de los 78 son el mismo pedido que ya está en un FBE.04** del mismo
   proveedor, sede y fecha; las cantidades coinciden bajo las variantes de
   nombre (`FLAUTA POLLO QUESO CHAMP` = `FLAUTA POLLO QUESO CHAMPIÑONES
   FRITA`). Es la hoja de trabajo con la que se prepararon los formularios.
2. **Sus fechas no son de fiar.** La propia hoja repite y se equivoca:
   `Febrero 26` aparece dos veces, una marcada «(Miercoles)» y otra
   «(Jueves)»; hay un `Martes 03 de 2026` sin mes; `Marzo 24` y `Abril 6`
   salen dos veces cada uno.

Los 6 que no tienen pareja se explican por la hoja `SALIDAS RAPIFRITOS- FEB26`,
que lleva un encabezado con fecha del 25. Están listados abajo por si se
quieren revisar a mano.

## Una sede que no es una cafetería

`FEBRERO__VICKY_.xlsx :: VIKCYDF` pide para `SERVICIOS ESPECIALES`, que no es
ninguna de las cinco cafeterías pero sí es quien solicita, y
`pedido.cafeteria_id` es NOT NULL. Son `PAPA POLLO x7` (5) y
`PAPA CEBOLLITAS` (33), del 20 de febrero.

Se da de alta como sede, con código `06` y **`activa = FALSE`**. Lo de
inactiva no es un descuido: `cafeteria` **no está atada a ningún módulo** —la
usan reservas y pedidos—, así que darla de alta activa la pondría a ofrecer
almuerzos en `/reservas`, que no es lo que es. Inactiva queda fuera de las dos
listas y su pedido sigue siendo consultable, que es exactamente lo que
01-esquema.sql previó para una sede cerrada.

## Cosas que había que arreglar en los datos

**85 filas corridas una columna**, todas en `ENE_-_MARZO_COCA_COLA.xlsx`: la
unidad quedó vacía, `BANDEJA` cayó en la casilla de la cantidad y la cantidad
en la de «devuelta». Se recolocan. De paso explica por qué **ninguna línea
tiene cantidad devuelta ni adicional**: las 85 que parecían tenerla eran esto.
Las columnas del almacén nunca se rellenaron.

**El archivo `_NEOFRUT_XLS_CONVERTED.xlsx` no se lee.** Es la conversión a
`.xlsx` del mismo libro `_NEOFRUT_.xlsm`: sus 24 bloques son idénticos, línea
a línea, a 24 de los 33 del `.xlsm`. Leer los dos habría duplicado 24 pedidos.

**3 documentos duplicados descartados** (26 líneas) · misma sede, misma fecha
y las mismas líneas exactas, en dos hojas distintas del mismo libro. Los tres
están en `_NEOFRUT_.xlsm`: `NEOFRUT MARZO 16` frente a `NEOFRUT MARZO 16 (2)`,
y `NEOFRUT MAYO 7 11` frente a `NEOFRUT MAYO 7 11 (2)`. Son copias que no se
llegaron a modificar.

**20 hojas con la fecha del encabezado distinta a la del nombre de la hoja.**
Manda el nombre de la hoja. Las hojas se hacen copiando la del día anterior y
lo que se renombra a mano es la pestaña; la casilla dd/mm/aaaa se queda como
estaba. Se ve claro en `AGOSTO 19`, dentro del libro de agosto, con un
encabezado de mayo, y en `SALIDAS COCA COLA- MARZO 11`, con uno de febrero.
La fecha del encabezado queda anotada en las incidencias.

## El cuadre

Las 3 887 filas de `pedidos_bloques_diarios.csv`, una por una:

| | |
|---|---|
| Importadas | 1 801 |
| Producto impreso sin cantidad pedida | 851 |
| Renglón en blanco de la plantilla | 476 |
| Pie de firmas | 359 |
| Del archivo duplicado que no se lee | 284 |
| Cantidad 0 | 116 |

1 801 − 26 (líneas de los documentos duplicados) − 1 (un producto repetido
dentro de un documento, que se suma a su línea) = **1 774**.

No queda ninguna fila sin explicación.

## Para revisar a mano

- Los 6 pedidos de `PEDIDO DIARIO` sin pareja (26 de febrero ×3, 18 de marzo
  ×2, 24 de marzo ×1) y la fecha real de `SALIDAS RAPIFRITOS- FEB26`.
- ~~Si `neofrut` y `pulpas-camilo` son el mismo proveedor.~~ **RESUELTO el 29
  de agosto de 2026: lo son.** Fredy eligió conservar el nombre Neofrut, y la
  fusión está en `supabase/14-fusion-neofrut.sql`. Se hizo al revés de como se
  apuntaba aquí —sobrevive la fila `neofrut`, no la de `pulpas-camilo`— porque
  `pulpas-camilo` no tenía ni un pedido: mover 29 pedidos y reapuntar sus
  líneas para acabar en el mismo sitio era riesgo sin ganancia.
- De quién es el catálogo de `fruver`, para activarlo:
  ```sql
  UPDATE proveedor SET activo = TRUE WHERE id = 'fruver';
  ```
- Las 2 parejas de Fuze Tea de la tabla de arriba.
- Las 20 hojas con la fecha discrepante, si alguna importa.
