/**
 * ARCHIVO: DocumentosProyecto.jsx
 * PROPÓSITO: Ruta /proyectos/:id/documentos — antes pestaña
 *            "Evidencias" de DetalleProyecto.jsx. Mismo contenido:
 *            filtros + maestro-detalle de documentos del proyecto.
 */
import { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Search, FileText } from 'lucide-react';
import EvidenciaListItem from '../../components/evidencias/EvidenciaListItem';
import EvidenciaDetallePanel from '../../components/evidencias/EvidenciaDetallePanel';
import FilePreviewModal from '../../components/evidencias/FilePreviewModal';
import EmptyState from '../../components/common/EmptyState';
import * as evidenciasApi from '../../api/evidencias';

export default function DocumentosProyecto() {
  const { proyectoId: id, permisos, statsKey } = useOutletContext();

  const [evidencias, setEvidencias] = useState([]);
  const [filtroEvidencias, setFiltroEvidencias] = useState({ busqueda: '', categoria: '', etapa: '' });

  useEffect(() => {
    if (!id) return;
    async function cargar() {
      try {
        const res = await evidenciasApi.obtenerEvidenciasProyecto(id);
        setEvidencias(res.datos || []);
      } catch (err) {
        console.error('Error cargando evidencias:', err);
      }
    }
    cargar();
  }, [id, statsKey]);

  const evidenciasFiltradas = useMemo(() => {
    let resultado = evidencias;
    if (filtroEvidencias.busqueda) {
      const q = filtroEvidencias.busqueda.toLowerCase();
      resultado = resultado.filter(e =>
        e.titulo?.toLowerCase().includes(q) ||
        e.nombre_original?.toLowerCase().includes(q) ||
        e.notas?.toLowerCase().includes(q) ||
        e.autor_nombre?.toLowerCase().includes(q)
      );
    }
    if (filtroEvidencias.categoria) {
      resultado = resultado.filter(e => e.categoria === filtroEvidencias.categoria);
    }
    if (filtroEvidencias.etapa) {
      resultado = resultado.filter(e => e.etapa_nombre === filtroEvidencias.etapa);
    }
    return resultado;
  }, [evidencias, filtroEvidencias]);

  const categoriasUnicas = useMemo(() => [...new Set(evidencias.map(e => e.categoria).filter(Boolean))], [evidencias]);
  const etapasUnicas = useMemo(() => [...new Set(evidencias.map(e => e.etapa_nombre).filter(Boolean))], [evidencias]);

  const [evidenciaSeleccionada, setEvidenciaSeleccionada] = useState(null);
  const [evidenciaPreview, setEvidenciaPreview] = useState(null);

  useEffect(() => {
    if (evidenciaSeleccionada && !evidencias.some(e => e.id === evidenciaSeleccionada.id)) setEvidenciaSeleccionada(null);
  }, [evidencias]); // eslint-disable-line react-hooks/exhaustive-deps

  async function eliminarEvidenciaProyecto(ev) {
    if (!confirm(`¿Eliminar "${ev.nombre_original || ev.titulo || ev.url}"? Esta acción no se puede deshacer.`)) return;
    try {
      await evidenciasApi.eliminarEvidencia(ev.id);
      setEvidencias(prev => prev.filter(e => e.id !== ev.id));
    } catch (err) {
      console.error('Error eliminando evidencia:', err);
    }
  }

  return (
    <div className="space-y-4">
      {evidencias.length > 0 && (
        <div className="card p-3 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, notas o autor..."
              value={filtroEvidencias.busqueda}
              onChange={e => setFiltroEvidencias(prev => ({ ...prev, busqueda: e.target.value }))}
              className="input-base pl-9 text-sm h-9"
            />
          </div>
          {categoriasUnicas.length > 1 && (
            <select
              value={filtroEvidencias.categoria}
              onChange={e => setFiltroEvidencias(prev => ({ ...prev, categoria: e.target.value }))}
              className="input-base text-sm h-9 w-auto"
            >
              <option value="">Todas las categorías</option>
              {categoriasUnicas.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {etapasUnicas.length > 1 && (
            <select
              value={filtroEvidencias.etapa}
              onChange={e => setFiltroEvidencias(prev => ({ ...prev, etapa: e.target.value }))}
              className="input-base text-sm h-9 w-auto"
            >
              <option value="">Todas las etapas</option>
              {etapasUnicas.map(et => <option key={et} value={et}>{et}</option>)}
            </select>
          )}
          {(filtroEvidencias.busqueda || filtroEvidencias.categoria || filtroEvidencias.etapa) && (
            <button
              onClick={() => setFiltroEvidencias({ busqueda: '', categoria: '', etapa: '' })}
              className="text-xs text-guinda-500 hover:text-guinda-700 font-medium"
            >
              Limpiar
            </button>
          )}
          <span className="text-xs text-gray-400 ml-auto">{evidenciasFiltradas.length} de {evidencias.length}</span>
        </div>
      )}

      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0 space-y-1.5">
          {evidencias.length === 0 ? (
            <EmptyState icono={FileText} titulo="Sin documentos" subtitulo="Los documentos se suben desde las etapas y acciones de este proyecto." />
          ) : evidenciasFiltradas.length === 0 ? (
            <EmptyState icono={Search} titulo="Sin resultados" subtitulo="Ningún documento coincide con los filtros aplicados." />
          ) : (
            evidenciasFiltradas.map(ev => (
              <EvidenciaListItem
                key={ev.id}
                evidencia={ev}
                activa={evidenciaSeleccionada?.id === ev.id}
                onClick={() => setEvidenciaSeleccionada(ev)}
              />
            ))
          )}
        </div>

        {evidencias.length > 0 && (
          <div className="hidden lg:block w-96 flex-shrink-0 border-l border-gray-100 pl-4 sticky top-4 self-start">
            {evidenciaSeleccionada
              ? (
                <EvidenciaDetallePanel
                  evidencia={evidenciaSeleccionada}
                  onPreview={() => setEvidenciaPreview(evidenciaSeleccionada)}
                  onEliminar={!permisos?.esSoloLectura ? () => eliminarEvidenciaProyecto(evidenciaSeleccionada) : undefined}
                />
              )
              : (
                <div className="flex flex-col items-center justify-center text-center px-6 py-12 text-gray-400">
                  <FileText size={32} className="mb-3 text-gray-200" />
                  <p className="text-sm font-medium text-gray-600">Selecciona un documento</p>
                  <p className="text-xs mt-1">Haz clic en un archivo de la lista para ver su detalle completo.</p>
                </div>
              )}
          </div>
        )}
      </div>

      {evidenciaPreview && <FilePreviewModal evidencia={evidenciaPreview} onClose={() => setEvidenciaPreview(null)} />}
    </div>
  );
}
