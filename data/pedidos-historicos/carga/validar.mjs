/**
 * Comprueba la carga contra las restricciones de 05-pedidos.sql ANTES de
 * ejecutarla. Barato de correr y evita descubrir a mitad de la transacción
 * que dos nombres distintos apuntaban al mismo producto.
 */
import fs from 'node:fs';
import * as C from './comun.mjs';
import { PROVEEDOR_REAL } from './emparejar.mjs';

const pedidos = JSON.parse(fs.readFileSync('data/pedidos-historicos/carga/pedidos.json', 'utf8'));
const decisiones = new Map(JSON.parse(fs.readFileSync('data/pedidos-historicos/carga/decisiones.json', 'utf8')).map((d) => [d.clave, d]));
const nuevos = JSON.parse(fs.readFileSync('data/pedidos-historicos/carga/nuevos.json', 'utf8'));
const cat = JSON.parse(fs.readFileSync('data/pedidos-historicos/carga/catalogo-actual.json', 'utf8'));

const SEDES = new Set(['bienestar-pro', 'camilo-torres', 'bienestar-universitario', 'administracion-3', 'cafeteria-salud', 'servicios-especiales']);
const fallos = [];
const mal = (r, d) => fallos.push(r + ' · ' + JSON.stringify(d));

const claveNueva = (p, n) => p + '|' + C.norm(n);
const idNuevo = new Map();
nuevos.forEach((n, i) => idNuevo.set(claveNueva(n.proveedor, n.nombre), 'NUEVO#' + i));
const idsCatalogo = new Set(cat.map((p) => p.id));

const origenes = new Set();
let lineas = 0;

for (const p of pedidos) {
  const proveedor = PROVEEDOR_REAL[p.proveedor_id];
  const origen = p.archivo + '::' + p.hoja + '#' + p.bloque_idx;

  if (!proveedor) mal('proveedor sin equivalencia', { p: p.proveedor_id });
  if (!SEDES.has(p.cafeteria_id)) mal('cafeteria_id inexistente', { origen, sede: p.cafeteria_id });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fecha)) mal('fecha con formato raro', { origen, fecha: p.fecha });
  if (origenes.has(origen)) mal('origen_historico repetido (rompe el índice único)', { origen });
  origenes.add(origen);
  if (!p.lineas.length) mal('pedido sin líneas', { origen });

  // pedido_linea_sin_repetir UNIQUE (pedido_id, producto_id)
  const productosDelPedido = new Set();
  for (const l of p.lineas) {
    lineas++;
    const d = decisiones.get(proveedor + '|' + C.norm(l.nombre));
    if (!d) { mal('línea sin decisión de producto', { origen, nombre: l.nombre }); continue; }

    const ref = d.via === 'nuevo'
      ? idNuevo.get(claveNueva(proveedor, d.grupo_nombre ?? l.nombre))
      : d.producto_id;
    if (ref === undefined) { mal('producto nuevo sin fila que lo cree', { origen, nombre: l.nombre }); continue; }
    if (d.via !== 'nuevo' && !idsCatalogo.has(ref)) mal('producto_id que no existe', { origen, ref });

    if (productosDelPedido.has(ref)) {
      mal('DOS LÍNEAS AL MISMO PRODUCTO en un pedido (viola pedido_linea_sin_repetir)',
        { origen, producto: ref, nombre: l.nombre });
    }
    productosDelPedido.add(ref);

    if (!(l.cantidad > 0)) mal('cantidad_solicitada no es > 0', { origen, nombre: l.nombre, cantidad: l.cantidad });
    if (l.devuelta !== null && l.devuelta < 0) mal('cantidad_devuelta < 0', { origen, nombre: l.nombre });
    if (l.adicional !== null && l.adicional < 0) mal('cantidad_adicional < 0', { origen, nombre: l.nombre });
    if ((l.devuelta ?? 0) > l.cantidad + (l.adicional ?? 0)) {
      mal('devuelta > solicitada + adicional (viola pedido_linea_devuelta_posible)',
        { origen, nombre: l.nombre, solicitada: l.cantidad, devuelta: l.devuelta, adicional: l.adicional });
    }
    if (!l.unidad) mal('unidad_medida vacía (es NOT NULL)', { origen, nombre: l.nombre });
  }
}

console.log('pedidos:', pedidos.length, '| líneas:', lineas, '| orígenes distintos:', origenes.size);
if (!fallos.length) console.log('\nSIN FALLOS: la carga cumple todas las restricciones del esquema.');
else {
  console.log('\n' + fallos.length + ' FALLOS:');
  const porTipo = {};
  for (const f of fallos) { const t = f.split(' · ')[0]; (porTipo[t] ||= []).push(f); }
  for (const [t, l] of Object.entries(porTipo)) {
    console.log('\n  [' + l.length + '] ' + t);
    l.slice(0, 8).forEach((x) => console.log('      ' + x.split(' · ')[1]));
  }
  process.exitCode = 1;
}
