/**
 * ARCHIVO: ModalRegistrarMovimiento.jsx
 * PROPÓSITO: Registrar a mano un movimiento del historial de un
 *            indicador (migración 084) — reemplaza la vieja captura
 *            directa de "valor_actual". Se usa desde dos lugares: la
 *            pestaña Indicadores de un nodo en Seguimiento > Detalle
 *            (Bloque 4 del encargo — aquí `idNodoOrigen` viaja, para que
 *            el historial diga de qué nodo vino) y la ficha del
 *            indicador (Bloque 6 — sin nodo, captura suelta).
 *
 * A diferencia de "Registrar valor" (que pide el TOTAL que debe quedar y
 * calcula la diferencia), aquí se pide la cantidad a SUMAR directamente
 * — tiene sentido cuando quien captura ya sabe "esto avanzó X", no
 * "esto ya llegó a X". Puede ser negativa (una corrección).
 */
import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import * as indicadoresApi from '../../api/indicadores';

export default function ModalRegistrarMovimiento({ indicadorId, indicadorNombre, idNodoOrigen, onCerrar, onRegistrado }) {
  const [cantidad, setCantidad] = useState('');
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function guardar() {
    const num = parseFloat(cantidad);
    if (cantidad === '' || isNaN(num) || num === 0) {
      setError('Escribe una cantidad distinta de cero.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      await indicadoresApi.crearMovimientoIndicador(indicadorId, {
        cantidad: num, fecha, nota: nota.trim() || null, idNodoOrigen,
      });
      onRegistrado?.();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo registrar el movimiento.');
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Registrar movimiento</h3>
          <button onClick={onCerrar} className="p-1 text-gray-400 hover:text-gray-700"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-gray-500 truncate">{indicadorNombre}</p>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Cuánto avanzó</label>
            <input
              type="number" step="any" autoFocus
              value={cantidad}
              onChange={e => setCantidad(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              La cantidad que se suma al total, no el total en sí. Negativa para corregir algo capturado de más.
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Nota <span className="font-normal text-gray-400">(opcional)</span>
            </label>
            <input
              value={nota}
              onChange={e => setNota(e.target.value)}
              placeholder="De dónde sale este número"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400"
            />
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button onClick={onCerrar} className="btn-secondary text-sm">Cancelar</button>
          <button onClick={guardar} disabled={guardando} className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-40">
            {guardando && <Loader2 size={14} className="animate-spin" />} Registrar
          </button>
        </div>
      </div>
    </div>
  );
}
