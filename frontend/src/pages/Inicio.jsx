/**
 * ARCHIVO: Inicio.jsx
 * PROPÓSITO: Dashboard personalizado del usuario con sus proyectos,
 *            acciones vencidas/por vencer, riesgos, indicadores y actividad.
 */
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  FolderKanban, Activity, AlertTriangle, TrendingUp,
  MapPin, ChevronRight, Clock, Target, Shield, Calendar, Layers
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { obtenerInicio } from '../api/inicio';
import client from '../api/client';
import MapaTerritorialInicio from '../components/inicio/MapaTerritorialInicio';

const GUINDA = '#7B1C3E';
const SEM = { verde: '#22c55e', ambar: '#f59e0b', rojo: '#ef4444', gris: '#9ca3af' };

export default function Inicio() {
  const { usuario } = useAuth();
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    obtenerInicio()
      .then(setData)
      .catch(console.error)
      .finally(() => setCargando(false));
  }, []);

  if (cargando) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-gray-200 rounded w-1/3 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="card p-6 animate-pulse h-24" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-6 animate-pulse h-64" />
          <div className="card p-6 animate-pulse h-64" />
        </div>
      </div>
    );
  }

  const { proyectos = [], vencidos = [], por_vencer = [], riesgos = [], mapa_incidencia = [], indicadores = [], actividad = [] } = data || {};

  return (
    <div className="space-y-6">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Buen día, {usuario?.nombre_completo?.split(' ')[0]}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <Link to="/mapa" className="btn-secondary text-xs flex items-center gap-1">
          <MapPin size={14} /> Territorio
        </Link>
      </div>

      {/* ═══ MÉTRICAS RESUMEN ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricaCard icono={FolderKanban} titulo="Mis proyectos" valor={proyectos.length} color="bg-guinda-50 text-guinda-600" />
        <MetricaCard icono={AlertTriangle} titulo="Acciones vencidas" valor={vencidos.length} color="bg-red-50 text-red-600" />
        <MetricaCard icono={Clock} titulo="Por vencer (14d)" valor={por_vencer.length} color="bg-yellow-50 text-yellow-600" />
        <MetricaCard icono={Shield} titulo="Riesgos abiertos" valor={riesgos.length} color="bg-orange-50 text-orange-600" />
      </div>

      {/* ═══ MIS PROYECTOS ═══ */}
      {proyectos.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: '#7B1C3E' }}>
            <FolderKanban size={14} /> Mis proyectos
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {proyectos.slice(0, 9).map(p => (
              <ProyectoCard key={p.id} proyecto={p} />
            ))}
          </div>
        </section>
      )}

      {/* ═══ MAPA + INDICADORES (mitad de ancho cada uno; el que falte, el otro ocupa todo) ═══ */}
      <div className={`grid grid-cols-1 gap-4 ${indicadores.length > 0 ? 'lg:grid-cols-2' : ''}`}>
        <div className="card p-5">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: '#7B1C3E' }}>
            <MapPin size={14} /> Incidencia territorial
          </h2>
          <MapaTerritorialInicio />
        </div>

        {indicadores.length > 0 && (
          <div className="card p-5">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: '#7B1C3E' }}>
              <Target size={14} className="text-blue-500" /> Indicadores
            </h2>
            <IndicadoresResumen indicadores={indicadores} />
          </div>
        )}
      </div>

      {/* ═══ VENCIDOS + POR VENCER (mitad de ancho cada uno; el que falte, el otro ocupa todo) ═══ */}
      {(vencidos.length > 0 || por_vencer.length > 0) && (
        <div className={`grid grid-cols-1 gap-6 ${vencidos.length > 0 && por_vencer.length > 0 ? 'lg:grid-cols-2' : ''}`}>
          {vencidos.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: '#7B1C3E' }}>
                <AlertTriangle size={14} className="text-red-500" /> Acciones vencidas
              </h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {vencidos.map(a => (
                  <Link
                    key={a.id}
                    to={`/proyectos/${a.proyecto_id}?tab=seguimiento&nodo=${a.id}`}
                    className="flex items-start gap-2 p-2 rounded hover:bg-red-50 border border-transparent hover:border-red-100 transition"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-800 truncate font-medium">{a.nombre}</p>
                      <p className="text-[10px] text-gray-500">{a.proyecto_nombre}{a.etapa_nombre ? ` › ${a.etapa_nombre}` : ''} · -{a.dias_atraso}d</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
          {por_vencer.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: '#7B1C3E' }}>
                <Clock size={14} className="text-yellow-600" /> Por vencer (14 días)
              </h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {por_vencer.map(a => (
                  <Link
                    key={a.id}
                    to={`/proyectos/${a.proyecto_id}?tab=seguimiento&nodo=${a.id}`}
                    className="flex items-start gap-2 p-2 rounded hover:bg-yellow-50 border border-transparent hover:border-yellow-100 transition"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-800 truncate font-medium">{a.nombre}</p>
                      <p className="text-[10px] text-gray-500">{a.proyecto_nombre}{a.etapa_nombre ? ` › ${a.etapa_nombre}` : ''} · {a.dias_restantes}d restantes</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ RIESGOS ABIERTOS ═══ */}
      {riesgos.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: '#7B1C3E' }}>
            <Shield size={14} className="text-orange-500" /> Riesgos abiertos
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {riesgos.map(r => (
              <Link
                key={r.id}
                to={`/proyectos/${r.proyecto_id}?tab=seguimiento&nodo=${r.entidad_id}`}
                className="flex items-center gap-2 p-2 rounded hover:bg-orange-50 border border-gray-100 hover:border-orange-200 transition"
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  r.nivel === 'Critico' ? 'bg-red-600' :
                  r.nivel === 'Alto' ? 'bg-orange-500' :
                  r.nivel === 'Medio' ? 'bg-yellow-500' : 'bg-gray-400'
                }`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-800 truncate">{r.titulo}</p>
                  <p className="text-[10px] text-gray-500">{r.proyecto_nombre} · {r.nivel}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ═══ ACTIVIDAD RECIENTE ═══ */}
      {actividad.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5" style={{ color: '#7B1C3E' }}>
            <Activity size={14} className="text-purple-500" /> Actividad reciente
          </h2>
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {actividad.map((ev) => {
              const { bg, text, icon: IconComp } = actividadConfig(ev.tipo);
              return (
                <Link
                  key={ev.id}
                  to={`/proyectos/${ev.proyecto_id}?tab=seguimiento&nodo=${ev.entidad_id}`}
                  className="flex items-start gap-2.5 p-1.5 -m-1.5 rounded hover:bg-gray-50 transition-colors"
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${bg} ${text}`}>
                    <IconComp size={11} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-gray-800 leading-relaxed">
                      {ev.actor && <span className="font-medium">{ev.actor} — </span>}
                      <span className="text-gray-700">{ev.titulo}</span>
                    </p>
                    {ev.descripcion && (
                      <p className="text-[11px] text-gray-500 truncate">{ev.descripcion.slice(0, 80)}</p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      <span className="hover:text-guinda-600">{ev.proyecto_nombre}</span>
                      {' · '}{rel(ev.created_at)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────
const actividadConfig = (tipo) => {
  const map = {
    estado:     { bg: 'bg-blue-100',   text: 'text-blue-600',   icon: TrendingUp },
    avance:     { bg: 'bg-green-100',  text: 'text-green-600',  icon: TrendingUp },
    evidencia:  { bg: 'bg-yellow-100', text: 'text-yellow-600', icon: Shield },
    comentario: { bg: 'bg-purple-100', text: 'text-purple-600', icon: Activity },
    miembro:    { bg: 'bg-pink-100',   text: 'text-pink-600',   icon: Calendar },
    creacion:   { bg: 'bg-teal-100',   text: 'text-teal-600',   icon: AlertTriangle },
    indicador:  { bg: 'bg-orange-100', text: 'text-orange-600', icon: Target },
    tarea:      { bg: 'bg-indigo-100', text: 'text-indigo-600', icon: Clock },
  };
  return map[tipo] || { bg: 'bg-gray-100', text: 'text-gray-500', icon: Activity };
};

function rel(fecha) {
  if (!fecha) return '';
  const diff = Date.now() - new Date(fecha).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

function getColor(pct) {
  if (pct >= 80) return '#22c55e';
  if (pct >= 60) return '#84cc16';
  if (pct >= 40) return '#eab308';
  if (pct >= 20) return '#f97316';
  return '#ef4444';
}

// ─── Proyecto Card ────────────────────────────────────────────
function ProyectoCard({ proyecto }) {
  const pct = parseFloat(proyecto.porcentaje_calculado) || 0;
  const cacheRef = useRef(null);
  const timeoutRef = useRef(null);
  const [popover, setPopover] = useState(null); // { x, y, above, cargando, datos }

  function mostrarPopover(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const arriba = rect.top > window.innerHeight / 2;
    const pos = { x: rect.left, y: arriba ? rect.top - 8 : rect.bottom + 8, above: arriba };
    if (cacheRef.current) { setPopover({ ...pos, cargando: false, datos: cacheRef.current }); return; }
    setPopover({ ...pos, cargando: true, datos: null });
    timeoutRef.current = setTimeout(() => {
      client.get(`/proyectos/${proyecto.id}/panorama-rapido`)
        .then(res => { cacheRef.current = res.data.datos; setPopover(p => p ? { ...p, cargando: false, datos: res.data.datos } : p); })
        .catch(() => setPopover(p => p ? { ...p, cargando: false, datos: { etapas: [], actividad: [] } } : p));
    }, 250);
  }
  function ocultarPopover() {
    clearTimeout(timeoutRef.current);
    setPopover(null);
  }

  return (
    <Link
      to={`/proyectos/${proyecto.id}`}
      className="card p-4 hover:shadow-md hover:border-guinda-200 transition group relative"
      onMouseEnter={mostrarPopover}
      onMouseLeave={ocultarPopover}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-guinda-700 transition">
            {proyecto.nombre}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {proyecto.dg_siglas || 'Sin DG'} · {proyecto.estado?.replace('_', ' ')}
          </p>
        </div>
        <ChevronRight size={14} className="text-gray-300 group-hover:text-guinda-400 transition mt-1" />
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-500">Avance</span>
          <span className="text-xs font-bold" style={{ color: getColor(pct) }}>{pct.toFixed(0)}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: getColor(pct) }} />
        </div>
      </div>
      <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
        {proyecto.acciones_pendientes > 0 && <span>{proyecto.acciones_pendientes} pendientes</span>}
        {proyecto.riesgos_activos > 0 && <span className="text-orange-500">{proyecto.riesgos_activos} riesgos</span>}
        {proyecto.es_prioritario && <span className="text-guinda-600 font-bold">★ Prioritario</span>}
      </div>

      {popover && (
        <div
          className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-xl p-3 w-80 pointer-events-none"
          style={{ left: Math.min(popover.x, window.innerWidth - 336), top: popover.above ? undefined : popover.y, bottom: popover.above ? window.innerHeight - popover.y : undefined }}
        >
          {popover.cargando ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
              <div className="animate-spin w-3.5 h-3.5 border-2 border-[#7B1C3E] border-t-transparent rounded-full" /> Cargando panorama…
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Layers size={11} className="text-indigo-500" />
                <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Estructura</p>
              </div>
              {popover.datos.etapas.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic mb-2">Sin etapas registradas.</p>
              ) : (
                <ul className="space-y-1 max-h-32 overflow-y-auto mb-2">
                  {popover.datos.etapas.slice(0, 6).map(et => (
                    <li key={et.id} className="flex items-center gap-1.5 text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: SEM[et.semaforo || 'gris'] }} />
                      <span className="truncate text-gray-700 flex-1">{et.nombre}</span>
                      <span className="text-gray-400 flex-shrink-0">{et.acciones_completadas}/{et.total_acciones}</span>
                      <span className="text-gray-400 tabular-nums flex-shrink-0 w-8 text-right">{Math.round(et.avance)}%</span>
                    </li>
                  ))}
                  {popover.datos.etapas.length > 6 && (
                    <li className="text-[10px] text-gray-400 text-center">+{popover.datos.etapas.length - 6} etapas más…</li>
                  )}
                </ul>
              )}

              <div className="flex items-center gap-1.5 mb-1.5 pt-1.5 border-t border-gray-100">
                <Activity size={11} className="text-purple-500" />
                <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">Última actividad</p>
              </div>
              {popover.datos.actividad.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic">Sin actividad reciente.</p>
              ) : (
                <ul className="space-y-1">
                  {popover.datos.actividad.map(ev => (
                    <li key={ev.id} className="text-[11px] text-gray-700 leading-snug">
                      {ev.actor && <span className="font-medium">{ev.actor.split(' ')[0]} — </span>}
                      <span className="text-gray-600">{ev.titulo}</span>
                      <span className="text-gray-400"> · {rel(ev.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </Link>
  );
}

// ─── Métricas Card ────────────────────────────────────────────
function MetricaCard({ icono: Icono, titulo, valor, color }) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${color}`}>
        <Icono size={22} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{valor}</p>
        <p className="text-xs text-gray-500">{titulo}</p>
      </div>
    </div>
  );
}

// ─── Indicadores Resumen ──────────────────────────────────────
function IndicadoresResumen({ indicadores }) {
  // Group by tipo
  const grouped = {};
  for (const ind of indicadores) {
    const tipo = ind.tipo || 'Otro';
    if (!grouped[tipo]) grouped[tipo] = [];
    grouped[tipo].push(ind);
  }

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([tipo, inds]) => (
        <div key={tipo}>
          <p className="text-xs font-medium text-gray-700 mb-2">{tipo}</p>
          <div className="space-y-2">
            {inds.slice(0, 6).map(ind => {
              const meta = parseFloat(ind.meta_global) || 0;
              const valor = parseFloat(ind.valor_actual) || 0;
              const tieneMeta = meta > 0;
              const pct = tieneMeta ? Math.min(100, (valor / meta) * 100) : null;
              const unidad = ind.etiqueta_unidad || ind.unidad_personalizada || ind.unidad || '';
              return (
                <div key={ind.id} className="border border-gray-100 rounded-lg p-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-gray-800 font-medium leading-snug break-words">{ind.nombre}</p>
                      <p className="text-[10px] text-gray-500 leading-snug break-words">{ind.proyecto_nombre} · {ind.dg_siglas}</p>
                    </div>
                    {!tieneMeta && (
                      <p className="text-xs font-bold flex-shrink-0 whitespace-nowrap" style={{ color: GUINDA }}>
                        {valor.toLocaleString()} {unidad}
                      </p>
                    )}
                  </div>
                  {tieneMeta && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct || 0}%`, backgroundColor: GUINDA }} />
                      </div>
                      <span className="text-[10px] font-semibold text-gray-600 flex-shrink-0">{pct !== null ? `${pct.toFixed(0)}%` : '—'}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
