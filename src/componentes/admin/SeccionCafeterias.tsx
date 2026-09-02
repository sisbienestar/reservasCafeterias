/**
 * Las cafeterías del campus, en el panel de la APLICACIÓN.
 *
 * ── Por qué está aquí y no en `/reservas/admin` ──────────────────────────
 *
 * Vivió en la pestaña «Catálogo» de reservas hasta que hubo tres módulos
 * usando las sedes. Ahí ya no cabía: una cafetería no es de reservas —la usan
 * también los pedidos y el control de salidas—, y editarla desde dentro de uno
 * de los tres sugería lo contrario.
 *
 * Y no es un módulo propio, aunque lo parezca. CLAUDE.md lo dice: la
 * administración no se ata a ningún módulo, o apagar uno cerraría la puerta
 * para volver a encenderlo. Con tres módulos dependiendo de estas filas, eso
 * pesa más que antes. `cafeterias.*` sigue fuera de `MODULO_DE`.
 *
 * La carta de la semana se quedó en reservas, que sí es suya.
 *
 * ── Dos cosas que se parecen y no son la misma ───────────────────────────
 *
 * En la pestaña «Usuarios» se dice a qué sede tiene ACCESO cada cuenta
 * —`perfil.cafeteria_id`, que es un permiso—. Aquí se dice quién RESPONDE por
 * cada sede, que es un dato del cierre de caja y no abre ninguna puerta.
 *
 * Se pueden contradecir a propósito: una sede puede tener tres cuentas con
 * acceso y una sola responsable, y la responsable puede ser una cuenta que
 * atienda otra sede. Lo único que el servidor exige es que sea de MOSTRADOR:
 * administración y el auxiliar van sin sede, así que ninguno «estaba» en una
 * cafetería un día concreto.
 */

import { useCallback, useState, type FormEvent } from 'react';
import {
  actualizarCafeteria, archivarCafeteria, crearCafeteria, getCafeterias,
  reactivarCafeteria, type Cafeteria,
} from '../../servicios/cafeteriasServicio.js';
import { getUsuarios } from '../../servicios/usuariosServicio.js';
import { usePeticion } from '../../utiles/usePeticion.js';
import { BloqueEstado } from '../BloqueEstado.js';
import type { PeticionConfirmacion } from '../ModalConfirmacion.js';

