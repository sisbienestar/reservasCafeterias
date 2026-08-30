/**
 * Fase 2 · paso 2: cada nombre histórico contra el catálogo del proveedor.
 *
 * El emparejamiento va en tres pasadas, de más segura a menos:
 *
 *   1. ALIAS      · una tabla escrita a mano, para lo que ningún algoritmo
 *                   puede saber: que «FAMA» vende Ramo, o que «MIXTO BBQ 40 g
 *                   bolsa x 6» es el «MIXTON BBQ» del catálogo.
 *   2. EXACTO     · mismo nombre una vez normalizado (sin tildes, sin dobles
 *                   espacios, en mayúsculas).
 *   3. PARECIDO   · Jaccard de palabras + los números que lleva el nombre.
 *                   Los números MANDAN: «600 ML X 24» y «600 ML X 6» son dos
 *                   referencias distintas, no una escrita de dos formas, así
 *                   que si los números no coinciden no hay pareja.
 *
 * Lo que no pasa ninguna de las tres se convierte en producto NUEVO del
 * proveedor, y queda listado para que alguien lo mire.
 */
import fs from 'node:fs';
import * as C from './comun.mjs';

const cat = JSON.parse(fs.readFileSync('data/pedidos-historicos/carga/catalogo-actual.json', 'utf8'));
const pedidos = JSON.parse(fs.readFileSync('data/pedidos-historicos/carga/pedidos.json', 'utf8'));

/* ── Qué proveedor de la base es cada archivo histórico ────────────────
 *
 * Tres no se llaman igual en la base que en los archivos, y se comprobó
 * comparando los catálogos, no los nombres:
 *
 *   FAMA    -> ramo           · 7 de sus 9 productos son de Ramo, con el
 *                               nombre idéntico. FAMA es quien lo distribuye.
 *   NEOFRUT -> neofrut        · sus 9 pulpas coinciden letra por letra con las
 *                               de `pulpas-camilo`, pero aquélla está dada de alta
 *                               como FBE.34 y estas hojas son FBE.04. Se crea
 *                               aparte a propósito: si resultan ser el mismo
 *                               proveedor, fusionarlos es un UPDATE; separar lo
 *                               ya fusionado obliga a volver a los Excel.
 *   RECETTA -> almacen-nutresa· 55 de 55 idénticos, sin sobras.
 */
export const PROVEEDOR_REAL = {
  cocacola: 'cocacola',
  'almacen-colombina': 'almacen-colombina',
  vicky: 'vicky',
  fama: 'ramo',
  neofrut: 'neofrut',           // proveedor nuevo · ver la nota de arriba
  recetta: 'almacen-nutresa',
  rapifritos: 'rapifritos',        // proveedor nuevo
};

/* Lo que el algoritmo no puede deducir. Clave: proveedor de la base +
 * nombre histórico normalizado. Valor: el `nombre` exacto del catálogo. */
const ALIAS = {
  // ── Vicky · el catálogo no lleva el número de unidades por bolsa y el
  //    histórico sí, y además abrevia.
  'vicky|PAPA POLLO X7': 'PAPA POLLO',
  'vicky|ROSQUILLAS DE QUESO X6': 'ROSQUILLAS DE QUESO',
  'vicky|TROCILLOS X6': 'TROCILLOS',
  'vicky|PLATANO SALADO X6': 'PLATANO SALADO',
  'vicky|CHICHARRON CARNUDO NAT X6': 'CHICHARRON CARNUDO NAT',
  'vicky|CHICHARRON CARNUDO PICANTE X6': 'CHICHARRON CARNUDO PICANTE',
  'vicky|PAPA MAYONESA X6': 'PAPA MAYONESA',
  'vicky|PAPA BBQX6': 'PAPA BBQ',
  'vicky|CHICHARRON CARNUDO NATURAL 30 G BOLSA X 6': 'CHICHARRON CARNUDO NAT',
  'vicky|MIXTO BBQ 40 G BOLSA X 6': 'MIXTON BBQ',
  'vicky|TROCILLO SABOR POLLO 25 G': 'TROCILLOS',

  // ── Colombina · el histórico añade las unidades del empaque al final.
  'almacen-colombina|BOM BOM BUM 24': 'BOM BOM BUM',
  'almacen-colombina|CHOCOBREAK 50': 'CHOCOBREAK',
  'almacen-colombina|CREMA MUU 12': 'CREMA MUU',
  'almacen-colombina|MAX COCO WAFER 10': 'MAX COCO WAFER',
  'almacen-colombina|NUCITA 18': 'NUCITA',

  // ── Ramo (los archivos de FAMA)
  'ramo|LIMONCITAS X8 GALLETAS': 'GALLETAS LIMONCITAS X 8',
  'ramo|GALA X 60 GR': 'GALA TAJADA X 60 GR',

  // ── Coca-Cola · variantes de redacción de la MISMA referencia. Sólo las
  //    que no cambian ni el sabor ni el tamaño ni las unidades.
  'cocacola|GASEOSA CUATRO PET 400ML': 'CUATRO PET 400 ML X 12',
  'cocacola|GASEOSA KOLA ROMAN PET 400ML': 'KOLA ROMAN  400 ML X 12',
  'cocacola|GASEOSA SPRITE PET 400ML': 'SPRITE PET 400 ML X 12',
};

