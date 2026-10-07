/**
 * ARCHIVO: MenuDatosReportes.jsx
 * PROPÓSITO: Un solo menú "Datos y reportes" para la barra de Seguimiento
 *            en vez de 4 botones sueltos (Importar, Importaciones
 *            recientes, Exportar, Reporte PDF) — esos 4 elementos, cada
 *            uno flex-shrink-0, competían por el mismo espacio que el
 *            control segmentado de vistas (Detalle|Diagrama|Lista|
 *            Cronograma|Mapa) y lo desbordaban entre 1019px y 1300px de
 *            ancho ("Cronograma" quedaba tapado por "Importar").
 *
 * Mismas funciones/endpoints que los 3 componentes que reemplaza
 * (BotonExportar.jsx, GenerarReporteBtn.jsx, PanelLotesImportacion.jsx —
 * retirados por quedar sin otro importador tras este cambio): ninguna
 * lógica de negocio nueva, solo un único punto de entrada visual.
 */
import { useState } from 'react';
import { Database, ChevronDown, ChevronRight, FileSpreadsheet, FileText, History, Loader2, Undo2 } from 'lucide-react';
import MenuDesplegable from '../common/MenuDesplegable';
import ConfirmDialog from '../common/ConfirmDialog';
import * as importarApi from '../../api/importar';
import { exportarProyecto } from '../../api/proyectos';
import { generarReportePDF } from '../../utils/generarReportePDF';
import { useUI } from '../../context/UIContext';

function formatoFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

function ItemMenu({ icono: Icono, iconoClase = 'text-gray-400', children, onClick, disabled, cargando }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {cargando ? <Loader2 size={14} className="animate-spin flex-shrink-0" /> : <Icono size={14} className={`flex-shrink-0 ${iconoClase}`} />}
      {children}
    </button>
  );
}

export default function MenuDatosReportes({ proyectoId, proyecto, onAbrirImportar, onLoteDeshecho }) {
  const { mostrarToast } = useUI();
  const [exportando, setExportando] = useState(false);
  const [generandoReporte, setGenerandoReporte] = useState(false);

  const [mostrarLotes, setMostrarLotes] = useState(false);
  const [lotes, setLotes] = useState([]);
  const [cargandoLotes, setCargandoLotes] = useState(false);
  const [loteAEliminar, setLoteAEliminar] = useState(null);
  const [eliminandoLote, setEliminandoLote] = useState(false);

  async function cargarLotes() {
    setCargandoLotes(true);
    try {
      const res = await importarApi.listarLotes(proyectoId);
      setLotes(res.datos || []);
    } catch {
      setLotes([]);
    } finally {
      setCargandoLotes(false);
    }
  }

  function alternarLotes() {
    const siguiente = !mostrarLotes;
    setMostrarLotes(siguiente);
    if (siguiente) cargarLotes();
  }

  async function confirmarEliminarLote() {
    if (!loteAEliminar) return;
    setEliminandoLote(true);
    try {
      await importarApi.eliminarLote(loteAEliminar.id, proyectoId);
      setLoteAEliminar(null);
      await cargarLotes();
      onLoteDeshecho?.();
    } catch {
      // Mismo criterio que el panel original: el error se queda callado
      // aquí, no bloquea el resto del menú.
    } finally {
      setEliminandoLote(false);
    }
  }

  async function exportar(formato) {
    setExportando(true);
    try {
      await exportarProyecto(proyectoId, formato);
    } catch (err) {
      console.error('Error exportando proyecto:', err);
      mostrarToast('No se pudo generar el archivo de exportación', 'error');
    } finally {
      setExportando(false);
    }
  }

  async function reportePDF() {
    if (!proyecto) return;
    setGenerandoReporte(true);
    try {
      await generarReportePDF(proyectoId, proyecto);
      mostrarToast('Reporte generado y descargado', 'exito');
    } catch (err) {
      console.error('Error generando reporte PDF:', err);
      mostrarToast('Error al generar el reporte PDF', 'error');
    } finally {
      setGenerandoReporte(false);
    }
  }

  return (
    <>
      <MenuDesplegable
        align="right"
        ancho="w-80"
        trigger={({ toggle, abierto }) => (
          <button onClick={() => { toggle(); setMostrarLotes(false); }} className="btn-secondary text-sm flex items-center gap-1.5">
            <Database size={14} /> Datos y reportes
            <ChevronDown size={12} className={`text-gray-400 transition-transform ${abierto ? 'rotate-180' : ''}`} />
          </button>
        )}
      >
        {({ cerrar }) => (
          <div className="py-1">
            <ItemMenu icono={FileSpreadsheet} iconoClase="text-green-600" onClick={() => { cerrar(); onAbrirImportar(); }}>
              Importar desde Excel
            </ItemMenu>

            <button
              onClick={alternarLotes}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left"
            >
              <span className="flex items-center gap-2"><History size={14} className="text-gray-400 flex-shrink-0" /> Importaciones recientes</span>
              <ChevronRight size={12} className={`text-gray-400 transition-transform flex-shrink-0 ${mostrarLotes ? 'rotate-90' : ''}`} />
            </button>
            {mostrarLotes && (
              <div className="border-t border-b border-gray-100 max-h-64 overflow-y-auto bg-gray-50/50">
                {cargandoLotes ? (
                  <div className="flex items-center justify-center py-5">
                    <Loader2 size={15} className="animate-spin text-gray-400" />
                  </div>
                ) : lotes.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-5 px-3">Sin importaciones registradas en este proyecto.</p>
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
            )}

            <div className="my-1 border-t border-gray-100" />

            <ItemMenu icono={FileSpreadsheet} iconoClase="text-green-600" cargando={exportando} disabled={exportando} onClick={() => { exportar('xlsx'); cerrar(); }}>
              Exportar a Excel (.xlsx)
            </ItemMenu>
            <ItemMenu icono={FileText} iconoClase="text-gray-500" disabled={exportando} onClick={() => { exportar('csv'); cerrar(); }}>
              Exportar a CSV
            </ItemMenu>

            <div className="my-1 border-t border-gray-100" />

            <ItemMenu icono={FileText} iconoClase="text-guinda-600" cargando={generandoReporte} disabled={generandoReporte} onClick={() => { reportePDF(); cerrar(); }}>
              Reporte PDF
            </ItemMenu>
          </div>
        )}
      </MenuDesplegable>

      <ConfirmDialog
        abierto={!!loteAEliminar}
        titulo="¿Deshacer esta importación?"
        mensaje={loteAEliminar
          ? `Se eliminarán ${loteAEliminar.etapas} componente(s), ${loteAEliminar.acciones} acción(es) y ${loteAEliminar.tareas} tarea(s) de "${loteAEliminar.archivo_origen || 'este archivo'}", incluyendo cualquier evidencia/comentario/tarea que se haya agregado manualmente después dentro de ellas. Esta acción no se puede deshacer.`
          : ''}
        textoConfirmar={eliminandoLote ? 'Eliminando…' : 'Sí, deshacer'}
        onConfirmar={confirmarEliminarLote}
        onCancelar={() => setLoteAEliminar(null)}
        variante="danger"
      />
    </>
  );
}
