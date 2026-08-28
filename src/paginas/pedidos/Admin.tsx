/**
 * El panel del módulo de pedidos.
 *
 * Misma forma que `/reservas/admin`: pestañas arriba, y cada una con su
 * formulario y su tabla. No es la misma pantalla ni comparte código con
 * aquella, y no debería: administran cosas distintas y juntarlas habría hecho
 * un panel que sabe de los dos módulos a la vez, que es justo lo que la
 * división en módulos evita.
 *
 * Aquí NO se ven ni se anulan pedidos. Eso ya está en el historial y en el
 * documento, y repetirlo sería una segunda puerta a lo mismo.
 */

import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  SeccionCuentas, SeccionProductos, SeccionProveedores,
} from '../../componentes/pedidos/CatalogoPedidos.js';
import { BarraSesion } from '../../componentes/BarraSesion.js';
import { ModalConfirmacion, type PeticionConfirmacion } from '../../componentes/ModalConfirmacion.js';
import { Pie } from '../../componentes/Pie.js';
import { useSesion } from '../../contexto/Sesion.js';

type Pestana = 'proveedores' | 'productos' | 'cuentas';

const PESTANAS: { id: Pestana; texto: string }[] = [
  { id: 'proveedores', texto: 'Proveedores' },
  { id: 'productos', texto: 'Productos' },
  { id: 'cuentas', texto: 'Cuentas' },
];

export function Admin() {
  const { contexto, salir } = useSesion();
  const perfil = contexto?.perfil ?? null;

  const [pestana, setPestana] = useState<Pestana>('proveedores');
  const [confirmacion, setConfirmacion] = useState<PeticionConfirmacion | null>(null);

  /*
   * Toda baja pasa por el modal. No es ceremonia: archivar un proveedor le
   * quita el formulario de pedido a las cinco cafeterías a la vez, y ese es
   * exactamente el tipo de gesto que no debería caber en un clic distraído.
   */
  const pedirConfirmacion = useCallback((peticion: PeticionConfirmacion) => {
    setConfirmacion({
      ...peticion,
      alConfirmar: () => {
        peticion.alConfirmar();
        setConfirmacion(null);
      },
    });
  }, []);

  /** Flechas izquierda y derecha entre pestañas, como manda el patrón ARIA. */
  const alTeclear = useCallback((evento: React.KeyboardEvent) => {
    if (evento.key !== 'ArrowRight' && evento.key !== 'ArrowLeft') return;
    evento.preventDefault();
    const i = PESTANAS.findIndex((p) => p.id === pestana);
    const salto = evento.key === 'ArrowRight' ? 1 : PESTANAS.length - 1;
    setPestana(PESTANAS[(i + salto) % PESTANAS.length]!.id);
  }, [pestana]);

  return (
    <>
      <main className="contenedor pagina">
        {perfil && (
          <BarraSesion
            perfil={perfil}
            alSalir={salir}
            volver={{ a: '/pedidos', texto: '← Ir a elaborar pedidos' }}
          />
        )}

        <section className="encabezado-admin">
          <h1 className="encabezado-admin__titulo">Administración de pedidos</h1>
          <p className="encabezado-admin__bajada">
            El catálogo que se ve al elaborar un pedido: qué proveedores hay,
            qué productos tiene cada uno y en qué orden salen impresos.
          </p>
        </section>

        <nav className="pestanas" aria-label="Secciones del panel de pedidos">
          <div className="pestanas__lista" role="tablist">
            {PESTANAS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                id={`pestana-${p.id}`}
                aria-selected={pestana === p.id}
                aria-controls={`panel-${p.id}`}
                className={pestana === p.id ? 'pestana pestana--activa' : 'pestana'}
                tabIndex={pestana === p.id ? 0 : -1}
                onKeyDown={alTeclear}
                onClick={() => setPestana(p.id)}
              >
                {p.texto}
              </button>
            ))}
          </div>
        </nav>

        <div
          id={`panel-${pestana}`}
          role="tabpanel"
          aria-labelledby={`pestana-${pestana}`}
        >
          {/*
            Cada sección se monta y se desmonta al cambiar de pestaña, así que
            vuelve a consultar. Es a propósito: administrar es corregir y
            volver a mirar, y una lista guardada en memoria enseñaría lo de
            antes justo cuando importa ver lo de ahora.
          */}
          {pestana === 'proveedores' && <SeccionProveedores pedirConfirmacion={pedirConfirmacion} />}
          {pestana === 'productos' && <SeccionProductos pedirConfirmacion={pedirConfirmacion} />}
          {pestana === 'cuentas' && <SeccionCuentas />}
        </div>

        {pestana === 'cuentas' && (
          <p className="aviso aviso--aviso" role="status">
            ¿Falta alguien o sobra? Las cuentas se crean y se borran en el panel
            de Supabase, y el rol se asigna en la tabla <code>perfil</code>.{' '}
            <Link className="aviso__accion" to="/pedidos/historial">Ver el historial de pedidos</Link>
          </p>
        )}
      </main>

      <Pie />

      <ModalConfirmacion peticion={confirmacion} alCerrar={() => setConfirmacion(null)} />
    </>
  );
}
