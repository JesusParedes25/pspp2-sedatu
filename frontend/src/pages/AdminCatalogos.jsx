/**
 * ARCHIVO: AdminCatalogos.jsx
 * PROPÓSITO: Panel de administración (solo superadmin).
 * Tabs: Catálogos | Usuarios | Áreas | Configuración
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, RotateCcw, AlertTriangle, Shield, ChevronDown, ChevronRight,
  Loader2, Save, X, Users, Building2, Settings, Mail, ToggleLeft, ToggleRight,
  RefreshCw, CheckCircle, EyeOff, Eye
} from 'lucide-react';
import * as adminApi from '../api/admin';
import * as proyectosApi from '../api/proyectos';
import emailjs from '@emailjs/browser';
import ConfirmDialog from '../components/common/ConfirmDialog';

// ─── Tab: Catálogos ──────────────────────────────────────────────
function TabCatalogos() {
  const [catalogos, setCatalogos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [tipoAbierto, setTipoAbierto] = useState(null);
  const [editando, setEditando] = useState(null);
  const [nuevo, setNuevo] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { const r = await adminApi.listarCatalogos(); setCatalogos(r.datos); }
    catch (e) { setError(e.response?.data?.mensaje || 'Error'); }
    finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function guardarNuevo() {
    if (!nuevo?.valor?.trim()) return;
    try { await adminApi.agregarValor(nuevo.tipo, nuevo.valor, nuevo.descripcion); setNuevo(null); cargar(); }
    catch (e) { setError(e.response?.data?.mensaje || 'Error'); }
  }
  async function guardarEdicion() {
    if (!editando) return;
    try { await adminApi.editarValor(editando.id, { valor: editando.valor, descripcion: editando.descripcion }); setEditando(null); cargar(); }
    catch (e) { setError(e.response?.data?.mensaje || 'Error'); }
  }

  if (cargando) return <div className="flex justify-center py-10"><Loader2 size={24} className="animate-spin text-guinda-600" /></div>;

  return (
    <div className="space-y-2">
      {error && <ErrorBanner msg={error} onClose={() => setError(null)} />}
      {catalogos.map(cat => {
        const abierto = tipoAbierto === cat.tipo;
        const esFijo = !cat.extensible;
        const activos = cat.valores.filter(v => v.activo);
        const inactivos = cat.valores.filter(v => !v.activo);
        return (
          <div key={cat.tipo} className={`border rounded-lg ${esFijo ? 'border-amber-200 bg-amber-50/20' : 'border-gray-200 bg-white'}`}>
            <button onClick={() => setTipoAbierto(abierto ? null : cat.tipo)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50/50 rounded-t-lg">
              {abierto ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
              <span className="text-sm font-semibold text-gray-800 capitalize">{cat.tipo.replace(/_/g, ' ')}</span>
              <span className="text-xs text-gray-400 ml-1">({activos.length} activos{inactivos.length > 0 ? `, ${inactivos.length} inactivos` : ''})</span>
              {esFijo && <span className="ml-auto text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded font-medium flex items-center gap-1"><AlertTriangle size={10} /> FIJO</span>}
            </button>
            {abierto && (
              <div className="px-4 pb-3 space-y-1">
                {esFijo && <p className="text-[11px] text-amber-600 mb-2 flex items-center gap-1"><AlertTriangle size={11} />Este catálogo es fijo. Solo se puede editar el texto.</p>}
                {activos.map(v => (
                  <div key={v.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50 group">
                    {editando?.id === v.id ? (
                      <>
                        <input value={editando.valor} onChange={e => setEditando({ ...editando, valor: e.target.value })} className="input-base text-xs py-0.5 flex-1" autoFocus />
                        <input value={editando.descripcion || ''} onChange={e => setEditando({ ...editando, descripcion: e.target.value })} placeholder="Descripción" className="input-base text-xs py-0.5 w-40" />
                        <button onClick={guardarEdicion} className="text-green-600 hover:text-green-700"><Save size={14} /></button>
                        <button onClick={() => setEditando(null)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-gray-700 flex-1">{v.valor}</span>
                        {v.descripcion && <span className="text-[10px] text-gray-400 truncate max-w-[150px]">{v.descripcion}</span>}
                        <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
                          <button onClick={() => setEditando({ id: v.id, valor: v.valor, descripcion: v.descripcion || '' })} className="text-gray-400 hover:text-blue-600"><Pencil size={12} /></button>
                          {!esFijo && <button onClick={async () => { await adminApi.desactivarValor(v.id); cargar(); }} className="text-gray-400 hover:text-red-600"><Trash2 size={12} /></button>}
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {inactivos.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-[10px] text-gray-400 cursor-pointer">{inactivos.length} inactivo(s)</summary>
                    {inactivos.map(v => (
                      <div key={v.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50 opacity-50">
                        <span className="text-xs text-gray-500 flex-1 line-through">{v.valor}</span>
                        <button onClick={async () => { await adminApi.reactivarValor(v.id); cargar(); }} className="text-green-500 hover:text-green-700"><RotateCcw size={12} /></button>
                      </div>
                    ))}
                  </details>
                )}
                {!esFijo && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    {nuevo?.tipo === cat.tipo ? (
                      <div className="flex items-center gap-2">
                        <input value={nuevo.valor} onChange={e => setNuevo({ ...nuevo, valor: e.target.value })} placeholder="Nuevo valor..." className="input-base text-xs py-0.5 flex-1" autoFocus onKeyDown={e => e.key === 'Enter' && guardarNuevo()} />
                        <input value={nuevo.descripcion || ''} onChange={e => setNuevo({ ...nuevo, descripcion: e.target.value })} placeholder="Descripción (opc.)" className="input-base text-xs py-0.5 w-36" />
                        <button onClick={guardarNuevo} className="text-green-600 hover:text-green-700"><Save size={14} /></button>
                        <button onClick={() => setNuevo(null)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                      </div>
                    ) : (
                      <button onClick={() => setNuevo({ tipo: cat.tipo, valor: '', descripcion: '' })} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                        <Plus size={12} /> Agregar valor
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab: Usuarios ───────────────────────────────────────────────
const ROLES = ['superadmin', 'ejecutivo', 'direccion', 'enlace', 'externo'];

// Envía el correo de invitación vía EmailJS (se ejecuta desde el navegador).
// Devuelve { enviado: true } o { enviado: false, motivo: string }.
async function enviarCorreoInvitacion(nombreUsuario, correoUsuario, inviteLink) {
  try {
    const json = await adminApi.obtenerConfigPublico();
    const cfg = json.datos || {};
    if (cfg.emailjs_enabled !== 'true') return { enviado: false, motivo: 'correo_deshabilitado' };
    const { emailjs_service_id: svcId, emailjs_template_id: tplId, emailjs_public_key: pubKey } = cfg;
    if (!svcId || !tplId || !pubKey) return { enviado: false, motivo: 'sin_configuracion' };
    await emailjs.send(svcId, tplId, {
      to_name: nombreUsuario,
      to_email: correoUsuario,
      invite_link: inviteLink,
    }, pubKey);
    return { enviado: true };
  } catch (err) {
    console.error('EmailJS error:', err);
    return { enviado: false, motivo: 'error_envio' };
  }
}

function TabUsuarios({ dgs, das }) {
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null); // null | { modo: 'crear'|'editar', datos }
  const [enviando, setEnviando] = useState(false);
  const [inviteLink, setInviteLink] = useState(null); // { usuario, invite_link, correoEnviado, motivoFallo }
  const [porEliminarU, setPorEliminarU] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { const r = await adminApi.listarUsuariosAdmin(); setUsuarios(r.datos); }
    catch (e) { setError(e.response?.data?.mensaje || 'Error'); }
    finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const dasDgActual = modal ? das.filter(d => d.id_dg === modal.datos.id_dg) : [];

  async function guardar() {
    setEnviando(true);
    try {
      if (modal.modo === 'crear') {
        const r = await adminApi.crearUsuarioAdmin(modal.datos);
        const link = r.datos.invite_link;
        const resultado = await enviarCorreoInvitacion(r.datos.nombre_completo, r.datos.correo, link);
        setInviteLink({ usuario: r.datos, invite_link: link, correoEnviado: resultado.enviado, motivoFallo: resultado.motivo });
        setModal(null);
        cargar();
      } else {
        await adminApi.editarUsuarioAdmin(modal.datos.id, modal.datos);
        setModal(null);
        cargar();
      }
    } catch (e) { setError(e.response?.data?.mensaje || 'Error'); }
    finally { setEnviando(false); }
  }

  async function reenviar(u) {
    try {
      const r = await adminApi.reenviarInvitacion(u.id);
      const link = r.datos.invite_link;
      const resultado = await enviarCorreoInvitacion(u.nombre_completo, u.correo, link);
      setInviteLink({ usuario: u, invite_link: link, correoEnviado: resultado.enviado, motivoFallo: resultado.motivo });
    } catch (e) { setError(e.response?.data?.mensaje || 'Error'); }
  }

  async function toggleActivo(id) {
    try { await adminApi.toggleUsuarioAdmin(id); cargar(); }
    catch (e) { setError(e.response?.data?.mensaje || 'Error'); }
  }

  async function eliminarU(u) {
    try {
      await adminApi.eliminarUsuarioAdmin(u.id);
      setUsuarios(prev => prev.filter(x => x.id !== u.id));
    } catch (e) { setError(e.response?.data?.mensaje || 'Error al eliminar'); }
    finally { setPorEliminarU(null); }
  }

  const rolColor = { superadmin: 'bg-guinda-100 text-guinda-700', ejecutivo: 'bg-purple-100 text-purple-700', direccion: 'bg-blue-100 text-blue-700', enlace: 'bg-green-100 text-green-700', externo: 'bg-gray-100 text-gray-600' };

  if (cargando) return <div className="flex justify-center py-10"><Loader2 size={24} className="animate-spin text-guinda-600" /></div>;

  return (
    <div>
      {error && <ErrorBanner msg={error} onClose={() => setError(null)} />}

      {inviteLink && (
        <div className={`mb-4 p-4 rounded-lg border ${inviteLink.correoEnviado ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              {inviteLink.correoEnviado
                ? <p className="text-sm font-medium text-green-800">✅ Correo de invitación enviado a <strong>{inviteLink.usuario.correo}</strong></p>
                : <p className="text-sm font-medium text-amber-800">⚠️ Usuario creado, pero el correo no pudo enviarse
                    {inviteLink.motivoFallo === 'correo_deshabilitado' && ' (envío deshabilitado en Configuración)'}
                    {inviteLink.motivoFallo === 'sin_configuracion' && ' (configura EmailJS en Configuración)'}
                    {inviteLink.motivoFallo === 'error_envio' && ' (error de EmailJS — revisa las credenciales)'}
                  </p>
              }
              <p className="text-xs text-gray-500 mt-0.5">Enlace válido por 30 días. Cópialo si necesitas enviarlo manualmente.</p>
            </div>
            <button onClick={() => setInviteLink(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0"><X size={14} /></button>
          </div>
          <div className="flex gap-2 items-center">
            <input readOnly value={inviteLink.invite_link} className="input-base text-xs flex-1 bg-white" onClick={e => e.target.select()} />
            <button onClick={() => navigator.clipboard.writeText(inviteLink.invite_link)} className="text-xs px-3 py-1.5 bg-gray-700 text-white rounded-lg hover:bg-gray-600 whitespace-nowrap">Copiar enlace</button>
          </div>
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button onClick={() => setModal({ modo: 'crear', datos: { nombre_completo: '', correo: '', cargo: '', rol: 'enlace', id_dg: '', id_direccion_area: '' } })}
          className="flex items-center gap-2 px-4 py-2 bg-guinda-700 text-white rounded-lg text-sm hover:bg-guinda-600">
          <Plus size={16} /> Nuevo usuario
        </button>
      </div>

      <div className="space-y-2">
        {usuarios.map(u => (
          <div key={u.id} className={`border rounded-lg p-4 flex items-center gap-4 ${u.activo ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-200 opacity-60'}`}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{u.nombre_completo}</p>
              <p className="text-xs text-gray-500 truncate">{u.correo} · {u.cargo}</p>
              <p className="text-xs text-gray-400">{u.dg_siglas}{u.da_siglas ? ` / ${u.da_siglas}` : ''}</p>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${rolColor[u.rol] || 'bg-gray-100 text-gray-600'}`}>{u.rol}</span>
            <div className="flex gap-2">
              <button onClick={() => setModal({ modo: 'editar', datos: { ...u, id_dg: u.id_dg || '', id_direccion_area: u.id_direccion_area || '' } })}
                className="text-gray-400 hover:text-blue-600" title="Editar"><Pencil size={15} /></button>
              <button onClick={() => reenviar(u)} className="text-gray-400 hover:text-guinda-600" title="Generar nuevo enlace de activación"><RefreshCw size={15} /></button>
              <button onClick={() => toggleActivo(u.id)} className={u.activo ? 'text-green-500 hover:text-red-500' : 'text-gray-400 hover:text-green-500'} title={u.activo ? 'Desactivar' : 'Activar'}>
                {u.activo ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
              </button>
              <button onClick={() => setPorEliminarU(u)} className="text-gray-400 hover:text-red-600" title="Eliminar usuario permanentemente"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-semibold text-gray-800">{modal.modo === 'crear' ? 'Nuevo usuario' : 'Editar usuario'}</h3>
              <button onClick={() => setModal(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <Field label="Nombre completo" required>
                <input value={modal.datos.nombre_completo} onChange={e => setModal(m => ({ ...m, datos: { ...m.datos, nombre_completo: e.target.value } }))} className="input-base text-sm" />
              </Field>
              <Field label="Correo institucional" required>
                <input type="email" value={modal.datos.correo} onChange={e => setModal(m => ({ ...m, datos: { ...m.datos, correo: e.target.value } }))} className="input-base text-sm" />
              </Field>
              <Field label="Cargo">
                <input value={modal.datos.cargo || ''} onChange={e => setModal(m => ({ ...m, datos: { ...m.datos, cargo: e.target.value } }))} className="input-base text-sm" />
              </Field>
              <Field label="Rol" required>
                <select value={modal.datos.rol} onChange={e => setModal(m => ({ ...m, datos: { ...m.datos, rol: e.target.value } }))} className="input-base text-sm">
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
              <Field label="Dirección General">
                <select value={modal.datos.id_dg || ''} onChange={e => setModal(m => ({ ...m, datos: { ...m.datos, id_dg: e.target.value, id_direccion_area: '' } }))} className="input-base text-sm">
                  <option value="">— Sin DG —</option>
                  {dgs.map(d => <option key={d.id} value={d.id}>{d.siglas} — {d.nombre}</option>)}
                </select>
              </Field>
              {dasDgActual.length > 0 && (
                <Field label="Dirección de Área">
                  <select value={modal.datos.id_direccion_area || ''} onChange={e => setModal(m => ({ ...m, datos: { ...m.datos, id_direccion_area: e.target.value } }))} className="input-base text-sm">
                    <option value="">— Sin DA —</option>
                    {dasDgActual.map(d => <option key={d.id} value={d.id}>{d.siglas} — {d.nombre}</option>)}
                  </select>
                </Field>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button onClick={guardar} disabled={enviando} className="px-4 py-2 text-sm bg-guinda-700 text-white rounded-lg hover:bg-guinda-600 disabled:opacity-50 flex items-center gap-2">
                {enviando && <Loader2 size={14} className="animate-spin" />}
                {modal.modo === 'crear' ? 'Crear usuario' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        abierto={!!porEliminarU}
        titulo="Eliminar usuario permanentemente"
        mensaje={porEliminarU ? `¿Eliminar a "${porEliminarU.nombre_completo}" (${porEliminarU.correo})? Se borrará de forma permanente e irreversible.` : ''}
        textoConfirmar="Sí, eliminar"
        variante="danger"
        onConfirmar={() => eliminarU(porEliminarU)}
        onCancelar={() => setPorEliminarU(null)}
      />
    </div>
  );
}

// ─── Tab: Áreas ──────────────────────────────────────────────────
function TabAreas({ dgs, das, recargar }) {
  const [tab, setTab] = useState('dg');
  const [modal, setModal] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const urs = [...new Set(dgs.filter(d => d.ur_siglas).map(d => d.ur_siglas))];

  async function guardar() {
    setEnviando(true);
    try {
      if (tab === 'dg') {
        if (modal.modo === 'crear') await adminApi.crearDGAdmin(modal.datos);
        else await adminApi.editarDGAdmin(modal.datos.id, modal.datos);
      } else {
        if (modal.modo === 'crear') await adminApi.crearDAAdmin(modal.datos);
        else await adminApi.editarDAAdmin(modal.datos.id, modal.datos);
      }
      setModal(null);
      recargar();
    } catch (e) { setError(e.response?.data?.mensaje || 'Error'); }
    finally { setEnviando(false); }
  }

  const internas = dgs.filter(d => !d.es_externa);
  const externas = dgs.filter(d => d.es_externa);

  return (
    <div>
      {error && <ErrorBanner msg={error} onClose={() => setError(null)} />}
      <div className="flex gap-2 mb-5">
        <TabBtn active={tab === 'dg'} onClick={() => setTab('dg')}>Direcciones Generales ({dgs.length})</TabBtn>
        <TabBtn active={tab === 'da'} onClick={() => setTab('da')}>Direcciones de Área ({das.length})</TabBtn>
      </div>

      {tab === 'dg' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setModal({ modo: 'crear', datos: { nombre: '', siglas: '', descripcion: '', id_unidad_responsable: '', es_externa: false, secretaria_externa: '' } })}
              className="flex items-center gap-2 px-4 py-2 bg-guinda-700 text-white rounded-lg text-sm hover:bg-guinda-600">
              <Plus size={16} /> Nueva DG
            </button>
          </div>

          {internas.length > 0 && <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">SEDATU</p>}
          <div className="space-y-1 mb-4">
            {internas.map(d => (
              <div key={d.id} className="border border-gray-200 rounded-lg px-4 py-2.5 flex items-center gap-3 bg-white">
                <span className="text-sm font-medium text-guinda-700 w-20 flex-shrink-0">{d.siglas}</span>
                <span className="text-sm text-gray-700 flex-1 truncate">{d.nombre}</span>
                {d.ur_siglas && <span className="text-xs text-gray-400">{d.ur_siglas}</span>}
                <button onClick={() => setModal({ modo: 'editar', datos: { ...d } })} className="text-gray-400 hover:text-blue-600"><Pencil size={14} /></button>
              </div>
            ))}
          </div>

          {externas.length > 0 && <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Externas</p>}
          <div className="space-y-1">
            {externas.map(d => (
              <div key={d.id} className="border border-dashed border-gray-300 rounded-lg px-4 py-2.5 flex items-center gap-3 bg-gray-50">
                <span className="text-sm font-medium text-gray-600 w-20 flex-shrink-0">{d.siglas}</span>
                <span className="text-sm text-gray-600 flex-1 truncate">{d.nombre}</span>
                {d.secretaria_externa && <span className="text-xs text-gray-400 italic">{d.secretaria_externa}</span>}
                <button onClick={() => setModal({ modo: 'editar', datos: { ...d } })} className="text-gray-400 hover:text-blue-600"><Pencil size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'da' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setModal({ modo: 'crear', datos: { nombre: '', siglas: '', id_dg: dgs[0]?.id || '' } })}
              className="flex items-center gap-2 px-4 py-2 bg-guinda-700 text-white rounded-lg text-sm hover:bg-guinda-600">
              <Plus size={16} /> Nueva DA
            </button>
          </div>
          <div className="space-y-1">
            {das.map(d => (
              <div key={d.id} className="border border-gray-200 rounded-lg px-4 py-2.5 flex items-center gap-3 bg-white">
                <span className="text-xs text-gray-400 w-16 flex-shrink-0">{d.dg_siglas}</span>
                <span className="text-sm font-medium text-gray-700 w-20 flex-shrink-0">{d.siglas}</span>
                <span className="text-sm text-gray-600 flex-1 truncate">{d.nombre}</span>
                <button onClick={() => setModal({ modo: 'editar', datos: { ...d } })} className="text-gray-400 hover:text-blue-600"><Pencil size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-semibold text-gray-800">{modal.modo === 'crear' ? (tab === 'dg' ? 'Nueva DG' : 'Nueva DA') : (tab === 'dg' ? 'Editar DG' : 'Editar DA')}</h3>
              <button onClick={() => setModal(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <Field label="Nombre completo" required>
                <input value={modal.datos.nombre} onChange={e => setModal(m => ({ ...m, datos: { ...m.datos, nombre: e.target.value } }))} className="input-base text-sm" />
              </Field>
              <Field label="Siglas" required>
                <input value={modal.datos.siglas} onChange={e => setModal(m => ({ ...m, datos: { ...m.datos, siglas: e.target.value } }))} className="input-base text-sm uppercase" />
              </Field>
              {tab === 'dg' && (
                <>
                  <Field label="Descripción">
                    <input value={modal.datos.descripcion || ''} onChange={e => setModal(m => ({ ...m, datos: { ...m.datos, descripcion: e.target.value } }))} className="input-base text-sm" />
                  </Field>
                  <div className="flex items-center gap-3">
                    <label className="text-sm text-gray-700">¿Es externa?</label>
                    <input type="checkbox" checked={modal.datos.es_externa || false} onChange={e => setModal(m => ({ ...m, datos: { ...m.datos, es_externa: e.target.checked } }))} className="w-4 h-4 accent-guinda-600" />
                  </div>
                  {modal.datos.es_externa && (
                    <Field label="Nombre de la Secretaría">
                      <input value={modal.datos.secretaria_externa || ''} onChange={e => setModal(m => ({ ...m, datos: { ...m.datos, secretaria_externa: e.target.value } }))} placeholder="Ej. SEMARNAT" className="input-base text-sm" />
                    </Field>
                  )}
                </>
              )}
              {tab === 'da' && (
                <Field label="Dirección General" required>
                  <select value={modal.datos.id_dg || ''} onChange={e => setModal(m => ({ ...m, datos: { ...m.datos, id_dg: e.target.value } }))} className="input-base text-sm">
                    <option value="">— Selecciona DG —</option>
                    {dgs.map(d => <option key={d.id} value={d.id}>{d.siglas} — {d.nombre}</option>)}
                  </select>
                </Field>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button onClick={guardar} disabled={enviando} className="px-4 py-2 text-sm bg-guinda-700 text-white rounded-lg hover:bg-guinda-600 disabled:opacity-50 flex items-center gap-2">
                {enviando && <Loader2 size={14} className="animate-spin" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Configuración ──────────────────────────────────────────
function TabConfiguracion() {
  const [config, setConfig] = useState({});
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState(null);
  const [mostrarKey, setMostrarKey] = useState(false);

  useEffect(() => {
    adminApi.obtenerConfig().then(r => {
      const map = {};
      r.datos.forEach(i => { map[i.clave] = i.valor || ''; });
      setConfig(map);
    }).catch(() => {}).finally(() => setCargando(false));
  }, []);

  async function guardar() {
    setGuardando(true); setOk(false); setError(null);
    try {
      await adminApi.actualizarConfig(Object.entries(config).map(([clave, valor]) => ({ clave, valor })));
      setOk(true);
      setTimeout(() => setOk(false), 3000);
    } catch (e) { setError(e.response?.data?.mensaje || 'Error al guardar'); }
    finally { setGuardando(false); }
  }

  if (cargando) return <div className="flex justify-center py-10"><Loader2 size={24} className="animate-spin text-guinda-600" /></div>;

  return (
    <div className="max-w-lg space-y-6">
      {error && <ErrorBanner msg={error} onClose={() => setError(null)} />}
      {ok && <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700"><CheckCircle size={16} />Configuración guardada</div>}

      <div className="border border-gray-200 rounded-xl p-5 bg-white space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Mail size={18} className="text-guinda-600" />
          <h3 className="font-semibold text-gray-800">Configuración de EmailJS</h3>
        </div>
        <p className="text-xs text-gray-500">Estas credenciales se usan para enviar correos de bienvenida al crear usuarios. Consígualas en <a href="https://www.emailjs.com" target="_blank" rel="noreferrer" className="text-blue-600 underline">emailjs.com</a>.</p>

        <Field label="Service ID">
          <input value={config.emailjs_service_id || ''} onChange={e => setConfig(c => ({ ...c, emailjs_service_id: e.target.value }))} placeholder="service_xxxxxxx" className="input-base text-sm" />
        </Field>
        <Field label="Template ID">
          <input value={config.emailjs_template_id || ''} onChange={e => setConfig(c => ({ ...c, emailjs_template_id: e.target.value }))} placeholder="template_xxxxxxx" className="input-base text-sm" />
        </Field>
        <Field label="Public Key (User ID)">
          <div className="relative">
            <input type={mostrarKey ? 'text' : 'password'} value={config.emailjs_public_key || ''} onChange={e => setConfig(c => ({ ...c, emailjs_public_key: e.target.value }))} placeholder="Tu llave pública" className="input-base text-sm pr-9" />
            <button type="button" onClick={() => setMostrarKey(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
              {mostrarKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </Field>

        <div className="flex items-center gap-3 pt-1">
          <label className="text-sm text-gray-700 font-medium">Habilitar envío de correos</label>
          <button onClick={() => setConfig(c => ({ ...c, emailjs_enabled: c.emailjs_enabled === 'true' ? 'false' : 'true' }))}
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${config.emailjs_enabled === 'true' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {config.emailjs_enabled === 'true' ? <><ToggleRight size={16} /> Habilitado</> : <><ToggleLeft size={16} /> Deshabilitado</>}
          </button>
        </div>
      </div>

      <button onClick={guardar} disabled={guardando} className="flex items-center gap-2 px-5 py-2.5 bg-guinda-700 text-white rounded-lg text-sm hover:bg-guinda-600 disabled:opacity-50">
        {guardando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
        Guardar configuración
      </button>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────
function ErrorBanner({ msg, onClose }) {
  return (
    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
      <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
      <p className="text-sm text-red-700 flex-1">{msg}</p>
      <button onClick={onClose} className="text-red-400 hover:text-red-600"><X size={14} /></button>
    </div>
  );
}
function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
    </div>
  );
}
function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${active ? 'bg-guinda-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
      {children}
    </button>
  );
}

// ─── Componente principal ─────────────────────────────────────────
const TABS = [
  { id: 'catalogos', label: 'Catálogos', icon: Shield },
  { id: 'usuarios', label: 'Usuarios', icon: Users },
  { id: 'areas', label: 'Áreas', icon: Building2 },
  { id: 'papelera', label: 'Papelera', icon: Trash2 },
  { id: 'config', label: 'Configuración', icon: Settings },
];

// ─── Tab: Papelera de proyectos ───────────────────────────────────
function TabPapelera() {
  const [proyectos, setProyectos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [restaurando, setRestaurando] = useState(null);
  const [porRestaurar, setPorRestaurar] = useState(null);
  const [porPurgar, setPorPurgar] = useState(null);
  const [purgando, setPurgando] = useState(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await proyectosApi.listarProyectosEliminados();
      setProyectos(res.datos || []);
    } catch (err) {
      console.error('Error cargando papelera:', err);
    } finally { setCargando(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function restaurar(p) {
    setRestaurando(p.id);
    setError('');
    try {
      await proyectosApi.restaurarProyecto(p.id);
      setProyectos(prev => prev.filter(x => x.id !== p.id));
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al restaurar');
    } finally {
      setRestaurando(null);
      setPorRestaurar(null);
    }
  }

  async function purgar(p) {
    setPurgando(p.id);
    setError('');
    try {
      await proyectosApi.purgarProyecto(p.id);
      setProyectos(prev => prev.filter(x => x.id !== p.id));
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al eliminar');
    } finally {
      setPurgando(null);
      setPorPurgar(null);
    }
  }

  if (cargando) return <div className="text-sm text-gray-400 py-8 text-center">Cargando papelera…</div>;

  if (proyectos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Trash2 size={32} className="mb-2 text-gray-200" />
        <p className="text-sm">La papelera está vacía.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Proyectos eliminados en los últimos 30 días. Pasado ese plazo se purgan de forma permanente e irreversible.
      </p>
      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
      {proyectos.map(p => (
        <div key={p.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{p.nombre}</p>
            <p className="text-xs text-gray-400">
              {p.dg_lider_siglas && `${p.dg_lider_siglas} · `}
              Eliminado por {p.creador_nombre || '—'} el {new Date(p.deleted_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <span className={`text-[10px] font-medium px-2 py-1 rounded-full flex-shrink-0 ${p.dias_restantes <= 5 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
            {p.dias_restantes}d para ELIMINAR permanenetemente
          </span>
          <button
            onClick={() => setPorRestaurar(p)}
            disabled={restaurando === p.id}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-guinda-600 text-white hover:bg-guinda-700 disabled:opacity-40 flex-shrink-0"
          >
            <RotateCcw size={12} /> Restaurar
          </button>
          <button
            onClick={() => setPorPurgar(p)}
            disabled={purgando === p.id}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 flex-shrink-0"
            title="Eliminar permanentemente ahora"
          >
            <Trash2 size={12} /> Eliminar ya
          </button>
        </div>
      ))}

      <ConfirmDialog
        abierto={!!porRestaurar}
        titulo="Restaurar proyecto"
        mensaje={porRestaurar ? `¿Restaurar "${porRestaurar.nombre}"? Volverá a estar visible para todos los usuarios.` : ''}
        textoConfirmar="Sí, restaurar"
        variante="normal"
        onConfirmar={() => restaurar(porRestaurar)}
        onCancelar={() => setPorRestaurar(null)}
      />
      <ConfirmDialog
        abierto={!!porPurgar}
        titulo="Eliminar permanentemente"
        mensaje={porPurgar ? `Se eliminará "${porPurgar.nombre}" junto con todas sus etapas, acciones, archivos y comentarios. Esta acción es IRREVERSIBLE.` : ''}
        textoConfirmar="Sí, eliminar para siempre"
        variante="danger"
        onConfirmar={() => purgar(porPurgar)}
        onCancelar={() => setPorPurgar(null)}
      />
    </div>
  );
}

export default function AdminCatalogos() {
  const [tab, setTab] = useState('catalogos');
  const [dgs, setDgs] = useState([]);
  const [das, setDas] = useState([]);

  const cargarAreas = useCallback(async () => {
    try {
      const [r1, r2] = await Promise.all([adminApi.listarDGsAdmin(), adminApi.listarDAsAdmin()]);
      setDgs(r1.datos);
      setDas(r2.datos);
    } catch {}
  }, []);

  useEffect(() => { cargarAreas(); }, [cargarAreas]);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-guinda-100 rounded-lg flex items-center justify-center">
          <Shield size={20} className="text-guinda-700" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-800">Panel de Administración</h1>
          <p className="text-sm text-gray-500">Superadministrador</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-guinda-700 text-guinda-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'catalogos' && <TabCatalogos />}
      {tab === 'usuarios' && <TabUsuarios dgs={dgs} das={das} />}
      {tab === 'areas' && <TabAreas dgs={dgs} das={das} recargar={cargarAreas} />}
      {tab === 'papelera' && <TabPapelera />}
      {tab === 'config' && <TabConfiguracion />}
    </div>
  );
}
