/**
 * ARCHIVO: BloqueCalculado.jsx
 * PROPÓSITO: Bloque "de origen del avance" para un nodo CONTENEDOR (tiene
 *            hijos) — Estatus/Avance/Fecha inicio en solo lectura, nunca
 *            como inputs deshabilitados (un campo gris invita a escribir
 *            en él). El título se autonombra según el nivel: una Etapa
 *            dice "desde sus acciones", una Acción "desde sus tareas".
 */
import { Lock } from 'lucide-react';
import { NIVELES } from '../../config/niveles';
import { formatFecha } from '../../utils/fecha';

export default function BloqueCalculado({ tipo, estado, avance, fechaInicio, mostrarFechaInicio }) {
  const nivel = NIVELES[tipo];
  return (
    <div className="mb-3 px-3 py-2.5 bg-gray-50 border border-dashed border-gray-300 rounded-lg">
      <div className="flex items-center gap-1 mb-2">
        <Lock size={10} className="text-gray-400" />
        <span className="text-[9px] font-semibold text-gray-500 uppercase tracking-wider">
          Calculado desde sus {(nivel.hijoLabelPlural || 'partes').toLowerCase()}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">Estatus</span>
          <span className="text-xs text-gray-600">{(estado || 'Pendiente').replace(/_/g, ' ')}</span>
        </div>
        <div>
          <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">Avance</span>
          <span className="text-xs text-gray-600 tabular-nums">{Math.round(avance)}%</span>
        </div>
        {mostrarFechaInicio && (
          <div className="col-span-2">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">Fecha inicio</span>
            <span className="text-xs text-gray-600">{formatFecha(fechaInicio) || 'Sin definir'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
