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
import { formatFecha } from '../../utils/fecha';
import { AlertTriangle, Shield, User, Calendar, MapPin } from 'lucide-react';

const bordePorNivel = {
  Bajo:    'border-l-green-500',
  Medio:   'border-l-yellow-500',
  Alto:    'border-l-orange-500',
  Critico: 'border-l-red-500',
};

const ETIQUETA_ENTIDAD = { Proyecto: 'Proyecto', Etapa: 'Etapa', Accion: 'Acción', Subaccion: 'Acción', Tarea: 'Tarea' };

// mostrarNodo: a qué etapa/acción/tarea pertenece — útil cuando la tarjeta
// se ve fuera del contexto de ESE nodo (la sección de Riesgos a nivel
// proyecto, que mezcla riesgos de toda la jerarquía); PanelRiesgos.jsx (ya
// dentro de un nodo puntual) lo deja apagado a propósito, sería redundante
// ahí.
export default function RiesgoCard({ riesgo, compacto = false, mostrarNodo = false }) {
  return (
    <div className={`card border-l-4 ${compacto ? 'p-3' : 'p-4'} ${bordePorNivel[riesgo.nivel] || 'border-l-gray-300'}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {riesgo.tipo === 'Problema' ? (
            <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
          ) : (
            <Shield size={16} className="text-orange-500 flex-shrink-0" />
          )}
          <h4 className="text-sm font-semibold text-gray-900 truncate">{riesgo.titulo}</h4>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <EstadoChip estado={riesgo.nivel} />
          <EstadoChip estado={riesgo.estado} />
        </div>
      </div>

      {mostrarNodo && (riesgo.nombre_entidad || riesgo.entidad_tipo) && (
        <p className="text-[11px] text-gray-400 flex items-center gap-1 mb-2 -mt-1">
          <MapPin size={11} />
          {ETIQUETA_ENTIDAD[riesgo.entidad_tipo] || riesgo.entidad_tipo}
          {riesgo.nombre_entidad ? `: ${riesgo.nombre_entidad}` : ''}
        </p>
      )}

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

      {/* Footer: responsable y fecha — si la asignación sigue pendiente o
          se declinó, se nota aquí mismo, sin tener que abrir el riesgo
          para descubrir que en realidad nadie confirmó hacerse cargo. */}
      <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-100">
        <div className="flex items-center gap-1">
          <User size={12} />
          {riesgo.responsable_nombre || 'Sin asignar'}
          {riesgo.estado_responsable === 'pendiente' && (
            <span className="text-amber-600 font-medium">(pendiente de aceptar)</span>
          )}
          {riesgo.estado_responsable === 'rechazada' && (
            <span className="text-red-500 font-medium">(declinó)</span>
          )}
        </div>
        {riesgo.fecha_limite_resolucion && (
          <div className="flex items-center gap-1">
            <Calendar size={12} />
            {formatFecha(riesgo.fecha_limite_resolucion, { day: '2-digit', month: 'short' })}
          </div>
        )}
        <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded">{riesgo.tipo}</span>
      </div>

      {!compacto && (
        <div className="flex items-center gap-3 text-[11px] text-gray-400 pt-1.5">
          {riesgo.created_at && <span>Identificado: {formatFecha(riesgo.created_at, { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
          {riesgo.fecha_cierre && <span>Cerrado: {formatFecha(riesgo.fecha_cierre, { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
        </div>
      )}
    </div>
  );
}
