import { construirTicket, ANCHO } from './banco/js/utils/ticket.js';

const cafeteria = { nombre: 'Bienestar Pro', ubicacion: 'Campus central' };
const casos = [
  ['Pagada, todo corto', {
    id: '01-260825-004', nombre: 'Laura Ardila', telefono: '3001234567',
    fecha: '2026-08-25', menuNombre: 'Bandeja paisa', medio: 'presencial', pago: 'pagado' }],
  ['Debe, nombre y plato largos', {
    id: '03-260825-012', nombre: 'María Fernanda Villamizar Jaimes', telefono: '3157654321',
    fecha: '2026-08-25', menuNombre: 'Cerdo con verduras salteadas y arroz', medio: 'telefono', pago: 'debe' }],
];

for (const [titulo, reserva] of casos) {
  const t = construirTicket(reserva, cafeteria);
  const largas = t.split('\n').filter((l) => l.length > ANCHO);
  console.log('\n### ' + titulo + '  (líneas que se pasan de ' + ANCHO + ': ' + largas.length + ')');
  console.log('┌' + '─'.repeat(ANCHO) + '┐');
  for (const l of t.split('\n')) console.log('│' + l.padEnd(ANCHO) + '│');
  console.log('└' + '─'.repeat(ANCHO) + '┘');
}
