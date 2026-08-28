/**
 * Datos simulados: cafeterías.
 *
 * La forma imita fila a fila la hoja 'Cafeterias' de Google Sheets, incluidos
 * los nombres de campo en snake_case. Lo que normaliza a camelCase para la UI
 * es la capa de servicios, no este archivo.
 *
 * Hoja equivalente:
 *   id | codigo | nombre | ubicacion | imagen | activa | platos_fijos
 *
 * `activa` sostiene el borrado lógico: una cafetería que cierra deja de
 * aparecer en la página operativa, pero sus reservas históricas siguen
 * teniendo a qué apuntar en los reportes del administrador.
 *
 * `codigo` son los dos dígitos con los que empieza el identificador de cada
 * reserva (01-260823-001). Va aparte del `id` porque el id es un slug legible
 * para las URLs y el código tiene que ser corto y numérico para dictarlo.
 *
 * Los `id` salen del nombre con la misma regla que aplica el catálogo al
 * crear una cafetería nueva (`utils/texto.js#aSlug`), para que no haya dos
 * criterios distintos según de dónde venga la fila.
 *
 * `platos_fijos` son los productos que esa sede ofrece TODOS los días, además
 * de la carta común. Van en la cafetería y no en la carta porque no cambian
 * con el día: son parte de lo que esa sede es, no de lo que se cocinó hoy.
 *
 * OJO: las `ubicacion` son marcadores de posición. Los nombres y las fotos
 * son los reales.
 */

export const CAFETERIAS = [
  {
    id: 'bienestar-pro',
    codigo: '01',
    nombre: 'Bienestar Pro',
    ubicacion: 'Campus central',
    imagen: 'assets/img/bienestar-pro.jpg',
    activa: true,
    platos_fijos: ['Especial carne', 'Especial pollo', 'Especial cerdo'],
  },
  {
    id: 'camilo-torres',
    codigo: '02',
    nombre: 'Camilo Torres',
    ubicacion: 'Auditorio Camilo Torres',
    imagen: 'assets/img/camilo-torres.jpg',
    activa: true,
    platos_fijos: ['Mini Lunch'],
  },
  {
    id: 'bienestar-universitario',
    codigo: '03',
    nombre: 'Bienestar Universitario',
    ubicacion: 'Edificio de Bienestar Universitario',
    // Ojo: esta es .jpeg, no .jpg. Por eso la ruta va escrita y no se deduce
    // del id — tampoco «administracion3», que no lleva guion.
    imagen: 'assets/img/bienestar-universitario.jpeg',
    activa: true,
    platos_fijos: ['Mini Lunch'],
  },
  {
    id: 'administracion-3',
    codigo: '04',
    nombre: 'Administración 3',
    ubicacion: 'Edificio de Administración 3',
    imagen: 'assets/img/administracion3.jpg',
    activa: true,
    platos_fijos: [],
  },
];
