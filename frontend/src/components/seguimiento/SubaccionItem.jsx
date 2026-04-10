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
import { useState } from 'react';
import { Paperclip } from 'lucide-react';
import * as accionesApi from '../../api/acciones';

export default function SubaccionItem({ sub, soloLectura, onCambio, onAbrirDetalle }) {
  const [toggling, setToggling] = useState(false);
  const completada = sub.estado === 'Completada';
  const totalEv = parseInt(sub.total_evidencias) || 0;

  async function toggleCheck(e) {
    e.stopPropagation();
    if (toggling || soloLectura) return;
    setToggling(true);
    try {
      await accionesApi.toggleSubaccion(sub.id);
      onCambio && onCambio();
    } catch (err) {
      alert(err.response?.data?.mensaje || 'Error al cambiar subacción');
    } finally {
      setToggling(false);
    }
  }

  function abrirDrawer(e) {
    e.stopPropagation();
    onAbrirDetalle && onAbrirDetalle(sub);
  }

  return (
    <div className={`group flex items-center gap-3 py-1.5 px-2 -mx-1 rounded-lg transition-colors duration-200 ${
      completada ? 'bg-emerald-50/40' : 'hover:bg-gray-50/70'
    }`}>
      {/* Checkbox circular */}
      {!soloLectura ? (
        <button onClick={toggleCheck} disabled={toggling}
          className={`w-[18px] h-[18px] rounded-full flex-shrink-0 flex items-center justify-center border-[1.5px] transition-all duration-200 ${
            completada
              ? 'bg-emerald-500 border-emerald-500 text-white'
              : 'border-gray-300 hover:border-guinda-400'
          } ${toggling ? 'opacity-40' : 'active:scale-90'}`}>
          {completada && (
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>
      ) : (
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${completada ? 'bg-emerald-400' : 'bg-gray-300'}`} />
      )}

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
