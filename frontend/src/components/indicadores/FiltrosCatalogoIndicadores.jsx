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
 * solo quiere encontrar un indicador. Ahora el segundo nivel es el mismo
 * buscador de texto libre sobre la columna "producto" del Excel — en la
 * interfaz se llama "Categoría" (el término que reconoce quien usa la
 * plataforma; "producto" solo vive como nombre de columna en base de
 * datos) para los 3 instrumentos por igual. "Área responsable" se agrega
 * como filtro secundario opcional.
 *
 * Las sugerencias solo incluyen valores de "producto" que agrupan 2+
 * entradas del catálogo (filtrado en el backend, listarProductos) — un
 * texto que describe un único indicador no es una categoría real, es
 * la narrativa de ESE indicador, y sugerirlo como filtro no ayuda a
 * nadie a encontrar nada más.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useRef } from 'react';
import { Tag, Building2 } from 'lucide-react';
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
    // Cambiar de instrumento invalida la categoría elegida del instrumento
    // anterior — una categoría de PSEDATU no tiene sentido filtrando
    // Informe de Labores, por ejemplo.
    onCambio({ instrumento: nuevo, producto: null });
    setBusquedaProducto('');
  }

  return (
    <div className="bg-gray-50/70 border border-gray-100 rounded-xl p-3 space-y-2.5">
      {/* Nivel 1: instrumento */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => elegirInstrumento(null)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
            !instrumento
              ? 'bg-guinda-600 text-white border-guinda-600 shadow-sm'
              : 'bg-white border-gray-200 text-gray-600 hover:border-guinda-200 hover:text-guinda-700'
          }`}
        >
          Todos
        </button>
        {INSTRUMENTOS.map(i => (
          <button
            key={i}
            type="button"
            onClick={() => elegirInstrumento(i)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
              instrumento === i
                ? 'bg-guinda-600 text-white border-guinda-600 shadow-sm'
                : 'bg-white border-gray-200 text-gray-600 hover:border-guinda-200 hover:text-guinda-700'
            }`}
          >
            {i}
          </button>
        ))}
      </div>

      {/* Nivel 2: buscador de categoría, con texto completo (truncado con
          tooltip), igual para los 3 instrumentos — más Área responsable
          como filtro secundario opcional. */}
      <div className="flex flex-wrap items-start gap-2">
        <div className="relative max-w-sm flex-1 min-w-[220px]" ref={cajaProductoRef}>
          <Tag size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-guinda-400" />
          <input
            value={producto ? producto.slice(0, 80) : busquedaProducto}
            onChange={e => {
              setBusquedaProducto(e.target.value);
              if (producto) onCambio({ producto: null });
              setMostrarSugerencias(true);
            }}
            onFocus={() => setMostrarSugerencias(true)}
            placeholder="Buscar por categoría..."
            className="w-full pl-7 pr-2.5 py-1.5 text-xs bg-white border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:border-guinda-400 focus:ring-2 focus:ring-guinda-100 transition-shadow"
          />
          {mostrarSugerencias && sugerenciasProducto.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
              {sugerenciasProducto.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => { onCambio({ producto: p }); setBusquedaProducto(p); setMostrarSugerencias(false); }}
                  className="w-full flex items-start gap-1.5 text-left px-2.5 py-1.5 text-xs text-gray-700 hover:bg-guinda-50/60 border-b border-gray-50 last:border-0"
                  title={p}
                >
                  <Tag size={11} className="text-guinda-300 mt-0.5 flex-shrink-0" />
                  <span>{p.length > 80 ? `${p.slice(0, 80)}…` : p}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative flex-shrink-0">
          <Building2 size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <select
            value={area || ''}
            onChange={e => onCambio({ area: e.target.value || null })}
            className="text-xs bg-white border border-gray-200 rounded-lg shadow-sm pl-7 pr-2 py-1.5 focus:outline-none focus:border-guinda-400 focus:ring-2 focus:ring-guinda-100 transition-shadow"
          >
            <option value="">Área responsable (todas)</option>
            {areas.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}
