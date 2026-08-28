/**
 * El pie institucional.
 *
 * Estaba en las tres páginas del original y se me quedó fuera al pasar a
 * React. No es adorno: en una herramienta interna, decir de quién es y a qué
 * dependencia pertenece es la única atribución que hay.
 *
 * El enlace a administración va en la portada de RESERVAS y nada más. Es la
 * administración de ese módulo —no la de la aplicación—, y por eso no aparece
 * en la lista de módulos. Se ofrece SIEMPRE, con sesión o sin ella: es la
 * única puerta que hay, y esconderla a quien no ha entrado la haría
 * inalcanzable. Pulsarlo sin sesión abre el acceso; entrar con una cuenta que
 * no es de administración devuelve a la portada del módulo.
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
              <Link className="pie__enlace" to="/reservas/admin">Admin</Link>
            </>
          )}
        </p>
      </div>
    </footer>
  );
}
