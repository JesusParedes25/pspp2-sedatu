/**
 * ARCHIVO: EtiquetaMultiSelect.jsx
 * PROPÓSITO: Filtro de etiqueta para el listado de Proyectos — lista
 *            desplegable con varias etiquetas seleccionables a la vez
 *            (busca proyectos que tengan ALGUNA de las elegidas). A
 *            diferencia de EtiquetaFiltroInput (una sola etiqueta, usado
 *            en Territorio y Documentos), este es multi-selección con
 *            checkboxes, con las opciones cargadas de una vez al abrir en
 *            vez de solo aparecer mientras se escribe.
 *
 * valores: array de strings (etiquetas activas). onCambio: (array) => void.
 */
import { useState, useRef, useEffect } from 'react';
import { Tag, ChevronDown, X, Search } from 'lucide-react';
import * as etiquetasApi from '../../api/etiquetas';

export default function EtiquetaMultiSelect({ valores = [], onCambio, className = '' }) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [opciones, setOpciones] = useState([]);
  const [cargando, setCargando] = useState(false);
  const refContenedor = useRef(null);
  const refDebounce = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    clearTimeout(refDebounce.current);
    refDebounce.current = setTimeout(() => {
      setCargando(true);
      etiquetasApi.buscarEtiquetas(busqueda, 50)
        .then(res => setOpciones(res.datos || []))
        .catch(() => setOpciones([]))
        .finally(() => setCargando(false));
    }, 250);
    return () => clearTimeout(refDebounce.current);
  }, [abierto, busqueda]);

  useEffect(() => {
    function onClickFuera(e) {
      if (refContenedor.current && !refContenedor.current.contains(e.target)) setAbierto(false);
    }
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, []);

  function toggle(nombre) {
    onCambio(valores.includes(nombre) ? valores.filter(v => v !== nombre) : [...valores, nombre]);
  }

  // Unión de lo ya elegido (aunque no matchee la búsqueda actual, para no
  // "perder de vista" una selección al filtrar el panel) + lo que sí
  // matchea.
  const listaCompleta = [...new Set([...valores, ...opciones])];

  return (
    <div className={`relative ${className}`} ref={refContenedor}>
      <button type="button" onClick={() => setAbierto(v => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors w-full justify-between ${
          valores.length > 0 ? 'bg-guinda-50 border-guinda-300 text-guinda-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50 bg-white'
        }`}>
        <span className="flex items-center gap-1.5 truncate">
          <Tag size={12} className="flex-shrink-0" />
          {valores.length === 0 ? 'Todas las etiquetas' : `${valores.length} etiqueta${valores.length !== 1 ? 's' : ''}`}
        </span>
        <ChevronDown size={12} className="flex-shrink-0" />
      </button>

      {abierto && (
        <div className="absolute z-[1100] top-full mt-1 left-0 w-64 bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar etiqueta..." autoFocus
                className="w-full pl-6 pr-2 py-1 text-xs border border-gray-200 rounded outline-none focus:border-guinda-400"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {cargando && <div className="px-3 py-2 text-[11px] text-gray-400">Buscando…</div>}
            {!cargando && listaCompleta.length === 0 && (
              <div className="px-3 py-2 text-[11px] text-gray-400">Sin etiquetas</div>
            )}
            {!cargando && listaCompleta.map(nombre => (
              <label key={nombre} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={valores.includes(nombre)} onChange={() => toggle(nombre)}
                  className="accent-guinda-600 flex-shrink-0" />
                <span className="truncate">{nombre}</span>
              </label>
            ))}
          </div>
          {valores.length > 0 && (
            <div className="p-2 border-t border-gray-100">
              <button type="button" onClick={() => onCambio([])}
                className="text-[11px] text-guinda-600 hover:text-guinda-800 font-medium">
                Limpiar selección
              </button>
            </div>
          )}
        </div>
      )}

      {valores.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {valores.map(v => (
            <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 bg-guinda-50 text-guinda-700 text-[11px] rounded-full">
              {v}
              <button type="button" onClick={() => toggle(v)} className="hover:text-guinda-900 leading-none">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
