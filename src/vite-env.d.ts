/// <reference types="vite/client" />

/**
 * Las variables de entorno que este frontend consume, declaradas.
 *
 * Sin esto, `import.meta.env.VITE_LO_QUE_SEA` valdria `any` y una errata en el
 * nombre pasaria el compilador para fallar en el navegador con un `undefined`
 * que no dice de donde vino.
 *
 * Las tres son PUBLICAS: viajan dentro del paquete que descarga el navegador.
 * Ninguna clave de servicio puede llamarse VITE_*, o acabaria ahi dentro.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
