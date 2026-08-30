/**
 * Las cuentas y sus permisos.
 *
 * Es la contraparte del archivo más delicado del backend. Aquí no se decide
 * nada: todas las reglas —no cambiarse el rol a uno mismo, dejar siempre un
 * admin, el par rol + sede— las impone `api/_nucleo/acciones/usuarios.ts`.
 * Esta capa solo traduce la forma del dato y repite las validaciones obvias
 * para avisar antes de gastar un viaje.
 */

import { pedir } from './api.js';
import type { Rol } from '../contexto/Sesion.js';

export interface Usuario {
  usuarioId: string;
  correo: string;
  nombre: string;
  rol: Rol;
  cafeteriaId: string;
  cafeteriaNombre: string;
}

interface FilaUsuario {
  usuario_id: string; correo?: string; nombre?: string; rol: string;
  cafeteria_id?: string; cafeteria_nombre?: string;
}

const normalizar = (f: FilaUsuario): Usuario => ({
  usuarioId: f.usuario_id,
  correo: f.correo ?? '',
  nombre: f.nombre ?? '',
  rol: f.rol === 'admin' ? 'admin' : f.rol === 'auxiliar' ? 'auxiliar' : 'mostrador',
  cafeteriaId: f.cafeteria_id ?? '',
  cafeteriaNombre: f.cafeteria_nombre ?? '',
});

export async function getUsuarios(): Promise<Usuario[]> {
  return (await pedir<FilaUsuario[]>('usuarios.listar', {})).map(normalizar);
}

/**
 * Da de alta la cuenta y sus permisos en un gesto.
 *
 * La contraseña es TEMPORAL: la pone administración para que la persona pueda
 * entrar la primera vez. Cambiarla después es cosa suya.
 */
export async function crearUsuario(datos: {
  correo: string; nombre: string; contrasena: string;
  rol: Rol; cafeteriaId?: string;
}): Promise<Usuario> {
  return normalizar(await pedir<FilaUsuario>('usuarios.crear', {
    correo: datos.correo,
    nombre: datos.nombre,
    contrasena: datos.contrasena,
    rol: datos.rol,
    cafeteria_id: datos.cafeteriaId ?? '',
  }));
}

/** Cambia nombre, rol y sede. NO toca el correo ni la contraseña. */
export async function actualizarUsuario(usuarioId: string, datos: {
  nombre: string; rol: Rol; cafeteriaId?: string;
}): Promise<Usuario> {
  return normalizar(await pedir<FilaUsuario>('usuarios.actualizar', {
    usuario_id: usuarioId,
    nombre: datos.nombre,
    rol: datos.rol,
    cafeteria_id: datos.cafeteriaId ?? '',
  }));
}

/** Queda anotado en el registro: cambiarle la clave a alguien es entrar en su cuenta. */
export async function cambiarContrasena(usuarioId: string, contrasena: string): Promise<void> {
  await pedir('usuarios.contrasena', { usuario_id: usuarioId, contrasena });
}

/** Borra el perfil y la cuenta. Lo que hizo se conserva. */
export async function eliminarUsuario(usuarioId: string): Promise<void> {
  await pedir('usuarios.eliminar', { usuario_id: usuarioId });
}
