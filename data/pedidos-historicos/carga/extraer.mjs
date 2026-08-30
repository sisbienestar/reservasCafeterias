/**
 * Fase 2 · paso 1: de los archivos planos a una lista de pedidos.
 *
 * Un pedido = un BLOQUE de una hoja, que es un documento FBE.04 impreso: su
 * propio encabezado, su propia sede y su propia fecha. No se agrupa por
 * (proveedor, sede, fecha), porque hay días con dos documentos para la misma
 * sede y fundirlos inventaría un pedido que nunca existió.
 *
 * Escribe `pedidos.json` e `incidencias.json`.
 */
import fs from 'node:fs';
import * as C from './comun.mjs';

const incidencias = [];
const anota = (tipo, detalle) => incidencias.push({ tipo, ...detalle });

const bloques = C.leer('pedidos_bloques_diarios.csv');
const ctx = C.leer('contextos_encabezado_por_hoja.csv');

const SEP = '';
const contextoDe = new Map();
for (const c of ctx) contextoDe.set([c.archivo, c.hoja, c.bloque_idx].join(SEP), c.contexto_encabezado_raw);

/* Filas que no son producto: el pie de firmas, y las que la plantilla imprime
 * de más porque el formulario trae siempre el mismo número de renglones. */
const esFilaDeProducto = (r) =>
  r.producto.trim() !== '' &&
  !/^Espacio para Nombre y firma/i.test(r.fila_no) &&
  !/^Espacio para Nombre y firma/i.test(r.unidad_medida);

/* En `ENE_-_MARZO_COCA_COLA.xlsx` 85 filas salieron corridas una columna: la
 * unidad quedó vacía, «BANDEJA» cayó en cant_solicitada y la cantidad en
 * cant_devuelta. Se reconoce sin ambigüedad —unidad vacía y un texto donde va
 * un número— y se recoloca en vez de perderse. */
function recolocaSiVieneCorrida(r) {
  const s = r.cant_solicitada.trim();
  if (r.unidad_medida.trim() === '' && s !== '' && !Number.isFinite(Number(s))) {
    anota('fila-corrida', { archivo: r.archivo, hoja: r.hoja, bloque: r.bloque_idx,
      producto: r.producto, unidad_recuperada: s, cantidad_recuperada: r.cant_devuelta });
    return { ...r, unidad_medida: s, cant_solicitada: r.cant_devuelta,
      cant_devuelta: r.cant_adicional, cant_adicional: '' };
  }
  return r;
}

