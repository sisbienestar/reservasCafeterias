/**
 * El panel de la APLICACIÓN, no el de un módulo.
 *
 * Cuelga de `/admin` a secas por eso mismo: lo de cada módulo vive bajo su
 * prefijo —`/reservas/admin`, `/pedidos/admin`— y esto está por encima de los
 * dos.
 *
 * Cuatro pestañas y una regla en todas: aquí no se decide ningún permiso. Las
 * guardas de verdad —no cambiarse el rol a uno mismo, dejar siempre un admin,
 * el par rol + sede— están en `api/_nucleo/acciones/usuarios.ts`. Lo que hay
 * aquí es la forma de pedirlas y de contar qué pasó.
 */

import { useCallback, useState } from 'react';
import {
  actualizarModulo, getAjustes, getRegistro, guardarAjuste,
} from '../servicios/aplicacionServicio.js';
import {
  actualizarUsuario, cambiarContrasena, crearUsuario, eliminarUsuario, getUsuarios,
  type Usuario,
} from '../servicios/usuariosServicio.js';
import { getCafeterias } from '../servicios/cafeteriasServicio.js';
import { usePeticion } from '../utiles/usePeticion.js';
import { BarraSesion } from '../componentes/BarraSesion.js';
import { BloqueEstado } from '../componentes/BloqueEstado.js';
import { ModalConfirmacion, type PeticionConfirmacion } from '../componentes/ModalConfirmacion.js';
import { Pie } from '../componentes/Pie.js';
import { useSesion, type Rol } from '../contexto/Sesion.js';
import { formatearMarcaTemporal } from '../utiles/fechas.js';

type Pestana = 'usuarios' | 'modulos' | 'ajustes' | 'registro';

const PESTANAS: { id: Pestana; texto: string }[] = [
  { id: 'usuarios', texto: 'Usuarios' },
  { id: 'modulos', texto: 'Módulos' },
  { id: 'ajustes', texto: 'Ajustes' },
  { id: 'registro', texto: 'Registro' },
];

const NOMBRE_ROL: Record<string, string> = {
  mostrador: 'Mostrador',
  admin: 'Administración',
};

export function AdminGeneral() {
  const { contexto, salir, refrescar } = useSesion();
  const perfil = contexto?.perfil ?? null;

  const [pestana, setPestana] = useState<Pestana>('usuarios');
  const [confirmacion, setConfirmacion] = useState<PeticionConfirmacion | null>(null);

  const pedirConfirmacion = useCallback((peticion: PeticionConfirmacion) => {
    setConfirmacion({
      ...peticion,
      alConfirmar: () => { peticion.alConfirmar(); setConfirmacion(null); },
    });
  }, []);

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
          <BarraSesion perfil={perfil} alSalir={salir} volver={{ a: '/', texto: '← Módulos' }} />
        )}

        <section className="encabezado-admin">
          <h1 className="encabezado-admin__titulo">Administración de la aplicación</h1>
          <p className="encabezado-admin__bajada">
            Quién entra y con qué permisos, qué módulos están en servicio, y los
            interruptores que antes obligaban a redesplegar para cambiarlos.
          </p>
        </section>

        <nav className="pestanas" aria-label="Secciones del panel">
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

        <div id={`panel-${pestana}`} role="tabpanel" aria-labelledby={`pestana-${pestana}`}>
          {pestana === 'usuarios' && (
            <SeccionUsuarios pedirConfirmacion={pedirConfirmacion} yoSoy={perfil?.nombre ?? ''} />
          )}
          {/*
            Al cambiar un módulo hay que refrescar el contexto: la portada y la
            cabecera leen de ahí, y sin esto seguirían enseñando lo de antes
            hasta la siguiente recarga completa.
          */}
          {pestana === 'modulos' && <SeccionModulos alCambiar={refrescar} />}
          {pestana === 'ajustes' && <SeccionAjustes alCambiar={refrescar} />}
          {pestana === 'registro' && <SeccionRegistro />}
        </div>
      </main>

      <Pie />

      <ModalConfirmacion peticion={confirmacion} alCerrar={() => setConfirmacion(null)} />
    </>
  );
}

/* ── Usuarios ───────────────────────────────────────────────────────── */

