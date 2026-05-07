/**
 * ARCHIVO: TarjetaAccion.jsx
 * PROPÓSITO: Tarjeta colapsable para una acción/subacción pivotada en el Paso 3.
 *
 * Muestra el nombre de la acción, las columnas disponibles con dropdown de campo,
 * y permite colapsar/expandir para no saturar la pantalla con 6+ acciones.
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';

const CAMPOS_ACCION = [
  { value: '', label: '— No usar —' },
  { value: 'estado', label: 'Estado' },
  { value: 'fecha_inicio', label: 'Fecha inicio' },
  { value: 'fecha_fin', label: 'Fecha fin' },
  { value: 'descripcion', label: 'Descripción' },
  { value: 'responsable', label: 'Responsable' },
  { value: 'entregable', label: 'Evidencia URL' },
  { value: 'clave', label: 'Clave' },
];

export default function TarjetaAccion({
  accion,
  index,
  columnasDisponibles,
  headers,
  onChange,
  onDelete,
  errorNombre,
}) {
  const [colapsada, setColapsada] = useState(false);

  const actualizarNombre = (nombre) => {
    onChange({ ...accion, name: nombre });
  };

  const actualizarFieldMap = (colIdx, campo) => {
    const fieldMap = { ...accion.fieldMap };
    const columns = [...(accion.columns || [])];

    if (campo === '') {
      delete fieldMap[colIdx];
      const i = columns.indexOf(colIdx);
      if (i !== -1) columns.splice(i, 1);
    } else {
      fieldMap[colIdx] = campo;
      if (!columns.includes(colIdx)) {
        columns.push(colIdx);
        columns.sort((a, b) => a - b);
      }
    }

    onChange({ ...accion, fieldMap, columns });
  };

  // Columnas asignadas a ESTA acción (tienen un campo != '')
  const columnasAsignadas = Object.keys(accion.fieldMap || {}).map(Number);
  const tieneAsignaciones = columnasAsignadas.length > 0;

  // Resumen para mostrar cuando está colapsada
  const resumenCampos = Object.values(accion.fieldMap || {})
    .map(v => CAMPOS_ACCION.find(c => c.value === v)?.label || v)
    .filter(Boolean);

  return (
    <div className={`border rounded-lg overflow-hidden ${errorNombre ? 'border-red-300' : 'border-gray-200'}`}>
      {/* Header colapsable */}
      <div
        className="flex items-center gap-2 px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
        onClick={() => setColapsada(!colapsada)}
      >
        {colapsada ? <ChevronRight size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
        <span className="text-xs text-gray-400 font-mono">#{index + 1}</span>
        <span className="text-sm font-medium text-gray-700 flex-1">
          {accion.name || <span className="italic text-gray-400">Sin nombre</span>}
        </span>
        {colapsada && tieneAsignaciones && (
          <span className="text-xs text-gray-500">
            {resumenCampos.join(', ')}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-red-400 hover:text-red-600 p-1 rounded"
          title="Eliminar acción"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Contenido expandido */}
      {!colapsada && (
        <div className="px-4 py-3 space-y-3">
          {/* Nombre */}
          <div>
            <label className="text-xs font-medium text-gray-600">Nombre de la acción:</label>
            <input
              type="text"
              value={accion.name || ''}
              onChange={e => actualizarNombre(e.target.value)}
              placeholder="Ej: Consulta Pública, Aprobación..."
              className={`mt-1 w-full border rounded px-3 py-1.5 text-sm ${errorNombre ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
            />
            {errorNombre && (
              <p className="text-xs text-red-500 mt-0.5">{errorNombre}</p>
            )}
          </div>

          {/* Tabla de columnas disponibles */}
          <div>
            <label className="text-xs font-medium text-gray-600">Columnas que describen esta acción:</label>
            <div className="mt-1 border rounded max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium text-gray-500">Columna</th>
                    <th className="px-3 py-1.5 text-left font-medium text-gray-500 w-40">Asignar a</th>
                  </tr>
                </thead>
                <tbody>
                  {columnasDisponibles.map(colIdx => (
                    <tr key={colIdx} className="border-t">
                      <td className="px-3 py-1.5 text-gray-700">
                        {headers[colIdx] || `Col ${colIdx}`}
                      </td>
                      <td className="px-3 py-1.5">
                        <select
                          value={accion.fieldMap?.[colIdx] || ''}
                          onChange={e => actualizarFieldMap(colIdx, e.target.value)}
                          className="w-full border rounded px-2 py-1 text-xs"
                        >
                          {CAMPOS_ACCION.map(c => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                  {columnasDisponibles.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-3 py-3 text-center text-gray-400 italic">
                        Todas las columnas están asignadas a la etapa u otras acciones.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
