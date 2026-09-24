/**
 * ARCHIVO: FiltrosCatalogoIndicadores.jsx
 * PROPÓSITO: Barra de filtros compartida del catálogo de indicadores —
 *            usada tanto en la pantalla de Catálogo como en el picker
 *            de vinculación (SelectorIndicadorCatalogo.jsx), para que
 *            ambos ofrezcan exactamente los mismos filtros, no una
 *            versión reducida en el segundo.
 *
 * MINI-CLASE: agrupar primero por instrumento, después por el eje que
 *             de verdad organiza a cada uno
 * ─────────────────────────────────────────────────────────────────
 * El catálogo de SEDATU viene de 3 instrumentos oficiales (Informe de
 * Gobierno, Informe de Labores, PSEDATU 2025-2030). Cada uno se
 * organiza distinto: PSEDATU tiene un código jerárquico real
 * (objetivo.estrategia.línea — 4 objetivos, ~27 estrategias), mientras
 * que los otros dos solo tienen "producto" (un texto de objetivo
 * narrativo, sin código). Por eso el segundo nivel de filtro cambia
 * según el instrumento elegido, en vez de mostrar un único filtro
 * genérico que no encajaría bien en ninguno de los dos casos.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import * as catalogoApi from '../../api/catalogo-indicadores';

const INSTRUMENTOS = ['Informe de Gobierno', 'Informe de Labores', 'PSEDATU 2025-2030'];

// Sort natural (1.1.2 antes que 1.1.10) — un sort de texto plano deja
// "1.1.10" entre "1.1.1" y "1.1.2".
function compararCodigos(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export default function FiltrosCatalogoIndicadores({ valor, onCambio }) {
  const { instrumento, producto, objetivo, estrategia } = valor;
  const [codigos, setCodigos] = useState([]);
  const [busquedaProducto, setBusquedaProducto] = useState(producto || '');
  const [sugerenciasProducto, setSugerenciasProducto] = useState([]);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const cajaProductoRef = useRef(null);

  // Códigos de línea de acción reales del PSEDATU — se cargan una sola
  // vez, son ~220 valores, barato tenerlos todos en memoria.
  useEffect(() => {
    catalogoApi.listarLineasAccionCatalogo().then(setCodigos).catch(() => setCodigos([]));
  }, []);

  useEffect(() => {
    if (instrumento === 'PSEDATU 2025-2030') return;
    let vivo = true;
    const t = setTimeout(async () => {
      try {
        const res = await catalogoApi.listarProductosCatalogo(busquedaProducto, instrumento || undefined);
        if (vivo) setSugerenciasProducto(res);
      } catch { if (vivo) setSugerenciasProducto([]); }
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [busquedaProducto, instrumento]);

  useEffect(() => {
    function alHacerClicFuera(e) {
      if (cajaProductoRef.current && !cajaProductoRef.current.contains(e.target)) {
        setMostrarSugerencias(false);
      }
    }
    document.addEventListener('mousedown', alHacerClicFuera);
    return () => document.removeEventListener('mousedown', alHacerClicFuera);
  }, []);

  const objetivos = [...new Set(codigos.map(c => c.split('.')[0]))].sort((a, b) => Number(a) - Number(b));
  const estrategias = objetivo
    ? [...new Set(codigos.filter(c => c.startsWith(`${objetivo}.`)).map(c => c.split('.').slice(0, 2).join('.')))].sort(compararCodigos)
    : [];

  function elegirInstrumento(nuevo) {
    // Cambiar de instrumento invalida el filtro de segundo nivel del
    // instrumento anterior — evita quedar con un objetivo de PSEDATU
    // fijo mientras se mira Informe de Labores, por ejemplo.
    onCambio({ instrumento: nuevo, producto: null, objetivo: null, estrategia: null });
    setBusquedaProducto('');
  }

  return (
    <div className="space-y-2">
      {/* Nivel 1: instrumento */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => elegirInstrumento(null)}
          className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
            !instrumento ? 'bg-guinda-500 text-white border-guinda-500' : 'border-gray-200 text-gray-600 hover:border-gray-300'
          }`}
        >
          Todos
        </button>
        {INSTRUMENTOS.map(i => (
          <button
            key={i}
            type="button"
            onClick={() => elegirInstrumento(i)}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
              instrumento === i ? 'bg-guinda-500 text-white border-guinda-500' : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {i}
          </button>
        ))}
      </div>

      {/* Nivel 2: depende del instrumento activo */}
      {instrumento === 'PSEDATU 2025-2030' && (
        <div className="flex flex-wrap gap-2">
          <select
            value={objetivo || ''}
            onChange={e => onCambio({ objetivo: e.target.value || null, estrategia: null })}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-guinda-400"
          >
            <option value="">Objetivo (todos)</option>
            {objetivos.map(o => <option key={o} value={o}>Objetivo {o}</option>)}
          </select>
          <select
            value={estrategia || ''}
            onChange={e => onCambio({ estrategia: e.target.value || null })}
            disabled={!objetivo}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-guinda-400 disabled:opacity-40"
          >
            <option value="">Estrategia (todas)</option>
            {estrategias.map(e => <option key={e} value={e}>Estrategia {e}</option>)}
          </select>
        </div>
      )}

      {(instrumento === 'Informe de Gobierno' || instrumento === 'Informe de Labores') && (
        <div className="relative max-w-sm" ref={cajaProductoRef}>
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={producto ? producto.slice(0, 80) : busquedaProducto}
            onChange={e => {
              setBusquedaProducto(e.target.value);
              if (producto) onCambio({ producto: null });
              setMostrarSugerencias(true);
            }}
            onFocus={() => setMostrarSugerencias(true)}
            placeholder="Buscar por producto/objetivo..."
            className="w-full pl-7 pr-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400"
          />
          {mostrarSugerencias && sugerenciasProducto.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
              {sugerenciasProducto.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { onCambio({ producto: p }); setBusquedaProducto(p); setMostrarSugerencias(false); }}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                  title={p}
                >
                  {p.length > 80 ? `${p.slice(0, 80)}…` : p}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
