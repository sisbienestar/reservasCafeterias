/**
 * El backend nuevo, servido en local sobre un http de Node.
 *
 * Existe para una cosa: poder lanzarle `pruebas/contrato.mjs` sin desplegar
 * nada en Vercel. Es el papel que en el backend anterior hacía
 * `pruebas/simulaAppsScript.mjs`, que montaba Codigo.gs en memoria.
 *
 * La diferencia importante es que aquí NO se simula la base de datos. Monta
 * el enrutador de verdad, con sus comprobaciones de sesión de verdad, y habla
 * con el Supabase que digan las variables de entorno. Un mock de Postgres
 * daría luz verde a un esquema que no existe, que es exactamente el tipo de
 * confianza que esta prueba no debe dar.
 *
 *   node --import tsx pruebas/servidor.mjs
 *   node pruebas/contrato.mjs http://localhost:3001 --escribir --token=<jwt>
 *
 * APUNTA A UN PROYECTO DE PRUEBAS. Con `--escribir`, el contrato crea
 * reservas; las hace en enero de 2020 para no tropezar con datos reales, pero
 * el borrado del sistema es lógico y no se pueden quitar del todo.
 */

// El primero de la lista, y tiene que seguir siéndolo: presta a Node el
// WebSocket que supabase-js exige y que la versión 20 no trae. En Vercel no
// hace falta, porque el entorno Edge sí lo tiene.
import '../supabase/websocketDeNode.mjs';

import { createServer } from 'node:http';
import { manejar } from '../api/_nucleo/enrutador.ts';

const PUERTO = Number(process.env.PUERTO ?? 3001);

const servidor = createServer((peticion, respuesta) => {
  const responder = (sobre) => {
    const cuerpo = JSON.stringify(sobre);
    respuesta.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(cuerpo),
    });
    respuesta.end(cuerpo);
  };

  if (peticion.method === 'GET') {
    responder({ ok: true, data: { servicio: 'reservasCafeterias', estado: 'en marcha' } });
    return;
  }

  const trozos = [];
  peticion.on('data', (t) => trozos.push(t));
  peticion.on('end', async () => {
    let cuerpo;
    try {
      cuerpo = JSON.parse(Buffer.concat(trozos).toString('utf8'));
    } catch {
      responder({
        ok: false,
        error: { codigo: 'PETICION_INVALIDA', mensaje: 'El cuerpo no es JSON válido.' },
      });
      return;
    }

    responder(await manejar(
      String(cuerpo?.accion ?? ''),
      cuerpo?.params ?? {},
      peticion.headers.authorization,
    ));
  });
});

servidor.listen(PUERTO, () => {
  const url = process.env.SUPABASE_URL ?? '(SUPABASE_URL sin definir)';
  console.log(`Backend de reservasCafeterias en http://localhost:${PUERTO}`);
  console.log(`Hablando con ${url}`);
  console.log('Ctrl+C para parar.');
});
