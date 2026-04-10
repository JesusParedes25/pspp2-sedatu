/**
 * ARCHIVO: RiesgoCard.jsx
 * PROPÓSITO: Card individual de un riesgo o problema del proyecto.
 *
 * MINI-CLASE: Riesgos con nivel de severidad visual
 * ─────────────────────────────────────────────────────────────────
 * El borde izquierdo del card usa el color del nivel de severidad:
 * verde (Bajo), amarillo (Medio), naranja (Alto), rojo (Crítico).
 * Esto permite al usuario identificar rápidamente los riesgos más
 * urgentes sin leer los detalles. El card muestra título, tipo
 * (Riesgo/Problema), nivel, estado, responsable y medida de
 * mitigación si existe.
 * ─────────────────────────────────────────────────────────────────
 */
import EstadoChip from '../common/EstadoChip';
import { AlertTriangle, Shield, User, Calendar } from 'lucide-react';

const bordePorNivel = {
  Bajo:    'border-l-green-500',
  Medio:   'border-l-yellow-500',
  Alto:    'border-l-orange-500',
  Critico: 'border-l-red-500',
};

export default function RiesgoCard({ riesgo, compacto = false }) {
  return (
    <div className={`card border-l-4 ${compacto ? 'p-3' : 'p-4'} ${bordePorNivel[riesgo.nivel] || 'border-l-gray-300'}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {riesgo.tipo === 'Problema' ? (
            <AlertTriangle size={16} className="text-red-500" />
          ) : (
            <Shield size={16} className="text-orange-500" />
          )}
          <h4 className="text-sm font-semibold text-gray-900">{riesgo.titulo}</h4>
        </div>
        <div className="flex items-center gap-2">
          <EstadoChip estado={riesgo.nivel} />
          <EstadoChip estado={riesgo.estado} />
        </div>
      </div>

      {/* Descripción */}
      {riesgo.descripcion && (
        <p className="text-xs text-gray-600 mb-2 line-clamp-2">{riesgo.descripcion}</p>
      )}

      {/* Causa e impacto */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        {riesgo.causa && (
          <div>
            <p className="text-xs font-medium text-gray-500">Causa</p>
            <p className="text-xs text-gray-600 line-clamp-1">{riesgo.causa}</p>
          </div>
        )}
        {riesgo.impacto && (
          <div>
            <p className="text-xs font-medium text-gray-500">Impacto</p>
            <p className="text-xs text-gray-600 line-clamp-1">{riesgo.impacto}</p>
          </div>
        )}
      </div>

      {/* Medida de mitigación */}
      {riesgo.medida_mitigacion && (
        <div className="mb-2 px-2 py-1.5 bg-blue-50 rounded text-xs text-blue-700">
          <span className="font-medium">Mitigación:</span> {riesgo.medida_mitigacion}
        </div>
      )}

      {/* Footer: responsable y fecha */}
      <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-100">
        <div className="flex items-center gap-1">
          <User size={12} />
          {riesgo.responsable_nombre || 'Sin asignar'}
        </div>
        {riesgo.fecha_limite_resolucion && (
          <div className="flex items-center gap-1">
            <Calendar size={12} />
            {new Date(riesgo.fecha_limite_resolucion).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
          </div>
        )}
        <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded">{riesgo.tipo}</span>
      </div>
    </div>
  );
}
