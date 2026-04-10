/**
 * ARCHIVO: EvidenciaRow.jsx
 * PROPÓSITO: Fila de una evidencia en la tabla de evidencias del proyecto.
 *
 * MINI-CLASE: Presentación de archivos con metadatos
 * ─────────────────────────────────────────────────────────────────
 * Cada evidencia muestra: nombre original del archivo, categoría
 * (Geoespacial, Estudios, Scripts, etc.), quién la subió, la fecha,
 * y un enlace de descarga. El ícono cambia según la categoría para
 * dar contexto visual inmediato sobre el tipo de archivo.
 * ─────────────────────────────────────────────────────────────────
 */
import { FileText, Download, Map, Code, Image, File } from 'lucide-react';

const iconosPorCategoria = {
  Geoespacial: Map,
  Scripts: Code,
  Fotografias: Image,
  Estudios: FileText,
  Planos: Map,
  Oficios: FileText,
  Minutas: FileText,
  Contratos: FileText,
  Reportes: FileText,
  Otro: File,
};

// Formatear tamaño de archivo en bytes a formato legible
function formatearTamano(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function EvidenciaRow({ evidencia }) {
  const Icono = iconosPorCategoria[evidencia.categoria] || File;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100">
      {/* Ícono de categoría */}
      <div className="w-9 h-9 bg-guinda-50 rounded-lg flex items-center justify-center flex-shrink-0">
        <Icono size={18} className="text-guinda-500" />
      </div>

      {/* Info del archivo */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{evidencia.nombre_original}</p>
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
          <span className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">{evidencia.categoria}</span>
          {evidencia.autor_nombre && <span>{evidencia.autor_nombre}</span>}
          {evidencia.tamano_bytes && <span>{formatearTamano(evidencia.tamano_bytes)}</span>}
        </div>
        {evidencia.notas && (
          <p className="text-xs text-gray-400 mt-1 line-clamp-1">{evidencia.notas}</p>
        )}
      </div>

      {/* Etapa y acción de donde viene */}
      {evidencia.etapa_nombre && (
        <span className="text-xs text-gray-400 flex-shrink-0 hidden lg:block max-w-32 truncate">
          {evidencia.etapa_nombre}
        </span>
      )}

      {/* Fecha */}
      <span className="text-xs text-gray-400 flex-shrink-0">
        {new Date(evidencia.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
      </span>

      {/* Botón descarga */}
      <button
        className="p-2 text-gray-400 hover:text-guinda-500 rounded-lg hover:bg-guinda-50 transition-colors flex-shrink-0"
        title="Descargar"
      >
        <Download size={16} />
      </button>
    </div>
  );
}
