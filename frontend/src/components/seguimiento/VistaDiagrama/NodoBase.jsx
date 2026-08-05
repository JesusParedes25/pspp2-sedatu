/**
 * ARCHIVO: NodoBase.jsx
 * PROPÓSITO: Contenido visual compartido por los 3 nodeTypes del diagrama
 *            (Etapa/Acción/Tarea) — franja y punto de color de semáforo
 *            (palomita si está completada), etiqueta de tipo, nombre
 *            truncado, barra de avance y porcentaje. El nivel de detalle
 *            baja con el zoom (por debajo de 0.62 solo queda punto+nombre).
 */
import { CheckCircle2 } from 'lucide-react';
import { useStore, Handle, Position } from '@xyflow/react';
import { COLORES_SEMAFORO, LEYENDA_SEMAFORO } from '../../common/SemaforoDot';

export const DIMENSIONES = {
  etapa: { w: 252, h: 88, etiqueta: 'ETAPA' },
  accion: { w: 222, h: 76, etiqueta: 'ACCIÓN' },
  tarea: { w: 200, h: 66, etiqueta: 'TAREA' },
};

const zoomSelector = (s) => s.transform[2];

export default function NodoBase({ id, data, selected, tipo }) {
  const zoom = useStore(zoomSelector);
  const detalle = zoom >= 0.62;
  const { w, h, etiqueta } = DIMENSIONES[tipo];

  const sem = data.semaforo_efectivo || 'gris';
  const estado = data.estado || 'Pendiente';
  const completada = estado === 'Completada';
  const avance = data.avance_efectivo ?? (tipo === 'etapa' ? parseFloat(data.porcentaje_calculado || 0) : parseFloat(data.porcentaje_avance || 0));
  const tieneHijos = tipo === 'etapa' ? (data.acciones?.length > 0) : tipo === 'accion' ? (data.tareas?.length > 0) : false;
  const colapsado = data.numDescendientesOcultos > 0;

  return (
    <div
      role="treeitem"
      tabIndex={0}
      aria-label={`${etiqueta}: ${data.nombre}. ${Math.round(avance)} por ciento de avance. Estado: ${estado.replace(/_/g, ' ')}.`}
      aria-expanded={tieneHijos ? !colapsado : undefined}
      style={{ width: w, height: h, opacity: data.atenuado ? 0.25 : 1 }}
      className={`rounded-lg border bg-white shadow-sm flex overflow-hidden relative transition-opacity focus:outline-none focus:ring-2 focus:ring-[#7B1C3E] focus:ring-offset-1 ${
        selected ? 'border-[#7B1C3E] ring-1 ring-[#7B1C3E]' : 'border-gray-200'
      }`}
    >
      {tipo !== 'etapa' && <Handle type="target" position={Position.Left} className="!bg-gray-300 !w-1.5 !h-1.5 !border-0" />}
      {/* franja lateral de color de semáforo */}
      <div className="w-1.5 flex-shrink-0" style={{ backgroundColor: COLORES_SEMAFORO[sem] || COLORES_SEMAFORO.gris }} />
      <div className="flex-1 min-w-0 px-2.5 py-2 flex flex-col justify-center gap-1">
        <div className="flex items-center gap-1.5">
          {completada ? (
            <CheckCircle2 size={12} className="text-emerald-600 flex-shrink-0" title="Completada" />
          ) : (
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: COLORES_SEMAFORO[sem] || COLORES_SEMAFORO.gris }}
              title={LEYENDA_SEMAFORO[sem] || LEYENDA_SEMAFORO.gris}
            />
          )}
          {detalle && <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide truncate">{etiqueta}</span>}
        </div>
        <p className="text-xs font-medium text-gray-800 truncate" title={data.nombre}>{data.nombre}</p>
        {detalle && (
          <div className="flex items-center gap-1.5">
            <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.min(avance, 100)}%`, backgroundColor: COLORES_SEMAFORO[sem] || COLORES_SEMAFORO.gris }} />
            </div>
            <span className="text-[10px] tabular-nums text-gray-400 flex-shrink-0">{Math.round(avance)}%</span>
          </div>
        )}
      </div>

      {tieneHijos && (
        <button
          onClick={(e) => { e.stopPropagation(); data.onToggleColapsar?.(id); }}
          title={colapsado ? `Expandir (${data.numDescendientesOcultos} ocultos)` : 'Colapsar rama'}
          aria-label={colapsado ? `Expandir rama, ${data.numDescendientesOcultos} elementos ocultos` : 'Colapsar rama'}
          className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white border border-gray-300 shadow flex items-center justify-center text-gray-500 hover:border-[#7B1C3E] hover:text-[#7B1C3E] text-[11px] font-bold leading-none z-10"
        >
          {colapsado ? '+' : '−'}
        </button>
      )}
      {colapsado && (
        <span
          title={`${data.numDescendientesOcultos} elementos ocultos`}
          className="absolute -right-1.5 -top-2 bg-[#7B1C3E] text-white text-[8px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center"
        >
          {data.numDescendientesOcultos > 99 ? '99+' : data.numDescendientesOcultos}
        </span>
      )}
      {tipo !== 'tarea' && <Handle type="source" position={Position.Right} className="!bg-gray-300 !w-1.5 !h-1.5 !border-0" />}
    </div>
  );
}

// Memoización por comparación de {id, avance, estado} (más selección y
// contador de ocultos, que también cambian la vista) — evita re-renderizar
// nodos que no cambiaron cuando el árbol tiene cientos de elementos.
export function nodosIguales(prev, next) {
  return prev.id === next.id
    && prev.selected === next.selected
    && prev.data.estado === next.data.estado
    && prev.data.avance_efectivo === next.data.avance_efectivo
    && prev.data.porcentaje_avance === next.data.porcentaje_avance
    && prev.data.porcentaje_calculado === next.data.porcentaje_calculado
    && prev.data.semaforo_efectivo === next.data.semaforo_efectivo
    && prev.data.numDescendientesOcultos === next.data.numDescendientesOcultos
    && prev.data.atenuado === next.data.atenuado;
}
