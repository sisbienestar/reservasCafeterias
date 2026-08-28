/**
 * Quién puede usar la aplicación. Solo de consulta.
 *
 * Crear cuentas y asignar roles se sigue haciendo en el panel de Supabase.
 * Esto responde «¿quién tiene acceso y con qué alcance?», que hoy obliga a
 * salir de la aplicación para verlo.
 */

import { pedir } from './api.js';

export interface Cuenta {
  nombre: string;
  rol: string;
  cafeteriaId: string;
  cafeteriaNombre: string;
}

interface FilaCuenta {
  nombre?: string; rol: string;
  cafeteria_id?: string; cafeteria_nombre?: string;
}

/** No incluye correos: no hacen falta para responder la pregunta. */
export async function getCuentas(): Promise<Cuenta[]> {
  const filas = await pedir<FilaCuenta[]>('cuentas.listar', {});
  return filas.map((fila) => ({
    nombre: fila.nombre ?? '',
    rol: fila.rol,
    cafeteriaId: fila.cafeteria_id ?? '',
    cafeteriaNombre: fila.cafeteria_nombre ?? '',
  }));
}
