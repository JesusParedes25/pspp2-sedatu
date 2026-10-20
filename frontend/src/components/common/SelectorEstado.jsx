/**
 * ARCHIVO: SelectorEstado.jsx
 * PROPÓSITO: Selector reutilizable de estado para cualquier nivel jerárquico.
 *
 * MINI-CLASE: Selector con popover y confirmación
 * ─────────────────────────────────────────────────────────────────
 * Muestra el EstadoChip actual como botón. Al clicar, despliega un
 * popover con las opciones de estado disponibles. Si el usuario
 * elige 'Bloqueada', abre ModalBloqueo para capturar el motivo.
 * Si elige 'Cancelada', consulta conteo de descendientes y pide
 * confirmación antes de proceder. Delega la llamada al endpoint
 * PUT /estado (api/estado.js).
 *
 * Es el eje más usado de la plataforma y, hasta esta ronda, el peor
 * señalizado: un chip sin chevron, sin foco visible y rodeado de otros
 * chips que NO son controles. Con permiso para cambiarlo se ve y se
 * comporta como el control que es (chevron, hover/foco visibles,
 * `role="button"`/`aria-haspopup="listbox"`, Enter/Espacio lo abren por
 * un manejador explícito — ver el comentario junto al botón). SIN
 * permiso, es justo lo contrario: un <span> — nunca un <button> — sin
 * chevron, sin cursor, sin ningún atributo de control: el badge
 * estático que de verdad es.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import EstadoChip from './EstadoChip';
import ModalBloqueo from './ModalBloqueo';
import * as estadoApi from '../../api/estado';
import { useUI } from '../../context/UIContext';
import { formatearEstado } from '../../utils/estados';

const ESTADOS = ['Pendiente', 'En_proceso', 'Bloqueada', 'Completada', 'Cancelada'];

const ICONOS_ESTADO = {
  Pendiente:  '○',
  En_proceso: '◐',
  Bloqueada:  '⊘',
  Completada: '●',
  Cancelada:  '✕',
};

/**
 * @param {string}   entidadTipo    - 'Proyecto'|'Etapa'|'Accion'|'Subaccion'
 * @param {string}   entidadId      - UUID de la entidad
 * @param {string}   estadoActual   - Estado actual de la entidad
 * @param {boolean}  estadoOverride - Si el estatus quedó fijado a mano (en
 *                                    vez del calculado de sus partes).
 * @param {boolean}  esContenedor   - Si la entidad es un contenedor
 *                                    (Etapa siempre, Accion/Subaccion con
 *                                    hijos). El ✎/"Volver a automático"
 *                                    solo tiene sentido para contenedores:
 *                                    cambiarEstadoUtil fija estado_override
 *                                    también en hojas (para que el cambio
 *                                    "pegue" aunque el nodo no tenga nada
 *                                    que lo recalcule solo), pero en una
 *                                    hoja no hay "automático" al que volver
 *                                    — "Volver a automático" ahí siempre
 *                                    devuelve 400. Default true para no
 *                                    cambiar el comportamiento donde no se
 *                                    pasa (Proyecto, siempre contenedor).
 * @param {function} onCambio      - Callback tras cambio exitoso
 * @param {boolean}  soloLectura   - Deshabilita interacción
 * @param {string}   className     - Clases CSS adicionales
 */
