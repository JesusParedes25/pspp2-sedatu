/**
 * ARCHIVO: ModalEditarValorIndicador.jsx
 * PROPÓSITO: Captura manual del valor de un indicador modo_calculo='manual'.
 *            Antes era imposible por completo — el modo existía en la
 *            base de datos pero ningún endpoint ni pantalla lo exponía.
 *
 * Si el indicador es de temporalidad 'Anual' (el caso típico: un
 * indicador financiero con corte por periodos), primero pide cuál
 * periodo — y precarga el valor ya capturado de ese periodo si existe,
 * para no pisar un dato real por error. `indicadores.valor_actual`
 * termina siendo la suma de todos los periodos (rollup, resuelto en el
 * backend); aquí solo se captura uno a la vez. La lógica de selección de
 * periodo y guardado vive en el hook compartido `usarCapturaValorIndicador`
 * (reusado también por la pantalla de detalle del indicador).
 */
import { X } from 'lucide-react';
import { useUI } from '../../context/UIContext';
import { formatearMoneda } from '../../utils/formatoMoneda';
import { usarCapturaValorIndicador } from '../../hooks/usarCapturaValorIndicador';

export default function ModalEditarValorIndicador({ indicador, onCerrar, onGuardado }) {
  const { mostrarToast } = useUI();
  const esMoneda = indicador.unidad === 'Moneda_MXN';
  const {
    mostrarSelectorPeriodo, sinPeriodos, periodos,
    idPeriodo, cambiarPeriodo, periodoActual,
    valor, setValor, guardando, error, guardar, metaActual,
  } = usarCapturaValorIndicador(indicador);

  async function manejarGuardar() {
    const ok = await guardar();
    if (ok) {
      mostrarToast('Valor actualizado', 'exito');
      onGuardado?.();
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Registrar valor</h3>
          <button onClick={onCerrar} className="p-1 text-gray-400 hover:text-gray-700"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-gray-500">{indicador.nombre}</p>

          {sinPeriodos ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              Este indicador todavía no tiene ningún periodo definido. Agrega uno primero en la definición del indicador (meta por ejercicio/sexenio/periodo personalizado) antes de poder registrar un valor.
            </p>
          ) : (
            <>
              {mostrarSelectorPeriodo && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Periodo</label>
                  <select
                    value={idPeriodo || ''}
                    onChange={e => cambiarPeriodo(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400"
                  >
                    {periodos.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.etiqueta || p.anio}{p.valor_actual != null ? ` — ya capturado: ${esMoneda ? formatearMoneda(p.valor_actual) : p.valor_actual}` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-400 mt-1">
                    Confirma el periodo antes de guardar — cada uno se captura por separado.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {mostrarSelectorPeriodo ? `Valor ${periodoActual?.etiqueta || periodoActual?.anio || ''}` : 'Valor'}
                </label>
                <div className="relative">
                  {esMoneda && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>}
                  <input
                    type="number" step="any" autoFocus
                    value={valor}
                    onChange={e => setValor(e.target.value)}
                    className={`w-full py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400 ${esMoneda ? 'pl-6 pr-3' : 'px-3'}`}
                  />
                </div>
                {metaActual > 0 && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    Meta{mostrarSelectorPeriodo ? ` ${periodoActual?.etiqueta || periodoActual?.anio || ''}` : ''}: {esMoneda ? formatearMoneda(metaActual) : metaActual}
                  </p>
                )}
              </div>
            </>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button onClick={onCerrar} className="btn-secondary text-sm">Cancelar</button>
          <button onClick={manejarGuardar} disabled={guardando || sinPeriodos} className="btn-primary text-sm disabled:opacity-40">
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
