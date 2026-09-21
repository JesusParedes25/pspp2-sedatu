/**
 * ARCHIVO: CatalogoIndicadores.jsx
 * PROPÓSITO: Pantalla 3 del módulo de Indicadores — el catálogo único,
 *            abierto a lectura para cualquiera, con curaduría (editar,
 *            retirar, fusionar duplicados) exclusiva de superadmin.
 *
 * MINI-CLASE: por qué "fusionar" y no solo "retirar"
 * ─────────────────────────────────────────────────────────────────
 * Retirar una entrada duplicada no arreglaba la fragmentación que
 * causó: los proyectos ya vinculados a esa entrada quedaban huérfanos
 * (su dato dejaba de sumar en cualquier lado, porque las pantallas
 * agrupan por catálogo activo). Fusionar reapunta esos proyectos hacia
 * la entrada que sobrevive antes de retirar la duplicada — es la
 * operación que de verdad corrige el catálogo, no solo lo esconde.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Search, Pencil, EyeOff, Eye, X, ChevronRight, ExternalLink, GitMerge, CheckSquare, Square } from 'lucide-react';
import * as catalogoApi from '../../api/catalogo-indicadores';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { useCierreConDatosSinGuardar } from '../../hooks/useCierreConDatosSinGuardar';

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
        <p className="text-xs text-gray-500">Ningún proyecto lo usa todavía.</p>
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

export default function CatalogoIndicadores() {
  const { usuario } = useAuth();
  const { mostrarToast } = useUI();
  const esSuperadmin = usuario?.rol === 'superadmin';

  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [verRetirados, setVerRetirados] = useState(false);
  const [editando, setEditando] = useState(null);
  const [expandido, setExpandido] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const editandoInicialRef = useRef(null);

  // Modo fusión: selección múltiple entre entradas duplicadas.
  const [modoFusion, setModoFusion] = useState(false);
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [sobrevive, setSobrevive] = useState(null);
  const [confirmandoFusion, setConfirmandoFusion] = useState(false);
  const [fusionando, setFusionando] = useState(false);

  function abrirEdicion(ind) {
    editandoInicialRef.current = { ...ind };
    setEditando(editandoInicialRef.current);
  }

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await catalogoApi.listarCatalogoIndicadores({
        busqueda: busqueda || undefined,
        incluirInactivos: esSuperadmin ? verRetirados : false,
      });
      setItems(res.datos || []);
    } catch {
      setError('No se pudo cargar el catálogo.');
    } finally { setCargando(false); }
  }, [busqueda, verRetirados, esSuperadmin]);

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
      mostrarToast('Indicador actualizado', 'exito');
      cargar();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo guardar.');
    } finally { setGuardando(false); }
  }

  async function alternarActivo(ind) {
    setError('');
    try {
      await catalogoApi.cambiarActivoIndicadorCatalogo(ind.id, !ind.activo);
      mostrarToast(ind.activo ? 'Indicador retirado' : 'Indicador reactivado', 'exito');
      cargar();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'No se pudo cambiar el estado.', 'error');
    }
  }

  const hayCambiosSinGuardar = !!editando && JSON.stringify(editando) !== JSON.stringify(editandoInicialRef.current);
  const { cerrarPorFondo, cerrarConConfirmacion } = useCierreConDatosSinGuardar(hayCambiosSinGuardar, () => setEditando(null));

  function alternarSeleccion(id) {
    setSeleccionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function salirModoFusion() {
    setModoFusion(false);
    setSeleccionados(new Set());
    setSobrevive(null);
  }

  const itemsSeleccionados = items.filter(i => seleccionados.has(i.id));

  function abrirConfirmacionFusion() {
    // Por default, sobrevive la entrada con más proyectos usándola — es
    // la que menos reapuntamientos necesita y la más probable de ser la
    // "correcta" entre las duplicadas.
    const porUso = [...itemsSeleccionados].sort((a, b) => (b.usos || 0) - (a.usos || 0));
    setSobrevive(porUso[0]?.id || null);
    setConfirmandoFusion(true);
  }

  async function confirmarFusion() {
    setFusionando(true);
    try {
      const res = await catalogoApi.fusionarIndicadoresCatalogo(sobrevive, [...seleccionados]);
      mostrarToast(res.mensaje || 'Fusionado', 'exito');
      setConfirmandoFusion(false);
      salirModoFusion();
      cargar();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'No se pudo fusionar.', 'error');
    } finally {
      setFusionando(false);
    }
  }

  const sobrevivienteEntrada = itemsSeleccionados.find(i => i.id === sobrevive);
  const perdedoras = itemsSeleccionados.filter(i => i.id !== sobrevive);
  const totalReapuntados = perdedoras.reduce((s, i) => s + (i.usos || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-800">Catálogo de indicadores</h2>
          <p className="text-xs text-gray-500 mt-0.5 max-w-2xl">
            La definición única de cada indicador. Los proyectos eligen de aquí, así que dos
            proyectos que miden lo mismo quedan comparables entre sí.
            {esSuperadmin ? ' Cualquier usuario puede dar de alta uno que falte; aquí se cura.' : ''}
          </p>
        </div>
        {esSuperadmin && !modoFusion && (
          <button
            onClick={() => setModoFusion(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-guinda-700 border border-guinda-200 rounded-lg hover:bg-guinda-50 flex-shrink-0"
          >
            <GitMerge size={13} /> Fusionar duplicados
          </button>
        )}
      </div>

      {modoFusion && (
        <div className="flex items-center justify-between gap-3 bg-guinda-50/60 border border-guinda-200 rounded-lg px-3 py-2.5">
          <p className="text-xs text-guinda-800">
            Selecciona 2 o más entradas que midan lo mismo.
            {seleccionados.size > 0 && ` ${seleccionados.size} seleccionada${seleccionados.size !== 1 ? 's' : ''}.`}
          </p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={salirModoFusion} className="text-xs text-gray-500 hover:text-gray-700">Cancelar</button>
            <button
              onClick={abrirConfirmacionFusion}
              disabled={seleccionados.size < 2}
              className="px-3 py-1.5 text-xs font-medium bg-guinda-700 text-white rounded-lg disabled:opacity-40 hover:bg-guinda-600"
            >
              Fusionar seleccionados
            </button>
          </div>
        </div>
      )}

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
        {esSuperadmin && !modoFusion && (
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer flex-shrink-0">
            <input type="checkbox" checked={verRetirados} onChange={e => setVerRetirados(e.target.checked)} className="accent-guinda-600" />
            Ver retirados
          </label>
        )}
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
                {modoFusion && (
                  <button onClick={() => alternarSeleccion(ind.id)} className="flex-shrink-0 mt-0.5 text-guinda-600">
                    {seleccionados.has(ind.id) ? <CheckSquare size={16} /> : <Square size={16} className="text-gray-300" />}
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-medium ${ind.activo ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                      {ind.nombre}
                    </span>
                    {!ind.activo && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">retirado</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
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
                  {ind.fuente && <p className="text-[10px] text-gray-400 mt-0.5">Fuente: {ind.fuente}</p>}
                </div>
                {esSuperadmin && !modoFusion && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => abrirEdicion(ind)} title="Editar"
                      className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-gray-100"><Pencil size={13} /></button>
                    <button onClick={() => alternarActivo(ind)} title={ind.activo ? 'Retirar del catálogo' : 'Reactivar'}
                      className="p-1.5 text-gray-400 hover:text-amber-600 rounded hover:bg-gray-100">
                      {ind.activo ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                )}
              </div>
              {expandido === ind.id && <FilaUso indicador={ind} onCerrar={() => setExpandido(null)} />}
            </div>
          ))}
        </div>
      )}

      {/* ─── Edición ─── */}
      {editando && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={cerrarPorFondo}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Editar indicador</h3>
              <button onClick={cerrarConConfirmacion} className="p-1 text-gray-400 hover:text-gray-700"><X size={16} /></button>
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
              <button onClick={cerrarConConfirmacion} className="btn-secondary text-sm">Cancelar</button>
              <button onClick={guardar} disabled={guardando || !editando.nombre?.trim()}
                className="btn-primary text-sm disabled:opacity-40">
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Fusión: elegir sobreviviente + preview ─── */}
      {confirmandoFusion && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setConfirmandoFusion(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Fusionar {itemsSeleccionados.length} entradas</h3>
              <button onClick={() => setConfirmandoFusion(false)} className="p-1 text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-3 overflow-y-auto">
              <p className="text-xs text-gray-600">¿Cuál de estas entradas sobrevive? Las demás se retiran y sus proyectos pasan a esta.</p>
              <div className="space-y-1.5">
                {itemsSeleccionados.map(ind => (
                  <label key={ind.id} className={`flex items-center justify-between gap-2 px-3 py-2 border rounded-lg cursor-pointer ${
                    sobrevive === ind.id ? 'border-guinda-400 bg-guinda-50/50' : 'border-gray-200'
                  }`}>
                    <span className="flex items-center gap-2 min-w-0">
                      <input type="radio" name="sobrevive" checked={sobrevive === ind.id} onChange={() => setSobrevive(ind.id)} className="accent-guinda-600" />
                      <span className="text-sm text-gray-800 truncate">{ind.nombre}</span>
                    </span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{ind.usos} proyecto{ind.usos !== 1 ? 's' : ''}</span>
                  </label>
                ))}
              </div>
              {sobrevivienteEntrada && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  {totalReapuntados > 0
                    ? `${totalReapuntados} indicador(es) de proyecto pasarán de ${perdedoras.map(p => `"${p.nombre}"`).join(', ')} a "${sobrevivienteEntrada.nombre}". `
                    : `Ningún proyecto usa todavía las entradas que se retiran. `}
                  Las demás quedan retiradas. No se puede deshacer.
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
              <button onClick={() => setConfirmandoFusion(false)} className="btn-secondary text-sm">Cancelar</button>
              <button onClick={confirmarFusion} disabled={fusionando || !sobrevive}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-guinda-700 text-white hover:bg-guinda-600 disabled:opacity-40">
                {fusionando ? 'Fusionando...' : 'Fusionar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
