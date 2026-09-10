/**
 * ARCHIVO: EtiquetasChipInput.jsx
 * PROPÓSITO: Campo de etiquetas de un proyecto — chips + input, con
 *            sugerencias de etiquetas ya usadas en otros proyectos mientras
 *            se escribe. Antes (NuevoProyecto.jsx y ModalEditarProyecto.jsx,
 *            cada uno con su propia copia del mismo bloque) el campo era
 *            texto libre puro — sin nada que sugiriera lo ya existente,
 *            "Vivienda"/"vivienda"/"VIVIENDA" terminaban como 3 etiquetas
 *            distintas en la práctica. Una sola implementación para las
 *            dos pantallas que capturan etiquetas.
 *
 * value: array de strings. onChange: (array) => void.
 */
import { useState, useRef, useEffect } from 'react';
import * as etiquetasApi from '../../api/etiquetas';

export default function EtiquetasChipInput({ value, onChange }) {
  const [texto, setTexto] = useState('');
  const [sugerencias, setSugerencias] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const refInput = useRef(null);
  const refDebounce = useRef(null);

  useEffect(() => {
    clearTimeout(refDebounce.current);
    const q = texto.trim();
    if (!q) { setSugerencias([]); return; }
    refDebounce.current = setTimeout(() => {
      setBuscando(true);
      etiquetasApi.buscarEtiquetas(q)
        .then(res => setSugerencias((res.datos || []).filter(s => !value.includes(s))))
        .catch(() => setSugerencias([]))
        .finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(refDebounce.current);
  }, [texto]); // eslint-disable-line react-hooks/exhaustive-deps

  function agregar(nueva) {
    const limpia = nueva.trim().replace(/,$/, '');
    if (limpia && !value.includes(limpia)) onChange([...value, limpia]);
    setTexto('');
    setSugerencias([]);
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1.5 p-2 input-base min-h-[42px] cursor-text" onClick={() => refInput.current?.focus()}>
        {value.map((et, i) => (
          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-guinda-50 text-guinda-700 text-xs rounded-full">
            {et}
            <button type="button" onClick={e => { e.stopPropagation(); onChange(value.filter((_, j) => j !== i)); }}
              className="text-guinda-400 hover:text-guinda-600 leading-none text-sm">&times;</button>
          </span>
        ))}
        <input
          ref={refInput}
          type="text"
          value={texto}
          onChange={e => { setTexto(e.target.value); setMostrarSugerencias(true); }}
          onFocus={() => setMostrarSugerencias(true)}
          onBlur={() => {
            setTimeout(() => setMostrarSugerencias(false), 150);
            if (texto.trim()) agregar(texto);
          }}
          onKeyDown={e => {
            if ((e.key === 'Enter' || e.key === ',') && texto.trim()) {
              e.preventDefault();
              agregar(texto);
            }
            if (e.key === 'Backspace' && !texto && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          className="flex-1 min-w-[120px] border-none outline-none text-sm bg-transparent p-0"
          placeholder={value.length === 0 ? 'Escribe y presiona Enter...' : ''}
        />
      </div>

      {mostrarSugerencias && texto.trim().length >= 2 && (
        <div className="absolute z-[1100] top-full mt-1 left-0 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {buscando && <div className="px-3 py-2 text-[11px] text-gray-400">Buscando…</div>}
          {!buscando && sugerencias.length === 0 && (
            <div className="px-3 py-2 text-[11px] text-gray-400">Sin coincidencias — se agregará como nueva</div>
          )}
          {sugerencias.map(s => (
            <button key={s} type="button" onMouseDown={() => agregar(s)}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50">
              {s}
            </button>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 mt-1">Presiona Enter o coma para agregar</p>
    </div>
  );
}
