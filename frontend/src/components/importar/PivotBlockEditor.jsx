/**
 * ARCHIVO: PivotBlockEditor.jsx
 * PROPÓSITO: Editor de un bloque pivotado individual.
 *
 * Permite al usuario seleccionar columnas, nombrar el bloque,
 * y mapear campos internos (estado, fecha_inicio, etc.).
 */
import { Trash2 } from 'lucide-react';

const CAMPOS_PIVOT = [
  { value: '', label: '— No mapear —' },
  { value: 'estado', label: 'Estado' },
  { value: 'fecha_inicio', label: 'Fecha inicio' },
  { value: 'fecha_fin', label: 'Fecha fin' },
  { value: 'descripcion', label: 'Descripción / Observaciones' },
  { value: 'responsable', label: 'Responsable' },
  { value: 'entregable', label: 'Entregable' },
];

export default function PivotBlockEditor({ block, index, headers, superHeaders, onChange, onDelete }) {
  const updateField = (field, value) => {
    onChange({ ...block, [field]: value });
  };

  const toggleColumna = (colIdx) => {
    const cols = block.columns || [];
    const nuevas = cols.includes(colIdx)
      ? cols.filter(c => c !== colIdx)
      : [...cols, colIdx].sort((a, b) => a - b);
    
    // Actualizar fieldMap: quitar campos de columnas removidas
    const fieldMap = { ...block.fieldMap };
    for (const key of Object.keys(fieldMap)) {
      if (!nuevas.includes(parseInt(key))) {
        delete fieldMap[key];
      }
    }
    
    onChange({ ...block, columns: nuevas, fieldMap });
  };

  const actualizarFieldMap = (colIdx, campo) => {
    const fieldMap = { ...block.fieldMap };
    if (campo === '') {
      delete fieldMap[colIdx];
    } else {
      fieldMap[colIdx] = campo;
    }
    onChange({ ...block, fieldMap });
  };

  return (
    <div className="border rounded-lg p-3 bg-white space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 font-mono">#{index + 1}</span>
        <input
          type="text"
          value={block.name || ''}
          onChange={e => updateField('name', e.target.value)}
          placeholder="Nombre del bloque (ej: Consulta Pública)"
          className="flex-1 border rounded px-2 py-1 text-sm"
        />
        <select
          value={block.createsLevel || 'accion'}
          onChange={e => updateField('createsLevel', e.target.value)}
          className="border rounded px-2 py-1 text-xs"
        >
          <option value="accion">Crea: Acción</option>
          <option value="subaccion">Crea: Subacción</option>
        </select>
        <button onClick={onDelete} className="text-red-400 hover:text-red-600 p-1">
          <Trash2 size={14} />
        </button>
      </div>

      {/* Seleccionar columnas */}
      <div>
        <p className="text-xs font-medium text-gray-600 mb-1">Columnas incluidas (click para agregar/quitar):</p>
        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
          {headers.map((h, i) => {
            const seleccionada = (block.columns || []).includes(i);
            return (
              <button
                key={i}
                onClick={() => toggleColumna(i)}
                className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                  seleccionada
                    ? 'bg-orange-100 border-orange-300 text-orange-800'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
                title={superHeaders?.[i] ? `${superHeaders[i]} → ${h}` : h}
              >
                {i}: {h || '(vacío)'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mapear campos internos del bloque */}
      {(block.columns || []).length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1">Mapeo de campos dentro del bloque:</p>
          <div className="grid grid-cols-2 gap-2">
            {(block.columns || []).map(colIdx => (
              <div key={colIdx} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-24 truncate" title={headers[colIdx]}>
                  {colIdx}: {headers[colIdx] || '?'}
                </span>
                <select
                  value={block.fieldMap?.[colIdx] || ''}
                  onChange={e => actualizarFieldMap(colIdx, e.target.value)}
                  className="flex-1 border rounded px-2 py-0.5 text-xs"
                >
                  {CAMPOS_PIVOT.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
