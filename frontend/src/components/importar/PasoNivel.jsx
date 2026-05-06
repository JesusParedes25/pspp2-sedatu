/**
 * ARCHIVO: PasoNivel.jsx
 * PROPÓSITO: Paso 2 del wizard — configurar nivel de fila (etapa/acción/subacción),
 *            entidad padre, y columna de jerarquía.
 */
import { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import * as etapasApi from '../../api/etapas';

export default function PasoNivel({ config, onCambiar, onAvanzar, proyectoId }) {
  const [rowLevel, setRowLevel] = useState(config.rowLevel || 'etapa');
  const [hierarchyEnabled, setHierarchyEnabled] = useState(config.hierarchy?.enabled || false);
  const [hierarchyColumn, setHierarchyColumn] = useState(config.hierarchy?.column ?? '');
  const [parentEntityId, setParentEntityId] = useState(config.parentEntityId || '');

  // Entidades padre disponibles
  const [etapas, setEtapas] = useState([]);

  useEffect(() => {
    if (rowLevel === 'accion' || rowLevel === 'subaccion') {
      etapasApi.obtenerEtapasProyecto(proyectoId)
        .then(res => setEtapas(res.datos || []))
        .catch(() => {});
    }
  }, [rowLevel, proyectoId]);

  const guardar = () => {
    const updates = {
      rowLevel,
      parentEntityId: parentEntityId || null,
      hierarchy: {
        enabled: hierarchyEnabled,
        column: hierarchyEnabled ? parseInt(hierarchyColumn) : null,
        valueMap: hierarchyEnabled ? { ETAPA: 'etapa', ACCION: 'accion', SUBACCION: 'subaccion' } : {},
      },
    };
    onCambiar(updates);
    onAvanzar();
  };

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold text-gray-700">Nivel de cada fila</h3>

      {/* Row level */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-2">¿Qué representa cada fila del archivo?</label>
        <div className="flex gap-3">
          {[
            { value: 'etapa', label: 'Etapa', desc: 'Cada fila es una etapa (acciones se crean vía pivot blocks o jerarquía)' },
            { value: 'accion', label: 'Acción', desc: 'Cada fila es una acción (requiere seleccionar etapa padre)' },
            { value: 'subaccion', label: 'Subacción', desc: 'Cada fila es una subacción (requiere seleccionar acción padre)' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setRowLevel(opt.value)}
              className={`flex-1 p-3 border rounded-lg text-left transition-colors ${
                rowLevel === opt.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className="text-sm font-medium block">{opt.label}</span>
              <span className="text-xs text-gray-500 mt-0.5 block">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Parent entity selector */}
      {(rowLevel === 'accion' || rowLevel === 'subaccion') && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {rowLevel === 'accion' ? 'Etapa padre' : 'Acción padre'}
          </label>
          <select
            value={parentEntityId}
            onChange={e => setParentEntityId(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
          >
            <option value="">— Seleccionar —</option>
            {etapas.map(et => (
              <option key={et.id} value={et.id}>{et.nombre}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-0.5">
            Todas las filas importadas se agregarán bajo esta entidad.
          </p>
        </div>
      )}

      {/* Hierarchy column */}
      <div className="border rounded-lg p-4 bg-gray-50">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={hierarchyEnabled}
            onChange={e => setHierarchyEnabled(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-sm font-medium text-gray-700">El archivo tiene una columna de nivel/jerarquía</span>
        </label>
        <p className="text-xs text-gray-500 mt-1 ml-6">
          Si el archivo tiene una columna que indica ETAPA/ACCION/SUBACCION para cada fila.
        </p>

        {hierarchyEnabled && (
          <div className="mt-3 ml-6">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Índice de la columna de nivel (0-based)
            </label>
            <input
              type="number"
              min={0}
              value={hierarchyColumn}
              onChange={e => setHierarchyColumn(e.target.value)}
              className="w-32 border rounded-md px-3 py-2 text-sm"
              placeholder="ej: 0"
            />
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={guardar}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
        >
          Siguiente <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
