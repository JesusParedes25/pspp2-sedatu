/**
 * ARCHIVO: TarjetaSubaccion.jsx
 * PROPÓSITO: Tarjeta colapsable para una subacción anidada dentro de una TarjetaAccion.
 *
 * Misma estructura que TarjetaAccion pero con indentación visual,
 * fondo ligeramente distinto y numeración anidada (1.1, 1.2, etc.).
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';

const CAMPOS_SUBACCION = [
  { value: '', label: '— No usar —' },
  { value: 'estado', label: 'Estado' },
  { value: 'fecha_inicio', label: 'Fecha inicio' },
  { value: 'fecha_fin', label: 'Fecha fin' },
  { value: 'descripcion', label: 'Descripción' },
  { value: 'responsable', label: 'Responsable' },
  { value: 'entregable', label: 'Evidencia URL' },
  { value: 'clave', label: 'Clave' },
];

export default function TarjetaSubaccion({
  subaccion,
  accionIndex,
  subIndex,
  columnasDisponibles,
  headers,
  onChange,
  onDelete,
  errorNombre,
}) {
  const [colapsada, setColapsada] = useState(false);

  const actualizarNombre = (nombre) => {
    onChange({ ...subaccion, name: nombre });
  };

  const actualizarFieldMap = (colIdx, campo) => {
    const fieldMap = { ...subaccion.fieldMap };
    const columns = [...(subaccion.columns || [])];

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

    onChange({ ...subaccion, fieldMap, columns });
  };

  const resumenCampos = Object.values(subaccion.fieldMap || {})
    .map(v => CAMPOS_SUBACCION.find(c => c.value === v)?.label || v)
    .filter(Boolean);

  const tieneAsignaciones = resumenCampos.length > 0;
  const etiqueta = `${accionIndex + 1}.${subIndex + 1}`;

  return (
    <div className={`border rounded-lg overflow-hidden ${errorNombre ? 'border-red-300 bg-red-50/30' : 'border-indigo-200 bg-indigo-50/30'}`}>
      {/* Header colapsable */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-indigo-50/60 cursor-pointer hover:bg-indigo-100/60 transition-colors"
        onClick={() => setColapsada(!colapsada)}
      >
        {colapsada ? <ChevronRight size={12} className="text-indigo-400" /> : <ChevronDown size={12} className="text-indigo-400" />}
        <span className="text-xs text-indigo-400 font-mono">#{etiqueta}</span>
        <span className="text-xs font-medium text-indigo-700 flex-1">
          {subaccion.name || <span className="italic text-indigo-300">Sin nombre</span>}
        </span>
        {colapsada && tieneAsignaciones && (
          <span className="text-xs text-indigo-400">
            {resumenCampos.join(', ')}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-red-400 hover:text-red-600 p-0.5 rounded"
          title="Eliminar subacción"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Contenido expandido */}
      {!colapsada && (
        <div className="px-3 py-2 space-y-2">
          {/* Nombre */}
          <div>
            <label className="text-xs font-medium text-indigo-600">Nombre de la subacción:</label>
            <input
              type="text"
              value={subaccion.name || ''}
              onChange={e => actualizarNombre(e.target.value)}
              placeholder="Ej: Aviso de inicio, Cierre..."
              className={`mt-1 w-full border rounded px-2 py-1 text-xs ${errorNombre ? 'border-red-400 bg-red-50' : 'border-indigo-200'}`}
            />
            {errorNombre && (
              <p className="text-xs text-red-500 mt-0.5">{errorNombre}</p>
            )}
          </div>

          {/* Tabla de columnas disponibles */}
          <div>
            <label className="text-xs font-medium text-indigo-600">Columnas que describen esta subacción:</label>
            <div className="mt-1 border border-indigo-200 rounded max-h-36 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-indigo-50/80 sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium text-indigo-500">Columna</th>
                    <th className="px-2 py-1 text-left font-medium text-indigo-500 w-36">Asignar a</th>
                  </tr>
                </thead>
                <tbody>
                  {columnasDisponibles.map(colIdx => (
                    <tr key={colIdx} className="border-t border-indigo-100">
                      <td className="px-2 py-1 text-gray-700">
                        {headers[colIdx] || `Col ${colIdx}`}
                      </td>
                      <td className="px-2 py-1">
                        <select
                          value={subaccion.fieldMap?.[colIdx] || ''}
                          onChange={e => actualizarFieldMap(colIdx, e.target.value)}
                          className="w-full border border-indigo-200 rounded px-1.5 py-0.5 text-xs"
                        >
                          {CAMPOS_SUBACCION.map(c => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                  {columnasDisponibles.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-2 py-2 text-center text-indigo-300 italic">
                        No hay columnas disponibles.
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
