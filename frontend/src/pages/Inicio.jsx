/**
 * ARCHIVO: Inicio.jsx
 * PROPÓSITO: Dashboard personalizado del usuario con sus proyectos,
 *            acciones vencidas/por vencer, riesgos, indicadores y actividad.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  FolderKanban, Activity, AlertTriangle, TrendingUp,
  MapPin, ChevronRight, Clock, Target, Shield, Calendar
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { obtenerInicio } from '../api/inicio';

const GUINDA = '#7B1C3E';

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
          <MapPin size={14} /> Mapa territorial
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
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
            <FolderKanban size={14} /> Mis proyectos
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {proyectos.slice(0, 9).map(p => (
              <ProyectoCard key={p.id} proyecto={p} />
            ))}
          </div>
        </section>
      )}

      {/* ═══ VENCIDOS + POR VENCER ═══ */}
      {(vencidos.length > 0 || por_vencer.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {vencidos.length > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-red-500" /> Acciones vencidas
              </h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {vencidos.map(a => (
                  <Link
                    key={a.id}
                    to={`/proyectos/${a.proyecto_id}?tab=seguimiento`}
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
              <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
                <Clock size={14} className="text-yellow-600" /> Por vencer (14 días)
              </h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {por_vencer.map(a => (
                  <Link
                    key={a.id}
                    to={`/proyectos/${a.proyecto_id}?tab=seguimiento`}
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
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
            <Shield size={14} className="text-orange-500" /> Riesgos abiertos
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {riesgos.map(r => (
              <Link
                key={r.id}
                to={`/proyectos/${r.proyecto_id}`}
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

      {/* ═══ MAPA INCIDENCIA TERRITORIAL ═══ */}
      {mapa_incidencia.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
            <MapPin size={14} className="text-purple-500" /> Incidencia territorial
          </h2>
          <div className="flex flex-wrap gap-2">
            {mapa_incidencia.map(e => (
              <div
                key={e.cve_ent}
                className="px-3 py-1.5 rounded-lg border text-xs group relative"
                style={{
                  backgroundColor: `rgba(123, 28, 62, ${Math.min(0.15 + e.num_proyectos * 0.1, 0.6)})`,
                  borderColor: `rgba(123, 28, 62, 0.3)`,
                  color: '#4a0e23'
                }}
              >
                <span className="font-medium">{e.estado_nombre}</span>
                <span className="ml-1 opacity-70">({e.num_proyectos})</span>
                {e.proyectos_nombres && (
                  <div className="absolute bottom-full left-0 mb-1 bg-gray-900 text-white text-[10px] px-2 py-1 rounded shadow-lg hidden group-hover:block z-10 whitespace-nowrap max-w-xs">
                    {e.proyectos_nombres.slice(0, 5).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ INDICADORES AGREGADOS ═══ */}
      {indicadores.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
            <Target size={14} className="text-blue-500" /> Indicadores
          </h2>
          <IndicadoresResumen indicadores={indicadores} />
        </div>
      )}

      {/* ═══ ACTIVIDAD RECIENTE ═══ */}
      {actividad.length > 0 && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-1.5">
            <Activity size={14} className="text-purple-500" /> Actividad reciente
          </h2>
          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {actividad.map((ev) => {
              const { bg, text, icon: IconComp } = actividadConfig(ev.tipo);
              return (
                <div key={ev.id} className="flex items-start gap-2.5">
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
                      <Link to={`/proyectos/${ev.proyecto_id}`} className="hover:text-guinda-600 hover:underline">{ev.proyecto_nombre}</Link>
                      {' · '}{rel(ev.created_at)}
                    </p>
                  </div>
                </div>
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
  return (
    <Link
      to={`/proyectos/${proyecto.id}`}
      className="card p-4 hover:shadow-md hover:border-guinda-200 transition group"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {inds.slice(0, 6).map(ind => {
              const meta = parseFloat(ind.meta_global) || 0;
              const valor = parseFloat(ind.valor_actual) || 0;
              const tieneMeta = meta > 0;
              const pct = tieneMeta ? Math.min(100, (valor / meta) * 100) : null;
              const unidad = ind.etiqueta_unidad || ind.unidad_personalizada || ind.unidad || '';
              return (
                <div key={ind.id} className="border border-gray-100 rounded-lg p-2.5">
                  <p className="text-xs text-gray-800 truncate font-medium">{ind.nombre}</p>
                  <p className="text-[10px] text-gray-500 truncate">{ind.proyecto_nombre} · {ind.dg_siglas}</p>
                  {tieneMeta && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct || 0}%`, backgroundColor: GUINDA }} />
                      </div>
                      <span className="text-[10px] font-semibold text-gray-600">{pct !== null ? `${pct.toFixed(0)}%` : '—'}</span>
                    </div>
                  )}
                  {!tieneMeta && (
                    <p className="text-xs font-bold mt-1" style={{ color: GUINDA }}>
                      {valor.toLocaleString()} {unidad}
                    </p>
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
