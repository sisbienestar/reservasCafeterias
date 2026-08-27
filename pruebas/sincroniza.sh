#!/bin/bash
# Prepara pruebas/banco/, la copia del proyecto sobre la que corren las suites.
#
# ¿Por qué una copia y no el proyecto directamente? Por dos motivos:
#
#  1. `js/config.js` apunta al backend real, que es lo correcto en el
#     navegador y equivocado aquí: las suites de interfaz ejercitan la
#     pantalla, no la red. En la copia se fuerza el mock.
#  2. Se necesitan DOS versiones a la vez: `banco/js` contra el mock, y
#     `banco/js-api` contra el Codigo.gs real ejecutándose en memoria. La
#     segunda es una copia de la primera con UNA línea cambiada, la que elige
#     el transporte, y es lo que permite comprobar que el frontend de verdad
#     entiende al backend de verdad.
#
# banco/ es contenido GENERADO: se borra y se rehace en cada ejecución, y no
# debe editarse a mano. Lo que se edita es el proyecto.
set -e
cd "$(dirname "$0")"

if [ ! -f ../index.html ]; then
  echo "No encuentro el proyecto en ..; ejecuta este script desde pruebas/." >&2
  exit 1
fi

rm -rf banco
mkdir -p banco
cp -r ../js banco/js
cp -r ../assets banco/assets
cp ../*.html banco/
cp ../css banco/css -r

# El interruptor: en el banco siempre se usa el mock.
sed -i "s/export const FUENTE_DATOS = 'api';/export const FUENTE_DATOS = 'mock';/" banco/js/config.js

# La segunda copia, idéntica salvo el transporte.
cp -r banco/js banco/js-api
sed -i "s|import { enviar as enviarMock } from '../mock/mockApi.js';|import { enviar as enviarMock } from './transporteSimulado.js';|" \
  banco/js-api/services/api.js

cat > banco/js-api/services/transporteSimulado.js <<'JS'
/** Transporte de prueba: ejecuta Codigo.gs en memoria en vez de hacer fetch. */
import { crearBackendSimulado } from '../../../simulaAppsScript.mjs';

const backend = crearBackendSimulado();
export const libro = backend.libro;

/**
 * Cada llamada es un viaje al servidor. Contra Google cuesta más de un
 * segundo aunque el servidor no lea nada, así que aquí se puede simular esa
 * espera con RETARDO_MS: sin ella, medir tiempos en memoria daría siempre
 * cero y no distinguiría dos peticiones encadenadas de dos en paralelo, que
 * es exactamente lo que hay que medir.
 */
const RETARDO_MS = Number(process.env.RETARDO_MS || 0);

/** Las acciones pedidas, en orden. Las pruebas la vacían y la leen. */
export const viajes = [];

export async function enviar(accion, params = {}) {
  viajes.push(accion);
  const respuesta = backend.enviar(accion, params);
  if (RETARDO_MS) await new Promise((r) => setTimeout(r, RETARDO_MS));
  return respuesta;
}
JS

grep -q "FUENTE_DATOS = 'mock'" banco/js/config.js || { echo "El mock no quedó forzado." >&2; exit 1; }
echo "banco/ listo (mock forzado, transporte simulado en js-api)"
