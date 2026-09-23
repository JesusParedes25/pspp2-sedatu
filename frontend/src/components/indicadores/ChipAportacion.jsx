/**
 * ARCHIVO: ChipAportacion.jsx
 * PROPÓSITO: Chip expandible para una aportación (nodo ↔ indicador) —
 *            editar modo/valor, desvincular, con la explicación de qué
 *            hace cada modo. Extraído de TabIndicadores.jsx (donde cada
 *            chip lista un INDICADOR que aporta a un nodo fijo) para
 *            reusarlo también en el detalle de un indicador (donde cada
 *            chip lista un NODO que aporta a un indicador fijo) — mismo
 *            componente, cambia solo qué texto va como título principal
 *            vía `etiquetaPrincipal`/`subtitulo`, para que la lógica de
 *            editar/guardar/desvincular no viva duplicada en dos sitios
 *            y termine divergiendo.
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, Trash2, Loader2 } from 'lucide-react';
import * as indicadoresApi from '../../api/indicadores';

export const MODOS_APORTACION = [
  { valor: 'al_concluir', etiqueta: 'Manual', ayuda: 'Tú escribes el número. Cuenta cuando esto se complete.' },
  { valor: 'proporcional', etiqueta: 'Automático', ayuda: 'Se calcula solo, proporcional a su avance.' },
];

export default function ChipAportacion({ ap, etiquetaPrincipal, subtitulo, soloLectura, onActualizado, mostrarToast, categorias }) {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState(ap.modo);
  const [valor, setValor] = useState(ap.aportacion ?? '');
  const [idCategoria, setIdCategoria] = useState(ap.id_categoria || '');
  const [guardando, setGuardando] = useState(false);

  const modoInfo = MODOS_APORTACION.find(m => m.valor === ap.modo) || MODOS_APORTACION[0];
  const esPorCategorias = !!categorias;

  async function guardar() {
    setGuardando(true);
    try {
      await indicadoresApi.actualizarAportacion(ap.id, {
        modo,
        valor_aportacion: valor === '' ? 0 : parseFloat(valor),
        ...(esPorCategorias ? { id_categoria: idCategoria || null } : {}),
      });
      mostrarToast('Aportación actualizada', 'exito');
      onActualizado();
    } catch (e) {
      mostrarToast(e.response?.data?.mensaje || 'Error al actualizar', 'error');
    } finally {
      setGuardando(false);
    }
  }

  async function desvincular() {
    setGuardando(true);
    try {
      await indicadoresApi.eliminarAportacion(ap.id);
      mostrarToast('Desvinculado', 'exito');
      onActualizado();
    } catch (e) {
      mostrarToast(e.response?.data?.mensaje || 'Error al desvincular', 'error');
      setGuardando(false);
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="min-w-0">
          <span className="text-sm text-gray-800 truncate block">{etiquetaPrincipal}</span>
          {subtitulo && <span className="text-[10px] text-gray-400 truncate block">{subtitulo}</span>}
        </span>
        <span className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] text-gray-400">{modoInfo.etiqueta}</span>
          {abierto ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />}
        </span>
      </button>
      {abierto && (
        <div className="px-3 pb-3 pt-1 border-t border-gray-100 space-y-2">
          <div className="flex gap-1.5">
            {MODOS_APORTACION.map(m => (
              <button
                key={m.valor}
                type="button"
                disabled={soloLectura}
                onClick={() => setModo(m.valor)}
                className={`flex-1 text-left px-2.5 py-1.5 rounded-md border text-xs transition-colors ${
                  modo === m.valor ? 'border-guinda-300 bg-guinda-50/50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span className="font-medium text-gray-800 block">{m.etiqueta}</span>
                <span className="text-[10px] text-gray-500 leading-snug">{m.ayuda}</span>
              </button>
            ))}
          </div>
          {esPorCategorias && (
            <select
              value={idCategoria}
              onChange={e => setIdCategoria(e.target.value)}
              disabled={soloLectura}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:border-guinda-500 focus:ring-1 focus:ring-guinda-500/20 outline-none disabled:opacity-60"
            >
              <option value="">— sin categoría —</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          )}
          <div className="flex items-center gap-2">
            <input
              type="number" step="any" min="0"
              value={valor}
              onChange={e => setValor(e.target.value)}
              disabled={soloLectura}
              className="w-24 text-xs border border-gray-300 rounded px-2 py-1 focus:border-guinda-500 focus:ring-1 focus:ring-guinda-500/20 outline-none disabled:opacity-60"
            />
            {!soloLectura && (
              <>
                <button
                  onClick={guardar}
                  disabled={guardando || (modo === ap.modo && Number(valor) === Number(ap.aportacion) && idCategoria === (ap.id_categoria || ''))}
                  className="text-xs font-medium text-guinda-700 hover:underline disabled:opacity-40 disabled:no-underline"
                >
                  Guardar
                </button>
                <button
                  onClick={desvincular}
                  disabled={guardando}
                  className="ml-auto text-gray-400 hover:text-red-500 transition-colors p-0.5 rounded"
                  title="Desvincular"
                >
                  {guardando ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