/* Nombres históricos que NO se emparejan aunque se parezcan, porque son otra
 * referencia. Se crean como producto nuevo del proveedor. El motivo queda
 * escrito porque es lo que habrá que revisar si algún día se corrige. */
const NO_EMPAREJAR = {
  'cocacola|COCACOLA ZERO 400 ML X 12': 'Zero y Sin Azúcar son dos referencias distintas de Coca-Cola.',
  'cocacola|COCACOLA ZERO PET 400 ML X 12': 'Zero y Sin Azúcar son dos referencias distintas de Coca-Cola.',
  'vicky|PLATANO VERDE KAHOY 60 G': 'El catálogo tiene «PLATANO SALADO» y «PLATANO AGRIDULCE»; verde no es ninguno de los dos.',
};

/* «X6» y «400ML» son dos cosas pegadas: hay que separarlas antes de contar
 * palabras, o «X6» pasa por una palabra y «400ML» esconde el número. */
const suelta = (s) => s.replace(/([A-Z])(\d)/g, '$1 $2').replace(/(\d)([A-Z])/g, '$1 $2');

const numerosDe = (s) => (s.match(/\d+/g) ?? []).map(Number).sort((a, b) => a - b).join(',');
const palabrasDe = (s) => new Set(suelta(s).split(/[^A-Z0-9ÑÜ]+/).filter((w) => w.length > 1 && !/^\d+$/.test(w)));

/* Palabras que no distinguen una referencia de otra: el envase, la unidad y
 * los conectores. Todo lo demás SÍ distingue —GAS, LIMON, ZERO, MORA— y por
 * eso dos nombres que difieran en una sola de ellas no son el mismo producto. */
const VACIAS = new Set(['ML', 'PET', 'GR', 'BOLSA', 'UND', 'UNID', 'UNIDAD', 'CAJA',
  'PAQUETE', 'GASEOSA', 'DEL', 'DE', 'LA', 'EL', 'Y', 'TJDA']);
const significativas = (s) => [...palabrasDe(s)].filter((w) => !VACIAS.has(w) && w !== 'X').sort().join(' ');

/** Dos escrituras del MISMO producto: mismos números y mismas palabras con
 *  significado. Es deliberadamente estricta; agrupar de menos sólo deja dos
 *  filas en el catálogo, agrupar de más mezcla dos referencias distintas. */
const mismaReferencia = (a, b) =>
  numerosDe(a) === numerosDe(b) && significativas(a) === significativas(b);

function parecido(a, b) {
  // Los números tienen que ser los mismos: distinguen tamaño y unidades.
  if (numerosDe(a) !== numerosDe(b)) return 0;
  const A = palabrasDe(a), B = palabrasDe(b);
  if (!A.size || !B.size) return 0;
  let comunes = 0;
  for (const w of A) if (B.has(w)) comunes++;
  return comunes / (A.size + B.size - comunes);
}

const UMBRAL = 0.6;

const porProveedor = new Map();
for (const p of cat) {
  const l = porProveedor.get(p.proveedor_id) ?? [];
  l.push(p);
  porProveedor.set(p.proveedor_id, l);
}

