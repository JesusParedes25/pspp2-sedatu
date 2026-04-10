/**
 * ARCHIVO: SelectorDG.jsx
 * PROPÓSITO: Botones para cambiar la vista entre DGs participantes de un proyecto.
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
import { Eye } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function SelectorDG({ dgs = [], dgSeleccionada, onSeleccionar }) {
  const { usuario } = useAuth();
  const esSoloLectura = dgSeleccionada && dgSeleccionada !== usuario?.id_dg;

  return (
    <div className="space-y-2">
      {/* Botones de DGs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onSeleccionar(null)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            !dgSeleccionada
              ? 'bg-guinda-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Todas las DGs
        </button>
        {dgs.map(dg => (
          <button
            key={dg.id_dg}
            onClick={() => onSeleccionar(dg.id_dg)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              dgSeleccionada === dg.id_dg
                ? 'bg-guinda-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {dg.dg_siglas}
            {dg.direccion_area_siglas ? ` / ${dg.direccion_area_siglas}` : ''}
            <span className="ml-1 opacity-60">({dg.rol_en_proyecto})</span>
          </button>
        ))}
      </div>

      {/* Banner de solo lectura */}
      {esSoloLectura && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
          <Eye size={16} className="text-blue-500 flex-shrink-0" />
          <p className="text-xs text-blue-700">
            Viendo avance de <strong>{dgs.find(d => d.id_dg === dgSeleccionada)?.dg_siglas || 'otra DG'}</strong> — Solo lectura
          </p>
        </div>
      )}
    </div>
  );
}