function SeccionUsuarios({ pedirConfirmacion, yoSoy }: {
  pedirConfirmacion: (p: PeticionConfirmacion) => void;
  yoSoy: string;
}) {
  const consultar = useCallback(() => getUsuarios(), []);
  const { datos: usuarios, cargando, error, recargar } = usePeticion(consultar, []);

  const consultarSedes = useCallback(() => getCafeterias(), []);
  const { datos: sedes } = usePeticion(consultarSedes, []);

  const [editando, setEditando] = useState<Usuario | null>(null);
  const [correo, setCorreo] = useState('');
  const [nombre, setNombre] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [rol, setRol] = useState<Rol>('mostrador');
  const [sede, setSede] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null);

  function limpiar() {
    setEditando(null);
    setCorreo(''); setNombre(''); setContrasena('');
    setRol('mostrador'); setSede('');
  }

  function editar(usuario: Usuario) {
    setEditando(usuario);
    setCorreo(usuario.correo);
    setNombre(usuario.nombre);
    setContrasena('');
    setRol(usuario.rol);
    setSede(usuario.cafeteriaId);
    setAviso(null);
  }

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setAviso(null);
    try {
      if (editando) {
        await actualizarUsuario(editando.usuarioId, { nombre, rol, cafeteriaId: sede });
        // La contraseña es una decisión aparte: solo se cambia si se escribió.
        if (contrasena) await cambiarContrasena(editando.usuarioId, contrasena);
      } else {
        await crearUsuario({ correo, nombre, contrasena, rol, cafeteriaId: sede });
      }
      limpiar();
      recargar();
      setAviso({ tipo: 'exito', mensaje: editando ? 'Cuenta actualizada.' : 'Cuenta creada.' });
    } catch (fallo) {
      setAviso({ tipo: 'error', mensaje: (fallo as Error).message });
    } finally {
      setGuardando(false);
    }
  }

  function borrar(usuario: Usuario) {
    pedirConfirmacion({
      titulo: `¿Borrar la cuenta de ${usuario.nombre}?`,
      detalle: 'Pierde el acceso y se borra la cuenta. Lo que hizo —sus reservas, sus pedidos y sus asientos del registro— se conserva entero.',
      textoConfirmar: 'Borrar la cuenta',
      alConfirmar: () => {
        void eliminarUsuario(usuario.usuarioId)
          .then(() => recargar())
          .catch((f: Error) => setAviso({ tipo: 'error', mensaje: f.message }));
      },
    });
  }

  return (
    <section className="bloque-admin" aria-label="Usuarios">
      <form className="formulario-catalogo" onSubmit={guardar} noValidate>
        {/* El correo es el identificador con el que se entra: cambiarlo desde
            aquí dejaría a alguien fuera sin avisarle. Editando va bloqueado. */}
        <div className="campo filtros__campo filtros__campo--ancho">
          <label className="campo__etiqueta" htmlFor="u-correo">Correo</label>
          <input
            id="u-correo"
            className="campo__control"
            type="email"
            value={correo}
            required
            disabled={Boolean(editando)}
            onChange={(e) => setCorreo(e.target.value)}
          />
        </div>

        <div className="campo filtros__campo filtros__campo--ancho">
          <label className="campo__etiqueta" htmlFor="u-nombre">Nombre</label>
          <input
            id="u-nombre"
            className="campo__control"
            value={nombre}
            required
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>

        <div className="campo filtros__campo">
          <label className="campo__etiqueta" htmlFor="u-rol">Rol</label>
          <select
            id="u-rol"
            className="campo__control"
            value={rol}
            onChange={(e) => {
              const nuevo = e.target.value as Rol;
              setRol(nuevo);
              // Administración ve todas las sedes, así que no se le asigna
              // ninguna. Es la misma regla que el CHECK del esquema.
              if (nuevo === 'admin') setSede('');
            }}
          >
            <option value="mostrador">Mostrador</option>
            <option value="admin">Administración</option>
          </select>
        </div>

        {rol === 'mostrador' && (
          <div className="campo filtros__campo filtros__campo--ancho">
            <label className="campo__etiqueta" htmlFor="u-sede">Cafetería</label>
            <select
              id="u-sede"
              className="campo__control"
              value={sede}
              required
              onChange={(e) => setSede(e.target.value)}
            >
              <option value="">Elige una…</option>
              {(sedes ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        )}

        <div className="campo filtros__campo filtros__campo--ancho">
          <label className="campo__etiqueta" htmlFor="u-clave">
            {editando ? 'Contraseña nueva (opcional)' : 'Contraseña temporal'}
          </label>
          <input
            id="u-clave"
            className="campo__control"
            type="text"
            value={contrasena}
            required={!editando}
            minLength={8}
            placeholder={editando ? 'Dejar en blanco para no cambiarla' : 'Mínimo 8 caracteres'}
            onChange={(e) => setContrasena(e.target.value)}
          />
        </div>

        <div className="filtros__acciones">
          {editando && (
            <button type="button" className="boton boton--secundario" onClick={limpiar}>
              Cancelar
            </button>
          )}
          <button type="submit" className="boton boton--primario" disabled={guardando}>
            {editando ? 'Guardar cambios' : 'Crear cuenta'}
          </button>
        </div>
      </form>

      {aviso && <p className={`aviso aviso--${aviso.tipo}`} role="status">{aviso.mensaje}</p>}

      {cargando && <BloqueEstado tipo="cargando" titulo="Cargando cuentas…" />}
      {error && (
        <BloqueEstado
          tipo="error"
          titulo="No se pudieron cargar las cuentas"
          detalle={error}
          accion={{ texto: 'Reintentar', alPulsar: recargar }}
        />
      )}

      {usuarios && usuarios.length > 0 && (
        <div className="tabla-envoltorio">
          <table className="tabla tabla--admin">
            <thead>
              <tr>
                <th scope="col">Correo</th>
                <th scope="col">Nombre</th>
                <th scope="col">Rol</th>
                <th scope="col">Cafetería</th>
                <th className="tabla__acciones" scope="col">
                  <span className="visualmente-oculto">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((usuario) => {
                const soyYo = usuario.nombre === yoSoy;
                return (
                  <tr key={usuario.usuarioId}>
                    <td className="tabla__nombre">{usuario.correo}</td>
                    <td className="tabla__nombre">
                      {usuario.nombre}
                      {soyYo && <span className="tabla__detalle">Tu cuenta</span>}
                    </td>
                    <td>
                      <span className="marca-estado marca-estado--activa">
                        {NOMBRE_ROL[usuario.rol] ?? usuario.rol}
                      </span>
                    </td>
                    <td className="tabla__menu">{usuario.cafeteriaNombre || 'Todas'}</td>
                    <td className="tabla__acciones">
                      <button
                        type="button"
                        className="boton boton--secundario boton--sm"
                        onClick={() => editar(usuario)}
                      >
                        Editar
                      </button>
                      {/* La propia cuenta no se borra. El servidor lo rechaza
                          igual; esconder el botón evita el intento. */}
                      {!soyYo && (
                        <button
                          type="button"
                          className="boton boton--peligro-plano boton--sm"
                          onClick={() => borrar(usuario)}
                        >
                          Borrar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ── Módulos ────────────────────────────────────────────────────────── */

function SeccionModulos({ alCambiar }: { alCambiar: () => Promise<void> }) {
  const { contexto } = useSesion();
  const [trabajando, setTrabajando] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null);

  const modulos = contexto?.modulos ?? [];

  /**
   * Guarda la ruta al salir del campo, no en cada tecla.
   *
   * Un `onChange` por pulsación mandaría una petición por letra. Al salir del
   * campo es cuando se sabe que quien escribía terminó.
   */
  async function guardarImagen(modulo: typeof modulos[number], imagen: string) {
    setAviso(null);
    try {
      await actualizarModulo({ ...modulo, imagen });
      await alCambiar();
      setAviso({ tipo: 'exito', mensaje: `Imagen de «${modulo.nombre}» guardada.` });
    } catch (fallo) {
      setAviso({ tipo: 'error', mensaje: (fallo as Error).message });
    }
  }

  async function cambiar(modulo: typeof modulos[number], activo: boolean) {
    setTrabajando(modulo.id);
    setAviso(null);
    try {
      await actualizarModulo({ ...modulo, activo });
      await alCambiar();
      setAviso({
        tipo: 'exito',
        mensaje: activo
          ? `«${modulo.nombre}» vuelve a estar en servicio.`
          : `«${modulo.nombre}» queda fuera de servicio: deja de verse y su API deja de responder.`,
      });
    } catch (fallo) {
      setAviso({ tipo: 'error', mensaje: (fallo as Error).message });
    } finally {
      setTrabajando('');
    }
  }

  return (
    <section className="bloque-admin" aria-label="Módulos">
      <p className="aviso aviso--aviso" role="status">
        Apagar un módulo no lo esconde solamente: sus rutas dejan de abrirse y
        el servidor rechaza sus acciones. Administración sigue entrando, para
        poder probarlo antes de volver a publicarlo.
      </p>

      {aviso && <p className={`aviso aviso--${aviso.tipo}`} role="status">{aviso.mensaje}</p>}

      <div className="tabla-envoltorio">
        <table className="tabla tabla--admin">
          <thead>
            <tr>
              <th scope="col">Módulo</th>
              <th scope="col">Ruta</th>
              <th scope="col">Imagen</th>
              <th scope="col">Estado</th>
              <th className="tabla__acciones" scope="col">
                <span className="visualmente-oculto">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {modulos.map((modulo) => (
              <tr key={modulo.id} className={modulo.activo ? undefined : 'tabla__fila--apagada'}>
                <td className="tabla__nombre">
                  {modulo.nombre}
                  <span className="tabla__detalle">{modulo.id}</span>
                </td>
                <td className="tabla__menu">{modulo.ruta || '—'}</td>
                {/* Solo el nombre del archivo; la carpeta la pone la
                    aplicación. Se edita aquí mismo: es un dato de una línea y
                    abrir un formulario aparte para él sobraba. */}
                <td>
                  <input
                    className="campo__control cantidad"
                    style={{ width: '190px', textAlign: 'left' }}
                    defaultValue={modulo.imagen}
                    placeholder="pedidos.jpeg"
                    aria-label={`Imagen de ${modulo.nombre}`}
                    onBlur={(e) => {
                      if (e.target.value !== modulo.imagen) {
                        void guardarImagen(modulo, e.target.value);
                      }
                    }}
                  />
                </td>
                <td>
                  <span className={`marca-estado marca-estado--${modulo.activo ? 'activa' : 'cancelada'}`}>
                    {modulo.activo ? 'En servicio' : 'Fuera de servicio'}
                  </span>
                </td>
                <td className="tabla__acciones">
                  <button
                    type="button"
                    className={`boton boton--sm ${modulo.activo ? 'boton--peligro-plano' : 'boton--secundario'}`}
                    disabled={trabajando === modulo.id}
                    onClick={() => void cambiar(modulo, !modulo.activo)}
                  >
                    {modulo.activo ? 'Poner fuera de servicio' : 'Poner en servicio'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ── Ajustes ────────────────────────────────────────────────────────── */

/** Los que son un interruptor y no un texto. */
const INTERRUPTORES = new Set(['permitir_fin_de_semana']);

function SeccionAjustes({ alCambiar }: { alCambiar: () => Promise<void> }) {
  const consultar = useCallback(() => getAjustes(), []);
  const { datos: ajustes, cargando, error, recargar } = usePeticion(consultar, []);

  const [borrador, setBorrador] = useState<Record<string, string>>({});
  const [trabajando, setTrabajando] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; mensaje: string } | null>(null);

  async function guardar(clave: string, valor: string) {
    setTrabajando(clave);
    setAviso(null);
    try {
      await guardarAjuste(clave, valor);
      recargar();
      // El nombre, la versión y el interruptor los lee la aplicación del
      // contexto, así que hay que volver a pedirlo o la pantalla mentiría.
      await alCambiar();
      setAviso({ tipo: 'exito', mensaje: 'Ajuste guardado.' });
    } catch (fallo) {
      setAviso({ tipo: 'error', mensaje: (fallo as Error).message });
    } finally {
      setTrabajando('');
    }
  }

  return (
    <section className="bloque-admin" aria-label="Ajustes">
      {aviso && <p className={`aviso aviso--${aviso.tipo}`} role="status">{aviso.mensaje}</p>}

      {cargando && <BloqueEstado tipo="cargando" titulo="Cargando ajustes…" />}
      {error && (
        <BloqueEstado
          tipo="error"
          titulo="No se pudieron cargar los ajustes"
          detalle={error}
          accion={{ texto: 'Reintentar', alPulsar: recargar }}
        />
      )}

      {(ajustes ?? []).map((ajuste) => {
        const esInterruptor = INTERRUPTORES.has(ajuste.clave);
        const encendido = ajuste.valor === 'true';
        const valor = borrador[ajuste.clave] ?? ajuste.valor;

        return (
          <form
            key={ajuste.clave}
            className="formulario-catalogo"
            onSubmit={(e) => { e.preventDefault(); void guardar(ajuste.clave, valor); }}
          >
            <div className="campo filtros__campo filtros__campo--ancho" style={{ flexBasis: '100%' }}>
              <label className="campo__etiqueta" htmlFor={`aj-${ajuste.clave}`}>
                {ajuste.clave}
              </label>
              <p className="tabla__nota">{ajuste.descripcion}</p>
            </div>

            {esInterruptor ? (
              <div className="filtros__acciones">
                <span className={`marca-estado marca-estado--${encendido ? 'cancelada' : 'activa'}`}>
                  {encendido ? 'Encendido' : 'Apagado'}
                </span>
                <button
                  type="button"
                  className={`boton boton--sm ${encendido ? 'boton--peligro-plano' : 'boton--secundario'}`}
                  disabled={trabajando === ajuste.clave}
                  onClick={() => void guardar(ajuste.clave, encendido ? 'false' : 'true')}
                >
                  {encendido ? 'Apagar' : 'Encender'}
                </button>
              </div>
            ) : (
              <>
                <div className="campo filtros__campo filtros__campo--ancho">
                  <input
                    id={`aj-${ajuste.clave}`}
                    className="campo__control"
                    value={valor}
                    onChange={(e) => setBorrador((b) => ({ ...b, [ajuste.clave]: e.target.value }))}
                  />
                </div>
                <div className="filtros__acciones">
                  <button
                    type="submit"
                    className="boton boton--secundario"
                    disabled={trabajando === ajuste.clave || valor === ajuste.valor}
                  >
                    Guardar
                  </button>
                </div>
              </>
            )}
          </form>
        );
      })}
    </section>
  );
}

/* ── Registro ───────────────────────────────────────────────────────── */

function SeccionRegistro() {
  const consultar = useCallback(() => getRegistro(100), []);
  const { datos: asientos, cargando, error, recargar } = usePeticion(consultar, []);

  return (
    <section className="bloque-admin" aria-label="Registro">
      {cargando && <BloqueEstado tipo="cargando" titulo="Cargando el registro…" />}
      {error && (
        <BloqueEstado
          tipo="error"
          titulo="No se pudo cargar el registro"
          detalle={error}
          accion={{ texto: 'Reintentar', alPulsar: recargar }}
        />
      )}

      {asientos?.length === 0 && !cargando && (
        <BloqueEstado
          tipo="vacio"
          titulo="Todavía no hay nada anotado"
          detalle="Aquí queda constancia de quién crea cuentas, cambia roles, enciende módulos o toca un ajuste."
        />
      )}

      {asientos && asientos.length > 0 && (
        <div className="tabla-envoltorio">
          <table className="tabla tabla--admin">
            <caption className="tabla__caption">
              Solo los gestos administrativos. Las reservas y los pedidos tienen
              su propio rastro y no se duplican aquí.
            </caption>
            <thead>
              <tr>
                <th scope="col">Cuándo</th>
                <th scope="col">Quién</th>
                <th scope="col">Qué</th>
                <th scope="col">Sobre</th>
                <th scope="col">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {asientos.map((asiento) => (
                <tr key={asiento.id}>
                  <td className="tabla__fecha">{formatearMarcaTemporal(asiento.ocurridoEn)}</td>
                  <td className="tabla__nombre">{asiento.autorNombre || '—'}</td>
                  <td className="tabla__menu">{asiento.accion}</td>
                  <td className="tabla__nombre">{asiento.objeto || '—'}</td>
                  <td className="tabla__menu">
                    {Object.entries(asiento.detalle)
                      .map(([clave, valor]) => `${clave}: ${String(valor)}`)
                      .join(' · ') || '—'}
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
