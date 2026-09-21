/**
 * ARCHIVO: ModalEditarValorIndicador.jsx
 * PROPÓSITO: Captura manual del valor de un indicador modo_calculo='manual'.
 *            Antes era imposible por completo — el modo existía en la
 *            base de datos pero ningún endpoint ni pantalla lo exponía.
 *
 * Si el indicador es de temporalidad 'Anual' (el caso típico: un
 * indicador financiero con corte por ejercicio fiscal), primero pide el
 * año — y precarga el valor ya capturado de ese año si existe, para no
 * pisar un dato real por error. `indicadores.valor_actual` termina
 * siendo la suma de todos los años (rollup, ya resuelto en el backend);
 * aquí solo se captura un año a la vez.
 */
import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import * as indicadoresApi from '../../api/indicadores';
import { useUI } from '../../context/UIContext';
import { formatearMoneda } from '../../utils/formatoMoneda';

export default function ModalEditarValorIndicador({ indicador, onCerrar, onGuardado }) {
  const { mostrarToast } = useUI();
  const esAnual = indicador.temporalidad === 'Anual';
  const esMoneda = indicador.unidad === 'Moneda_MXN';

  const metasPorAnio = useMemo(() => {
    const mapa = {};
    for (const m of (indicador.metas_anuales || [])) mapa[m.anio] = m;
    return mapa;
  }, [indicador.metas_anuales]);

  const aniosDisponibles = useMemo(() => {
    if (!esAnual) return [];
    const anioActual = new Date().getFullYear();
    const set = new Set(Object.keys(metasPorAnio).map(Number));
    const inicio = indicador.anio_inicio || anioActual;
    const fin = indicador.anio_fin || anioActual;
    for (let a = inicio; a <= fin; a++) set.add(a);
    set.add(anioActual);
    return [...set].sort((a, b) => a - b);
  }, [esAnual, metasPorAnio, indicador.anio_inicio, indicador.anio_fin]);

  const [anio, setAnio] = useState(aniosDisponibles[aniosDisponibles.length - 1] || new Date().getFullYear());
  const valorInicial = esAnual
    ? (metasPorAnio[anio]?.valor_actual ?? '')
    : (indicador.valor_actual ?? '');
  const [valor, setValor] = useState(valorInicial != null ? String(valorInicial) : '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  function cambiarAnio(nuevoAnio) {
    setAnio(nuevoAnio);
    const existente = metasPorAnio[nuevoAnio]?.valor_actual;
    setValor(existente != null ? String(existente) : '');
  }

  async function guardar() {
    if (valor === '' || isNaN(parseFloat(valor))) {
      setError('Escribe un número válido.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      await indicadoresApi.establecerValorIndicador(indicador.id, {
        valor: parseFloat(valor),
        anio: esAnual ? anio : undefined,
      });
      mostrarToast('Valor actualizado', 'exito');
      onGuardado?.();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo guardar el valor.');
    } finally {
      setGuardando(false);
    }
  }

  const metaDelAnio = esAnual ? metasPorAnio[anio]?.meta : indicador.meta_global;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Registrar valor</h3>
          <button onClick={onCerrar} className="p-1 text-gray-400 hover:text-gray-700"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-gray-500">{indicador.nombre}</p>

          {esAnual && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Año</label>
              <select
                value={anio}
                onChange={e => cambiarAnio(parseInt(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400"
              >
                {aniosDisponibles.map(a => (
                  <option key={a} value={a}>
                    {a}{metasPorAnio[a] ? ` — ya capturado: ${esMoneda ? formatearMoneda(metasPorAnio[a].valor_actual) : metasPorAnio[a].valor_actual}` : ''}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-gray-400 mt-1">
                Confirma el año antes de guardar — cada año se captura por separado.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              {esAnual ? `Valor ${anio}` : 'Valor'}
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
            {metaDelAnio > 0 && (
              <p className="text-[10px] text-gray-400 mt-1">
                Meta{esAnual ? ` ${anio}` : ''}: {esMoneda ? formatearMoneda(metaDelAnio) : metaDelAnio}
              </p>
            )}
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button onClick={onCerrar} className="btn-secondary text-sm">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="btn-primary text-sm disabled:opacity-40">
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