const SelectorEstado = forwardRef(function SelectorEstado({
  entidadTipo,
  entidadId,
  estadoActual,
  estadoOverride = false,
  esContenedor = true,
  onCambio,
  soloLectura = false,
  className = ''
}, ref) {
  const { mostrarToast } = useUI();
  const [abierto, setAbierto] = useState(false);
  const [posicion, setPosicion] = useState({ top: 0, left: 0 });
  const [cargando, setCargando] = useState(false);
  const [modalBloqueo, setModalBloqueo] = useState(false);
  const [confirmCancelar, setConfirmCancelar] = useState(null);
  const refPopover = useRef(null);
  const refMenu = useRef(null);

  // El popover se renderiza con createPortal en document.body (mismo
  // patrón que AccionFicha) — no como hijo posicionado `absolute` dentro
  // del botón, para escapar del `overflow-y-auto` de cualquier contenedor
  // scrolleable donde viva este selector (p. ej. la tabla de Vista Lista):
  // un popover `absolute` que abre hacia arriba cerca del borde superior
  // de un contenedor con overflow queda recortado y sus opciones dejan de
  // ser clicables, aunque existan en el DOM. Posición fija calculada
  // contra el viewport, no contra el contenedor. ~260px es la altura
  // aproximada del popover completo (5 estados + separador + "Volver a
  // automático").
  function alAbrir() {
    if (refPopover.current) {
      const rect = refPopover.current.getBoundingClientRect();
      const arriba = window.innerHeight - rect.bottom < 260;
      setPosicion({
        top: arriba ? undefined : rect.bottom + 4,
        bottom: arriba ? (window.innerHeight - rect.top + 4) : undefined,
        left: Math.min(rect.left, window.innerWidth - 216),
      });
    }
    setAbierto(v => !v);
  }

  // Segundo camino para llegar a este mismo selector (2.3): "Cambiar
  // estado" en el menú "Más acciones" (FilaAcciones.jsx) no construye un
  // selector nuevo — abre este, por ref, vía EncabezadoDetalle. Sin
  // permiso no expone nada que abrir (mismo criterio que el <span>
  // estático de más arriba).
  useImperativeHandle(ref, () => ({
    abrir: () => { if (!soloLectura) alAbrir(); },
  }), [soloLectura]);

  // Cerrar popover al clicar fuera (el botón O el menú del portal), o con Escape.
  useEffect(() => {
    function handleClickFuera(e) {
      if (
        refPopover.current && !refPopover.current.contains(e.target) &&
        refMenu.current && !refMenu.current.contains(e.target)
      ) {
        setAbierto(false);
      }
    }
    function handleTecla(e) {
      if (e.key === 'Escape') setAbierto(false);
    }
    if (abierto) {
      document.addEventListener('mousedown', handleClickFuera);
      document.addEventListener('keydown', handleTecla);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickFuera);
      document.removeEventListener('keydown', handleTecla);
    };
  }, [abierto]);

  const ejecutarCambio = useCallback(async (nuevoEstado, opciones = {}) => {
    setCargando(true);
    try {
      await estadoApi.cambiarEstado(entidadTipo, entidadId, nuevoEstado, opciones);
      onCambio && onCambio();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || err.message || 'Error al cambiar estado', 'error');
    } finally {
      setCargando(false);
      setAbierto(false);
    }
  }, [entidadTipo, entidadId, onCambio]);

  const handleSeleccionar = useCallback(async (nuevoEstado) => {
    if (nuevoEstado === estadoActual) {
      setAbierto(false);
      return;
    }

    // Bloqueada → abrir modal para motivo
    if (nuevoEstado === 'Bloqueada') {
      setAbierto(false);
      setModalBloqueo(true);
      return;
    }

    // Cancelada → confirmar con conteo de descendientes
    if (nuevoEstado === 'Cancelada') {
      setAbierto(false);
      setCargando(true);
      try {
        const { datos } = await estadoApi.contarDescendientes(entidadTipo, entidadId);
        const total = (datos.etapas || 0) + (datos.acciones || 0) + (datos.subacciones || 0);
        if (total > 0) {
          setConfirmCancelar(datos);
          setCargando(false);
          return;
        }
      } catch {
        // Si falla el conteo, pedir confirmación simple
      }
      setCargando(false);

      if (!window.confirm(`¿Cancelar esta ${entidadTipo.toLowerCase()}?`)) return;
      await ejecutarCambio('Cancelada');
      return;
    }

    await ejecutarCambio(nuevoEstado);
  }, [estadoActual, entidadTipo, entidadId, ejecutarCambio]);

  const confirmarCancelacion = useCallback(async () => {
    setConfirmCancelar(null);
    await ejecutarCambio('Cancelada');
  }, [ejecutarCambio]);

  const restaurarAutomatico = useCallback(async () => {
    setAbierto(false);
    setCargando(true);
    try {
      await estadoApi.restaurarEstadoAutomatico(entidadTipo, entidadId);
      onCambio && onCambio();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || err.message || 'Error al volver al estatus automático', 'error');
    } finally {
      setCargando(false);
    }
  }, [entidadTipo, entidadId, onCambio]);

  // Sin permiso: badge estático de verdad — nunca un <button>, nunca
  // chevron ni cursor ni ningún atributo de control (2.1, explícito: "se
  // ve como el badge estático que es").
  if (soloLectura) {
    return (
      <span className={`inline-flex items-center ${className}`} title="Solo lectura">
        <EstadoChip estado={estadoActual} />
        {estadoOverride && esContenedor && (
          <span title="Estatus fijado a mano: normalmente se calcula de sus partes" className="ml-1 text-gray-400 text-xs align-top">✎</span>
        )}
      </span>
    );
  }

  return (
    <div className={`relative inline-block ${className}`} ref={refPopover}>
      {/* Botón: EstadoChip clicable — chevron + foco/hover visibles +
          semántica de control (role/aria-haspopup). Enter/Espacio abren
          el popover por un manejador EXPLÍCITO, no porque "ya pase solo"
          por ser un <button> nativo: el default del navegador dispara el
          click en el keyup de Espacio (o el keydown de Enter), así que
          sin preventDefault aquí un futuro cambio de este botón a otro
          elemento (o un navegador que no siga el default al pie de la
          letra) podría dejar de abrir con teclado sin que nada lo avise
          — y es lo que de verdad hace falta probar (jsdom no simula ese
          default action de "Enter en un botón" al disparar un keydown
          sintético, así que una prueba de teclado necesita este
          manejador para poder existir). */}
      <button
        type="button"
        role="button"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => !cargando && alAbrir()}
        onKeyDown={e => {
          if ((e.key === 'Enter' || e.key === ' ') && !cargando) {
            e.preventDefault();
            alAbrir();
          }
        }}
        disabled={cargando}
        className="group inline-flex items-center gap-0.5 rounded-full cursor-pointer transition-opacity hover:opacity-80 outline-none focus-visible:ring-2 focus-visible:ring-guinda-500 focus-visible:ring-offset-1"
        title="Cambiar estado"
      >
        <EstadoChip estado={estadoActual} />
        {estadoOverride && esContenedor && (
          <span title="Estatus fijado a mano: normalmente se calcula de sus partes" className="text-gray-400 text-xs align-top">✎</span>
        )}
        {cargando && <span className="text-xs text-gray-400 animate-pulse">…</span>}
        <ChevronDown size={13} className="text-gray-400 group-hover:text-gray-600 flex-shrink-0" />
      </button>

      {/* Popover de opciones — portal a document.body, posición fija
          calculada contra el viewport (ver comentario en alAbrir). Se
          abre hacia arriba si no cabe hacia abajo. */}
      {abierto && createPortal(
        <div
          ref={refMenu}
          role="listbox"
          aria-label="Cambiar estado"
          className="fixed z-[9999] w-52 bg-white border border-gray-200 rounded-lg shadow-lg py-1"
          style={{ top: posicion.top, bottom: posicion.bottom, left: posicion.left }}
        >
          {ESTADOS.map((est) => (
            <button
              key={est}
              type="button"
              role="option"
              aria-selected={est === estadoActual}
              onClick={() => handleSeleccionar(est)}
              disabled={est === estadoActual}
              className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors
                ${est === estadoActual
                  ? 'bg-gray-50 text-gray-400 cursor-default'
                  : 'hover:bg-gray-50 text-gray-700'}`}
            >
              <span className="text-base">{ICONOS_ESTADO[est]}</span>
              {formatearEstado(est)}
            </button>
          ))}
          {estadoOverride && esContenedor && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <button
                type="button"
                onClick={restaurarAutomatico}
                className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 text-gray-500 hover:bg-gray-50"
              >
                <span className="text-base">↺</span> Volver a automático
              </button>
            </>
          )}
        </div>,
        document.body
      )}

      {/* Modal de bloqueo */}
      {modalBloqueo && (
        <ModalBloqueo
          onConfirmar={(motivo) => {
            setModalBloqueo(false);
            ejecutarCambio('Bloqueada', { motivoBloqueo: motivo });
          }}
          onCancelar={() => setModalBloqueo(false)}
        />
      )}

      {/* Diálogo de confirmación de cancelación */}
      {confirmCancelar && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-red-700 mb-3">
              Confirmar cancelación
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Al cancelar esta {entidadTipo.toLowerCase()} se cancelarán en cascada:
            </p>
            <ul className="text-sm mb-4 space-y-1">
              {confirmCancelar.etapas > 0 && (
                <li className="text-gray-700">• <strong>{confirmCancelar.etapas}</strong> etapa(s)</li>
              )}
              {confirmCancelar.acciones > 0 && (
                <li className="text-gray-700">• <strong>{confirmCancelar.acciones}</strong> acción(es)</li>
              )}
              {confirmCancelar.subacciones > 0 && (
                <li className="text-gray-700">• <strong>{confirmCancelar.subacciones}</strong> subacción(es)</li>
              )}
            </ul>
            <p className="text-xs text-red-500 mb-4">Esta acción no se puede deshacer fácilmente.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmCancelar(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                No, volver
              </button>
              <button
                onClick={confirmarCancelacion}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Sí, cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default SelectorEstado;
