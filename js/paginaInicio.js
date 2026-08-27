/**
 * Entrada de index.html.
 *
 * Habla solo con la capa de servicios. No importa nada de js/mock/.
 */

import { getCafeterias } from './services/cafeteriasService.js';
import { qs, pintar, bloqueEstado, prepararLogo } from './ui/dom.js';
import { tarjetaCafeteria } from './ui/tarjetaCafeteria.js';
import { hoyISO, formatearFechaLarga } from './utils/fechas.js';

const contenedor = qs('#lista-cafeterias');

async function cargar() {
  pintar(contenedor, bloqueEstado({ tipo: 'cargando', titulo: 'Cargando cafeterías…' }));

  try {
    const cafeterias = await getCafeterias();

    if (cafeterias.length === 0) {
      pintar(contenedor, bloqueEstado({
        tipo: 'vacio',
        titulo: 'No hay cafeterías registradas',
      }));
      return;
    }

    pintar(contenedor, ...cafeterias.map(tarjetaCafeteria));
  } catch (error) {
    pintar(contenedor, bloqueEstado({
      tipo: 'error',
      titulo: 'No se pudieron cargar las cafeterías',
      detalle: error.message,
      accion: { texto: 'Reintentar', alPulsar: cargar },
    }));
  }
}

prepararLogo();
qs('#fecha-hoy').textContent = formatearFechaLarga(hoyISO());
cargar();
