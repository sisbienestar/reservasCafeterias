/**
 * La puerta única a las gráficas. Quien las use importa de aquí y no de los
 * archivos sueltos: así se puede repartir el interior sin tocar las pantallas.
 */

export {
  GraficaBarras, GraficaColumnas, Indicador,
  type DatoBarra, type DatoColumna,
} from './Basicas.js';

export {
  GraficaBarrasAgrupadas, GraficaLineas,
  type GrupoBarras, type PuntoSerie, type SerieTemporal,
} from './Series.js';

export { GraficaAnillo, type Porcion } from './Composicion.js';
export { MapaCalor, type CeldaCalor } from './MapaCalor.js';
export { Leyenda, colorSerie, MAX_SERIES, COLOR_OTROS, type Serie } from './comunes.js';
