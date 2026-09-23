/**
 * ARCHIVO: ListaCategoriasEditable.jsx
 * PROPÓSITO: Filas editables de valor por categoría de un indicador
 *            composicion='Categorias'. Presentacional y controlado — no
 *            guarda nada por sí mismo, ni tiene botón propio; el llamador
 *            (modal o sección de detalle) decide cuándo guardar. A
 *            diferencia del selector de periodo (una lista potencialmente
 *            larga, se elige una a la vez), aquí la lista es corta y fija
 *            — se muestran todas las filas a la vez.
 */
import { formatearMoneda } from '../../utils/formatoMoneda';

export default function ListaCategoriasEditable({ indicador, categorias, valores, onCambiarValor }) {
  const esMoneda = indicador.unidad === 'Moneda_MXN';

  return (
    <div className="space-y-3">
      {categorias.map(cat => (
        <div key={cat.id}>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{cat.nombre}</label>
          <div className="relative">
            {esMoneda && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>}
            <input
              type="number" step="any"
              value={valores[cat.id] ?? ''}
              onChange={e => onCambiarValor(cat.id, e.target.value)}
              className={`w-full py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400 ${esMoneda ? 'pl-6 pr-3' : 'px-3'}`}
            />
          </div>
          {parseFloat(cat.meta) > 0 && (
            <p className="text-[10px] text-gray-400 mt-1">
              Meta: {esMoneda ? formatearMoneda(cat.meta) : cat.meta}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