const num = (v) => {
  const t = (v ?? '').trim();
  if (t === '') return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/* ── Un pedido por bloque ─────────────────────────────────────────────── */
const porBloque = new Map();

for (const bruta of bloques) {
  if (C.ARCHIVOS_IGNORADOS.has(bruta.archivo)) continue;
  const r = recolocaSiVieneCorrida(bruta);
  if (!esFilaDeProducto(r)) continue;

  const cant = num(r.cant_solicitada);
  if (cant === null || cant <= 0) continue;   // renglón impreso sin nada pedido

  const proveedor_id = C.PROVEEDOR_DE_ARCHIVO[r.archivo];
  if (!proveedor_id) { anota('archivo-sin-proveedor', { archivo: r.archivo }); continue; }

  const kb = [r.archivo, r.hoja, r.bloque_idx].join(SEP);
  const raw = contextoDe.get(kb) ?? '';
  const plano = raw.replace(/\s+/g, ' ');
  const mu = plano.match(/Unidad de Servicio que solicita:\s*\|?\s*([^|]*)/i);
  const unidadTexto = mu ? mu[1].trim() : '';
  const cafeteria_id = C.sedeDeTexto(unidadTexto);
  const deEncabezado = C.fechaDeEncabezado(raw);
  const deHoja = C.fechaDeNombreHoja(r.hoja);

  /* Cuando las dos fechas se contradicen manda el NOMBRE DE LA HOJA.
   *
   * Las hojas se hacen copiando la del día anterior, y lo que se renombra a
   * mano es la pestaña; la casilla dd/mm/aaaa del encabezado se queda como
   * estaba. Se ve en los 20 casos: «AGOSTO 19», dentro del libro de agosto,
   * lleva un encabezado de mayo; «SALIDAS COCA COLA- MARZO 11» lleva uno de
   * febrero. En los dos el mes del encabezado es el del día que se copió.
   *
   * Cuando coinciden —321 de 341— da igual cuál se tome. La del encabezado
   * queda escrita en `origen_historico` para poder revisarlo. */
  const fecha = deHoja ?? deEncabezado;

  if (!cafeteria_id) {
    anota('sin-sede', { archivo: r.archivo, hoja: r.hoja, bloque: r.bloque_idx,
      unidad: unidadTexto, producto: r.producto, cantidad: cant });
    continue;
  }
  if (!fecha) {
    anota('sin-fecha', { archivo: r.archivo, hoja: r.hoja, bloque: r.bloque_idx,
      producto: r.producto, cantidad: cant });
    continue;
  }

  if (!porBloque.has(kb)) {
    /* Las dos fechas se contradicen. Manda la del nombre de la hoja, por lo
     * dicho arriba, y queda anotado para revisión con las dos a la vista. */
    if (deEncabezado && deHoja && deEncabezado !== deHoja) {
      anota('fecha-discrepante', { archivo: r.archivo, hoja: r.hoja, bloque: r.bloque_idx,
        segun_encabezado: deEncabezado, segun_nombre_hoja: deHoja, se_usa: deHoja });
    }
    porBloque.set(kb, {
      proveedor_id, cafeteria_id, fecha,
      fecha_de: deHoja ? 'nombre de hoja' : 'encabezado',
      fecha_encabezado: deEncabezado, fecha_nombre_hoja: deHoja,
      archivo: r.archivo, hoja: r.hoja, bloque_idx: r.bloque_idx,
      categoria_marcada: /Alimentos y bebidas \| X/i.test(plano) ? 'Alimentos y bebidas' : null,
      unidad_texto: unidadTexto,
      lineas: new Map(),
    });
  }
  const p = porBloque.get(kb);

  /* Un producto que sale dos veces DENTRO del mismo documento: la plantilla
   * lo trae repetido. Se suman, porque `pedido_linea` sólo admite una línea
   * por producto y las dos cantidades se escribieron de verdad. */
  const nombre = r.producto.trim().replace(/\s+/g, ' ');
  const kl = C.norm(nombre);
  if (p.lineas.has(kl)) {
    const y = p.lineas.get(kl);
    anota('producto-repetido-en-documento', { archivo: r.archivo, hoja: r.hoja,
      bloque: r.bloque_idx, producto: nombre, cantidades: [y.cantidad, cant] });
    y.cantidad += cant;
    const d = num(r.cant_devuelta);
    if (d !== null) y.devuelta = (y.devuelta ?? 0) + d;
  } else {
    p.lineas.set(kl, { nombre, unidad: r.unidad_medida.trim() || 'UNIDAD', cantidad: cant,
      devuelta: num(r.cant_devuelta), adicional: num(r.cant_adicional), orden: p.lineas.size + 1 });
  }
}

/* ── Documentos copiados y no modificados ─────────────────────────────
 *
 * Dos hojas distintas con el mismo proveedor, la misma sede, la misma fecha y
 * exactamente las mismas líneas no son dos pedidos: son la misma hoja
 * duplicada dentro del libro. Importar las dos doblaría lo pedido ese día. */
const vistos = new Map();
const pedidos = [];
for (const p of porBloque.values()) {
  const huella = [p.proveedor_id, p.cafeteria_id, p.fecha,
    [...p.lineas.values()].map((l) => C.norm(l.nombre) + '=' + l.cantidad).sort().join(';')].join('|');
  if (vistos.has(huella)) {
    const orig = vistos.get(huella);
    anota('documento-duplicado', {
      descartado: p.archivo + '::' + p.hoja + '#' + p.bloque_idx,
      se_queda: orig.archivo + '::' + orig.hoja + '#' + orig.bloque_idx,
      proveedor: p.proveedor_id, sede: p.cafeteria_id, fecha: p.fecha, lineas: p.lineas.size });
    continue;
  }
  vistos.set(huella, p);
  pedidos.push({ ...p, lineas: [...p.lineas.values()] });
}

pedidos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.proveedor_id.localeCompare(b.proveedor_id));
fs.writeFileSync('data/pedidos-historicos/carga/pedidos.json', JSON.stringify(pedidos, null, 1));
fs.writeFileSync('data/pedidos-historicos/carga/incidencias.json', JSON.stringify(incidencias, null, 1));

const cuenta = (f) => { const o = {}; for (const p of pedidos) o[f(p)] = (o[f(p)] || 0) + 1; return o; };
console.log('PEDIDOS:', pedidos.length, '| LÍNEAS:', pedidos.reduce((a, p) => a + p.lineas.length, 0));
console.log('por proveedor:', cuenta((p) => p.proveedor_id));
console.log('por sede:', cuenta((p) => p.cafeteria_id));
console.log('fecha tomada de:', cuenta((p) => p.fecha_de));
const f = pedidos.map((p) => p.fecha).sort();
console.log('rango:', f[0], '→', f[f.length - 1]);
const ti = {}; for (const x of incidencias) ti[x.tipo] = (ti[x.tipo] || 0) + 1;
console.log('incidencias:', ti);

// ¿Cuántos días tienen más de un documento para la misma sede y proveedor?
const multi = new Map();
for (const p of pedidos) {
  const k = [p.proveedor_id, p.cafeteria_id, p.fecha].join('|');
  multi.set(k, (multi.get(k) || 0) + 1);
}
const d = {}; for (const v of multi.values()) d[v] = (d[v] || 0) + 1;
console.log('documentos por (proveedor,sede,fecha):', d);
