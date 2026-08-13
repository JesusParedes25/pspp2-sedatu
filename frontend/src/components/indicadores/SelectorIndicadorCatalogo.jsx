/**
 * ARCHIVO: SelectorIndicadorCatalogo.jsx
 * PROPÓSITO: Elegir un indicador del catálogo al capturar o editar un
 *            proyecto, o darlo de alta ahí mismo si no existe.
 *
 * MINI-CLASE: por qué se elige en vez de teclear
 * ─────────────────────────────────────────────────────────────────
 * Cuando cada proyecto escribía el nombre a mano, el mismo indicador
 * terminaba capturado de tres formas distintas y era imposible sumarlo
 * entre proyectos — justo lo que se necesita para mandarlo a otra
 * plataforma. Elegir del catálogo garantiza que dos proyectos que
 * miden lo mismo apunten a la misma definición.
 *
 * El alta rápida no es un adorno: si agregar el indicador que falta
 * obligara a pedírselo a un administrador, la gente lo capturaría
 * suelto y el catálogo nacería desactualizado. Por eso se puede crear
 * desde aquí, y queda registrado quién lo hizo para que el
 * administrador pueda curar después.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect } from 'react';
import { X, Loader2, Search, Plus, BarChart3, BookOpen } from 'lucide-react';
import * as catalogoApi from '../../api/catalogo-indicadores';

const TIPOS = [
  { valor: 'Avance_fisico', etiqueta: 'Avance físico' },
  { valor: 'Avance_financiero', etiqueta: 'Avance financiero' },
  { valor: 'Cobertura', etiqueta: 'Cobertura' },
  { valor: 'Beneficiarios', etiqueta: 'Beneficiarios' },
  { valor: 'Gestion', etiqueta: 'Gestión' },
  { valor: 'Otro', etiqueta: 'Otro' },
];

const UNIDADES = [
  { valor: 'Porcentaje', etiqueta: '% (porcentaje)' },
  { valor: 'Moneda_MXN', etiqueta: '$ MXN (pesos)' },
  { valor: 'Numero', etiqueta: 'Número (personalizable)' },
];

export function etiquetaUnidad(ind) {
  if (ind.unidad === 'Porcentaje') return '%';
  if (ind.unidad === 'Moneda_MXN') return '$ MXN';
  return ind.unidad_personalizada || ind.etiqueta_unidad || 'unidades';
}

export default function SelectorIndicadorCatalogo({ onElegir, onCerrar, yaUsados = [] }) {
  const [catalogo, setCatalogo] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [modoAlta, setModoAlta] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [nuevo, setNuevo] = useState({
    nombre: '', tipo: 'Avance_fisico', unidad: 'Numero',
    unidad_personalizada: '', definicion: '', fuente: '',
  });

  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      setCargando(true);
      try {
        const res = await catalogoApi.listarCatalogoIndicadores({ busqueda: busqueda || undefined });
        if (vivo) setCatalogo(res.datos || []);
      } catch {
        if (vivo) setError('No se pudo cargar el catálogo de indicadores.');
      } finally {
        if (vivo) setCargando(false);
      }
    }, busqueda ? 250 : 0);
    return () => { vivo = false; clearTimeout(t); };
  }, [busqueda]);

  async function crearYElegir() {
    if (!nuevo.nombre.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await catalogoApi.crearIndicadorCatalogo(nuevo);
      onElegir(res.datos);
    } catch (err) {
      const data = err.response?.data;
      // Si ya existía, no se obliga a empezar de nuevo: se ofrece usarlo.
      if (data?.codigo === 'DUPLICADO' && data.existente) {
        setError(`${data.mensaje} — búscalo en la lista para usarlo.`);
        setModoAlta(false);
        setBusqueda(data.existente.nombre);
      } else {
        setError(data?.mensaje || 'No se pudo agregar el indicador.');
      }
      setGuardando(false);
    }
  }

  const usados = new Set(yaUsados.filter(Boolean));

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-guinda-600" />
            <h3 className="text-sm font-semibold text-gray-900">
              {modoAlta ? 'Agregar un indicador al catálogo' : 'Elegir indicador del catálogo'}
            </h3>
          </div>
          <button onClick={onCerrar} className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-3">
          {!modoAlta ? (
            <>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar indicador..."
                  autoFocus
                  className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400"
                />
              </div>

              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
                {cargando ? (
                  <div className="flex items-center justify-center py-8 text-gray-400">
                    <Loader2 size={16} className="animate-spin" />
                  </div>
                ) : catalogo.length === 0 ? (
                  <p className="text-xs text-gray-500 px-3 py-5 text-center">
                    {busqueda
                      ? 'Ningún indicador del catálogo coincide. Puedes agregarlo abajo.'
                      : 'El catálogo está vacío todavía.'}
                  </p>
                ) : catalogo.map(ind => {
                  const yaEsta = usados.has(ind.id);
                  return (
                    <button
                      key={ind.id}
                      disabled={yaEsta}
                      onClick={() => onElegir(ind)}
                      className={`w-full text-left px-3 py-2.5 transition-colors ${
                        yaEsta ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm text-gray-800 leading-tight">{ind.nombre}</span>
                        {yaEsta
                          ? <span className="text-[10px] text-gray-400 flex-shrink-0">ya agregado</span>
                          : ind.usos > 0 && (
                            <span className="text-[10px] text-gray-400 flex-shrink-0" title="Proyectos que ya lo usan">
                              {ind.usos} proyecto{ind.usos !== 1 ? 's' : ''}
                            </span>
                          )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                          {TIPOS.find(t => t.valor === ind.tipo)?.etiqueta || ind.tipo}
                        </span>
                        <span className="text-[10px] text-gray-400">{etiquetaUnidad(ind)}</span>
                      </div>
                      {ind.definicion && (
                        <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{ind.definicion}</p>
                      )}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => { setModoAlta(true); setNuevo(n => ({ ...n, nombre: busqueda })); setError(null); }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-guinda-600 border border-dashed border-guinda-200 rounded-lg hover:bg-guinda-50/50 transition-colors"
              >
                <Plus size={14} /> No encuentro el que necesito — agregarlo
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Nombre del indicador</label>
                <input
                  value={nuevo.nombre}
                  onChange={e => setNuevo(n => ({ ...n, nombre: e.target.value }))}
                  autoFocus
                  placeholder="Ej. Viviendas mejoradas en zonas metropolitanas"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Tipo</label>
                  <select
                    value={nuevo.tipo}
                    onChange={e => setNuevo(n => ({ ...n, tipo: e.target.value }))}
                    className="w-full px-2 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400"
                  >
                    {TIPOS.map(t => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Unidad</label>
                  <select
                    value={nuevo.unidad}
                    onChange={e => setNuevo(n => ({ ...n, unidad: e.target.value }))}
                    className="w-full px-2 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400"
                  >
                    {UNIDADES.map(u => <option key={u.valor} value={u.valor}>{u.etiqueta}</option>)}
                  </select>
                </div>
              </div>

              {nuevo.unidad === 'Numero' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">¿Qué se cuenta?</label>
                  <input
                    value={nuevo.unidad_personalizada}
                    onChange={e => setNuevo(n => ({ ...n, unidad_personalizada: e.target.value }))}
                    placeholder="Ej. viviendas, hectáreas, localidades"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Cómo se mide <span className="font-normal text-gray-400">(opcional)</span>
                </label>
                <textarea
                  value={nuevo.definicion}
                  onChange={e => setNuevo(n => ({ ...n, definicion: e.target.value }))}
                  rows={2}
                  placeholder="Qué cuenta exactamente y qué no, para que otros proyectos lo midan igual."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Fuente del dato <span className="font-normal text-gray-400">(opcional)</span>
                </label>
                <input
                  value={nuevo.fuente}
                  onChange={e => setNuevo(n => ({ ...n, fuente: e.target.value }))}
                  placeholder="Ej. Padrón único de beneficiarios"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400"
                />
              </div>

              <p className="text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                Quedará disponible para todos los proyectos. La meta y el avance se capturan
                después, en cada proyecto por separado.
              </p>
            </>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-100 flex-shrink-0">
          {modoAlta ? (
            <button onClick={() => { setModoAlta(false); setError(null); }} className="text-xs text-gray-500 hover:text-gray-700">
              ← Volver al catálogo
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onCerrar} className="btn-secondary text-sm">Cancelar</button>
            {modoAlta && (
              <button
                onClick={crearYElegir}
                disabled={!nuevo.nombre.trim() || guardando}
                className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-40"
              >
                {guardando ? <><Loader2 size={14} className="animate-spin" /> Agregando...</> : <><BarChart3 size={14} /> Agregar y usar</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
