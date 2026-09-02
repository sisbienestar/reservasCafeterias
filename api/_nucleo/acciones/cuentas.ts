/**
 * Quién puede usar la aplicación. Solo de consulta.
 *
 * Crear cuentas, cambiar contraseñas y asignar roles se sigue haciendo en el
 * panel de Supabase, y esto no lo sustituye: es la respuesta a «¿quién tiene
 * acceso y con qué alcance?», que hoy obliga a salir de la aplicación y abrir
 * otra herramienta para verlo.
 *
 * NO devuelve correos. Se podrían sacar de `auth.users` con la clave de
 * servicio —`notificaciones.ts` lo hace para poder enviar— pero aquí no hacen
 * falta para responder la pregunta, y un dato personal que no hace falta es un
 * dato que no se sirve.
 */

import { servicio, desempaquetar } from '../supabase.js';

export interface CuentaContrato {
  nombre: string;
  rol: string;
  cafeteria_id: string;
  cafeteria_nombre: string;
}

interface FilaPerfil {
  nombre: string | null;
  rol: string;
  cafeteria_id: string | null;
  cafeteria: { nombre: string } | null;
}

/**
 * Las cuentas con perfil, con el nombre de su sede resuelto.
 *
 * Ordenadas por rol y luego por nombre: administración arriba, que son pocas,
 * y el mostrador debajo agrupado. Alfabético a secas mezclaría los dos y
 * habría que leer la columna del rol en cada fila para saber quién es quién.
 */
export async function listar() {
  const filas = desempaquetar<FilaPerfil[]>(
    await servicio()
      .from('perfil')
      .select('nombre, rol, cafeteria_id, cafeteria!perfil_cafeteria_id_fkey(nombre)')
      .order('rol')
      .order('nombre'),
  );

  return filas.map((fila) => ({
    nombre: fila.nombre ?? '',
    rol: fila.rol,
    cafeteria_id: fila.cafeteria_id ?? '',
    cafeteria_nombre: fila.cafeteria?.nombre ?? '',
  }));
}
