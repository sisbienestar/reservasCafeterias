/**
 * Los enlaces del módulo, en TODAS sus pantallas.
 *
 * Estaban solo en la portada, así que ir del historial al catálogo eran dos
 * pasos: volver al control de salidas y desde allí entrar. Con cuatro
 * pantallas que se visitan en cualquier orden, ese «volver» de por medio se
 * paga muchas veces al día.
 *
 * `NavLink` y no `Link` para poder marcar dónde se está: en una barra que se
 * repite en todas partes, sin esa marca hay que leer el título para saberlo.
 *
 * Lo que NO lleva es «Ver el día junto». Ese nombre queda reservado para el
 * formato de impresión, que todavía no existe y que saldrá desde el cierre del
 * día y desde el historial — no desde una barra de navegación.
 */

import { NavLink } from 'react-router-dom';
import { puede } from '../../servicios/capacidades.js';
import { useSesion } from '../../contexto/Sesion.js';

export function NavSalidas() {
  const { contexto } = useSesion();
  const rol = contexto?.perfil?.rol;

  /* `end` en la portada: sin él, `/salidas` se daría por activa también en
     `/salidas/historial`, que empieza igual, y se marcarían dos a la vez. */
  const clase = ({ isActive }: { isActive: boolean }) =>
    `boton boton--sm boton--${isActive ? 'neutro' : 'secundario'}`;

  return (
    <nav className="nav-salidas" aria-label="Secciones del control de salidas">
      <NavLink to="/salidas" end className={clase}>Cierre del día</NavLink>

      {puede(rol, 'administrarSalidas') && (
        <NavLink to="/salidas/admin" className={clase}>Productos</NavLink>
      )}

      <NavLink to="/salidas/historial" className={clase}>Historial</NavLink>
    </nav>
  );
}
