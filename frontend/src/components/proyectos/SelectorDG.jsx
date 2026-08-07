/**
 * ARCHIVO: SelectorDG.jsx
 * PROPÓSITO: Selector compacto (un botón + menú) para cambiar la vista
 *            entre DGs participantes de un proyecto — antes eran pills
 *            sueltas que ocupaban una fila completa siempre visible; ahora
 *            es una sola línea que se abre bajo demanda, para recuperar
 *            espacio vertical en el encabezado del proyecto.
 *
 * MINI-CLASE: Vista por DG y modo solo lectura
 * ─────────────────────────────────────────────────────────────────
 * En proyectos con múltiples DGs (ej: DGOTU lider + DGOMR y DGPV
 * colaboradoras), este selector permite cambiar la vista para ver
 * las etapas y acciones asignadas a cada DG. Si la DG seleccionada
 * no es la DG del usuario logueado, se muestra un banner azul de
 * "Solo lectura" y se ocultan todos los botones de edición.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useRef, useEffect } from 'react';
import { Eye, Building2, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function SelectorDG({ dgs = [], dgSeleccionada, onSeleccionar }) {
  const { usuario } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);
  const esSoloLectura = dgSeleccionada && dgSeleccionada !== usuario?.id_dg;
  const dgActual = dgs.find(d => d.id_dg === dgSeleccionada);

  useEffect(() => {
    function fuera(e) { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); }
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setAbierto(v => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg px-2.5 py-1 hover:bg-gray-50 transition-colors"
      >
        <Building2 size={12} className="text-gray-400" />
        Direcciones: {dgActual ? `${dgActual.dg_siglas}${dgActual.direccion_area_siglas ? ' / ' + dgActual.direccion_area_siglas : ''}` : `Todas las DGs (${dgs.length})`}
        <ChevronDown size={12} className={`text-gray-400 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {esSoloLectura && (
        <span className="inline-flex items-center gap-1 ml-2 text-[11px] text-blue-600" title="Viendo el avance de otra DG — solo lectura">
          <Eye size={11} /> Solo lectura
        </span>
      )}

      {abierto && (
        <div className="absolute z-20 top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          <button
            onClick={() => { onSeleccionar(null); setAbierto(false); }}
            className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${!dgSeleccionada ? 'bg-guinda-50 text-guinda-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            Todas las DGs
          </button>
          {dgs.map(dg => (
            <button
              key={dg.id_dg}
              onClick={() => { onSeleccionar(dg.id_dg); setAbierto(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${dgSeleccionada === dg.id_dg ? 'bg-guinda-50 text-guinda-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {dg.dg_siglas}{dg.direccion_area_siglas ? ` / ${dg.direccion_area_siglas}` : ''}
              <span className="ml-1 opacity-60">({dg.rol_en_proyecto})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
