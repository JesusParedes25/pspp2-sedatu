/**
 * ARCHIVO: PasoRelacion.jsx
 * PROPÓSITO: Paso 4 del wizard — Relación Jerárquica.
 *
 * Solo se muestra si el usuario eligió "Acciones" o "Tareas" en PasoNivel.
 * Pide al usuario que identifique qué columna del archivo contiene
 * el nombre del componente padre (para acciones) o la acción padre (para tareas).
 */
import { useState } from 'react';
import { ChevronRight, Info, Link2 } from 'lucide-react';

export default function PasoRelacion({ headers, sampleRows, config, onCambiar, onAvanzar }) {
  const rowLevel = config.rowLevel || 'etapa';
  const [parentColumn, setParentColumn] = useState(
    config.parentColumn != null ? config.parentColumn : ''
  );

  const esAccion = rowLevel === 'accion';
  const esTarea = rowLevel === 'subaccion';
  const etiquetaPadre = esAccion ? 'Componente' : 'Acción';

  const guardar = () => {
    onCambiar({
      parentColumn: parentColumn !== '' ? parseInt(parentColumn) : null,
    });
    onAvanzar();
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Link2 size={16} className="text-blue-500" />
          Relación jerárquica
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          {esAccion
            ? 'Cada acción necesita pertenecer a un componente. Indica qué columna de tu archivo contiene el nombre del componente padre.'
            : 'Cada tarea necesita pertenecer a una acción. Indica qué columna de tu archivo contiene el nombre de la acción padre.'}
        </p>
      </div>

      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <label className="block text-xs font-medium text-gray-700 mb-2">
          ¿Qué columna contiene el nombre del {etiquetaPadre} padre?
        </label>
        <select
          value={parentColumn}
          onChange={e => setParentColumn(e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm bg-white"
        >
          <option value="">— Seleccionar columna —</option>
          {headers.map((h, i) => (
            <option key={i} value={i}>
              {h || `Columna ${i + 1}`}
              {sampleRows[0]?.[i] ? ` (ej: ${String(sampleRows[0][i]).substring(0, 40)})` : ''}
            </option>
          ))}
        </select>
      </div>

      {parentColumn !== '' && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-3 py-2 border-b">
            <span className="text-xs font-medium text-gray-600">
              Valores encontrados en esa columna (muestra)
            </span>
          </div>
          <div className="p-3">
            <div className="flex flex-wrap gap-1.5">
              {(() => {
                const colIdx = parseInt(parentColumn);
                const unicos = new Set();
                for (const fila of (sampleRows || [])) {
                  const val = fila[colIdx];
                  if (val && String(val).trim()) unicos.add(String(val).trim());
                }
                const valores = [...unicos].slice(0, 15);
                if (valores.length === 0) {
                  return <span className="text-xs text-gray-400 italic">Sin valores en la muestra</span>;
                }
                return valores.map((v, i) => (
                  <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                    {v}
                  </span>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-xs text-amber-700 flex items-start gap-1.5">
          <Info size={12} className="text-amber-500 mt-0.5 flex-shrink-0" />
          <span>
            {esAccion
              ? 'Si el componente padre no existe en el proyecto, se creará automáticamente durante la importación.'
              : 'Si la acción padre no existe en el proyecto, se creará automáticamente durante la importación.'}
          </span>
        </p>
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={guardar}
          disabled={parentColumn === ''}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-md font-medium transition-colors ${
            parentColumn !== ''
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          Siguiente <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
