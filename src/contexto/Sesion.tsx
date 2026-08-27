/**
 * La sesión: quién está usando la aplicación y qué puede hacer.
 *
 * Sustituye a `js/ui/accesoAdmin.js`, el pestillo que comparaba un SHA-256 en
 * el navegador. La diferencia no es que la comprobación sea más fuerte: es
 * que ya no está aquí. Lo que este contexto guarda es una COPIA de lo que el
 * servidor dijo, y sirve para decidir qué pintar — no para decidir qué se
 * permite. Quien permite es `api/_nucleo/sesion.ts`, y lo vuelve a comprobar
 * en cada petición.
 *
 * Dicho de otro modo: falsear `rol: 'admin'` en las herramientas de
 * desarrollo enseña los botones de administración, y todos devuelven
 * NO_AUTORIZADO. Eso es exactamente lo que tenía que pasar y antes no pasaba.
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../servicios/supabase.js';
import { pedir, ErrorServicio } from '../servicios/api.js';
import { hoyISO } from '../utiles/fechas.js';

export type Rol = 'mostrador' | 'admin';

export interface Perfil {
  nombre: string;
  rol: Rol;
  /** La sede del mostrador. `null` en administración. */
  cafeteriaId: string | null;
}

interface Contexto {
  /** La fecha de trabajo, según el SERVIDOR y en la zona de Colombia. */
  hoy: string;
  /** El interruptor de pruebas, que ahora vive solo en el backend. */
  permitirFinDeSemana: boolean;
  perfil: Perfil;
}

interface ValorSesion {
  /** `null` mientras se comprueba si había sesión guardada. */
  cargando: boolean;
  sesion: Session | null;
  contexto: Contexto | null;
  /** Un fallo al traer el contexto con sesión válida: cuenta sin perfil, red… */
  error: string | null;
  entrar: (correo: string, clave: string) => Promise<void>;
  salir: () => Promise<void>;
  /** Vuelve a pedir `app.contexto`. Útil tras un cambio de permisos. */
  refrescar: () => Promise<void>;
}

const SesionContexto = createContext<ValorSesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true);
  const [sesion, setSesion] = useState<Session | null>(null);
  const [contexto, setContexto] = useState<Contexto | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Trae del servidor la fecha, el interruptor y el perfil.
   *
   * Es la primera petición de la aplicación y hace de comprobación de acceso:
   * una cuenta válida SIN fila en `perfil` falla aquí con NO_AUTORIZADO, y es
   * mejor que se sepa al entrar que al pulsar el primer botón.
   */
  const traerContexto = useCallback(async () => {
    try {
      const datos = await pedir<{
        hoy: string;
        permitir_fin_de_semana: boolean;
        perfil: { nombre: string; rol: Rol; cafeteria_id: string | null };
      }>('app.contexto');

      setContexto({
        hoy: datos.hoy,
        permitirFinDeSemana: datos.permitir_fin_de_semana,
        perfil: {
          nombre: datos.perfil.nombre,
          rol: datos.perfil.rol,
          cafeteriaId: datos.perfil.cafeteria_id,
        },
      });
      setError(null);
    } catch (e) {
      setContexto(null);
      setError(e instanceof ErrorServicio ? e.message : 'No se pudo contactar con el servidor.');
    }
  }, []);

  useEffect(() => {
    let vigente = true;

    // La sesión puede venir del almacenamiento del navegador, así que hay un
    // momento inicial en que no se sabe si hay una o no. Pintar el formulario
    // de acceso durante ese momento haría parpadear la pantalla en cada
    // recarga a quien ya estaba dentro.
    supabase.auth.getSession().then(async ({ data }) => {
      if (!vigente) return;
      setSesion(data.session);
      if (data.session) await traerContexto();
      if (vigente) setCargando(false);
    });

    // Cubre el cierre de sesión desde otra pestaña y la caducidad del token.
    const { data: suscripcion } = supabase.auth.onAuthStateChange(async (_evento, nueva) => {
      if (!vigente) return;
      setSesion(nueva);
      if (nueva) await traerContexto();
      else { setContexto(null); setError(null); }
    });

    return () => { vigente = false; suscripcion.subscription.unsubscribe(); };
  }, [traerContexto]);

  const entrar = useCallback(async (correo: string, clave: string) => {
    const { error: fallo } = await supabase.auth.signInWithPassword({
      email: correo.trim(), password: clave,
    });
    // Se lanza en vez de guardarse en el estado: quien llama es el formulario,
    // que necesita saber si puede dejar de mostrar el girador.
    if (fallo) throw new Error(traducirFalloDeAcceso(fallo.message));
  }, []);

  const salir = useCallback(async () => { await supabase.auth.signOut(); }, []);

  const valor = useMemo<ValorSesion>(() => ({
    cargando, sesion, contexto, error, entrar, salir, refrescar: traerContexto,
  }), [cargando, sesion, contexto, error, entrar, salir, traerContexto]);

  return <SesionContexto.Provider value={valor}>{children}</SesionContexto.Provider>;
}

/**
 * Los mensajes de Supabase llegan en inglés y en su propia jerga. Quien
 * atiende un mostrador no tiene por qué leer «Invalid login credentials».
 */
function traducirFalloDeAcceso(mensaje: string): string {
  if (/invalid login credentials/i.test(mensaje)) {
    return 'El correo o la contraseña no son correctos.';
  }
  if (/email not confirmed/i.test(mensaje)) {
    return 'Esa cuenta todavía no está confirmada. Habla con administración.';
  }
  if (/rate limit|too many/i.test(mensaje)) {
    return 'Demasiados intentos seguidos. Espera un momento y vuelve a probar.';
  }
  return 'No se pudo entrar. Inténtalo otra vez.';
}

export function useSesion(): ValorSesion {
  const valor = useContext(SesionContexto);
  if (!valor) throw new Error('useSesion se usó fuera de <ProveedorSesion>.');
  return valor;
}

/**
 * La fecha de trabajo. Del servidor si hay contexto; del navegador si no.
 *
 * El respaldo local existe solo para que un componente pueda pintar algo
 * antes de que llegue la primera respuesta. Ninguna reserva se crea con esta
 * fecha sin contexto, porque sin contexto no hay sesión y sin sesión no hay
 * reserva.
 */
export function useHoy(): string {
  const { contexto } = useSesion();
  return contexto?.hoy ?? hoyISO();
}
