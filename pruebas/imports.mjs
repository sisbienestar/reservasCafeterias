// Carga los módulos de UI: si alguno importa un nombre que ya no se exporta,
// Node falla aquí (SyntaxError de enlace), no en el navegador.
await import('./banco/js/ui/dom.js');
await import('./banco/js/ui/tablaReservas.js');
await import('./banco/js/ui/tarjetaCafeteria.js');
await import('./banco/js/ui/modalReserva.js');
await import('./banco/js/utils/fechas.js');
await import('./banco/js/utils/telefono.js');
await import('./banco/js/utils/url.js');
console.log('Todos los imports de UI enlazan correctamente');
