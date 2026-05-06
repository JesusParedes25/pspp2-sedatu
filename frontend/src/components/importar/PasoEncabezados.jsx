/**
 * ARCHIVO: PasoEncabezados.jsx
 * PROPÓSITO: Paso 1 del wizard — configurar fila de encabezados,
 *            super-encabezados y fila de inicio de datos.
 */
import { useState } from 'react';
import { Sparkles, ChevronRight } from 'lucide-react';

export default function PasoEncabezados({
  vistaPrevia,
  config,
  headers,
  superHeaders,
  sampleRows,
  totalDataRows,
  onCambiar,
  onAvanzar,
  sugerencia,
  onAplicarPlantilla,
}) {
  const [headerRow, setHeaderRow] = useState(config.headerRow || 1);
  const [superHeaderRow, setSuperHeaderRow] = useState(config.superHeaderRow || '');
  const [dataStartRow, setDataStartRow] = useState(config.dataStartRow || 2);

  const aplicar = () => {
    onCambiar(
      headerRow,
      superHeaderRow ? parseInt(superHeaderRow) : null,
      parseInt(dataStartRow)
    );
  };

  return (
    <div className="space-y-5">
      {/* Sugerencia de plantilla */}
      {sugerencia && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <Sparkles size={18} className="text-amber-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              Plantilla sugerida: <strong>{sugerencia.plantilla.nombre}</strong> ({sugerencia.score}% coincidencia)
            </p>
            <p className="text-xs text-amber-600 mt-0.5">{sugerencia.plantilla.descripcion}</p>
          </div>
          <button
            onClick={() => onAplicarPlantilla(sugerencia.plantilla)}
            className="px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-md hover:bg-amber-600"
          >
            Aplicar y saltar a Preview
          </button>
        </div>
      )}

      <h3 className="text-sm font-semibold text-gray-700">Configuración de filas</h3>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Fila de encabezados</label>
          <input
            type="number"
            min={1}
            value={headerRow}
            onChange={e => setHeaderRow(parseInt(e.target.value) || 1)}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-400 mt-0.5">Fila que contiene los nombres de columnas</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Fila de super-encabezados (opcional)</label>
          <input
            type="number"
            min={0}
            value={superHeaderRow}
            onChange={e => setSuperHeaderRow(e.target.value)}
            placeholder="Vacío = sin super-headers"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-400 mt-0.5">Para archivos con encabezados agrupados</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Fila de inicio de datos</label>
          <input
            type="number"
            min={1}
            value={dataStartRow}
            onChange={e => setDataStartRow(parseInt(e.target.value) || 2)}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
          <p className="text-xs text-gray-400 mt-0.5">Primera fila con datos reales</p>
        </div>
      </div>

      <button
        onClick={aplicar}
        className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200"
      >
        Actualizar vista previa
      </button>

      {/* Vista previa del archivo */}
      {vistaPrevia && vistaPrevia.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-3 py-2 border-b">
            <span className="text-xs font-medium text-gray-600">
              Vista previa del archivo ({totalDataRows} filas de datos)
            </span>
          </div>
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-xs">
              <tbody>
                {vistaPrevia.slice(0, 8).map((fila, i) => {
                  const esHeader = i + 1 === headerRow;
                  const esSuperHeader = superHeaderRow && i + 1 === parseInt(superHeaderRow);
                  return (
                    <tr
                      key={i}
                      className={`${
                        esHeader ? 'bg-blue-50 font-semibold' :
                        esSuperHeader ? 'bg-purple-50 font-semibold' : ''
                      }`}
                    >
                      <td className="px-2 py-1 text-gray-400 border-r bg-gray-50 w-8 text-center">
                        {i + 1}
                      </td>
                      {(fila || []).map((celda, j) => (
                        <td key={j} className="px-2 py-1 border-r whitespace-nowrap max-w-32 truncate">
                          {celda || ''}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Headers detectados */}
      {headers && headers.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1">Encabezados detectados ({headers.length} columnas):</p>
          <div className="flex flex-wrap gap-1">
            {headers.map((h, i) => (
              <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                {i}: {h || '(vacío)'}
              </span>
            ))}
          </div>
        </div>
      )}

      {superHeaders && (
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1">Super-encabezados:</p>
          <div className="flex flex-wrap gap-1">
            {superHeaders.map((h, i) => (
              <span key={i} className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs">
                {h || '—'}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          onClick={onAvanzar}
          disabled={!headers || headers.length === 0}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Siguiente <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
