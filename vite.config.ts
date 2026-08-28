import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Configuración de Vite.
 *
 * `publicDir: 'public'` es lo que hace que `assets/img/logo-uis.webp` siga
 * resolviéndose igual que en la app vanilla: los archivos de `public/` se
 * sirven desde la raíz sin pasar por el empaquetado, así que las rutas del
 * marcado no cambian y las imágenes no se renombran con un hash.
 */
export default defineConfig({
  plugins: [react()],
  publicDir: 'public',
  server: {
    port: 5173,
    /**
     * En desarrollo, `/api` no existe: las funciones de Vercel solo corren en
     * Vercel. Se redirige al servidor de `pruebas/servidor.mjs`, que monta el
     * mismo enrutador sobre un http de Node.
     *
     *   ventana 1 → npm run backend-local
     *   ventana 2 → npm run dev
     *
     * Así el navegador habla con `/api` igual que en producción y no hace
     * falta que `VITE_API_URL` cambie entre entornos — una variable que hay
     * que acordarse de cambiar es una variable que un día no se cambia.
     */
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (ruta) => ruta.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    // El aviso por defecto salta a 500 kB y aquí no dice nada útil: el grueso
    // es React más el cliente de Supabase, que no se pueden partir.
    chunkSizeWarningLimit: 800,
  },
});
