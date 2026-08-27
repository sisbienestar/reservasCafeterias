/**
 * El pie institucional.
 *
 * Estaba en las tres páginas del original y se me quedó fuera al pasar a
 * React. No es adorno: en una herramienta interna, decir de quién es y a qué
 * dependencia pertenece es la única atribución que hay.
 *
 * El enlace a administración solo va en el inicio, igual que antes. Ahora
 * además solo se ofrece a quien puede usarlo, porque el servidor rechazará a
 * cualquier otro.
 */

import { Link } from 'react-router-dom';

export function Pie({ conEnlaceAdmin = false }: { conEnlaceAdmin?: boolean }) {
  return (
    <footer className="pie">
      <div className="contenedor">
        <p>
          Bienestar Universitario · Universidad Industrial de Santander
          {conEnlaceAdmin && (
            <>
              <span className="separador" aria-hidden="true">·</span>
              <Link className="pie__enlace" to="/admin">Admin</Link>
            </>
          )}
        </p>
      </div>
    </footer>
  );
}
