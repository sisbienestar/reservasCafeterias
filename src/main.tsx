/**
 * Punto de entrada. Monta React y no hace nada más.
 *
 * Las hojas de estilo se importan aquí y en este orden —base, componentes,
 * páginas, admin— porque siguen siendo CSS en cascada, sin módulos ni ámbitos:
 * son las mismas cuatro de la app vanilla, movidas tal cual. Reescribirlas al
 * pasar a React habría metido un segundo cambio grande dentro del primero, y
 * entonces cualquier cosa que se viera rara podría ser de los dos.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import './estilos/base.css';
import './estilos/componentes.css';
import './estilos/paginas.css';
import './estilos/admin.css';
import './estilos/react.css';
import './estilos/documento.css';

import { ProveedorSesion } from './contexto/Sesion.js';
import { App } from './App.js';

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Falta el elemento #raiz en index.html.');

createRoot(raiz).render(
  <StrictMode>
    <BrowserRouter>
      <ProveedorSesion>
        <App />
      </ProveedorSesion>
    </BrowserRouter>
  </StrictMode>,
);