/* ── Dos nombres del MISMO documento nunca son el mismo producto ────────
 *
 * Si una hoja escribe «FUZE TEA NEGRO - LIMON» en un renglón y «FUZE TEA
 * LIMON» en el siguiente, con dos cantidades distintas, es que para quien la
 * rellenó son dos cosas. Ningún parecido de texto puede saber eso; el
 * documento sí lo dice.
 *
 * Además de ser cierto, evita romper `pedido_linea_sin_repetir`, que no deja
 * dos líneas del mismo producto en un pedido.
 *
 * Se indexa por FIRMA y no por el nombre literal, para que la prohibición
 * alcance a las variantes de escritura: «FUZE TEA NEGRO - LIMON» convive con
 * «FUZE TEA LIMON» en una hoja, y eso basta para que «FUZE TEA NEGRO LIMON»
 * —el mismo producto sin el guion— tampoco pueda emparejarse con ella. */
const firma = (s) => numerosDe(s) + '#' + significativas(s);

const convive = new Map();
for (const p of pedidos) {
  const proveedor = PROVEEDOR_REAL[p.proveedor_id];
  const firmas = p.lineas.map((l) => firma(C.norm(l.nombre)));
  for (const a of firmas) {
    const s = convive.get(proveedor + '|' + a) ?? new Set();
    for (const b of firmas) if (b !== a) s.add(b);
    convive.set(proveedor + '|' + a, s);
  }
}
/** ¿Han salido `norm` y el producto `destino` en un mismo documento? */
const seVenJuntos = (proveedor, norm, destino) => {
  const s = convive.get(proveedor + '|' + firma(norm));
  return !!s && s.has(firma(C.norm(destino.nombre)));
};

const decisiones = new Map();     // proveedorReal|nombreNorm -> decisión
const nuevos = new Map();         // proveedorReal|nombreNorm -> producto nuevo
const informe = { alias: [], exacto: [], parecido: [], nuevo: [], dudoso: [], convivencia: [] };

for (const p of pedidos) {
  const proveedor = PROVEEDOR_REAL[p.proveedor_id];
  for (const l of p.lineas) {
    const norm = C.norm(l.nombre);
    const k = proveedor + '|' + norm;
    if (decisiones.has(k)) { decisiones.get(k).veces++; continue; }

    const catalogo = porProveedor.get(proveedor) ?? [];
    let d = null;

    if (ALIAS[k]) {
      const destino = catalogo.find((x) => x.nombre === ALIAS[k]);
      if (!destino) throw new Error('Alias apunta a un producto que no existe: ' + k + ' -> ' + ALIAS[k]);
      if (seVenJuntos(proveedor, norm, destino)) {
        throw new Error('El alias ' + k + ' -> ' + ALIAS[k] +
          ' junta dos nombres que aparecen en el MISMO documento: son productos distintos.');
      }
      d = { via: 'alias', producto: destino, nombre: l.nombre, proveedor };
      informe.alias.push({ proveedor, historico: l.nombre, catalogo: destino.nombre });
    } else if (NO_EMPAREJAR[k]) {
      d = { via: 'nuevo', nombre: l.nombre, proveedor, motivo: NO_EMPAREJAR[k] };
    } else {
      const exacto = catalogo.find((x) => C.norm(x.nombre) === norm);
      if (exacto) {
        d = { via: 'exacto', producto: exacto, nombre: l.nombre, proveedor };
        informe.exacto.push({ proveedor, nombre: l.nombre });
      } else {
        const puntuados = catalogo.map((x) => ({ x, s: parecido(norm, C.norm(x.nombre)) }))
          .filter((y) => y.s > 0)
          .filter((y) => {
            if (!seVenJuntos(proveedor, norm, y.x)) return true;
            informe.convivencia.push({ proveedor, historico: l.nombre, descartado: y.x.nombre,
              puntuacion: +y.s.toFixed(2) });
            return false;   // conviven en una hoja: no pueden ser el mismo
          })
          .sort((a, b) => b.s - a.s);
        const mejor = puntuados[0];
        if (mejor && mejor.s >= UMBRAL) {
          d = { via: 'parecido', producto: mejor.x, nombre: l.nombre, proveedor, puntuacion: mejor.s };
          informe.parecido.push({ proveedor, historico: l.nombre, catalogo: mejor.x.nombre, puntuacion: +mejor.s.toFixed(2) });
          if (mejor.s < 0.8 || (puntuados[1] && puntuados[1].s === mejor.s)) {
            informe.dudoso.push({ proveedor, historico: l.nombre, elegido: mejor.x.nombre,
              puntuacion: +mejor.s.toFixed(2),
              otros: puntuados.slice(1, 4).filter((y) => y.s > 0.4).map((y) => y.x.nombre + ' (' + y.s.toFixed(2) + ')') });
          }
        } else {
          d = { via: 'nuevo', nombre: l.nombre, proveedor,
            motivo: mejor ? 'el más parecido del catálogo se queda en ' + mejor.s.toFixed(2) + ': ' + mejor.x.nombre
                          : 'ningún producto del catálogo comparte números ni palabras' };
        }
      }
    }

    if (d.via === 'nuevo') {
      nuevos.set(k, { proveedor, nombre: l.nombre, unidad: l.unidad, motivo: d.motivo, veces: 0 });
    }
    d.veces = 1;
    decisiones.set(k, d);
  }
}

