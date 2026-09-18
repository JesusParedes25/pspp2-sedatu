/**
 * ARCHIVO: FiltroTablero.jsx
 * PROPÓSITO: Filtro del Tablero por uno/varios proyectos o por una
 *            cartera — acota "Mis proyectos" y el resto de los widgets
 *            de Inicio.jsx (indicadores, vencidas, riesgos, por vencer,
 *            actividad, incidencia territorial) a la selección. Las
 *            opciones ya llegan acotadas por rol desde el backend
 *            (GET /inicio/filtros/proyectos y /carteras): un usuario
 *            normal solo ve donde participa, superadmin/ejecutivo ven
 *            todo — este componente no repite esa lógica, solo la
 *            presenta.
 *
 * `filtro`: { proyectoIds: string[], carteraId: string|null } — los dos
 * modos son mutuamente excluyentes, elegir uno limpia el otro.
 */
import { useState, useRef, useEffect } from 'react';
import { Filter, ChevronDown, X, Check } from 'lucide-react';

export default function FiltroTablero({ filtro, onCambiar, proyectos, carteras, cargando }) {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState(filtro.carteraId ? 'cartera' : 'proyectos');
  const ref = useRef(null);

  useEffect(() => {
    function onClickFuera(e) { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); }
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, []);

  const hayFiltro = filtro.carteraId || filtro.proyectoIds.length > 0;

  let etiqueta = 'Todos mis proyectos';
  if (filtro.carteraId) {
    etiqueta = `Cartera: ${carteras.find(c => c.id === filtro.carteraId)?.nombre || '…'}`;
  } else if (filtro.proyectoIds.length === 1) {
    etiqueta = proyectos.find(p => p.id === filtro.proyectoIds[0])?.nombre || '1 proyecto';
  } else if (filtro.proyectoIds.length > 1) {
    etiqueta = `${filtro.proyectoIds.length} proyectos`;
  }

  function toggleProyecto(id) {
    const yaElegido = filtro.proyectoIds.includes(id);
    onCambiar({
      carteraId: null,
      proyectoIds: yaElegido ? filtro.proyectoIds.filter(x => x !== id) : [...filtro.proyectoIds, id],
    });
  }

  function elegirCartera(id) {
    onCambiar({ carteraId: filtro.carteraId === id ? null : id, proyectoIds: [] });
  }

  function limpiar() {
    onCambiar({ carteraId: null, proyectoIds: [] });
    setAbierto(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors max-w-[280px] ${
          hayFiltro ? 'bg-guinda-50 border-guinda-300 text-guinda-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
      >
        <Filter size={14} className="flex-shrink-0" />
        <span className="truncate">{etiqueta}</span>
        <ChevronDown size={14} className="flex-shrink-0 opacity-60" />
      </button>

      {abierto && (
        <div className="absolute z-20 top-full mt-1.5 right-0 w-80 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="flex gap-1 p-2 border-b border-gray-100 bg-gray-50">
            {[['proyectos', 'Proyecto(s)'], ['cartera', 'Cartera']].map(([id, lbl]) => (
              <button
                key={id}
                onClick={() => setModo(id)}
                className={`flex-1 text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
                  modo === id ? 'bg-white text-guinda-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {cargando && <div className="px-4 py-3 text-xs text-gray-400">Cargando…</div>}

            {!cargando && modo === 'proyectos' && (
              proyectos.length === 0
                ? <div className="px-4 py-3 text-xs text-gray-400">No participas en ningún proyecto.</div>
                : proyectos.map(p => (
                  <label key={p.id} className="flex items-center gap-2.5 px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filtro.proyectoIds.includes(p.id)}
                      onChange={() => toggleProyecto(p.id)}
                      className="accent-guinda-600 flex-shrink-0"
                    />
                    <span className="truncate">{p.nombre}</span>
                  </label>
                ))
            )}

            {!cargando && modo === 'cartera' && (
              carteras.length === 0
                ? <div className="px-4 py-3 text-xs text-gray-400">No hay carteras con proyectos tuyos.</div>
                : carteras.map(c => (
                  <button
                    key={c.id}
                    onClick={() => elegirCartera(c.id)}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-left text-gray-700 hover:bg-gray-50"
                  >
                    <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                      filtro.carteraId === c.id ? 'bg-guinda-600 border-guinda-600' : 'border-gray-300'
                    }`}>
                      {filtro.carteraId === c.id && <Check size={9} className="text-white" />}
                    </span>
                    <span className="truncate">{c.nombre}</span>
                  </button>
                ))
            )}
          </div>

          {hayFiltro && (
            <div className="p-2 border-t border-gray-100">
              <button onClick={limpiar} className="flex items-center gap-1 text-[11px] font-medium text-guinda-600 hover:text-guinda-800 px-2 py-1">
                <X size={11} /> Limpiar filtro
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
