/**
 * ARCHIVO: EvidenciaListItem.jsx
 * PROPÓSITO: Fila compacta de una evidencia en una lista — extraída del
 *            módulo global de Documentos (pages/Evidencias.jsx) para
 *            reutilizarla también en la pestaña "Documentos" de un
 *            proyecto (DetalleProyecto.jsx), que antes usaba una versión
 *            más pobre (EvidenciaRow, sin selección/detalle/vista previa).
 *            Una sola fuente de verdad para "cómo se ve un documento en
 *            una lista" en toda la plataforma.
 */
import { Link2 } from 'lucide-react';
import CATEGORIAS_EVIDENCIA from '../seguimiento/categoriasEvidencia';

const ICONO_CATEGORIA = Object.fromEntries(CATEGORIAS_EVIDENCIA.map(c => [c.value, c.icon]));

export default function EvidenciaListItem({ evidencia: ev, activa, onClick }) {
  const esLink = ev.tipo_medio === 'link';
  const breadcrumb = [ev.proyecto_nombre, ev.etapa_nombre, ev.accion_nombre].filter(Boolean).join(' › ')
    || (ev.riesgo_titulo ? `Riesgo: ${ev.riesgo_titulo}` : '');

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors border ${
        activa ? 'bg-[#fbf3f6] border-[#7B1C3E]/30' : 'border-gray-100 hover:bg-gray-50'
      }`}
    >
      <div className="w-9 h-9 bg-guinda-50 rounded-lg flex items-center justify-center flex-shrink-0 text-base">
        {esLink ? <Link2 size={16} className="text-blue-500" /> : (ICONO_CATEGORIA[ev.categoria] || '📎')}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{ev.titulo || ev.nombre_original || ev.url}</p>
        <p className="text-xs text-gray-400 truncate mt-0.5">{breadcrumb || 'Sin ubicación asociada'}</p>
      </div>
      <div className="flex-shrink-0 text-right">
        <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded block mb-0.5">{ev.categoria}</span>
        <span className="text-[10px] text-gray-400">
          {new Date(ev.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
        </span>
      </div>
    </button>
  );
}
