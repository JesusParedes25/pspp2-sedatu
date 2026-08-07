/**
 * ARCHIVO: BloqueCalculado.jsx
 * PROPÓSITO: Bloque "de origen del avance" para un nodo CONTENEDOR (tiene
 *            hijos) — Estatus/Avance/Fecha inicio en solo lectura, nunca
 *            como inputs deshabilitados (un campo gris invita a escribir
 *            en él). El título se autonombra según el nivel: una Etapa
 *            dice "desde sus acciones", una Acción "desde sus tareas".
 *            Sigue siendo puramente de lectura — el avance de un nodo con
 *            hijos SIEMPRE se calcula a partir de ellos, eso no cambia
 *            aquí; solo el tinte (color del semáforo en vez de gris plano)
 *            para que se lea como "estado calculado" y no como "campo roto".
 */
import { Lock } from 'lucide-react';
import { NIVELES } from '../../config/niveles';
import { formatFecha } from '../../utils/fecha';
import { COLORES_SEMAFORO, CHIP_BG } from '../common/SemaforoDot';

export default function BloqueCalculado({ tipo, estado, avance, fechaInicio, mostrarFechaInicio, sem = 'gris' }) {
  const nivel = NIVELES[tipo];
  const color = COLORES_SEMAFORO[sem];
  return (
    <div
      className="mb-3 px-3.5 py-3 rounded-lg border"
      style={{ backgroundColor: CHIP_BG[sem], borderColor: `${color}35` }}
    >
      <div className="flex items-center gap-1.5 mb-2.5">
        <Lock size={11} style={{ color }} />
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color }}>
          Calculado desde sus {(nivel.hijoLabelPlural || 'partes').toLowerCase()}
        </span>
      </div>
      <div className="flex items-center gap-x-5 gap-y-2 flex-wrap">
        <div>
          <span className="text-[10px] text-gray-500 block mb-0.5">Estatus</span>
          <span className="text-sm font-medium text-gray-700">{(estado || 'Pendiente').replace(/_/g, ' ')}</span>
        </div>
        <div>
          <span className="text-[10px] text-gray-500 block mb-0.5">Avance</span>
          <span className="text-sm font-medium text-gray-700 tabular-nums">{Math.round(avance)}%</span>
        </div>
        {mostrarFechaInicio && (
          <div>
            <span className="text-[10px] text-gray-500 block mb-0.5">Fecha inicio</span>
            <span className="text-sm font-medium text-gray-700">{formatFecha(fechaInicio) || 'Sin definir'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
