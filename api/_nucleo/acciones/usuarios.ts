/**
 * Las cuentas y sus permisos.
 *
 * ESTE ES EL ARCHIVO MÁS DELICADO DEL PROYECTO. Crea cuentas, pone
 * contraseñas y reparte roles, y lo hace con la clave de servicio.
 *
 * Conviene tener claro qué cambia y qué no: la clave de servicio YA podía
 * hacer todo esto. Lo que este archivo añade no es poder, es una puerta. Lo
 * único que la sostiene es la lista blanca de `PERMISOS` en `sesion.ts`, que
 * solo da estas acciones al rol `admin`.
 *
 * Y de ahí las dos guardas de abajo, que no son cortesía:
 *
 *   · Nadie se cambia el rol a sí mismo.
 *   · Siempre queda al menos un `admin`.
 *
 * Sin ellas, un solo clic distraído deja la aplicación sin nadie que pueda
 * entrar al panel, y la única salida sería abrir Supabase a mano.
 */

import { servicio, desempaquetar } from '../supabase.js';
import { romper } from '../sobre.js';
import { registrar } from './aplicacion.js';
import type { Rol, Sesion } from '../sesion.js';

export interface UsuarioContrato {
  usuario_id: string;
  correo: string;
  nombre: string;
  rol: string;
  cafeteria_id: string;
  cafeteria_nombre: string;
}

interface FilaPerfil {
  usuario_id: string;
  nombre: string | null;
  rol: string;
  cafeteria_id: string | null;
  cafeteria: { nombre: string } | null;
}

const ROLES: Rol[] = ['mostrador', 'auxiliar', 'admin'];

/** Lo mínimo que Supabase acepta, dicho aquí para poder explicarlo mejor. */
const MINIMO_CONTRASENA = 8;

/**
 * Los correos de las cuentas, por id.
 *
 * Viven en `auth.users`, que Supabase gestiona y no expone por REST, así que
 * hay que pasar por la API de administración. Se piden todos de una vez y se
 * cruzan en memoria: una consulta por usuario serían veinte viajes para
 * pintar una tabla de veinte filas.
 */
async function correosPorId(): Promise<Map<string, string>> {
  const { data, error } = await servicio().auth.admin.listUsers({ page: 1, perPage: 500 });
  if (error) throw error;

  const correos = new Map<string, string>();
  for (const usuario of data?.users ?? []) {
    if (usuario.email) correos.set(usuario.id, usuario.email);
  }
  return correos;
}

/**
 * Las cuentas con permisos, con su correo y su sede.
 *
 * Aquí SÍ se sirven los correos, al revés que en `cuentas.listar`: esta
 * pantalla existe para gestionar cuentas, y sin el correo no se distingue a
 * dos personas que se llamen parecido ni se sabe con qué se entra.
 */
export async function listar(): Promise<UsuarioContrato[]> {
  const perfiles = desempaquetar<FilaPerfil[]>(
    await servicio().from('perfil')
      .select('usuario_id, nombre, rol, cafeteria_id, cafeteria(nombre)')
      .order('rol').order('nombre'),
  );

  const correos = await correosPorId();

  return perfiles.map((fila) => ({
    usuario_id: fila.usuario_id,
    correo: correos.get(fila.usuario_id) ?? '',
    nombre: fila.nombre ?? '',
    rol: fila.rol,
    cafeteria_id: fila.cafeteria_id ?? '',
    cafeteria_nombre: fila.cafeteria?.nombre ?? '',
  }));
}

/**
 * Comprueba el par rol + sede.
 *
 * Es la misma regla que el CHECK `perfil_sede_segun_rol` del esquema, repetida
 * aquí para poder decirla con palabras: un mostrador sin sede no podría ver
 * nada, y un admin con sede sugeriría un alcance que no tiene. Las dos serían
 * errores silenciosos.
 */
function leerRolYSede(params: Record<string, unknown>) {
  const rol = String(params.rol ?? '').trim() as Rol;
  if (!ROLES.includes(rol)) {
    romper('DATOS_INCOMPLETOS',
      `El rol tiene que ser ${ROLES.map((r) => `«${r}»`).join(', ')}.`);
  }

  const cafeteriaId = String(params.cafeteria_id ?? '').trim();

  if (rol === 'mostrador' && !cafeteriaId) {
    romper('DATOS_INCOMPLETOS', 'Una cuenta de mostrador tiene que atender una cafetería.');
  }
  if (rol !== 'mostrador' && cafeteriaId) {
    romper('DATOS_INCOMPLETOS', rol === 'admin'
      ? 'Administración ve todas las cafeterías, así que no se le asigna ninguna.'
      : 'El auxiliar administrativo trabaja con todas las cafeterías: el mismo ' +
        'proveedor reparte en varias, así que no se le asigna ninguna.');
  }

  return { rol, cafeteria_id: rol === 'mostrador' ? cafeteriaId : null };
}

