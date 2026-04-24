/**
 * ARCHIVO: SubaccionItem.jsx
 * PROPÓSITO: Fila compacta de subacción tipo checklist.
 *
 * MINI-CLASE: Checklist puro + drawer
 * ─────────────────────────────────────────────────────────────────
 * Checkbox a la izquierda: click marca/desmarca (toggle estado).
 * Nombre: click abre el drawer lateral con archivos y discusión.
 * La lista permanece siempre compacta — no se expande nada inline.
 * ─────────────────────────────────────────────────────────────────
 */
import { Paperclip } from 'lucide-react';
import SelectorEstado from '../common/SelectorEstado';

export default function SubaccionItem({ sub, soloLectura, onCambio, onAbrirDetalle }) {
  const completada = sub.estado === 'Completada';
  const totalEv = parseInt(sub.total_evidencias) || 0;

  function abrirDrawer(e) {
    e.stopPropagation();
    onAbrirDetalle && onAbrirDetalle(sub);
  }

  return (
    <div className={`group flex items-center gap-3 py-1.5 px-2 -mx-1 rounded-lg transition-colors duration-200 ${
      completada ? 'bg-emerald-50/40' : 'hover:bg-gray-50/70'
    }`}>
      {/* Selector de estado compacto */}
      <div onClick={e => e.stopPropagation()} className="flex-shrink-0">
        <SelectorEstado
          entidadTipo="Subaccion"
          entidadId={sub.id}
          estadoActual={sub.estado}
          onCambio={onCambio}
          soloLectura={soloLectura}
        />
      </div>

      {/* Nombre — click abre drawer */}
      <button onClick={abrirDrawer}
        className={`flex-1 text-left text-[13px] leading-tight transition-all duration-200 hover:text-guinda-600 ${
          completada ? 'line-through text-gray-400' : 'text-gray-700'
        }`}>
        {sub.nombre}
      </button>

      {/* Indicadores compactos */}
      {totalEv > 0 && (
        <span className="flex items-center gap-0.5 text-[10px] text-gray-400 flex-shrink-0">
          <Paperclip size={10} />
          <span className="tabular-nums">{totalEv}</span>
        </span>
      )}

      {parseFloat(sub.peso_porcentaje) > 0 && (
        <span className="text-[10px] text-gray-300 tabular-nums flex-shrink-0">
          {parseFloat(sub.peso_porcentaje).toFixed(0)}%
        </span>
      )}
    </div>
  );
}
