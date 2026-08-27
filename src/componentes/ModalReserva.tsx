/**
 * Modal de reserva. Sirve para crear y para editar.
 *
 * Se usa el `<dialog>` nativo a propósito: trae gratis el foco atrapado, el
 * cierre con Escape, el fondo y el `aria-modal`, que a mano son cien líneas
 * fáciles de hacer mal. React no cambia eso — que el marcado lo describa un
 * componente no hace que un `<div>` con `role="dialog"` sea mejor idea.
 *
 * Un solo modal para los dos modos y no dos: los campos son los mismos y
 * duplicarlos garantizaría que un día se corrija la validación en uno y no en
 * el otro. Lo que cambia entre modos son los rótulos, los valores de partida,
 * el historial y a qué callback se llama al guardar.
 *
 * El componente no sabe nada de servicios: recibe los datos ya cargados y
 * avisa con callbacks. Quien orquesta es la página.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { OpcionMenu } from '../servicios/menuServicio.js';
import type { AsientoHistorial, CambioReserva, Reserva } from '../servicios/reservasServicio.js';
import { ErrorServicio } from '../servicios/api.js';
import { formatearTelefono, normalizarTelefono } from '../utiles/telefono.js';
import { formatearMarcaTemporal } from '../utiles/fechas.js';

/** Nombre visible de cada campo en el historial. */
const ETIQUETA_CAMPO: Record<string, string> = {
  nombre: 'Nombre',
  telefono: 'Móvil',
  menu: 'Menú',
  medio: 'Medio',
  pago: 'Pago',
};

/** Encabezado de cada asiento del historial, según su tipo. */
const ETIQUETA_ASIENTO: Record<string, string> = {
  creacion: 'Reserva registrada',
  modificacion: 'Reserva modificada',
  cancelacion: 'Reserva cancelada',
};

export interface DatosReserva {
  nombre: string;
  telefono: string;
  menuId: string;
  medio: string;
  pago: string;
}

interface Props {
  abierto: boolean;
  menu: OpcionMenu[];
  /** `null` abre en modo creación. */
  reserva: Reserva | null;
  alCerrar: () => void;
  /** Si lanzan, el modal se queda abierto y muestra el mensaje. */
  alGuardar: (datos: DatosReserva, reserva: Reserva | null) => Promise<void>;
  /**
   * OPCIONAL. Sin él, el botón «Cancelar reserva» no aparece: es como la
   * pantalla de mostrador impide anular reservas reutilizando este mismo
   * formulario. La regla no depende de que la pantalla se acuerde.
   *
   * Devuelve `true` si la reserva se canceló de verdad y `false` si quien lo
   * pidió se echó atrás: el modal solo se cierra en el primer caso.
   */
  alCancelar?: ((reserva: Reserva) => Promise<boolean>) | undefined;
}

type Errores = Partial<Record<'nombre' | 'telefono' | 'menu' | 'medio' | 'pago', string>>;

