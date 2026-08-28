/**
 * Catálogo: cafeterías y carta semanal.
 *
 * Solo dibuja. Quién llama a los servicios y qué hace con los errores es
 * cosa de paginaAdmin.js, igual que en el resto del proyecto.
 */

import { crear, pintar, bloqueEstado } from './dom.js';
import { botonConCarga } from './boton.js';
import { formatearFechaCorta, nombreDiaCorto, hoyISO, esDiaDeServicio } from '../utils/fechas.js';

/** Con girador: cerrar o reabrir una sede escribe en la hoja y recarga. */
function boton(texto, clase, alPulsar, etiqueta) {
  return botonConCarga({ texto, clase, etiqueta, alPulsar });
}

/* ── Cafeterías ───────────────────────────────────────────────────────── */

/**
 * @param {HTMLElement} contenedor
 * @param {import('../services/cafeteriasService.js').Cafeteria[]} cafeterias
 * @param {{alEditar: Function, alArchivar: Function, alReactivar: Function}} acciones
 */
export function mostrarCafeterias(contenedor, cafeterias, acciones) {
  if (cafeterias.length === 0) {
    pintar(contenedor, bloqueEstado({ tipo: 'vacio', titulo: 'No hay cafeterías registradas' }));
    return;
  }

  const filas = cafeterias.map((c) =>
    crear('tr', {
      clase: c.activa ? 'tabla__fila' : 'tabla__fila tabla__fila--apagada',
      hijos: [
        crear('td', { clase: 'tabla__nombre', texto: c.nombre }),
        crear('td', { clase: 'tabla__menu', texto: c.ubicacion || '—' }),
        crear('td', {
          clase: 'tabla__menu',
          texto: (c.platosFijos ?? []).join(' · ') || '—',
        }),
        crear('td', {
          hijos: [
            crear('span', {
              clase: `marca-estado marca-estado--${c.activa ? 'activa' : 'cancelada'}`,
              texto: c.activa ? 'En servicio' : 'Cerrada',
            }),
          ],
        }),
        crear('td', {
          clase: 'tabla__acciones',
          hijos: [
            boton('Editar', 'boton--secundario', () => acciones.alEditar(c),
              `Editar ${c.nombre}`),
            c.activa
              ? boton('Cerrar', 'boton--secundario', () => acciones.alArchivar(c),
                  `Cerrar ${c.nombre}`)
              : boton('Reabrir', 'boton--secundario', () => acciones.alReactivar(c),
                  `Reabrir ${c.nombre}`),
          ],
        }),
      ],
    }),
  );

  pintar(contenedor, crear('table', {
    clase: 'tabla tabla--admin',
    hijos: [
      crear('thead', {
        hijos: [
          crear('tr', {
            hijos: [
              crear('th', { texto: 'Cafetería', attrs: { scope: 'col' } }),
              crear('th', { texto: 'Ubicación', attrs: { scope: 'col' } }),
              crear('th', { texto: 'Platos fijos', attrs: { scope: 'col' } }),
              crear('th', { texto: 'Estado', attrs: { scope: 'col' } }),
              crear('th', {
                clase: 'tabla__acciones',
                attrs: { scope: 'col' },
                hijos: [crear('span', { clase: 'visualmente-oculto', texto: 'Acciones' })],
              }),
            ],
          }),
        ],
      }),
      crear('tbody', { hijos: filas }),
    ],
  }));
}

/* ── Carta semanal ────────────────────────────────────────────────────── */

/** Convierte el texto de una caja en la lista de platos, sin líneas vacías. */
const aPlatos = (texto) => texto.split('\n').map((p) => p.trim()).filter(Boolean);

/**
 * Editor de la carta de una semana: siete cajas, una por día.
 *
 * Tres decisiones que hacen que actualizarla cada semana no duela:
 *
 * - **Una caja de texto por día, un plato por línea**, en vez de campos
 *   numerados con botones de añadir y quitar. El número de platos cambia de
 *   un día a otro —dos, tres, a veces ninguno— y el texto libre absorbe eso
 *   sin que haya que pelearse con la interfaz. Además se puede pegar la carta
 *   entera desde un documento de un tirón.
 * - **Un solo botón de guardar para toda la semana.** Publicar la carta es
 *   una tarea semanal, no siete tareas diarias: se rellenan los días y se
 *   guarda una vez.
 * - **Los días sin tocar se marcan como pendientes** en cuanto se escribe en
 *   ellos, para que se vea de un vistazo qué falta por guardar.
 *
 * No devuelve nada dibujado: devuelve un mando para que paginaAdmin.js lea
 * lo escrito, lo rellene y marque el guardado.
 *
 * @param {HTMLElement} contenedor
 * @param {{fecha: string, opciones: {id: string, nombre: string}[]}[]} dias
 * @param {{alCambiar: () => void}} acciones
 */
