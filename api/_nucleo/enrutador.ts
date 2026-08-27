/**
 * El mapa de acciones, y el único sitio donde se decide qué sale por el cable.
 *
 * Está separado de `api/index.ts` a propósito: aquí no se sabe nada de
 * peticiones HTTP ni de Vercel. Eso permite que `pruebas/servidor.mjs` monte
 * el mismo enrutador sobre un servidor de Node corriente y que
 * `pruebas/contrato.mjs` lo interrogue sin desplegar nada — que es lo que en
 * el backend anterior hacía `pruebas/appsscript.mjs` con Codigo.gs.
 */

import { exito, fallo, ErrorNegocio, type Sobre } from './sobre.js';
import { traducirError } from './supabase.js';
import { identificar, autorizar, type Sesion } from './sesion.js';
import { PERMITIR_FIN_DE_SEMANA } from './dominio.js';
import * as cafeterias from './acciones/cafeterias.js';
import * as menu from './acciones/menu.js';
import * as reservas from './acciones/reservas.js';

type Manejador = (params: Record<string, unknown>, sesion: Sesion) => Promise<unknown>;

/**
 * La fecha de HOY según el servidor, en la zona de Colombia.
 *
 * El prototipo la sacaba del reloj del navegador. Funcionaba porque los
 * equipos del mostrador están en Bucaramanga, pero hacía que un portátil con
 * la hora mal puesta —o abierto desde otro huso— registrara reservas del día
 * equivocado sin avisar. Ahora la fecha de trabajo la dice el servidor.
 *
 * `en-CA` porque su formato de fecha corto ES 'AAAA-MM-DD'. Es un rodeo, pero
 * el directo —toISOString()— da la fecha en UTC, que en Colombia (UTC−5) va
 * un día por delante desde las siete de la tarde.
 */
function hoyEnColombia(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/**
 * Lo que la aplicación necesita saber nada más entrar.
 *
 * Es la acción número 15, y no estaba en el contrato de Apps Script porque
 * allí no podía estar: el frontend guardaba su propia copia de
 * `PERMITIR_FIN_DE_SEMANA` en `js/config.js` y había que acordarse de apagar
 * las dos. El README lo tenía anotado como problema. Con el backend en un
 * despliegue distinto del frontend, dos constantes gemelas se
 * desincronizarían todavía más fácil, así que la única de verdad es la del
 * servidor y la pantalla pregunta por ella.
 */
async function contexto(_params: Record<string, unknown>, sesion: Sesion) {
  return {
    hoy: hoyEnColombia(),
    permitir_fin_de_semana: PERMITIR_FIN_DE_SEMANA,
    perfil: {
      nombre: sesion.nombre,
      rol: sesion.rol,
      cafeteria_id: sesion.cafeteriaId,
    },
  };
}

/** Las 15 acciones. Lo que no esté aquí es ACCION_DESCONOCIDA. */
const ACCIONES: Record<string, Manejador> = {
  'app.contexto': contexto,

  'cafeterias.listar': (p) => cafeterias.listar(p),
  'cafeterias.obtener': (p) => cafeterias.obtener(p),
  'cafeterias.crear': (p) => cafeterias.crear(p),
  'cafeterias.actualizar': (p) => cafeterias.actualizar(p),
  'cafeterias.archivar': (p) => cafeterias.archivar(p),
  'cafeterias.reactivar': (p) => cafeterias.reactivar(p),

  'menu.delDia': (p) => menu.delDia(p),
  'menu.semana': (p) => menu.semana(p),
  'menu.guardarSemana': (p) => menu.guardarSemana(p),

  'reservas.delDia': reservas.delDia,
  'reservas.crear': reservas.crear,
  'reservas.actualizar': reservas.actualizar,
  'reservas.cancelar': reservas.cancelar,
  'reservas.buscar': reservas.buscar,
};

/**
 * Ejecuta una acción y devuelve SIEMPRE el sobre, pase lo que pase.
 *
 * Que no se escape ninguna excepción es una regla del contrato, no una
 * cortesía: un error sin capturar saldría como la página de error de la
 * plataforma, el cliente recibiría HTML donde espera JSON y lo traduciría a
 * RESPUESTA_INVALIDA — un mensaje que no dice absolutamente nada de lo que
 * pasó.
 */
export async function manejar(
  accion: string,
  params: Record<string, unknown>,
  autorizacion: string | undefined | null,
): Promise<Sobre> {
  const manejador = ACCIONES[accion];
  if (!manejador) {
    return fallo('ACCION_DESCONOCIDA', `La API no reconoce la acción «${accion}».`);
  }

  try {
    const sesion = await identificar(autorizacion);
    autorizar(sesion, accion);
    return exito(await manejador(params ?? {}, sesion));
  } catch (error) {
    if (error instanceof ErrorNegocio) {
      return fallo(error.codigo, error.message);
    }

    // Un error de Postgres que se escapó sin traducir en su acción: se
    // reconoce aquí antes de darlo por interno. Es la red de debajo de la red.
    const traducido = traducirError(error as { code?: string; message?: string });
    if (traducido) return fallo(traducido.codigo, traducido.message);

    // A partir de aquí es un fallo nuestro. El mensaje va al registro entero
    // y al cliente resumido: los detalles de un error interno pueden decir
    // más de la base de datos de lo que conviene contar por la puerta.
    console.error(`[${accion}]`, error);
    return fallo('ERROR_INTERNO', 'Ocurrió un error inesperado en el servidor.');
  }
}

export { ACCIONES };