export function ModalReserva({
  abierto, menu, reserva, alCerrar, alGuardar, alCancelar,
}: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const refNombre = useRef<HTMLInputElement>(null);
  const refTelefono = useRef<HTMLInputElement>(null);

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [menuId, setMenuId] = useState('');
  const [medio, setMedio] = useState('');
  const [pago, setPago] = useState('');

  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState('');
  /** Qué botón está trabajando: importa porque el girador va en el que se
   *  pulsó. Si al cancelar apareciera en «Guardar cambios», estaría apuntando
   *  a la acción equivocada. */
  const [enviando, setEnviando] = useState<'' | 'guardar' | 'cancelar'>('');

  const editando = reserva !== null;

  // Los valores de partida se fijan al ABRIR y no en cada render: si
  // dependieran del render, escribir en un campo lo devolvería a su valor
  // original en cuanto algo de arriba se repintara.
  useEffect(() => {
    if (!abierto) return;
    setNombre(reserva ? reserva.nombre : '');
    setTelefono(reserva ? formatearTelefono(reserva.telefono) : '');
    // Si el plato de una reserva vieja ya no está en la carta de hoy, el
    // valor no existe entre las opciones y el desplegable se queda en el
    // marcador: hay que elegir de nuevo, que es exactamente lo correcto.
    setMenuId(reserva ? reserva.menuId : '');
    // Una reserva vieja puede no traer estos campos: entonces se queda sin
    // marcar y hay que elegir.
    setMedio(reserva?.medio ?? '');
    setPago(reserva?.pago ?? '');
    setErrores({});
    setErrorGeneral('');
    setEnviando('');
  }, [abierto, reserva]);

  // `showModal()` no se puede llamar desde el marcado: es imperativo por
  // diseño, y es lo que activa el fondo y la trampa de foco.
  useEffect(() => {
    const nodo = dialogo.current;
    if (!nodo) return;
    if (abierto && !nodo.open) {
      nodo.showModal();
      refNombre.current?.focus();
    } else if (!abierto && nodo.open) {
      nodo.close();
    }
  }, [abierto]);

  function validar(datos: DatosReserva & { telefonoValido: string | null }): Errores {
    const fallos: Errores = {};
    if (datos.nombre.length < 3) {
      fallos.nombre = 'Escribe el nombre completo de la persona.';
    }
    if (datos.telefonoValido === null) {
      fallos.telefono = 'Escribe un móvil de diez dígitos, por ejemplo 300 123 4567.';
    }
    if (!datos.menuId) fallos.menu = 'Elige una opción del menú.';
    if (!datos.medio) fallos.medio = 'Indica si la reserva se hizo presencial o por teléfono.';
    if (!datos.pago) fallos.pago = 'Indica si ya pagó o queda debiendo.';
    return fallos;
  }

  async function alEnviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;

    setErrores({});
    setErrorGeneral('');

    const telefonoValido = normalizarTelefono(telefono);
    const datos: DatosReserva = {
      nombre: nombre.trim(),
      telefono: telefonoValido ?? '',
      menuId, medio, pago,
    };

    const fallos = validar({ ...datos, telefonoValido });
    if (Object.keys(fallos).length > 0) {
      setErrores(fallos);
      // El foco al primer campo con problema: quien navega con teclado no
      // debería tener que buscar dónde está el error.
      if (fallos.nombre) refNombre.current?.focus();
      else if (fallos.telefono) refTelefono.current?.focus();
      return;
    }

    setEnviando('guardar');
    try {
      await alGuardar(datos, reserva);
      setEnviando('');
      alCerrar();
    } catch (error) {
      setEnviando('');
      setErrorGeneral((error as Error).message);
      // El duplicado se resuelve cambiando el móvil, así que se apunta ahí.
      if (error instanceof ErrorServicio && error.codigo === 'RESERVA_DUPLICADA') {
        refTelefono.current?.focus();
      }
    }
  }

  /**
   * Cancelar desde dentro del modal.
   *
   * Quien decide si de verdad se cancela es `alCancelar`, que pide su propia
   * confirmación: por eso puede devolver `false` sin que eso sea un error. El
   * modal solo se cierra cuando la cancelación ocurrió, para que decir «no»
   * devuelva a la edición en la que se estaba.
   */
  async function alPulsarCancelar() {
    if (enviando || !reserva || !alCancelar) return;
    setErrores({});
    setErrorGeneral('');
    setEnviando('cancelar');
    try {
      const cancelada = await alCancelar(reserva);
      setEnviando('');
      if (cancelada) alCerrar();
    } catch (error) {
      setEnviando('');
      setErrorGeneral((error as Error).message);
    }
  }

  const bloqueado = enviando !== '';

  return (
    <dialog
      className="modal"
      ref={dialogo}
      /* Escape y el botón de cierre pasan los dos por aquí. Se ignora
         mientras hay una petición en vuelo: cerrar a media escritura dejaría
         a quien atiende sin saber si la reserva entró. */
      onCancel={(e) => { if (bloqueado) e.preventDefault(); else alCerrar(); }}
      onClose={() => { if (!bloqueado) alCerrar(); }}
      /* El <dialog> es su propio fondo, así que un clic cuyo objetivo sea el
         diálogo mismo —y no un hijo— cayó fuera del panel. */
      onClick={(e) => { if (e.target === dialogo.current && !bloqueado) alCerrar(); }}
      aria-labelledby="titulo-modal"
    >
      <form className="modal__panel" onSubmit={alEnviar}>
        <header className="modal__cabecera">
          <h2 className="modal__titulo" id="titulo-modal">
            {editando ? 'Editar reserva' : 'Registrar reserva'}
          </h2>
          <button
            type="button"
            className="modal__cerrar"
            onClick={alCerrar}
            disabled={bloqueado}
            aria-label="Cerrar"
          >
            ×
          </button>
        </header>

        <p className="modal__nota">
          {editando
            ? 'Se puede cambiar el nombre, el móvil y el plato. Cada cambio queda en el historial.'
            : 'Solo se registran reservas para el día de hoy.'}
        </p>

        {/*
          El identificador entero —cafetería, fecha y consecutivo— y no solo el
          número corto de la tabla: aquí es donde se comprueba que se está
          editando la reserva correcta, y para eso hacen falta las tres partes.
        */}
        {editando && reserva.id && (
          <p className="modal__identificador">Reserva n.º {reserva.id}</p>
        )}

        <label className="campo">
          <span className="campo__etiqueta">Nombre completo</span>
          <input
            ref={refNombre}
            className="campo__control"
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            disabled={bloqueado}
            aria-invalid={errores.nombre ? true : undefined}
            autoComplete="off"
          />
          {errores.nombre && <span className="campo__error">{errores.nombre}</span>}
        </label>

        <label className="campo">
          <span className="campo__etiqueta">Móvil</span>
          <input
            ref={refTelefono}
            className="campo__control"
            type="tel"
            inputMode="numeric"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            disabled={bloqueado}
            aria-invalid={errores.telefono ? true : undefined}
            autoComplete="off"
          />
          {errores.telefono && <span className="campo__error">{errores.telefono}</span>}
        </label>

        <label className="campo">
          <span className="campo__etiqueta">Menú del día</span>
          <select
            className="campo__control"
            value={menuId}
            onChange={(e) => setMenuId(e.target.value)}
            disabled={bloqueado}
            aria-invalid={errores.menu ? true : undefined}
          >
            <option value="">Selecciona un plato</option>
            {/* Una sola lista, sin encabezados. Los platos fijos van al final
                porque el servidor los devuelve así, no porque la vista los
                reordene. */}
            {menu.map((opcion) => (
              <option key={opcion.id} value={opcion.id}>{opcion.nombre}</option>
            ))}
          </select>
          {errores.menu && <span className="campo__error">{errores.menu}</span>}
        </label>

        <GrupoOpciones
          leyenda="Medio de la reserva"
          nombre="medio"
          valor={medio}
          alCambiar={setMedio}
          deshabilitado={bloqueado}
          error={errores.medio}
          opciones={[
            { valor: 'presencial', etiqueta: 'Presencial' },
            { valor: 'telefono', etiqueta: 'Teléfono' },
          ]}
        />

        <GrupoOpciones
          leyenda="Estado del pago"
          nombre="pago"
          valor={pago}
          alCambiar={setPago}
          deshabilitado={bloqueado}
          error={errores.pago}
          opciones={[
            { valor: 'pagado', etiqueta: 'Pagado' },
            { valor: 'debe', etiqueta: 'Debe' },
          ]}
        />

        {errorGeneral && (
          <p className="modal__error" role="alert">{errorGeneral}</p>
        )}

        {editando && <Historial asientos={reserva.historial} />}

        <footer className="modal__pie">
          {/* Cancelar la reserva solo tiene sentido sobre una que ya existe, y
              solo donde esté permitido. */}
          {editando && alCancelar && (
            <button
              type="button"
              className="boton boton--peligro"
              onClick={alPulsarCancelar}
              disabled={bloqueado}
              aria-busy={enviando === 'cancelar' || undefined}
            >
              {enviando === 'cancelar' && <span className="boton__girador" aria-hidden="true" />}
              {enviando === 'cancelar' ? 'Cancelando…' : 'Cancelar reserva'}
            </button>
          )}

          <button
            type="submit"
            className="boton boton--primario"
            disabled={bloqueado}
            aria-busy={enviando === 'guardar' || undefined}
          >
            {enviando === 'guardar' && <span className="boton__girador" aria-hidden="true" />}
            {enviando === 'guardar'
              ? 'Guardando…'
              : editando ? 'Guardar cambios' : 'Registrar reserva'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

/**
 * Un grupo de botones de radio con su leyenda.
 *
 * Ninguno viene preseleccionado, y en `pago` eso es lo importante: un valor
 * por defecto acabaría marcando como pagado lo que no lo está.
 */
function GrupoOpciones({ leyenda, nombre, valor, alCambiar, opciones, deshabilitado, error }: {
  leyenda: string;
  nombre: string;
  valor: string;
  alCambiar: (v: string) => void;
  opciones: { valor: string; etiqueta: string }[];
  deshabilitado: boolean;
  error?: string | undefined;
}) {
  return (
    <fieldset className="campo campo--opciones">
      <legend className="campo__etiqueta">{leyenda}</legend>
      <div className="campo__radios">
        {opciones.map((opcion) => (
          <label className="radio" key={opcion.valor}>
            <input
              type="radio"
              name={nombre}
              value={opcion.valor}
              checked={valor === opcion.valor}
              onChange={() => alCambiar(opcion.valor)}
              disabled={deshabilitado}
              aria-invalid={error ? true : undefined}
            />
            <span>{opcion.etiqueta}</span>
          </label>
        ))}
      </div>
      {error && <span className="campo__error">{error}</span>}
    </fieldset>
  );
}

/** Un cambio suelto: 'Menú: Bandeja paisa → Pasta al pesto'. */
function LineaCambio({ cambio }: { cambio: CambioReserva }) {
  const valor = (v: string) => (cambio.campo === 'telefono' ? formatearTelefono(v) : v);
  return (
    <li className="historial__cambio">
      {`${ETIQUETA_CAMPO[cambio.campo] ?? cambio.campo}: ${valor(cambio.antes)} → ${valor(cambio.despues)}`}
    </li>
  );
}

/**
 * El historial, del asiento más reciente al más antiguo: lo que interesa al
 * abrir es el último cambio, no el alta.
 */
function Historial({ asientos }: { asientos: AsientoHistorial[] }) {
  if (asientos.length === 0) return null;
  const recientesPrimero = [...asientos].reverse();

  return (
    <section className="historial">
      <h3 className="historial__titulo">Historial</h3>
      <ul className="historial__lista">
        {recientesPrimero.map((asiento, i) => (
          <li className="historial__asiento" key={`${asiento.timestamp}-${i}`}>
            <p className="historial__marca">
              {`${ETIQUETA_ASIENTO[asiento.tipo] ?? 'Cambio'} · ${formatearMarcaTemporal(asiento.timestamp)}`}
            </p>
            {asiento.cambios.length > 0 && (
              <ul className="historial__cambios">
                {asiento.cambios.map((cambio, j) => (
                  <LineaCambio cambio={cambio} key={`${cambio.campo}-${j}`} />
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
