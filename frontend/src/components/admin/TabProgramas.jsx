/**
 * ARCHIVO: TabProgramas.jsx
 * PROPÓSITO: Administrar el catálogo de programas presupuestarios del
 *            Ramo 15 —la lista que se ofrece al crear o editar un
 *            proyecto— desde el panel de superadministrador.
 *
 * MINI-CLASE: retirar no es borrar
 * ─────────────────────────────────────────────────────────────────
 * Un Pp que deja de operar no se elimina: se desactiva. Desactivado
 * deja de aparecer en el desplegable de proyectos nuevos, pero los
 * proyectos que ya lo tienen conservan su vínculo — y con él la lectura
 * presupuestaria de su historial. Borrarlo rompería esa lectura, así
 * que eliminar solo se permite cuando ningún proyecto lo usa; por eso
 * cada renglón dice en cuántos se usa antes de que decidas.
 *
 * La clave (S177, K049…) sí es editable, al revés que en el catálogo de
 * indicadores: aquí no la consume ninguna plataforma externa, es la
 * nomenclatura de SHCP y cuando SHCP la cambia hay que poder corregirla.
 * Lo que no puede es repetirse, y el servidor lo rechaza con nombre y
 * apellido en vez de un error de base de datos.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback } from 'react';
import { Loader2, Search, Pencil, EyeOff, Eye, X, Plus, Trash2 } from 'lucide-react';
import * as adminApi from '../../api/admin';
import ConfirmDialog from '../common/ConfirmDialog';

// Modalidades presupuestarias de SHCP. La letra inicial de la clave es
// justamente la modalidad, por eso se muestran juntas.
const MODALIDADES = [
  { valor: 'S_Subsidio', etiqueta: 'S — Subsidio' },
  { valor: 'U_Subsidio_Especifico', etiqueta: 'U — Subsidio específico' },
  { valor: 'E_Prestacion_Servicios', etiqueta: 'E — Prestación de servicios' },
  { valor: 'P_Planeacion', etiqueta: 'P — Planeación y política' },
  { valor: 'K_Inversion', etiqueta: 'K — Inversión' },
  { valor: 'G_Regulacion', etiqueta: 'G — Regulación' },
  { valor: 'L_Obligacion', etiqueta: 'L — Obligaciones' },
  { valor: 'R_Gasto_Federalizado', etiqueta: 'R — Gasto federalizado' },
  { valor: 'M_Gasto_Administrativo', etiqueta: 'M — Gasto administrativo' },
  { valor: 'Prioritario_Nacional', etiqueta: 'Prioritario nacional' },
  { valor: 'Ramo_15', etiqueta: 'Ramo 15' },
  { valor: 'Otro', etiqueta: 'Otro' },
];

const VACIO = {
  nombre: '', clave: '', tipo: 'S_Subsidio',
  ejercicio_fiscal: new Date().getFullYear(),
  unidad_responsable: '', descripcion: '',
};

export default function TabProgramas() {
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [verInactivos, setVerInactivos] = useState(false);
  const [editando, setEditando] = useState(null);   // { ...programa } o VACIO con modo
  const [porEliminar, setPorEliminar] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await adminApi.listarProgramasAdmin();
      setItems(res.datos || []);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo cargar el catálogo.');
    } finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const texto = busqueda.trim().toLowerCase();
  const visibles = items.filter(p => {
    if (!verInactivos && !p.activo) return false;
    if (!texto) return true;
    return [p.nombre, p.clave, p.unidad_responsable]
      .some(v => (v || '').toLowerCase().includes(texto));
  });

  async function guardar() {
    setGuardando(true); setError('');
    try {
      const datos = {
        nombre: editando.nombre,
        clave: editando.clave,
        tipo: editando.tipo,
        ejercicio_fiscal: editando.ejercicio_fiscal ? Number(editando.ejercicio_fiscal) : null,
        unidad_responsable: editando.unidad_responsable,
        descripcion: editando.descripcion,
      };
      if (editando.id) await adminApi.editarProgramaAdmin(editando.id, datos);
      else await adminApi.crearProgramaAdmin(datos);
      setEditando(null);
      cargar();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo guardar.');
    } finally { setGuardando(false); }
  }

  async function alternarActivo(p) {
    setError('');
    try {
      await adminApi.cambiarActivoProgramaAdmin(p.id, !p.activo);
      cargar();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo cambiar el estado.');
    }
  }

  async function eliminar(p) {
    setError('');
    try {
      await adminApi.eliminarProgramaAdmin(p.id);
      setPorEliminar(null);
      cargar();
    } catch (err) {
      setPorEliminar(null);
      setError(err.response?.data?.mensaje || 'No se pudo eliminar.');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-800">Programas presupuestarios</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          La lista que se ofrece al crear o editar un proyecto, en el campo «Programa
          presupuestario». Solo los activos se ofrecen; los proyectos que ya apuntan a uno
          desactivado conservan su vínculo.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, clave o unidad responsable..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer flex-shrink-0">
          <input type="checkbox" checked={verInactivos} onChange={e => setVerInactivos(e.target.checked)} className="accent-guinda-600" />
          Ver desactivados
        </label>
        <button
          onClick={() => { setEditando({ ...VACIO }); setError(''); }}
          className="flex items-center gap-1.5 px-3 py-2 bg-guinda-700 text-white rounded-lg text-sm hover:bg-guinda-600 flex-shrink-0"
        >
          <Plus size={15} /> Nuevo
        </button>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

      {cargando ? (
        <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
      ) : visibles.length === 0 ? (
        <p className="text-xs text-gray-500 text-center py-8">
          {texto ? 'Ningún programa coincide con la búsqueda.' : 'El catálogo está vacío.'}
        </p>
      ) : (
        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
          {visibles.map(p => (
            <div key={p.id} className={`flex items-start gap-3 px-4 py-3 ${p.activo ? '' : 'bg-gray-50/70'}`}>
              <code className={`text-[11px] px-1.5 py-0.5 rounded font-mono flex-shrink-0 mt-0.5 ${p.activo ? 'bg-guinda-50 text-guinda-700' : 'bg-gray-200 text-gray-500'}`}>
                {p.clave}
              </code>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-medium ${p.activo ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                    {p.nombre}
                  </span>
                  {!p.activo && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">desactivado</span>}
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap text-[10px] text-gray-500">
                  <span>{MODALIDADES.find(m => m.valor === p.tipo)?.etiqueta || p.tipo}</span>
                  {p.unidad_responsable && <span className="text-gray-400">UR: {p.unidad_responsable}</span>}
                  {p.ejercicio_fiscal && <span className="text-gray-400">{p.ejercicio_fiscal}</span>}
                  {/* Cuántos proyectos lo usan decide si se puede borrar
                      o solo desactivar; va a la vista, no escondido. */}
                  <span className={p.usos > 0 ? 'text-gray-600' : 'text-gray-400'}>
                    {p.usos} proyecto{p.usos !== 1 ? 's' : ''}
                  </span>
                </div>
                {p.descripcion && <p className="text-[11px] text-gray-500 mt-1.5">{p.descripcion}</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => { setEditando({ ...p }); setError(''); }} title="Editar"
                  className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-gray-100"><Pencil size={13} /></button>
                <button onClick={() => alternarActivo(p)} title={p.activo ? 'Desactivar (deja de ofrecerse)' : 'Reactivar'}
                  className="p-1.5 text-gray-400 hover:text-amber-600 rounded hover:bg-gray-100">
                  {p.activo ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                <button onClick={() => { setPorEliminar(p); setError(''); }}
                  title={p.usos > 0 ? 'Lo usan proyectos: solo se puede desactivar' : 'Eliminar del catálogo'}
                  disabled={p.usos > 0}
                  className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-gray-100 disabled:opacity-30 disabled:hover:text-gray-400 disabled:cursor-not-allowed">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Alta y edición ─── */}
      {editando && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditando(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">
                {editando.id ? 'Editar programa' : 'Nuevo programa presupuestario'}
              </h3>
              <button onClick={() => setEditando(null)} className="p-1 text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>

            <div className="px-5 py-4 space-y-3 overflow-y-auto">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Clave</label>
                  <input value={editando.clave || ''} maxLength={20}
                    onChange={e => setEditando(v => ({ ...v, clave: e.target.value.toUpperCase() }))}
                    placeholder="S273"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg font-mono focus:outline-none focus:border-guinda-400" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Modalidad</label>
                  <select value={editando.tipo || 'Otro'} onChange={e => setEditando(v => ({ ...v, tipo: e.target.value }))}
                    className="w-full px-2 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400">
                    {MODALIDADES.map(m => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Nombre</label>
                <input value={editando.nombre || ''} onChange={e => setEditando(v => ({ ...v, nombre: e.target.value }))}
                  placeholder="Programa de Mejoramiento Urbano"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Unidad responsable</label>
                  <input value={editando.unidad_responsable || ''} onChange={e => setEditando(v => ({ ...v, unidad_responsable: e.target.value }))}
                    placeholder="DGOTU / CONAVI"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400" />
                  {/* Esto no es decorativo: al crear un proyecto, los Pp
                      cuya UR menciona las siglas de su DG se ofrecen
                      arriba, agrupados aparte. */}
                  <p className="text-[10px] text-gray-400 mt-1">
                    Si escribes aquí las siglas de una DG, sus proyectos verán este programa
                    agrupado arriba del resto.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Ejercicio</label>
                  <input type="number" value={editando.ejercicio_fiscal || ''}
                    onChange={e => setEditando(v => ({ ...v, ejercicio_fiscal: e.target.value }))}
                    placeholder="2026"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Descripción</label>
                <textarea value={editando.descripcion || ''} onChange={e => setEditando(v => ({ ...v, descripcion: e.target.value }))}
                  rows={3} placeholder="Qué atiende el programa."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-guinda-400" />
              </div>

              {editando.usos > 0 && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  {editando.usos} proyecto{editando.usos !== 1 ? 's' : ''} vinculado{editando.usos !== 1 ? 's' : ''} a este
                  programa. Lo que cambies aquí se refleja en todos.
                </p>
              )}

              {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
              <button onClick={() => setEditando(null)} className="btn-secondary text-sm">Cancelar</button>
              <button onClick={guardar}
                disabled={guardando || !editando.nombre?.trim() || !editando.clave?.trim()}
                className="btn-primary text-sm disabled:opacity-40">
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        abierto={!!porEliminar}
        titulo="Eliminar programa"
        mensaje={porEliminar
          ? `Se quitará «${porEliminar.clave} — ${porEliminar.nombre}» del catálogo. Ningún proyecto lo usa, así que no se pierde ningún vínculo.`
          : ''}
        textoConfirmar="Sí, eliminar"
        variante="danger"
        onConfirmar={() => eliminar(porEliminar)}
        onCancelar={() => setPorEliminar(null)}
      />
    </div>
  );
}