/** Cuántas cuentas de administración quedarían si esta dejara de serlo. */
async function otrosAdmin(exceptoId: string): Promise<number> {
  const { count, error } = await servicio()
    .from('perfil')
    .select('usuario_id', { count: 'exact', head: true })
    .eq('rol', 'admin')
    .neq('usuario_id', exceptoId);

  if (error) throw error;
  return count ?? 0;
}

/**
 * Da de alta una cuenta y sus permisos, en un solo gesto.
 *
 * La cuenta se crea con `email_confirm: true` porque la crea administración a
 * mano: pedirle a quien va a atender un mostrador que además confirme un
 * correo institucional al que quizá no tiene acceso sería un paso de más para
 * nada.
 *
 * Si el perfil falla después de crear la cuenta, se DESHACE la cuenta. Sin
 * eso quedaría un usuario en `auth.users` sin permisos: no puede entrar, no
 * sale en ninguna lista, y bloquea su propio correo para un alta nueva.
 */
export async function crear(params: Record<string, unknown>, sesion: Sesion) {
  const correo = String(params.correo ?? '').trim().toLowerCase();
  const nombre = String(params.nombre ?? '').trim();
  const contrasena = String(params.contrasena ?? '');

  if (!correo || !correo.includes('@')) {
    romper('DATOS_INCOMPLETOS', 'Hace falta un correo válido.');
  }
  if (!nombre) {
    romper('DATOS_INCOMPLETOS', 'Hace falta el nombre de la persona.');
  }
  if (contrasena.length < MINIMO_CONTRASENA) {
    romper('DATOS_INCOMPLETOS',
      `La contraseña temporal necesita al menos ${MINIMO_CONTRASENA} caracteres.`);
  }

  const permisos = leerRolYSede(params);

  const { data, error } = await servicio().auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
  });

  if (error || !data?.user) {
    const texto = String(error?.message ?? '');
    if (/already been registered|already exists/i.test(texto)) {
      romper('CUENTA_DUPLICADA', `Ya existe una cuenta con el correo «${correo}».`);
    }
    romper('ERROR_INTERNO', `No se pudo crear la cuenta: ${texto}`);
  }

  const { error: errorPerfil } = await servicio().from('perfil').insert({
    usuario_id: data.user.id,
    nombre,
    ...permisos,
  });

  if (errorPerfil) {
    await servicio().auth.admin.deleteUser(data.user.id);
    romper('ERROR_INTERNO',
      `La cuenta no se pudo dar de alta y se deshizo: ${errorPerfil.message}`);
  }

  await registrar(sesion, 'usuarios.crear', correo, { rol: permisos.rol, cafeteria: permisos.cafeteria_id });

  return { usuario_id: data.user.id, correo, nombre, ...permisos };
}

/**
 * Cambia nombre, rol y sede. NO toca el correo ni la contraseña.
 *
 * El correo es el identificador con el que se entra y cambiarlo desde otra
 * pantalla dejaría a alguien fuera sin avisarle. La contraseña tiene su propia
 * acción, porque son dos decisiones distintas.
 */
export async function actualizar(params: Record<string, unknown>, sesion: Sesion) {
  const usuarioId = String(params.usuario_id ?? '').trim();
  if (!usuarioId) romper('DATOS_INCOMPLETOS', 'Hay que indicar la cuenta.');

  const nombre = String(params.nombre ?? '').trim();
  if (!nombre) romper('DATOS_INCOMPLETOS', 'Hace falta el nombre de la persona.');

  const permisos = leerRolYSede(params);

  const antes = desempaquetar<{ rol: string; nombre: string | null } | null>(
    await servicio().from('perfil').select('rol, nombre').eq('usuario_id', usuarioId).maybeSingle(),
  );
  if (!antes) romper('CUENTA_NO_ENCONTRADA', 'Esa cuenta no tiene permisos asignados.');

  /*
   * La primera guarda: nadie se cambia el rol a sí mismo.
   *
   * No es paternalismo. Quitarse el rol de admin es la única operación de este
   * panel que deja a quien la hace sin poder deshacerla — sale de la pantalla
   * en el mismo gesto—, y con una sola cuenta de administración deja la
   * aplicación cerrada para todos.
   */
  if (usuarioId === sesion.usuarioId && antes.rol !== permisos.rol) {
    romper('NO_AUTORIZADO',
      'No puedes cambiarte el rol a ti mismo. Pídeselo a otra cuenta de administración.');
  }

  // La segunda: siempre queda alguien que pueda entrar aquí.
  if (antes.rol === 'admin' && permisos.rol !== 'admin' && (await otrosAdmin(usuarioId)) === 0) {
    romper('NO_AUTORIZADO',
      'Es la única cuenta de administración que queda. Crea otra antes de quitarle el rol.');
  }

  const fila = desempaquetar<FilaPerfil | null>(
    await servicio().from('perfil').update({ nombre, ...permisos })
      .eq('usuario_id', usuarioId)
      .select('usuario_id, nombre, rol, cafeteria_id, cafeteria(nombre)').maybeSingle(),
  );
  if (!fila) romper('CUENTA_NO_ENCONTRADA', 'Esa cuenta no tiene permisos asignados.');

  if (antes.rol !== permisos.rol) {
    await registrar(sesion, 'usuarios.actualizar', nombre, {
      rol_antes: antes.rol, rol_despues: permisos.rol,
    });
  }

  return {
    usuario_id: fila.usuario_id,
    correo: '',
    nombre: fila.nombre ?? '',
    rol: fila.rol,
    cafeteria_id: fila.cafeteria_id ?? '',
    cafeteria_nombre: fila.cafeteria?.nombre ?? '',
  };
}

