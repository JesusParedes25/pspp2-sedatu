/**
 * ARCHIVO: PasoMapeo.jsx
 * PROPÓSITO: Paso 3 del wizard — mapear columnas a campos PSPP y configurar pivot blocks.
 */
import { useState } from 'react';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';
import PivotBlockEditor from './PivotBlockEditor';

const CAMPOS_PSPP = [
  { value: '', label: '— No mapear —' },
  { value: 'nombre', label: 'Nombre' },
  { value: 'descripcion', label: 'Descripción' },
  { value: 'clave', label: 'Clave' },
  { value: 'fecha_inicio', label: 'Fecha inicio' },
  { value: 'fecha_fin', label: 'Fecha fin' },
  { value: 'responsable', label: 'Responsable' },
  { value: 'entregable', label: 'Entregable' },
  { value: 'estado', label: 'Estado' },
  { value: 'peso', label: 'Peso' },
  { value: 'orden', label: 'Orden' },
  { value: 'dependencia_externa', label: 'Dependencia externa' },
];

export default function PasoMapeo({ headers, superHeaders, sampleRows, config, onCambiar, onAvanzar }) {
  const [columnMap, setColumnMap] = useState(config.columnMap || {});
  const [pivotBlocks, setPivotBlocks] = useState(config.pivotBlocks || []);
  const [mostrarPivots, setMostrarPivots] = useState((config.pivotBlocks || []).length > 0);

  // Columnas ya usadas (en columnMap o pivotBlocks)
  const columnasUsadas = new Set([
    ...Object.keys(columnMap).map(Number),
    ...pivotBlocks.flatMap(b => b.columns || []),
  ]);

  const actualizarMapeo = (colIdx, campo) => {
    const nuevo = { ...columnMap };
    if (campo === '') {
      delete nuevo[colIdx];
    } else {
      nuevo[colIdx] = campo;
    }
    setColumnMap(nuevo);
  };

  const guardar = () => {
    onCambiar({ columnMap, pivotBlocks });
    onAvanzar();
  };

  const agregarPivotBlock = () => {
    setPivotBlocks([...pivotBlocks, {
      name: `Bloque ${pivotBlocks.length + 1}`,
      columns: [],
      fieldMap: {},
      createsLevel: 'accion',
    }]);
  };

  const actualizarPivotBlock = (idx, block) => {
    const copia = [...pivotBlocks];
    copia[idx] = block;
    setPivotBlocks(copia);
  };

  const eliminarPivotBlock = (idx) => {
    setPivotBlocks(pivotBlocks.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold text-gray-700">Mapeo de columnas</h3>
      <p className="text-xs text-gray-500">
        Asigna cada columna del archivo a un campo del sistema. Las columnas no mapeadas se ignoran.
      </p>

      {/* Mapeo directo columna → campo */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-3 py-2 border-b">
          <span className="text-xs font-medium text-gray-600">Columnas del archivo</span>
        </div>
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium text-gray-500 w-8">#</th>
                <th className="px-3 py-1.5 text-left font-medium text-gray-500">Encabezado</th>
                {superHeaders && (
                  <th className="px-3 py-1.5 text-left font-medium text-gray-500">Super-header</th>
                )}
                <th className="px-3 py-1.5 text-left font-medium text-gray-500">Ejemplo</th>
                <th className="px-3 py-1.5 text-left font-medium text-gray-500 w-48">Campo PSPP</th>
              </tr>
            </thead>
            <tbody>
              {headers.map((h, i) => {
                const enPivot = pivotBlocks.some(b => (b.columns || []).includes(i));
                return (
                  <tr key={i} className={`border-t ${enPivot ? 'bg-orange-50 opacity-60' : ''}`}>
                    <td className="px-3 py-1.5 text-gray-400">{i}</td>
                    <td className="px-3 py-1.5 font-medium">{h || '(vacío)'}</td>
                    {superHeaders && (
                      <td className="px-3 py-1.5 text-purple-600">{superHeaders[i] || '—'}</td>
                    )}
                    <td className="px-3 py-1.5 text-gray-500 max-w-32 truncate">
                      {sampleRows[0]?.[i] || '—'}
                    </td>
                    <td className="px-3 py-1.5">
                      {enPivot ? (
                        <span className="text-xs text-orange-600 italic">En pivot block</span>
                      ) : (
                        <select
                          value={columnMap[i] || ''}
                          onChange={e => actualizarMapeo(i, e.target.value)}
                          className="w-full border rounded px-2 py-1 text-xs"
                        >
                          {CAMPOS_PSPP.map(c => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pivot blocks */}
      <div className="border rounded-lg p-4 bg-gray-50">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={mostrarPivots}
            onChange={e => setMostrarPivots(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-sm font-medium text-gray-700">Usar bloques pivotados (columnas agrupadas = acciones)</span>
        </label>
        <p className="text-xs text-gray-500 mt-1 ml-6">
          Para archivos donde un grupo de columnas representa una acción (ej: Estado, Fecha inicio, Fecha fin de cada fase).
        </p>

        {mostrarPivots && (
          <div className="mt-4 ml-2 space-y-3">
            {pivotBlocks.map((block, idx) => (
              <PivotBlockEditor
                key={idx}
                block={block}
                index={idx}
                headers={headers}
                superHeaders={superHeaders}
                onChange={(b) => actualizarPivotBlock(idx, b)}
                onDelete={() => eliminarPivotBlock(idx)}
              />
            ))}
            <button
              onClick={agregarPivotBlock}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-md hover:bg-blue-50"
            >
              <Plus size={12} /> Agregar bloque pivotado
            </button>
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
