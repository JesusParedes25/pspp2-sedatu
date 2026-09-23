/**
 * ARCHIVO: ListaCategoriasEditable.jsx
 * PROPÓSITO: Filas editables de valor por categoría de un indicador
 *            composicion='Categorias'. Presentacional y controlado — no
 *            guarda nada por sí mismo, ni tiene botón propio; el llamador
 *            (modal o sección de detalle) decide cuándo guardar. A
 *            diferencia del selector de periodo (una lista potencialmente
 *            larga, se elige una a la vez), aquí la lista es corta y fija
 *            — se muestran todas las filas a la vez.
 *
 * Una categoría con aportaciones de nodo (`categoriasConAportacion`) se
 * calcula sola — mismo criterio que ya aplica a "Valor actual" del
 * indicador completo cuando tiene nodos vinculados. El backend ya lo
 * rechaza con 409; aquí se oculta el input para no mostrar como
 * editable algo que el servidor de todos modos va a rechazar.
 */
import { AlertTriangle } from 'lucide-react';
import { formatearMoneda } from '../../utils/formatoMoneda';
import { excedeMeta } from '../../utils/estadoMeta';

export default function ListaCategoriasEditable({ indicador, categorias, valores, onCambiarValor, categoriasConAportacion = new Set() }) {
  const esMoneda = indicador.unidad === 'Moneda_MXN';

  return (
    <div className="space-y-3">
      {categorias.map(cat => {
        const calculada = categoriasConAportacion.has(cat.id);
        const valorActual = calculada ? cat.valor_actual : valores[cat.id];
        const excede = excedeMeta(valorActual, cat.meta);
        return (
          <div key={cat.id}>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{cat.nombre}</label>
            {calculada ? (
              <div className="w-full py-2 px-3 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-600">
                {esMoneda ? formatearMoneda(cat.valor_actual || 0) : (cat.valor_actual || 0)}
                <span className="block text-[10px] text-gray-400 mt-0.5">Se calcula desde los nodos vinculados</span>
              </div>
            ) : (
              <div className="relative">
                {esMoneda && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>}
                <input
                  type="number" step="any"
                  value={valores[cat.id] ?? ''}
                  onChange={e => onCambiarValor(cat.id, e.target.value)}
                  className={`w-full py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400 ${esMoneda ? 'pl-6 pr-3' : 'px-3'}`}
                />
              </div>
            )}
            {parseFloat(cat.meta) > 0 && (
              <p className={`text-[10px] mt-1 flex items-center gap-1 ${excede ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                {excede && <AlertTriangle size={10} className="flex-shrink-0" />}
                Meta: {esMoneda ? formatearMoneda(cat.meta) : cat.meta}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
