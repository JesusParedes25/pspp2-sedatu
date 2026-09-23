/**
 * ARCHIVO: ModalEditarCategoriasIndicador.jsx
 * PROPÓSITO: Captura manual de valores por categoría de un indicador
 *            composicion='Categorias' — mismo cascarón visual que
 *            ModalEditarValorIndicador (encabezado/cuerpo/pie), pero con
 *            todas las categorías visibles y editables a la vez en vez
 *            de un selector de una a la vez. La lógica de estado/guardado
 *            vive en el hook compartido usarCapturaCategorias.
 */
import { X } from 'lucide-react';
import { useUI } from '../../context/UIContext';
import { usarCapturaCategorias } from '../../hooks/usarCapturaCategorias';
import ListaCategoriasEditable from './ListaCategoriasEditable';

export default function ModalEditarCategoriasIndicador({ indicador, onCerrar, onGuardado }) {
  const { mostrarToast } = useUI();
  const { categorias, sinCategorias, valores, cambiarValor, guardar, guardando, error } = usarCapturaCategorias(indicador);

  async function manejarGuardar() {
    const ok = await guardar();
    if (ok) {
      mostrarToast('Valores actualizados', 'exito');
      onGuardado?.();
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Registrar valores por categoría</h3>
          <button onClick={onCerrar} className="p-1 text-gray-400 hover:text-gray-700"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          <p className="text-xs text-gray-500">{indicador.nombre}</p>

          {sinCategorias ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              Este indicador todavía no tiene categorías definidas. Agrega al menos una en la definición del indicador antes de poder registrar valores.
            </p>
          ) : (
            <ListaCategoriasEditable
              indicador={indicador}
              categorias={categorias}
              valores={valores}
              onCambiarValor={cambiarValor}
            />
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          <button onClick={onCerrar} className="btn-secondary text-sm">Cancelar</button>
          <button onClick={manejarGuardar} disabled={guardando || sinCategorias} className="btn-primary text-sm disabled:opacity-40">
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
