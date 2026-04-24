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
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import EstadoChip from './EstadoChip';
import ModalBloqueo from './ModalBloqueo';
import * as estadoApi from '../../api/estado';

const ESTADOS = ['Pendiente', 'En_proceso', 'Bloqueada', 'Completada', 'Cancelada'];

const ICONOS_ESTADO = {
  Pendiente:  '○',
  En_proceso: '◐',
  Bloqueada:  '⊘',
  Completada: '●',
  Cancelada:  '✕',
};

/**
 * @param {string}   entidadTipo   - 'Proyecto'|'Etapa'|'Accion'|'Subaccion'
 * @param {string}   entidadId     - UUID de la entidad
 * @param {string}   estadoActual  - Estado actual de la entidad
 * @param {function} onCambio      - Callback tras cambio exitoso
 * @param {boolean}  soloLectura   - Deshabilita interacción
 * @param {string}   className     - Clases CSS adicionales
 */
export default function SelectorEstado({
  entidadTipo,
  entidadId,
  estadoActual,
  onCambio,
  soloLectura = false,
  className = ''
}) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [modalBloqueo, setModalBloqueo] = useState(false);
  const [confirmCancelar, setConfirmCancelar] = useState(null);
  const refPopover = useRef(null);

  // Cerrar popover al clicar fuera
  useEffect(() => {
    function handleClickFuera(e) {
      if (refPopover.current && !refPopover.current.contains(e.target)) {
        setAbierto(false);
      }
    }
    if (abierto) document.addEventListener('mousedown', handleClickFuera);
    return () => document.removeEventListener('mousedown', handleClickFuera);
  }, [abierto]);

  const ejecutarCambio = useCallback(async (nuevoEstado, opciones = {}) => {
    setCargando(true);
    try {
      await estadoApi.cambiarEstado(entidadTipo, entidadId, nuevoEstado, opciones);
      onCambio && onCambio();
    } catch (err) {
      alert(err.response?.data?.mensaje || err.message || 'Error al cambiar estado');
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

  return (
    <div className={`relative inline-block ${className}`} ref={refPopover}>
      {/* Botón: EstadoChip clicable */}
      <button
        type="button"
        onClick={() => !soloLectura && !cargando && setAbierto(!abierto)}
        disabled={soloLectura || cargando}
        className={`cursor-pointer transition-opacity ${soloLectura ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-80'}`}
        title={soloLectura ? 'Solo lectura' : 'Cambiar estado'}
      >
        <EstadoChip estado={estadoActual} />
        {cargando && <span className="ml-1 text-xs text-gray-400 animate-pulse">…</span>}
      </button>

      {/* Popover de opciones */}
      {abierto && (
        <div className="absolute z-50 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 left-0">
          {ESTADOS.map((est) => (
            <button
              key={est}
              type="button"
              onClick={() => handleSeleccionar(est)}
              disabled={est === estadoActual}
              className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors
                ${est === estadoActual
                  ? 'bg-gray-50 text-gray-400 cursor-default'
                  : 'hover:bg-gray-50 text-gray-700'}`}
            >
              <span className="text-base">{ICONOS_ESTADO[est]}</span>
              {est.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
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
}
