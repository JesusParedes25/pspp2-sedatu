/**
 * ARCHIVO: TabIndicadores.jsx
 * PROPÓSITO: Administrar el catálogo de indicadores desde el panel de
 *            superadministrador (curar lo que los usuarios dan de alta).
 *
 * MINI-CLASE: curar, no vigilar
 * ─────────────────────────────────────────────────────────────────
 * Cualquier usuario puede agregar un indicador que le falte — si no,
 * lo capturaría suelto y el catálogo quedaría desactualizado. El
 * trabajo de esta pantalla es el de después: corregir nombres,
 * completar la definición y la fuente, y retirar duplicados o
 * indicadores que ya no se usan.
 *
 * Por eso cada entrada muestra en cuántos proyectos se usa: retirar
 * uno con uso activo no rompe nada (los proyectos conservan su
 * referencia), pero conviene saberlo antes de hacerlo. La `clave` se
 * muestra siempre y no se puede editar: es el identificador con el que
 * la plataforma externa consumirá el avance.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback } from 'react';
import { Loader2, Search, Pencil, EyeOff, Eye, X, ChevronRight, ExternalLink } from 'lucide-react';
import * as catalogoApi from '../../api/catalogo-indicadores';

const TIPOS = [
  { valor: 'Avance_fisico', etiqueta: 'Avance físico' },
  { valor: 'Avance_financiero', etiqueta: 'Avance financiero' },
  { valor: 'Cobertura', etiqueta: 'Cobertura' },
  { valor: 'Beneficiarios', etiqueta: 'Beneficiarios' },
  { valor: 'Gestion', etiqueta: 'Gestión' },
  { valor: 'Otro', etiqueta: 'Otro' },
];

function FilaUso({ indicador, onCerrar }) {
  const [usos, setUsos] = useState(null);
  useEffect(() => {
    catalogoApi.obtenerUsoIndicadorCatalogo(indicador.id)
      .then(r => setUsos(r.datos || []))
      .catch(() => setUsos([]));
  }, [indicador.id]);

  return (
    <div className="bg-gray-50 border-t border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-600">Proyectos que lo usan</span>
        <button onClick={onCerrar} className="text-gray-400 hover:text-gray-700"><X size={13} /></button>
      </div>
      {usos === null ? (
        <Loader2 size={14} className="animate-spin text-gray-400" />
      ) : usos.length === 0 ? (
        <p className="text-xs text-gray-500">Ningún proyecto lo usa todavía. Se puede retirar sin afectar a nadie.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-400 text-left">
              <th className="font-medium pb-1">Proyecto</th>
              <th className="font-medium pb-1 w-16">DG</th>
              <th className="font-medium pb-1 w-20 text-right">Meta</th>
              <th className="font-medium pb-1 w-20 text-right">Avance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {usos.map(u => (
              <tr key={u.indicador_id}>
                <td className="py-1 pr-2">
                  <a href={`/proyectos/${u.proyecto_id}?tab=resumen`} target="_blank" rel="noreferrer"
                    className="text-guinda-600 hover:underline inline-flex items-center gap-1">
                    {u.proyecto_nombre} <ExternalLink size={10} />
                  </a>
                </td>
                <td className="py-1 text-gray-500">{u.dg_siglas || '—'}</td>
                <td className="py-1 text-right text-gray-700">{u.meta_global ?? '—'}</td>
                <td className="py-1 text-right text-gray-700">{u.valor_actual ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function TabIndicadores() {
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [verRetirados, setVerRetirados] = useState(false);
  const [editando, setEditando] = useState(null);
  const [expandido, setExpandido] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await catalogoApi.listarCatalogoIndicadores({
        busqueda: busqueda || undefined,
        incluirInactivos: verRetirados,
      });
      setItems(res.datos || []);
    } catch {
      setError('No se pudo cargar el catálogo.');
    } finally { setCargando(false); }
  }, [busqueda, verRetirados]);

  useEffect(() => {
    const t = setTimeout(cargar, busqueda ? 250 : 0);
    return () => clearTimeout(t);
  }, [cargar, busqueda]);

  async function guardar() {
    setGuardando(true);
    setError('');
    try {
      await catalogoApi.actualizarIndicadorCatalogo(editando.id, editando);
      setEditando(null);
      cargar();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo guardar.');
    } finally { setGuardando(false); }
  }

  async function alternarActivo(ind) {
    setError('');
    try {
      await catalogoApi.cambiarActivoIndicadorCatalogo(ind.id, !ind.activo);
      cargar();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo cambiar el estado.');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-800">Catálogo de indicadores</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          La definición única de cada indicador. Los proyectos eligen de aquí, así que dos
          proyectos que miden lo mismo quedan comparables — y consolidables para enviarlos
          a otra plataforma. Cualquier usuario puede dar de alta uno que falte; aquí se curan.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o clave..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer flex-shrink-0">
          <input type="checkbox" checked={verRetirados} onChange={e => setVerRetirados(e.target.checked)} className="accent-guinda-600" />
          Ver retirados
        </label>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

      {cargando ? (
        <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
      ) : items.length === 0 ? (
        <p className="text-xs text-gray-500 text-center py-8">
          {busqueda ? 'Ningún indicador coincide con la búsqueda.' : 'El catálogo está vacío.'}
        </p>
      ) : (
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
          {items.map(ind => (
            <div key={ind.id} className={ind.activo ? '' : 'bg-gray-50/70'}>
              <div className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-medium ${ind.activo ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                      {ind.nombre}
                    </span>
                    {!ind.activo && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">retirado</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {/* La clave es lo que consumirá la API externa: se muestra
                        siempre, en monoespaciado, y no es editable. */}
                    <code className="text-[10px] px-1.5 py-0.5 rounded bg-guinda-50 text-guinda-700 font-mono">{ind.clave}</code>
                    <span className="text-[10px] text-gray-500">
                      {TIPOS.find(t => t.valor === ind.tipo)?.etiqueta || ind.tipo}
                    </span>
                    {ind.unidad_personalizada && <span className="text-[10px] text-gray-400">{ind.unidad_personalizada}</span>}
                    <button
                      onClick={() => setExpandido(expandido === ind.id ? null : ind.id)}
                      className="text-[10px] text-gray-500 hover:text-guinda-600 inline-flex items-center gap-0.5"
                    >
                      {ind.usos} proyecto{ind.usos !== 1 ? 's' : ''}
                      <ChevronRight size={10} className={expandido === ind.id ? 'rotate-90 transition-transform' : 'transition-transform'} />
                    </button>
                  </div>
                  {ind.definicion && <p className="text-[11px] text-gray-500 mt-1.5">{ind.definicion}</p>}
                  {ind.creador_nombre && (
                    <p className="text-[10px] text-gray-400 mt-1">Agregado por {ind.creador_nombre}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => setEditando({ ...ind })} title="Editar"
                    className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-gray-100"><Pencil size={13} /></button>
                  <button onClick={() => alternarActivo(ind)} title={ind.activo ? 'Retirar del catálogo' : 'Reactivar'}
                    className="p-1.5 text-gray-400 hover:text-amber-600 rounded hover:bg-gray-100">
                    {ind.activo ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>
              {expandido === ind.id && <FilaUso indicador={ind} onCerrar={() => setExpandido(null)} />}
            </div>
          ))}
        </div>
      )}

      {/* ─── Edición ─── */}
      {editando && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditando(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Editar indicador</h3>
              <button onClick={() => setEditando(null)} className="p-1 text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-3 overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Clave</label>
                <code className="block text-xs px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-500 font-mono">{editando.clave}</code>
                <p className="text-[10px] text-gray-400 mt-1">
                  No se puede cambiar: es el identificador con el que otra plataforma consumirá
                  este indicador. Renombrarlo partiría la serie histórica en dos.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Nombre</label>
                <input value={editando.nombre || ''} onChange={e => setEditando(v => ({ ...v, nombre: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Tipo</label>
                  <select value={editando.tipo || 'Otro'} onChange={e => setEditando(v => ({ ...v, tipo: e.target.value }))}
                    className="w-full px-2 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400">
                    {TIPOS.map(t => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Unidad</label>
                  <input value={editando.unidad_personalizada || ''} onChange={e => setEditando(v => ({ ...v, unidad_personalizada: e.target.value }))}
                    placeholder="viviendas, hectáreas..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Cómo se mide</label>
                <textarea value={editando.definicion || ''} onChange={e => setEditando(v => ({ ...v, definicion: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Fuente del dato</label>
                <input value={editando.fuente || ''} onChange={e => setEditando(v => ({ ...v, fuente: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400" />
              </div>
              {editando.usos > 0 && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  Este indicador se usa en {editando.usos} proyecto{editando.usos !== 1 ? 's' : ''}. Cambiar el nombre
                  lo cambia en todos.
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
              <button onClick={() => setEditando(null)} className="btn-secondary text-sm">Cancelar</button>
              <button onClick={guardar} disabled={guardando || !editando.nombre?.trim()}
                className="btn-primary text-sm disabled:opacity-40">
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
