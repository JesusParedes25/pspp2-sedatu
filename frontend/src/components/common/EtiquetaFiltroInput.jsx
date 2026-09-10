/**
 * ARCHIVO: EtiquetaFiltroInput.jsx
 * PROPÓSITO: Filtro por etiqueta — busca entre las etiquetas ya usadas en
 *            algún proyecto (con sugerencias mientras se escribe) y filtra
 *            por una a la vez. Reutilizado en Proyectos, Territorio y
 *            Documentos: misma etiqueta, mismo componente en los tres.
 *
 * valor: string | undefined (etiqueta activa). onCambio: (string|undefined) => void.
 */
import { useState, useRef, useEffect } from 'react';
import { Tag, X } from 'lucide-react';
import * as etiquetasApi from '../../api/etiquetas';

export default function EtiquetaFiltroInput({ valor, onCambio, className = '' }) {
  const [texto, setTexto] = useState('');
  const [sugerencias, setSugerencias] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const refDebounce = useRef(null);

  useEffect(() => {
    clearTimeout(refDebounce.current);
    const q = texto.trim();
    if (q.length < 2) { setSugerencias([]); return; }
    refDebounce.current = setTimeout(() => {
      setBuscando(true);
      etiquetasApi.buscarEtiquetas(q)
        .then(res => setSugerencias(res.datos || []))
        .catch(() => setSugerencias([]))
        .finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(refDebounce.current);
  }, [texto]);

  if (valor) {
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 bg-guinda-500 text-white text-xs font-medium rounded-full ${className}`}>
        <Tag size={11} /> {valor}
        <button type="button" onClick={() => onCambio(undefined)} className="hover:text-guinda-100 leading-none">
          <X size={12} />
        </button>
      </span>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <Tag size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
      <input
        type="text"
        value={texto}
        onChange={e => { setTexto(e.target.value); setMostrarSugerencias(true); }}
        onFocus={() => setMostrarSugerencias(true)}
        onBlur={() => setTimeout(() => setMostrarSugerencias(false), 150)}
        placeholder="Etiqueta…"
        className="input-base pl-8 text-xs w-full py-1.5"
      />
      {mostrarSugerencias && texto.trim().length >= 2 && (
        <div className="absolute z-[1100] top-full mt-1 left-0 w-56 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {buscando && <div className="px-3 py-2 text-[11px] text-gray-400">Buscando…</div>}
          {!buscando && sugerencias.length === 0 && (
            <div className="px-3 py-2 text-[11px] text-gray-400">Sin resultados</div>
          )}
          {sugerencias.map(s => (
            <button key={s} type="button"
              onMouseDown={() => { onCambio(s); setTexto(''); setSugerencias([]); }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-1.5">
              <Tag size={11} className="text-gray-400" /> {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
