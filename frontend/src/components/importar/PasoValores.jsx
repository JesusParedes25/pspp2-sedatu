/**
 * ARCHIVO: PasoValores.jsx
 * PROPÓSITO: Paso 4 del wizard — mapeo de valores (ej: "Concluido" → "Completada").
 */
import { useState, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';

const ESTADOS_PSPP = ['Pendiente', 'En_proceso', 'Bloqueada', 'Completada', 'Cancelada'];

export default function PasoValores({ config, headers, sampleRows, onCambiar, onAvanzar }) {
  const [valueMap, setValueMap] = useState(config.valueMap || {});

  // Detectar valores únicos de columnas mapeadas como "estado"
  const valoresEstado = useMemo(() => {
    const colsEstado = [];
    // Del columnMap
    if (config.columnMap) {
      for (const [colIdx, campo] of Object.entries(config.columnMap)) {
        if (campo === 'estado') colsEstado.push(parseInt(colIdx));
      }
    }
    // De los pivotBlocks
    if (config.pivotBlocks) {
      for (const block of config.pivotBlocks) {
        if (block.fieldMap) {
          for (const [colIdx, campo] of Object.entries(block.fieldMap)) {
            if (campo === 'estado') colsEstado.push(parseInt(colIdx));
          }
        }
      }
    }

    // Extraer valores únicos de esas columnas
    const unicos = new Set();
    for (const fila of sampleRows || []) {
      for (const col of colsEstado) {
        const val = fila[col];
        if (val && String(val).trim()) unicos.add(String(val).trim());
      }
    }
    return [...unicos].sort();
  }, [config.columnMap, config.pivotBlocks, sampleRows]);

  const actualizarMapeoEstado = (valorOriginal, valorPSPP) => {
    const nuevo = {
      ...valueMap,
      estado: {
        ...(valueMap.estado || {}),
        [valorOriginal]: valorPSPP,
      },
    };
    setValueMap(nuevo);
  };

  const guardar = () => {
    onCambiar({ valueMap });
    onAvanzar();
  };

  // Si no hay columnas de estado mapeadas, saltar este paso
  const tieneCamposEstado = valoresEstado.length > 0;

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold text-gray-700">Mapeo de valores</h3>

      {!tieneCamposEstado ? (
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">
            No se detectaron columnas de estado mapeadas. Puedes saltar este paso.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Si necesitas mapear valores, primero asigna alguna columna al campo "Estado" en el paso de Mapeo.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-500">
            Los valores del archivo no siempre coinciden con los del sistema. Mapea cada valor encontrado al estado PSPP correspondiente.
          </p>

          <div className="border rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-3 py-2 border-b">
              <span className="text-xs font-medium text-gray-600">
                Valores de Estado encontrados ({valoresEstado.length})
              </span>
            </div>
            <div className="p-3 space-y-2">
              {valoresEstado.map(val => (
                <div key={val} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 w-48 truncate font-mono bg-gray-50 px-2 py-1 rounded">
                    {val}
                  </span>
                  <span className="text-gray-400 text-xs">→</span>
                  <select
                    value={valueMap.estado?.[val] || ''}
                    onChange={e => actualizarMapeoEstado(val, e.target.value)}
                    className="border rounded px-2 py-1 text-sm flex-1"
                  >
                    <option value="">— Sin mapeo (usar tal cual) —</option>
                    {ESTADOS_PSPP.map(e => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Preview del mapeo actual */}
          {Object.keys(valueMap.estado || {}).length > 0 && (
            <div className="text-xs text-gray-500">
              <strong>Mapeo actual:</strong>{' '}
              {Object.entries(valueMap.estado || {}).map(([k, v]) => `"${k}" → ${v}`).join(', ')}
            </div>
          )}
        </>
      )}

      <div className="flex justify-end pt-2">
        <button
          onClick={guardar}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
        >
          {tieneCamposEstado ? 'Siguiente' : 'Saltar y continuar'} <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
