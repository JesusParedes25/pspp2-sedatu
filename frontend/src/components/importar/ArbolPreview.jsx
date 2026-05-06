/**
 * ARCHIVO: ArbolPreview.jsx
 * PROPÓSITO: Visualización jerárquica del preview de importación.
 *
 * Muestra etapas → acciones → subacciones con indentación,
 * warnings en amarillo, errores en rojo.
 */
import { ChevronRight, Layers, Zap, GitBranch, AlertTriangle } from 'lucide-react';

function EntidadNodo({ entidad, profundidad = 0 }) {
  const iconos = {
    etapa: Layers,
    accion: Zap,
    subaccion: GitBranch,
  };
  const colores = {
    etapa: 'text-blue-600 bg-blue-50',
    accion: 'text-green-600 bg-green-50',
    subaccion: 'text-purple-600 bg-purple-50',
  };

  const Icono = iconos[entidad.nivel] || Zap;
  const color = colores[entidad.nivel] || 'text-gray-600 bg-gray-50';
  const tieneWarnings = (entidad.warnings || []).length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50 ${
          tieneWarnings ? 'bg-amber-50/50' : ''
        }`}
        style={{ marginLeft: `${profundidad * 20}px` }}
      >
        <span className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${color}`}>
          <Icono size={12} />
        </span>
        <span className="text-sm text-gray-800 font-medium truncate flex-1">
          {entidad.nombre}
        </span>
        {entidad.campos?.estado && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
            {entidad.campos.estado}
          </span>
        )}
        {entidad.campos?.fecha_inicio && (
          <span className="text-xs text-gray-400">
            {entidad.campos.fecha_inicio}
          </span>
        )}
        {tieneWarnings && (
          <span className="flex items-center gap-0.5 text-xs text-amber-600" title={entidad.warnings.join(', ')}>
            <AlertTriangle size={10} />
          </span>
        )}
        <span className="text-xs text-gray-300">F{entidad.filaOrigen}</span>
      </div>
      {/* Hijos recursivos */}
      {(entidad.hijos || []).map((hijo, i) => (
        <EntidadNodo key={i} entidad={hijo} profundidad={profundidad + 1} />
      ))}
    </div>
  );
}

export default function ArbolPreview({ entidades }) {
  if (!entidades || entidades.length === 0) {
    return (
      <p className="text-sm text-gray-500 italic py-4 text-center">
        No se detectaron entidades para importar.
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {entidades.map((ent, i) => (
        <EntidadNodo key={i} entidad={ent} profundidad={0} />
      ))}
    </div>
  );
}
