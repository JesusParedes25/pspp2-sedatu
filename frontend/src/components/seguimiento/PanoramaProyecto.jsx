/**
 * ARCHIVO: PanoramaProyecto.jsx
 * PROPÓSITO: Tab "Panorama del proyecto" — single scrollable dashboard con:
 *  Encabezado, Participantes, Indicadores, Mapa territorial,
 *  Vencidos/por vencer, Riesgos, Actividad reciente.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Users, UserPlus, Target, MapPin, AlertTriangle, Clock, Activity,
  TrendingUp, Calendar, Shield, ChevronRight, X, Trash2, Search, Loader2
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { usePermisosProyecto } from '../../hooks/usePermisos';
import { obtenerPanorama, crearInvitacion, eliminarMiembro, cancelarInvitacion } from '../../api/miembros';
import { calcularColorSemaforo } from '../../utils/semaforoColor';
import client from '../../api/client';

const GUINDA = '#7B1C3E';
const GUINDA_LIGHT = '#9f2241';

// ─── Helpers ──────────────────────────────────────────────────
function fmt(f) {
  if (!f) return '—';
  return new Date(f).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function rel(fecha) {
  if (!fecha) return '';
  const diff = Date.now() - new Date(fecha).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d}d`;
  return fmt(fecha);
}

// ─── Sección Card wrapper ─────────────────────────────────────
function SeccionCard({ titulo, icono: Icono, children, className = '' }) {
  return (
    <section className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}>
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
        {Icono && <Icono size={16} className="text-gray-500" />}
        <h3 className="text-sm font-semibold text-gray-800">{titulo}</h3>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

// ─── Componente principal ─────────────────────────────────────
export default function PanoramaProyecto({ proyecto, etapas, proyectoId, refreshKey }) {
  const { usuario } = useAuth();
  const permisos = usePermisosProyecto(proyecto);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [modalInvitar, setModalInvitar] = useState(false);

  useEffect(() => {
    if (!proyectoId) return;
    setCargando(true);
    obtenerPanorama(proyectoId)
      .then(d => setDatos(d))
      .catch(() => {})
      .finally(() => setCargando(false));
  }, [proyectoId, refreshKey]);

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-guinda-600" />
      </div>
    );
  }

  if (!datos) return <p className="text-center text-gray-500 py-10">Error al cargar panorama</p>;

  const { miembros, indicadores, cobertura, vencidos, por_vencer, riesgos, actividad } = datos;
  const pct = parseFloat(proyecto?.porcentaje_calculado) || 0;
  const sem = calcularColorSemaforo(pct, proyecto?.fecha_inicio, proyecto?.fecha_limite);

  return (
    <div className="space-y-5">
      {/* ═══ ENCABEZADO ═══ */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-start gap-4">
          {/* Anillo de avance */}
          <div className="relative flex-shrink-0 w-16 h-16">
            <svg width={64} height={64} className="-rotate-90">
              <circle cx={32} cy={32} r={26} fill="none" stroke="#f3f4f6" strokeWidth={6} />
              <circle cx={32} cy={32} r={26} fill="none" stroke={sem.color} strokeWidth={6}
                strokeDasharray={`${(pct / 100) * 163.36} 163.36`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold" style={{ color: sem.color }}>{pct.toFixed(0)}%</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-gray-900 truncate">{proyecto.nombre}</h2>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${
                proyecto.estado === 'En_proceso' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                proyecto.estado === 'Concluido' ? 'bg-green-50 text-green-700 border-green-200' :
                proyecto.estado === 'Pausado' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                'bg-gray-50 text-gray-600 border-gray-200'
              }`}>{proyecto.estado?.replace('_', ' ')}</span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 flex-wrap">
              <span className="flex items-center gap-1"><Calendar size={12} /> {fmt(proyecto.fecha_inicio)} — {fmt(proyecto.fecha_limite)}</span>
              {proyecto.dg_lider_siglas && <span className="font-medium text-gray-700">{proyecto.dg_lider_siglas}</span>}
              {proyecto.direccion_area_siglas && <span>{proyecto.direccion_area_siglas}</span>}
            </div>
            {proyecto.descripcion && (
              <p className="text-xs text-gray-600 mt-2 line-clamp-2">{proyecto.descripcion}</p>
            )}
          </div>
        </div>
      </div>

      {/* ═══ PARTICIPANTES ═══ */}
      <SeccionCard titulo="Participantes" icono={Users}>
        <div className="space-y-2">
          {miembros.map(m => (
            <div key={m.id_usuario} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-guinda-100 flex items-center justify-center text-xs font-bold text-guinda-700">
                  {m.nombre_completo?.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{m.nombre_completo}</p>
                  <p className="text-xs text-gray-500">{m.dg_siglas} · {m.rol}</p>
                </div>
              </div>
              {permisos.puedeEditar && m.id_usuario !== usuario?.id && (
                <button
                  onClick={() => handleEliminarMiembro(m.id_usuario)}
                  className="text-gray-400 hover:text-red-500 p-1"
                  title="Eliminar del proyecto"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          {miembros.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">Sin participantes registrados</p>
          )}
        </div>
        {permisos.puedeEditar && (
          <button
            onClick={() => setModalInvitar(true)}
            className="mt-3 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-guinda-200 text-guinda-700 hover:bg-guinda-50 transition"
          >
            <UserPlus size={14} /> Invitar usuario
          </button>
        )}
      </SeccionCard>

      {/* ═══ INDICADORES ═══ */}
      {indicadores.length > 0 && (
        <SeccionCard titulo="Indicadores" icono={Target}>
          <div className="grid gap-4 sm:grid-cols-2">
            {indicadores.map(ind => (
              <IndicadorCard key={ind.id} indicador={ind} />
            ))}
          </div>
        </SeccionCard>
      )}

      {/* ═══ MAPA TERRITORIAL ═══ */}
      {cobertura.length > 0 && (
        <SeccionCard titulo="Cobertura geográfica" icono={MapPin}>
          <div className="flex flex-wrap gap-2">
            {[...new Set(cobertura.map(c => c.estado_nombre).filter(Boolean))].map(e => (
              <span key={e} className="text-xs bg-guinda-50 text-guinda-700 px-2 py-1 rounded-full border border-guinda-200">{e}</span>
            ))}
          </div>
          {cobertura.some(c => c.municipio_nombre) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {cobertura.filter(c => c.municipio_nombre).map(c => (
                <span key={c.id} className="text-[11px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{c.municipio_nombre}, {c.estado_nombre}</span>
              ))}
            </div>
          )}
        </SeccionCard>
      )}

      {/* ═══ VENCIDOS Y POR VENCER ═══ */}
      {(vencidos.length > 0 || por_vencer.length > 0) && (
        <div className="grid gap-5 md:grid-cols-2">
          {vencidos.length > 0 && (
            <SeccionCard titulo={`Vencidas (${vencidos.length})`} icono={AlertTriangle}>
              <ul className="space-y-2">
                {vencidos.slice(0, 8).map(a => (
                  <li key={a.id} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 truncate">{a.nombre}</p>
                      <p className="text-[11px] text-gray-500">
                        {a.id_accion_padre ? 'Subacción' : 'Acción'} · -{a.dias_atraso}d atraso
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </SeccionCard>
          )}
          {por_vencer.length > 0 && (
            <SeccionCard titulo={`Por vencer (${por_vencer.length})`} icono={Clock}>
              <ul className="space-y-2">
                {por_vencer.slice(0, 8).map(a => (
                  <li key={a.id} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 truncate">{a.nombre}</p>
                      <p className="text-[11px] text-gray-500">
                        {a.id_accion_padre ? 'Subacción' : 'Acción'} · {a.dias_restantes}d restantes
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </SeccionCard>
          )}
        </div>
      )}

      {/* ═══ RIESGOS Y BLOQUEOS ═══ */}
      {riesgos.length > 0 && (
        <SeccionCard titulo={`Riesgos abiertos (${riesgos.length})`} icono={Shield}>
          <ul className="space-y-2">
            {riesgos.slice(0, 8).map(r => (
              <li key={r.id} className="flex items-center gap-2 py-1">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  r.nivel === 'Critico' ? 'bg-red-600' :
                  r.nivel === 'Alto' ? 'bg-orange-500' :
                  r.nivel === 'Medio' ? 'bg-yellow-500' : 'bg-gray-400'
                }`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800 truncate">{r.titulo}</p>
                  <p className="text-[11px] text-gray-500">{r.entidad_tipo} · {r.nivel}</p>
                </div>
              </li>
            ))}
          </ul>
        </SeccionCard>
      )}

      {/* ═══ ACTIVIDAD RECIENTE ═══ */}
      {actividad.length > 0 && (
        <SeccionCard titulo="Actividad reciente" icono={Activity}>
          <ul className="space-y-3">
            {actividad.slice(0, 10).map((ev, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                  ev.tipo === 'comentario' ? 'bg-purple-100 text-purple-600' : 'bg-green-100 text-green-600'
                }`}>
                  {ev.tipo === 'comentario' ? <Activity size={12} /> : <TrendingUp size={12} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800">
                    <span className="font-medium">{ev.actor}</span>
                    {' '}<span className="text-gray-500">{ev.tipo === 'comentario' ? 'comentó' : 'subió evidencia'}:</span>
                    {' '}<span className="text-gray-700 truncate">{ev.descripcion?.slice(0, 80)}</span>
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{rel(ev.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        </SeccionCard>
      )}

      {/* ═══ MODAL INVITAR USUARIO ═══ */}
      {modalInvitar && (
        <ModalInvitar
          proyectoId={proyectoId}
          onClose={() => setModalInvitar(false)}
          onInvitado={() => {
            setModalInvitar(false);
            obtenerPanorama(proyectoId).then(d => setDatos(d));
          }}
        />
      )}
    </div>
  );

  async function handleEliminarMiembro(userId) {
    if (!confirm('¿Eliminar a este usuario del proyecto?')) return;
    try {
      await eliminarMiembro(proyectoId, userId);
      const nuevosDatos = await obtenerPanorama(proyectoId);
      setDatos(nuevosDatos);
    } catch (e) {
      alert(e.response?.data?.mensaje || 'Error al eliminar miembro');
    }
  }
}

// ─── Indicador Card ───────────────────────────────────────────
function IndicadorCard({ indicador }) {
  const meta = parseFloat(indicador.meta_global) || 0;
  const valor = parseFloat(indicador.valor_actual) || 0;
  const tieneMeta = meta > 0;
  const pct = tieneMeta ? Math.min(100, (valor / meta) * 100) : null;
  const unidad = indicador.unidad === 'Porcentaje' ? '%'
    : indicador.unidad === 'Moneda_MXN' ? '$MXN'
    : indicador.etiqueta_unidad || indicador.unidad_personalizada || '#';

  // Data for metas anuales chart
  const chartData = (indicador.metas_anuales || []).map(m => ({
    anio: m.anio,
    meta: parseFloat(m.valor_meta) || 0,
    real: parseFloat(m.valor_real) || 0
  }));

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-gray-800">{indicador.nombre}</p>
          {indicador.etapa_nombre && (
            <p className="text-[11px] text-gray-500">Etapa: {indicador.etapa_nombre}</p>
          )}
        </div>
        {tieneMeta ? (
          <span className="text-xs font-bold tabular-nums" style={{ color: GUINDA }}>
            {pct.toFixed(0)}%
          </span>
        ) : (
          <span className="text-xs font-bold tabular-nums" style={{ color: GUINDA }}>
            {valor.toLocaleString()} {unidad}
          </span>
        )}
      </div>

      {/* Progress bar — only when meta > 0 */}
      {tieneMeta && (
        <div className="space-y-1">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.min(100, pct || 0)}%`, backgroundColor: GUINDA_LIGHT }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-gray-500">
            <span>{valor.toLocaleString()} {unidad}</span>
            <span>Meta: {meta.toLocaleString()} {unidad}</span>
          </div>
        </div>
      )}

      {/* Numeralia — when no meta */}
      {!tieneMeta && valor > 0 && (
        <p className="text-sm font-semibold" style={{ color: GUINDA }}>
          {valor.toLocaleString()} {unidad}
        </p>
      )}

      {/* Metas anuales chart */}
      {chartData.length > 0 && (
        <div className="h-24 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={2}>
              <XAxis dataKey="anio" tick={{ fontSize: 10 }} />
              <YAxis hide />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="meta" fill="#e5e7eb" name="Meta" radius={[2,2,0,0]} />
              <Bar dataKey="real" fill={GUINDA_LIGHT} name="Real" radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─── Modal Invitar ────────────────────────────────────────────
function ModalInvitar({ proyectoId, onClose, onInvitado }) {
  const [dgs, setDgs] = useState([]);
  const [das, setDas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [cargandoU, setCargandoU] = useState(false);
  const [filtros, setFiltros] = useState({ id_dg: '', id_da: '', nombre: '' });
  const [seleccionado, setSeleccionado] = useState(null);
  const [rol, setRol] = useState('colaborador');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/catalogos/dgs').then(r => setDgs(r.data.datos || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (filtros.id_dg) {
      client.get(`/catalogos/direcciones-area?id_dg=${filtros.id_dg}`).then(r => setDas(r.data.datos || [])).catch(() => {});
    } else {
      setDas([]);
    }
  }, [filtros.id_dg]);

  const buscarUsuarios = useCallback(async () => {
    setCargandoU(true);
    try {
      const params = new URLSearchParams({ excluir_proyecto: proyectoId });
      if (filtros.id_dg) params.set('id_dg', filtros.id_dg);
      if (filtros.id_da) params.set('id_direccion_area', filtros.id_da);
      if (filtros.nombre) params.set('nombre', filtros.nombre);
      const r = await client.get(`/catalogos/usuarios?${params}`);
      setUsuarios(r.data.datos || []);
    } catch {}
    finally { setCargandoU(false); }
  }, [filtros, proyectoId]);

  useEffect(() => { buscarUsuarios(); }, [buscarUsuarios]);

  async function handleInvitar(e) {
    e.preventDefault();
    if (!seleccionado) return;
    setEnviando(true); setError('');
    try {
      await crearInvitacion(proyectoId, seleccionado.id, rol);
      onInvitado();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'Error al agregar usuario');
    } finally { setEnviando(false); }
  }

  const dasFiltradas = filtros.id_dg ? das : [];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-base font-semibold text-gray-900">Agregar usuario al proyecto</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        <div className="px-6 py-4 space-y-3">
          {/* Filtros */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Dirección General</label>
              <select value={filtros.id_dg} onChange={e => setFiltros(f => ({ ...f, id_dg: e.target.value, id_da: '' }))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs">
                <option value="">— Todas —</option>
                {dgs.map(d => <option key={d.id} value={d.id}>{d.siglas}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Dirección de Área</label>
              <select value={filtros.id_da} onChange={e => setFiltros(f => ({ ...f, id_da: e.target.value }))} disabled={!filtros.id_dg} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs disabled:opacity-40">
                <option value="">— Todas —</option>
                {dasFiltradas.map(d => <option key={d.id} value={d.id}>{d.siglas}</option>)}
              </select>
            </div>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={filtros.nombre}
              onChange={e => setFiltros(f => ({ ...f, nombre: e.target.value }))}
              placeholder="Buscar por nombre..."
              className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-sm"
            />
          </div>

          {/* Lista de usuarios */}
          <div className="border border-gray-200 rounded-lg overflow-y-auto" style={{ maxHeight: 240 }}>
            {cargandoU ? (
              <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-guinda-600" /></div>
            ) : usuarios.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No se encontraron usuarios</p>
            ) : (
              usuarios.map(u => (
                <button key={u.id} onClick={() => setSeleccionado(u)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 border-b last:border-0 transition-colors ${
                    seleccionado?.id === u.id ? 'bg-guinda-50 border-l-2 border-l-guinda-600' : ''
                  }`}>
                  <div className="w-7 h-7 rounded-full bg-guinda-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-guinda-700">{u.nombre_completo?.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{u.nombre_completo}</p>
                    <p className="text-[11px] text-gray-400 truncate">{u.correo} · {u.dg_siglas}{u.direccion_area_siglas ? ` / ${u.direccion_area_siglas}` : ''}</p>
                  </div>
                  {seleccionado?.id === u.id && <div className="w-2 h-2 rounded-full bg-guinda-600 flex-shrink-0" />}
                </button>
              ))
            )}
          </div>

          {seleccionado && (
            <div className="p-3 bg-guinda-50 rounded-lg flex items-center gap-2">
              <span className="text-sm text-guinda-700 flex-1 truncate">✓ {seleccionado.nombre_completo}</span>
              <div>
                <label className="text-xs text-gray-600 mr-1">Rol:</label>
                <select value={rol} onChange={e => setRol(e.target.value)} className="text-xs border border-gray-300 rounded px-2 py-1">
                  <option value="colaborador">Colaborador</option>
                  <option value="responsable">Responsable</option>
                </select>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 p-2 rounded">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button onClick={handleInvitar} disabled={!seleccionado || enviando}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
            style={{ backgroundColor: GUINDA }}>
            {enviando && <Loader2 size={14} className="animate-spin" />}
            Agregar al proyecto
          </button>
        </div>
      </div>
    </div>
  );
}
