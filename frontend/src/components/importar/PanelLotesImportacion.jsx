/**
 * ARCHIVO: PanelLotesImportacion.jsx
 * PROPÓSITO: Botón + dropdown de "Importaciones recientes" de un proyecto
 *            — lista los lotes ya importados (archivo, quién, cuándo,
 *            conteos) y permite deshacer uno completo.
 *
 * Complementa el botón "Deshacer esta importación" que ya aparece justo
 * tras confirmar (PasoPreview.jsx/PasoMultiHoja.jsx) — este panel cubre
 * el caso en que el usuario cierra el wizard y solo después se da cuenta
 * del error. Mismo endpoint, mismo ConfirmDialog.
 */
import { useState, useRef, useEffect } from 'react';
import { History, ChevronDown, Undo2, Loader2 } from 'lucide-react';
import * as importarApi from '../../api/importar';
import ConfirmDialog from '../common/ConfirmDialog';

function formatoFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function PanelLotesImportacion({ proyectoId, onDeshecho }) {
  const [abierto, setAbierto] = useState(false);
  const [lotes, setLotes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [loteAEliminar, setLoteAEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function fuera(e) { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); }
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  async function cargar() {
    setCargando(true);
    try {
      const res = await importarApi.listarLotes(proyectoId);
      setLotes(res.datos || []);
    } catch (_) {
      setLotes([]);
    } finally {
      setCargando(false);
    }
  }

  function alAbrir() {
    const v = !abierto;
    setAbierto(v);
    if (v) cargar();
  }

  async function confirmarEliminar() {
    if (!loteAEliminar) return;
    setEliminando(true);
    try {
      await importarApi.eliminarLote(loteAEliminar.id, proyectoId);
      setLoteAEliminar(null);
      await cargar();
      onDeshecho?.();
    } catch (_) {
      // El error se queda silencioso en el panel — no bloquea el resto del flujo.
    } finally {
      setEliminando(false);
    }
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={alAbrir}
        className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors"
      >
        <History size={12} className="text-gray-400" />
        Importaciones recientes
        <ChevronDown size={12} className={`text-gray-400 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div className="absolute z-20 top-full right-0 mt-1 w-96 bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="max-h-80 overflow-y-auto">
            {cargando ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={16} className="animate-spin text-gray-400" />
              </div>
            ) : lotes.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6 px-3">
                Sin importaciones registradas en este proyecto.
              </p>
            ) : (
              lotes.map(lote => (
                <div key={lote.id} className="px-3 py-2.5 border-b border-gray-100 last:border-0">
                  <p className="text-xs font-medium text-gray-700 truncate" title={lote.archivo_origen}>
                    {lote.archivo_origen || 'Archivo sin nombre'}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {lote.importado_por_nombre || 'Usuario desconocido'} · {formatoFecha(lote.importado_en)}
                  </p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[11px] text-gray-500">
                      {lote.etapas} componente(s) · {lote.acciones} acción(es) · {lote.tareas} tarea(s)
                    </span>
                    <button
                      onClick={() => setLoteAEliminar(lote)}
                      className="flex items-center gap-1 text-[11px] text-red-600 hover:bg-red-50 rounded px-1.5 py-0.5"
                    >
                      <Undo2 size={11} /> Deshacer
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        abierto={!!loteAEliminar}
        titulo="¿Deshacer esta importación?"
        mensaje={loteAEliminar
          ? `Se eliminarán ${loteAEliminar.etapas} componente(s), ${loteAEliminar.acciones} acción(es) y ${loteAEliminar.tareas} tarea(s) de "${loteAEliminar.archivo_origen || 'este archivo'}", incluyendo cualquier evidencia/comentario/tarea que se haya agregado manualmente después dentro de ellas. Esta acción no se puede deshacer.`
          : ''}
        textoConfirmar={eliminando ? 'Eliminando…' : 'Sí, deshacer'}
        onConfirmar={confirmarEliminar}
        onCancelar={() => setLoteAEliminar(null)}
        variante="danger"
      />
    </div>
  );
}
