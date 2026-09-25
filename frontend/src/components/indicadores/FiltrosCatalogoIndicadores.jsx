/**
 * ARCHIVO: FiltrosCatalogoIndicadores.jsx
 * PROPÓSITO: Barra de filtros compartida del catálogo de indicadores —
 *            usada tanto en la pantalla de Catálogo como en el picker
 *            de vinculación (SelectorIndicadorCatalogo.jsx) y en el panel
 *            de administración (TabIndicadores.jsx), para que los tres
 *            ofrezcan exactamente los mismos filtros, no una versión
 *            reducida en ninguno.
 *
 * MINI-CLASE: filtrar por lo que el usuario reconoce, no por metadato
 * ─────────────────────────────────────────────────────────────────
 * La versión anterior reemplazaba, para PSEDATU, el buscador de texto
 * por selects de Objetivo/Estrategia por NÚMERO — datos correctos para
 * el tablero de la secretaría, pero ruido de navegación para alguien que
 * solo quiere encontrar un indicador: nadie llega pensando "necesito el
 * de la Estrategia 1.3". Ahora el segundo nivel es el mismo buscador de
 * texto libre sobre "producto" (el texto de la línea de acción en
 * PSEDATU, el objetivo narrativo en los otros 2 instrumentos) para los
 * 3 instrumentos por igual — el número de objetivo/estrategia se movió a
 * metadato visible por tarjeta (ver MigajaPsedatu.jsx), no un filtro que
 * elegir de antemano. "Área responsable" se agrega como filtro
 * secundario opcional, útil para quien ya sabe desde qué área trabaja.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import * as catalogoApi from '../../api/catalogo-indicadores';

const INSTRUMENTOS = ['Informe de Gobierno', 'Informe de Labores', 'PSEDATU 2025-2030'];

export default function FiltrosCatalogoIndicadores({ valor, onCambio }) {
  const { instrumento, producto, area } = valor;
  const [busquedaProducto, setBusquedaProducto] = useState(producto || '');
  const [sugerenciasProducto, setSugerenciasProducto] = useState([]);
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const [areas, setAreas] = useState([]);
  const cajaProductoRef = useRef(null);

  // Áreas responsables reales del catálogo — ~36 valores, barato tenerlas
  // todas en memoria como opciones de un <select> simple.
  useEffect(() => {
    catalogoApi.listarAreasCatalogo().then(setAreas).catch(() => setAreas([]));
  }, []);

  useEffect(() => {
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

  function elegirInstrumento(nuevo) {
    // Cambiar de instrumento invalida el producto elegido del instrumento
    // anterior — un texto de línea de acción de PSEDATU no tiene sentido
    // filtrando Informe de Labores, por ejemplo.
    onCambio({ instrumento: nuevo, producto: null });
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

      {/* Nivel 2: buscador de producto/línea de acción, con texto completo
          (truncado con tooltip), igual para los 3 instrumentos — más
          Área responsable como filtro secundario opcional. */}
      <div className="flex flex-wrap items-start gap-2">
        <div className="relative max-w-sm flex-1 min-w-[200px]" ref={cajaProductoRef}>
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={producto ? producto.slice(0, 80) : busquedaProducto}
            onChange={e => {
              setBusquedaProducto(e.target.value);
              if (producto) onCambio({ producto: null });
              setMostrarSugerencias(true);
            }}
            onFocus={() => setMostrarSugerencias(true)}
            placeholder={
              instrumento === 'PSEDATU 2025-2030'
                ? 'Buscar por línea de acción...'
                : 'Buscar por producto/objetivo...'
            }
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

        <select
          value={area || ''}
          onChange={e => onCambio({ area: e.target.value || null })}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-guinda-400 flex-shrink-0"
        >
          <option value="">Área responsable (todas)</option>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
    </div>
  );
}