/* ── Los nuevos, entre ellos ──────────────────────────────────────────
 *
 * «AGUA GAS BRISA LIMON 600 ML X 6», «… X6» y «… 6» son la misma referencia
 * escrita de tres formas. Ninguna está en el catálogo, así que las tres
 * llegan aquí como nuevas; si no se agrupan, crearían tres productos donde
 * hay uno. Se agrupan con la misma regla de parecido, y se queda como nombre
 * el más usado —el que más veces se escribió es el que la gente reconoce—. */
for (const [k, n] of nuevos) n.veces = decisiones.get(k).veces;

const grupos = [];
for (const [k, n] of [...nuevos].sort((a, b) => b[1].veces - a[1].veces)) {
  const norm = k.slice(n.proveedor.length + 1);
  const g = grupos.find((x) => x.proveedor === n.proveedor && mismaReferencia(x.norm, norm));
  if (g) { g.variantes.push({ clave: k, nombre: n.nombre, veces: n.veces }); decisiones.get(k).grupo = g; }
  else {
    const nuevo = { proveedor: n.proveedor, norm, nombre: n.nombre, unidad: n.unidad,
      motivo: n.motivo, variantes: [], veces: n.veces };
    grupos.push(nuevo);
    decisiones.get(k).grupo = nuevo;
  }
}
for (const g of grupos) informe.nuevo.push({ proveedor: g.proveedor, nombre: g.nombre, unidad: g.unidad,
  motivo: g.motivo, veces: g.veces, variantes: g.variantes.map((v) => v.nombre) });

fs.writeFileSync('data/pedidos-historicos/carga/nuevos.json', JSON.stringify(grupos.map((g) => ({
  proveedor: g.proveedor, nombre: g.nombre, unidad: g.unidad, motivo: g.motivo,
  variantes: g.variantes.map((v) => v.nombre) })), null, 1));

fs.writeFileSync('data/pedidos-historicos/carga/decisiones.json',
  JSON.stringify([...decisiones].map(([k, v]) => ({ clave: k, via: v.via, veces: v.veces,
    producto: v.producto?.nombre, producto_id: v.producto?.id, grupo_nombre: v.grupo?.nombre })), null, 1));
fs.writeFileSync('data/pedidos-historicos/carga/informe-productos.json', JSON.stringify(informe, null, 1));

console.log('nombres históricos distintos:', decisiones.size);
console.log('  por alias escrito a mano :', informe.alias.length);
console.log('  exactos                  :', informe.exacto.length);
console.log('  por parecido             :', informe.parecido.length);
console.log('  productos NUEVOS         :', informe.nuevo.length);
console.log('  marcados como dudosos    :', informe.dudoso.length);

console.log('\n=== POR PARECIDO ===');
informe.parecido.forEach((x) => console.log('  ', x.puntuacion, '|', x.proveedor, '|', x.historico, '->', x.catalogo));
console.log('\n=== DUDOSOS (revisar) ===');
informe.dudoso.forEach((x) => console.log('  ', x.proveedor, '|', x.historico, '-> ELEGIDO', x.elegido, '(' + x.puntuacion + ')', x.otros.length ? '| otros: ' + x.otros.join(', ') : ''));
console.log('\n=== PRODUCTOS NUEVOS ===');
const porProv = {};
for (const n of informe.nuevo) (porProv[n.proveedor] ||= []).push(n);
for (const [p, l] of Object.entries(porProv)) {
  console.log('\n  ' + p + ' (' + l.length + ')');
  l.forEach((n) => console.log('     ', n.nombre, '·', n.unidad, '\n         ' + n.motivo));
}
