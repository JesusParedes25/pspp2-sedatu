/**
 * ARCHIVO: EmptyState.jsx
 * PROPÓSITO: Componente para mostrar estado vacío con ícono y acción.
 *
 * MINI-CLASE: Empty states como guía para el usuario
 * ─────────────────────────────────────────────────────────────────
 * Un empty state bien diseñado no solo dice "no hay datos", sino
 * que guía al usuario sobre qué hacer: "No hay proyectos aún.
 * Crea tu primer proyecto." Incluye un ícono visual, un título,
 * un subtítulo descriptivo y opcionalmente un botón de acción.
 * ─────────────────────────────────────────────────────────────────
 */
import { FolderOpen } from 'lucide-react';

export default function EmptyState({ icono: Icono = FolderOpen, titulo, subtitulo, accion, onAccion }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <Icono size={28} className="text-gray-400" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-1">{titulo || 'Sin datos'}</h3>
      {subtitulo && <p className="text-sm text-gray-500 max-w-sm mb-4">{subtitulo}</p>}
      {accion && onAccion && (
        <button onClick={onAccion} className="btn-primary">
          {accion}
        </button>
      )}
    </div>
  );
}
