/**
 * La portada del módulo de pedidos: a quién se le pide.
 *
 * A diferencia de la de reservas, esta NO es pública: `proveedores.listar`
 * exige sesión, así que la ruta también. Quien llegue sin ella acaba en la
 * lista de módulos con el acceso delante y vuelve aquí al entrar.
 *
 * Por eso aquí no hay `ModalAcceso`: con sesión siempre, no hay nada que
 * pedir. La puerta de este módulo es la portada de la aplicación.
 */

import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getProveedores } from '../../servicios/proveedoresServicio.js';
import { usePeticion } from '../../utiles/usePeticion.js';
import { TarjetaProveedor } from '../../componentes/TarjetaProveedor.js';
import { BloqueEstado } from '../../componentes/BloqueEstado.js';
import { BarraVolver } from '../../componentes/BarraVolver.js';
import { Pie } from '../../componentes/Pie.js';
import { useHoy, useSesion } from '../../contexto/Sesion.js';
import { puede } from '../../servicios/capacidades.js';
import { formatearFechaLarga } from '../../utiles/fechas.js';

export function Inicio() {
  const hoy = useHoy();
  const { contexto, salir } = useSesion();
  const perfil = contexto?.perfil ?? null;

  const consultar = useCallback(() => getProveedores(), []);
  const { datos: proveedores, cargando, error, recargar } = usePeticion(consultar, []);

  return (
    <>
      <main className="contenedor pagina">
        {contexto?.perfil && (
          <BarraVolver
            volver={{ a: '/', texto: '← Módulos' }}
          />
        )}

        {/*
          `.encabezado-reserva` y no `.portada`: es la fila de «título a la
          izquierda, acción a la derecha» que ya usan las otras tres pantallas
          del módulo, y el titular mide exactamente lo mismo en las dos
          —`--texto-2xl`—, así que la portada no encoge.

          El historial va aquí y no en el pie: no es administración de nada, es
          la otra mitad del módulo —lo que ya se pidió— y quien elabora un
          pedido es quien más lo consulta.
        */}
        <section className="encabezado-reserva">
          <div>
            <p className="portada__fecha">{formatearFechaLarga(hoy)}</p>
            <h1 className="encabezado-reserva__titulo">Pedidos a proveedores</h1>
          </div>

          <div className="filtros__acciones">
            {/*
              Solo se enseña a administración, al revés que el «Admin» del pie
              de reservas. Allí se ofrece a todo el mundo porque es la ÚNICA
              puerta a administración y esconderla la haría inalcanzable; aquí
              no es la puerta de nada: quien no administra el catálogo no tiene
              qué hacer dentro. La ruta lo comprueba igual, y el servidor
              también.
            */}
            {puede(perfil?.rol, 'administrarCatalogo') && (
              <Link className="boton boton--secundario" to="/pedidos/admin">
                Administrar catálogo
              </Link>
            )}
            <Link className="boton boton--secundario" to="/pedidos/historial">
              Ver historial de pedidos
            </Link>
          </div>
        </section>

        <section aria-labelledby="titulo-proveedores">
          <h2 className="seccion__titulo" id="titulo-proveedores">Almacenes y proveedores</h2>

          {cargando && <BloqueEstado tipo="cargando" titulo="Cargando proveedores…" />}

          {error && (
            <BloqueEstado
              tipo="error"
              titulo="No se pudieron cargar los proveedores"
              detalle={error}
              accion={{ texto: 'Reintentar', alPulsar: recargar }}
            />
          )}

          {/*
            Una lista vacía aquí casi siempre significa una cosa concreta: que
            el catálogo no se ha sembrado todavía. Decirlo con esas palabras
            ahorra el rato de buscar el fallo en la pantalla.
          */}
          {proveedores?.length === 0 && (
            <BloqueEstado
              tipo="vacio"
              titulo="No hay proveedores dados de alta"
              detalle="Si la base de datos es nueva, falta sembrar el catálogo: npm run sembrar-pedidos"
            />
          )}

          {proveedores && proveedores.length > 0 && (
            <div className="rejilla-tarjetas" aria-live="polite">
              {proveedores.map((proveedor) => (
                <TarjetaProveedor key={proveedor.id} proveedor={proveedor} />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Sin enlace a administración: la de reservas es de reservas, y la de
          pedidos todavía no existe. */}
      <Pie />
    </>
  );
}