export function SeccionCafeterias({ pedirConfirmacion, alCambiar }: {
  pedirConfirmacion: (p: PeticionConfirmacion) => void;
  /** Para que quien tenga la lista cargada se entere de un alta o un cierre. */
  alCambiar: () => void;
}) {
  const consultar = useCallback(() => getCafeterias({ incluirInactivas: true }), []);
  const { datos: cafeterias, cargando, error, recargar } = usePeticion(consultar, []);

  /* Las cuentas, para el desplegable de responsable. Se piden UNA vez y se
     filtran aquí: son unas pocas filas, y traerlas por cafetería serían cinco
     viajes para pintar cinco desplegables con la misma lista. */
  const consultarCuentas = useCallback(() => getUsuarios(), []);
  const { datos: cuentas } = usePeticion(consultarCuentas, []);

  /** `null` = el formulario está en modo alta. */
  const [editando, setEditando] = useState<Cafeteria | null>(null);
  const [nombre, setNombre] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  /** Un plato fijo por línea. Es la forma más directa de editar una lista
   *  corta de texto libre, y no hace falta enseñar a usarla. */
  const [platosFijos, setPlatosFijos] = useState('');
  const [responsable, setResponsable] = useState('');
  const [aviso, setAviso] = useState<{ tipo: string; mensaje: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  /*
   * Cualquier cuenta de MOSTRADOR puede responder por cualquier sede.
   *
   * Estuvo limitado a las que atendían esa misma cafetería, y era demasiado:
   * con una sola cuenta de mostrador dada de alta, tres de las cuatro sedes
   * tenían el desplegable vacío sin que fuera un fallo. Responder por una sede
   * y tener acceso a ella son dos cosas distintas — ver el comentario de la
   * columna en `19-control-salidas.sql`.
   *
   * Es la misma regla que comprueba el servidor, repetida aquí para no ofrecer
   * un nombre que va a devolver un error al guardar.
   */
  const candidatos = (cuentas ?? []).filter((u) => u.rol === 'mostrador');

  function empezarEdicion(cafeteria: Cafeteria) {
    setEditando(cafeteria);
    setNombre(cafeteria.nombre);
    setUbicacion(cafeteria.ubicacion);
    setPlatosFijos(cafeteria.platosFijos.join('\n'));
    setResponsable(cafeteria.responsableUsuarioId);
    setAviso(null);
  }

  function terminarEdicion() {
    setEditando(null);
    setNombre('');
    setUbicacion('');
    setPlatosFijos('');
    setResponsable('');
  }

  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    if (guardando) return;

    setAviso(null);
    setGuardando(true);
    const datos = {
      nombre: nombre.trim(),
      ubicacion: ubicacion.trim(),
      platosFijos: platosFijos.split('\n').map((p) => p.trim()).filter(Boolean),
    };

    try {
      if (editando) {
        // El responsable solo se manda al EDITAR: una cafetería recién creada
        // todavía no tiene ninguna cuenta asignada a la que nombrar.
        await actualizarCafeteria(editando.id, { ...datos, responsableUsuarioId: responsable });
        setAviso({ tipo: 'exito', mensaje: `«${datos.nombre}» actualizada.` });
      } else {
        const nueva = await crearCafeteria(datos);
        setAviso({
          tipo: 'exito',
          mensaje: `«${nueva.nombre}» creada con el código ${nueva.codigo}.`,
        });
      }
      terminarEdicion();
      recargar();
      alCambiar();
    } catch (e) {
      setAviso({ tipo: 'error', mensaje: (e as Error).message });
    } finally {
      setGuardando(false);
    }
  }

  /**
   * Archivar es un borrado lógico y aun así se confirma: la sede desaparece
   * del inicio y del mostrador, y quien la archive por error puede tardar en
   * enterarse. Reactivar no se confirma — no destruye nada.
   */
  function pedirArchivar(cafeteria: Cafeteria) {
    pedirConfirmacion({
      titulo: `¿Cerrar «${cafeteria.nombre}»?`,
      detalle:
        'Dejará de aparecer en los tres módulos: no se podrán registrar reservas, '
        + 'ni hacerle pedidos, ni cerrar su caja. Su histórico se conserva entero '
        + 'y se puede reactivar cuando haga falta.',
      textoConfirmar: 'Cerrar la cafetería',
      alConfirmar: async () => {
        try {
          await archivarCafeteria(cafeteria.id);
          setAviso({ tipo: 'exito', mensaje: `«${cafeteria.nombre}» cerrada.` });
          recargar();
          alCambiar();
        } catch (e) {
          setAviso({ tipo: 'error', mensaje: (e as Error).message });
        }
      },
    });
  }

  async function reactivar(cafeteria: Cafeteria) {
    try {
      await reactivarCafeteria(cafeteria.id);
      setAviso({ tipo: 'exito', mensaje: `«${cafeteria.nombre}» vuelve a estar en servicio.` });
      recargar();
      alCambiar();
    } catch (e) {
      setAviso({ tipo: 'error', mensaje: (e as Error).message });
    }
  }

  return (
    <section className="bloque-admin">
      <h2 className="seccion__titulo">Cafeterías</h2>
      <p className="encabezado-admin__bajada">
        Las sedes del campus. Las usan los tres módulos, así que se administran
        aquí y no dentro de ninguno.
      </p>

      {aviso && <p className={`aviso aviso--${aviso.tipo}`} role="status">{aviso.mensaje}</p>}

      <form className="formulario-catalogo" onSubmit={guardar} noValidate>
        <div className="filtros__campo filtros__campo--ancho">
          <label className="campo__etiqueta" htmlFor="cafeteria-nombre">Nombre</label>
          <input className="campo__control" id="cafeteria-nombre" type="text"
                 autoComplete="off" placeholder="Cafetería de Salud"
                 value={nombre} onChange={(e) => setNombre(e.target.value)}
                 required disabled={guardando} />
        </div>

        <div className="filtros__campo filtros__campo--ancho">
          <label className="campo__etiqueta" htmlFor="cafeteria-ubicacion">Ubicación</label>
          <input className="campo__control" id="cafeteria-ubicacion" type="text"
                 autoComplete="off" placeholder="Facultad de Salud · Primer piso"
                 value={ubicacion} onChange={(e) => setUbicacion(e.target.value)}
                 disabled={guardando} />
        </div>

        <div className="filtros__campo filtros__campo--ancho">
          <label className="campo__etiqueta" htmlFor="cafeteria-fijos">Platos fijos</label>
          <textarea className="campo__control" id="cafeteria-fijos" rows={3} spellCheck={false}
                    placeholder="Uno por línea. Se ofrecen todos los días."
                    value={platosFijos} onChange={(e) => setPlatosFijos(e.target.value)}
                    disabled={guardando} />
        </div>

        {/*
          El responsable solo aparece EDITANDO, y no es una limitación: al dar
          de alta una cafetería todavía no hay ninguna cuenta asignada a ella,
          así que el desplegable saldría vacío y solo serviría para confundir.
        */}
        {editando && (
          <div className="filtros__campo filtros__campo--ancho">
            <label className="campo__etiqueta" htmlFor="cafeteria-responsable">
              Responsable del control de salidas
            </label>
            <select className="campo__control" id="cafeteria-responsable"
                    value={responsable} disabled={guardando}
                    onChange={(e) => setResponsable(e.target.value)}>
              <option value="">Sin asignar</option>
              {/* Con la sede detrás: es lo que distingue a dos personas del
                  mismo nombre, y deja ver de un vistazo si se está nombrando a
                  alguien de otra cafetería —que se puede, pero conviene que se
                  vea—. */}
              {candidatos.map((u) => (
                <option key={u.usuarioId} value={u.usuarioId}>
                  {u.nombre}{u.cafeteriaNombre ? ` · ${u.cafeteriaNombre}` : ''}
                </option>
              ))}
            </select>
            <span className="campo__ayuda">
              {candidatos.length === 0
                ? 'No hay ninguna cuenta de mostrador dada de alta. Se crean en la pestaña Usuarios.'
                : 'Cualquier cuenta de mostrador. Su nombre queda copiado dentro de '
                  + 'cada cierre, así que cambiarlo no altera los ya guardados. NO es '
                  + 'un permiso: el acceso a la sede se da en Usuarios.'}
            </span>
          </div>
        )}

        {/* El identificador y el código no se editan, y se dice por qué: son
            la clave con la que las reservas históricas apuntan aquí. */}
        {editando && (
          <p className="campo__ayuda">
            Identificador <code>{editando.id}</code> · código <code>{editando.codigo}</code>.
            No se pueden cambiar: las reservas ya registradas apuntan a ellos.
          </p>
        )}

        <div className="filtros__acciones">
          <button type="submit" className="boton boton--primario" disabled={guardando}>
            {editando ? 'Guardar cambios' : 'Añadir cafetería'}
          </button>
          {editando && (
            <button type="button" className="boton boton--secundario"
                    onClick={terminarEdicion} disabled={guardando}>
              Cancelar edición
            </button>
          )}
        </div>
      </form>

      {cargando && <BloqueEstado tipo="cargando" titulo="Cargando cafeterías…" />}
      {error && (
        <BloqueEstado tipo="error" titulo="No se pudo cargar el catálogo"
                      detalle={error} accion={{ texto: 'Reintentar', alPulsar: recargar }} />
      )}

      {cafeterias && (
        <div className="tabla-envoltorio">
          <table className="tabla tabla--admin">
            <thead>
              <tr>
                <th scope="col">Cafetería</th>
                <th scope="col">Ubicación</th>
                <th scope="col">Responsable</th>
                <th scope="col">Platos fijos</th>
                <th scope="col">Estado</th>
                <th className="tabla__acciones" scope="col">
                  <span className="visualmente-oculto">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {cafeterias.map((cafeteria) => (
                <tr key={cafeteria.id}
                    className={cafeteria.activa ? 'tabla__fila' : 'tabla__fila tabla__fila--apagada'}>
                  <td className="tabla__nombre">{cafeteria.nombre}</td>
                  <td className="tabla__menu">{cafeteria.ubicacion || '—'}</td>
                  <td className="tabla__menu">
                    {cafeteria.responsableNombre
                      || <span className="tabla__detalle">sin asignar</span>}
                  </td>
                  {/* Los NOMBRES, no cuántos hay: «3» no dice si falta alguno,
                      y esta tabla existe para revisarlos de un vistazo. */}
                  <td className="tabla__menu">
                    {cafeteria.platosFijos.join(' · ') || '—'}
                  </td>
                  <td>
                    <span className={`marca-estado marca-estado--${cafeteria.activa ? 'activa' : 'cancelada'}`}>
                      {cafeteria.activa ? 'En servicio' : 'Cerrada'}
                    </span>
                  </td>
                  <td className="tabla__acciones">
                    <button type="button" className="boton boton--secundario boton--sm"
                            onClick={() => empezarEdicion(cafeteria)}
                            aria-label={`Editar ${cafeteria.nombre}`}>
                      Editar
                    </button>
                    {cafeteria.activa ? (
                      <button type="button" className="boton boton--secundario boton--sm"
                              onClick={() => pedirArchivar(cafeteria)}
                              aria-label={`Cerrar ${cafeteria.nombre}`}>
                        Cerrar
                      </button>
                    ) : (
                      <button type="button" className="boton boton--secundario boton--sm"
                              onClick={() => void reactivar(cafeteria)}
                              aria-label={`Reabrir ${cafeteria.nombre}`}>
                        Reabrir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