/**
 * Pone una contraseña nueva.
 *
 * Existe porque la alternativa —«he perdido la contraseña, abre Supabase»— es
 * exactamente lo que este panel viene a quitar. Queda anotada en el registro:
 * cambiarle la contraseña a otra persona es entrar en su cuenta, y eso tiene
 * que dejar rastro.
 */
export async function cambiarContrasena(params: Record<string, unknown>, sesion: Sesion) {
  const usuarioId = String(params.usuario_id ?? '').trim();
  const contrasena = String(params.contrasena ?? '');

  if (!usuarioId) romper('DATOS_INCOMPLETOS', 'Hay que indicar la cuenta.');
  if (contrasena.length < MINIMO_CONTRASENA) {
    romper('DATOS_INCOMPLETOS',
      `La contraseña necesita al menos ${MINIMO_CONTRASENA} caracteres.`);
  }

  const perfil = desempaquetar<{ nombre: string | null } | null>(
    await servicio().from('perfil').select('nombre').eq('usuario_id', usuarioId).maybeSingle(),
  );
  if (!perfil) romper('CUENTA_NO_ENCONTRADA', 'Esa cuenta no tiene permisos asignados.');

  const { error } = await servicio().auth.admin.updateUserById(usuarioId, {
    password: contrasena,
  });
  if (error) romper('ERROR_INTERNO', `No se pudo cambiar la contraseña: ${error.message}`);

  await registrar(sesion, 'usuarios.contrasena', perfil.nombre ?? usuarioId, {});
  return { ok: true };
}

/**
 * Quita el acceso: borra el perfil y la cuenta.
 *
 * Las dos cosas, y en ese orden. Dejar la cuenta sin perfil la deja sin poder
 * entrar —`identificar` la rechaza— pero también deja su correo ocupado, así
 * que dar de alta otra vez a la misma persona fallaría sin decir por qué.
 *
 * Lo que hizo NO se borra: sus reservas, sus pedidos y sus asientos del
 * registro se quedan, con el nombre copiado donde hacía falta.
 */
export async function eliminar(params: Record<string, unknown>, sesion: Sesion) {
  const usuarioId = String(params.usuario_id ?? '').trim();
  if (!usuarioId) romper('DATOS_INCOMPLETOS', 'Hay que indicar la cuenta.');

  if (usuarioId === sesion.usuarioId) {
    romper('NO_AUTORIZADO', 'No puedes borrar tu propia cuenta.');
  }

  const perfil = desempaquetar<{ nombre: string | null; rol: string } | null>(
    await servicio().from('perfil').select('nombre, rol').eq('usuario_id', usuarioId).maybeSingle(),
  );
  if (!perfil) romper('CUENTA_NO_ENCONTRADA', 'Esa cuenta no tiene permisos asignados.');

  if (perfil.rol === 'admin' && (await otrosAdmin(usuarioId)) === 0) {
    romper('NO_AUTORIZADO',
      'Es la única cuenta de administración que queda. Crea otra antes de borrarla.');
  }

  await servicio().from('perfil').delete().eq('usuario_id', usuarioId);

  const { error } = await servicio().auth.admin.deleteUser(usuarioId);
  if (error) {
    romper('ERROR_INTERNO',
      `Se quitaron los permisos pero la cuenta sigue existiendo: ${error.message}`);
  }

  await registrar(sesion, 'usuarios.eliminar', perfil.nombre ?? usuarioId, { rol: perfil.rol });
  return { ok: true };
}
