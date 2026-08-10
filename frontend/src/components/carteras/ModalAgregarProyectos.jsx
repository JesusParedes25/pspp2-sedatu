/**
 * ARCHIVO: ModalAgregarProyectos.jsx
 * PROPÓSITO: Modal para agregar uno o varios proyectos existentes a una
 *            cartera, con búsqueda. Excluye los proyectos que ya
 *            pertenecen a la cartera (recibidos por el padre).
 */
import { useState, useEffect, useMemo } from 'react';
import { X, Loader2, Search, Briefcase } from 'lucide-react';
import * as proyectosApi from '../../api/proyectos';
import * as carterasApi from '../../api/carteras';
import { useUI } from '../../context/UIContext';

export default function ModalAgregarProyectos({ carteraId, idsExcluidos = [], onCerrar, onAgregados }) {
  const { mostrarToast } = useUI();
  const [busqueda, setBusqueda] = useState('');
  const [proyectos, setProyectos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [seleccionados, setSeleccionados] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const excluidosSet = useMemo(() => new Set(idsExcluidos), [idsExcluidos]);

  useEffect(() => {
    setCargando(true);
    const t = setTimeout(() => {
      proyectosApi.listarProyectos({ busqueda: busqueda || undefined, limite: 50 })
        .then(res => setProyectos(res.datos.proyectos.filter(p => !excluidosSet.has(p.id))))
        .catch(err => console.error('Error buscando proyectos:', err))
        .finally(() => setCargando(false));
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda, excluidosSet]);

  function alternar(id) {
    setSeleccionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function agregar() {
    if (!seleccionados.length) return;
    setGuardando(true);
    try {
      await carterasApi.agregarProyectosACartera(carteraId, seleccionados, seleccionados.length === 1);
      mostrarToast(`${seleccionados.length} proyecto(s) agregado(s) a la cartera`, 'exito');
      onAgregados?.();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'Error al agregar proyectos', 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" onClick={onCerrar}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Briefcase size={17} className="text-guinda-500" />
            <h2 className="text-sm font-bold text-gray-900">Agregar proyectos a la cartera</h2>
          </div>
          <button onClick={onCerrar} className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar proyecto por nombre..." className="input-base pl-8 text-sm" autoFocus />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-2 min-h-[200px]">
          {cargando ? (
            <div className="flex items-center justify-center py-8 text-gray-400 text-sm gap-2">
              <Loader2 size={14} className="animate-spin" /> Buscando...
            </div>
          ) : proyectos.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">Sin resultados</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {proyectos.map(p => (
                <label key={p.id} className="flex items-center gap-3 py-2 cursor-pointer">
                  <input type="checkbox" checked={seleccionados.includes(p.id)} onChange={() => alternar(p.id)}
                    className="rounded border-gray-300 text-guinda-500 focus:ring-guinda-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800 truncate">{p.nombre}</p>
                    <p className="text-[10px] text-gray-400">
                      {p.dg_lider_siglas}
                      {p.cartera_nombre ? ` · ya en "${p.cartera_nombre}"` : ''}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-gray-100 bg-gray-50 rounded-b-xl flex-shrink-0">
          <span className="text-xs text-gray-500">{seleccionados.length} seleccionado(s)</span>
          <div className="flex gap-2">
            <button onClick={onCerrar} className="px-3.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg">
              Cancelar
            </button>
            <button onClick={agregar} disabled={guardando || !seleccionados.length}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-guinda-500 text-white rounded-lg hover:bg-guinda-600 disabled:opacity-40 disabled:cursor-not-allowed">
              {guardando && <Loader2 size={12} className="animate-spin" />}
              Agregar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
