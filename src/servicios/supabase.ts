/**
 * El cliente de Supabase del NAVEGADOR. Solo sirve para la sesión.
 *
 * Conviene tener clara la diferencia con `api/_nucleo/supabase.ts`, porque las
 * dos se llaman igual y hacen cosas opuestas:
 *
 *   ALLÍ   clave de SERVICIO, se salta RLS, lee y escribe todo el campus, y
 *          nunca sale del servidor.
 *   AQUÍ   clave ANÓNIMA, pública por diseño, y no puede tocar ni una fila:
 *          02-rls.sql deja las tablas sin ninguna política permisiva.
 *
 * Por eso este cliente se usa SOLO para entrar, salir y renovar el token. Los
 * datos no se piden nunca por aquí: van por `api.ts`, que es donde el
 * servidor comprueba el rol y la sede.
 *
 * Que la clave anónima viaje en el paquete del navegador no es un descuido:
 * es lo que tiene que pasar para que exista un formulario de acceso. Lo que
 * la hace inofensiva es que al otro lado no haya ninguna puerta abierta.
 */

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const clave = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !clave) {
  // Un fallo ruidoso y temprano. Sin esto el síntoma sería un formulario de
  // acceso que rechaza cualquier contraseña sin decir por qué.
  throw new Error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Copia .env.example a .env.local.',
  );
}

export const supabase = createClient(url, clave, {
  auth: {
    // La sesión se guarda en el navegador y se renueva sola. En una
    // herramienta de mostrador eso importa: el turno dura ocho horas y nadie
    // debería tener que volver a entrar a media mañana.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

/** El token de la sesión en curso, o cadena vacía si no hay ninguna. */
export async function tokenActual(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}