export function montarSemana(contenedor, dias, acciones) {
  const hoy = hoyISO();
  const tarjetas = [];

  const nodos = dias.map((dia) => {
    const hayServicio = esDiaDeServicio(dia.fecha);

    // Sábado y domingo se muestran pero no se editan: no hay servicio, así
    // que no hay carta que publicar. Se dejan a la vista, y no ocultos, para
    // que la semana se lea completa y quede claro que no es un olvido.
    const area = crear('textarea', {
      clase: 'campo__control dia-carta__area',
      texto: hayServicio ? dia.opciones.map((o) => o.nombre).join('\n') : '',
      attrs: {
        rows: 4,
        spellcheck: 'false',
        'aria-label': `Platos del ${nombreDiaCorto(dia.fecha)} ${formatearFechaCorta(dia.fecha)}`,
        placeholder: hayServicio ? 'Un plato por línea' : 'Sin servicio',
        readonly: !hayServicio,
      },
    });

    const estado = crear('p', { clase: 'dia-carta__estado', attrs: { role: 'status' } });

    const tarjeta = { fecha: dia.fecha, area, estado, guardado: area.value };
    tarjetas.push(tarjeta);

    const refrescarEstado = () => {
      const platos = aPlatos(area.value);
      const pendiente = area.value !== tarjeta.guardado;
      if (!hayServicio) {
        estado.textContent = 'Sin servicio';
        estado.className = 'dia-carta__estado';
      } else if (pendiente) {
        estado.textContent = 'Sin guardar';
        estado.className = 'dia-carta__estado dia-carta__estado--pendiente';
      } else {
        estado.textContent = platos.length === 0
          ? 'Día sin carta'
          : `${platos.length} ${platos.length === 1 ? 'plato' : 'platos'}`;
        estado.className = 'dia-carta__estado';
      }
    };

    tarjeta.refrescar = refrescarEstado;
    refrescarEstado();

    area.addEventListener('input', () => {
      refrescarEstado();
      acciones.alCambiar();
    });

    const clases = ['dia-carta'];
    if (dia.fecha === hoy) clases.push('dia-carta--hoy');
    if (!hayServicio) clases.push('dia-carta--sin-servicio');

    return crear('article', {
      clase: clases.join(' '),
      hijos: [
        crear('header', {
          clase: 'dia-carta__cabecera',
          hijos: [
            crear('p', { clase: 'dia-carta__dia', texto: nombreDiaCorto(dia.fecha) }),
            crear('p', {
              clase: 'dia-carta__fecha',
              texto: formatearFechaCorta(dia.fecha) + (dia.fecha === hoy ? ' · hoy' : ''),
            }),
          ],
        }),
        area,
        estado,
      ],
    });
  });

  pintar(contenedor, ...nodos);

  return {
    /** Lo escrito ahora mismo, listo para mandar al servicio. */
    leer: () => tarjetas.map((t) => ({ fecha: t.fecha, platos: aPlatos(t.area.value) })),

    /** ¿Queda algo sin guardar? */
    hayPendientes: () => tarjetas.some((t) => t.area.value !== t.guardado),

    /** Da por guardado lo que hay escrito y quita las marcas de pendiente. */
    marcarGuardado() {
      tarjetas.forEach((t) => { t.guardado = t.area.value; t.refrescar(); });
    },

    /**
     * Vuelca la carta de otra semana en las cajas, respetando el día de la
     * semana: el lunes de allí cae en el lunes de aquí. Queda como pendiente,
     * porque copiar no es publicar.
     */
    volcar(otrosDias) {
      otrosDias.forEach((dia, i) => {
        const tarjeta = tarjetas[i];
        // Los días sin servicio se saltan: su caja es de solo lectura y
        // volcarles algo dejaría escrito lo que la API va a rechazar.
        if (!tarjeta || tarjeta.area.readOnly) return;
        tarjeta.area.value = dia.opciones.map((o) => o.nombre).join('\n');
        tarjeta.refrescar();
      });
    },
  };
}
