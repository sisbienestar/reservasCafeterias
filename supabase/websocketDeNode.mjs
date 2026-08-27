/**
 * Le presta a Node el `WebSocket` que `supabase-js` da por hecho.
 *
 * `createClient` construye siempre un cliente de Realtime, aunque este
 * proyecto no use Realtime para nada, y ese cliente exige un `WebSocket`
 * global. Los navegadores lo tienen desde siempre y el entorno Edge de Vercel
 * también, así que en producción no hace falta nada de esto. Node lo trae de
 * serie a partir de la versión 22; en la 20 no existe, y `createClient`
 * revienta nada más llamarlo con:
 *
 *   Error: Node.js 20 detected without native WebSocket support.
 *
 * Por eso vive AQUÍ y no en `api/_nucleo/supabase.ts`: ese archivo se despliega
 * en Edge, donde este remiendo sería código muerto arrastrando una dependencia
 * de Node que ese entorno no puede resolver. Lo cargan solo los dos guiones que
 * se ejecutan en una máquina: `supabase/importar.mjs` y `pruebas/servidor.mjs`.
 *
 * Se importa ANTES que nada que toque supabase-js. Los módulos ES se evalúan
 * en el orden en que se importan, así que basta con ponerlo el primero de la
 * lista — pero hay que dejarlo el primero, y de ahí este comentario.
 */

if (typeof globalThis.WebSocket === 'undefined') {
  const { default: WebSocket } = await import('ws');
  globalThis.WebSocket = WebSocket;
}
