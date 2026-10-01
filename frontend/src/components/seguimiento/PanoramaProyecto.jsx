/**
 * ARCHIVO: PanoramaProyecto.jsx
 * PROPÓSITO: Tab "Panorama del proyecto" — single scrollable dashboard con:
 *  Encabezado, Participantes, Indicadores, Mapa territorial,
 *  Vencidos/por vencer, Riesgos, Actividad reciente.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Target, MapPin, AlertTriangle, Clock, Activity,
  TrendingUp, Calendar, Shield, ChevronRight, MessageSquare,
} from 'lucide-react';
import { obtenerPanorama } from '../../api/miembros';
import { calcularColorSemaforo } from '../../utils/semaforoColor';
import TarjetaIndicador from '../indicadores/TarjetaIndicador';
import GraficaIndicador from '../indicadores/GraficaIndicador';
import ListaEstatusCualitativo from '../indicadores/ListaEstatusCualitativo';

const GUINDA = '#7B1C3E';

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
    <section className={`bg-white ${className}`} style={{ borderRadius: '8px', border: '1px solid #E5E5E5', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
      <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: '1px solid #E5E5E5' }}>
        {Icono && <Icono size={16} style={{ color: '#7B1C3E' }} />}
        <h3 className="text-sm font-semibold" style={{ color: '#7B1C3E' }}>{titulo}</h3>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

// ─── Componente principal ─────────────────────────────────────
export default function PanoramaProyecto({ proyecto, etapas, proyectoId, refreshKey, onNavegarNodo }) {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);

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

  const { indicadores, cobertura, vencidos, por_vencer, riesgos, actividad, estatus_cualitativo = [] } = datos;
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

      {/* ═══ ESTATUS CUALITATIVO ═══
          Contraparte de los indicadores: el número dice cuánto, esto
          dice por qué. Aquí no se repite el nombre del proyecto en cada
          línea — ya se sabe cuál es. */}
      {estatus_cualitativo.length > 0 && (
        <SeccionCard titulo="Estatus cualitativo" icono={MessageSquare}>
          <ListaEstatusCualitativo items={estatus_cualitativo} dentroDeProyecto maxAltura="max-h-72" />
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
                  <li key={a.id}>
                    <button onClick={() => onNavegarNodo?.(a.id)} className="w-full flex items-start gap-2 text-left p-1 -m-1 rounded hover:bg-red-50 transition-colors">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800 truncate">{a.nombre}</p>
                        <p className="text-[11px] text-gray-500">
                          {a.id_accion_padre ? 'Subacción' : 'Acción'} · -{a.dias_atraso}d atraso
                        </p>
                        {a.estatus_cualitativo && (
                          <p className="text-[11px] text-gray-500 italic truncate mt-0.5">"{a.estatus_cualitativo}"</p>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </SeccionCard>
          )}
          {por_vencer.length > 0 && (
            <SeccionCard titulo={`Por vencer (${por_vencer.length})`} icono={Clock}>
              <ul className="space-y-2">
                {por_vencer.slice(0, 8).map(a => (
                  <li key={a.id}>
                    <button onClick={() => onNavegarNodo?.(a.id)} className="w-full flex items-start gap-2 text-left p-1 -m-1 rounded hover:bg-yellow-50 transition-colors">
                      <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800 truncate">{a.nombre}</p>
                        <p className="text-[11px] text-gray-500">
                          {a.id_accion_padre ? 'Subacción' : 'Acción'} · {a.dias_restantes}d restantes
                        </p>
                        {a.estatus_cualitativo && (
                          <p className="text-[11px] text-gray-500 italic truncate mt-0.5">"{a.estatus_cualitativo}"</p>
                        )}
                      </div>
                    </button>
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
              <li key={r.id}>
                <button onClick={() => onNavegarNodo?.(r.entidad_id, r.id)} className="w-full flex items-center gap-2 py-1 px-1 -mx-1 rounded hover:bg-orange-50 transition-colors text-left">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    r.nivel === 'Critico' ? 'bg-red-600' :
                    r.nivel === 'Alto' ? 'bg-orange-500' :
                    r.nivel === 'Medio' ? 'bg-yellow-500' : 'bg-gray-400'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800 truncate">{r.titulo}</p>
                    <p className="text-[11px] text-gray-500">{r.entidad_tipo} · {r.nivel}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </SeccionCard>
      )}

      {/* ═══ ACTIVIDAD RECIENTE ═══ */}
      {actividad.length > 0 && (
        <SeccionCard titulo="Actividad reciente" icono={Activity}>
          <ul className="space-y-3">
            {actividad.slice(0, 10).map((ev, i) => {
              const icono = ev.tipo === 'comentario' ? <Activity size={12} />
                : ev.tipo === 'indicador' ? <Target size={12} />
                : <TrendingUp size={12} />;
              const color = ev.tipo === 'comentario' ? 'bg-purple-100 text-purple-600'
                : ev.tipo === 'indicador' ? 'bg-teal-100 text-teal-600'
                : 'bg-green-100 text-green-600';
              const etiqueta = ev.tipo === 'comentario' ? 'comentó'
                : ev.tipo === 'indicador' ? null // el título ya es la oración completa
                : 'subió evidencia';
              const contenido = (
                <>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${color}`}>
                    {icono}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800">
                      {etiqueta ? (
                        <>
                          <span className="font-medium">{ev.actor}</span>
                          {' '}<span className="text-gray-500">{etiqueta}:</span>
                          {' '}<span className="text-gray-700 truncate">{ev.descripcion?.slice(0, 80)}</span>
                        </>
                      ) : (
                        <>
                          <span className="text-gray-700 truncate">{ev.descripcion?.slice(0, 80)}</span>
                          {' '}<span className="text-gray-500">· {ev.actor}</span>
                        </>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{rel(ev.created_at)}</p>
                  </div>
                </>
              );
              return (
                <li key={i}>
                  {ev.tipo === 'indicador' ? (
                    <Link to={`/indicadores/${ev.entidad_id}`} className="w-full flex items-start gap-2.5 text-left p-1 -m-1 rounded hover:bg-purple-50 transition-colors">
                      {contenido}
                    </Link>
                  ) : (
                    <button onClick={() => onNavegarNodo?.(ev.entidad_id)} className="w-full flex items-start gap-2.5 text-left p-1 -m-1 rounded hover:bg-purple-50 transition-colors">
                      {contenido}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </SeccionCard>
      )}

    </div>
  );
}

// ─── Indicador Card ───────────────────────────────────────────
function IndicadorCard({ indicador }) {
  // La tarjeta es la compartida con Tablero y Resumen de cartera; aquí
  // se le agrega, como hijo, la gráfica del desglose (periodos o
  // categorías, excluyentes por diseño), que solo tiene sentido dentro
  // del proyecto. "etiqueta" cubre Sexenio ("2018–2024") y
  // Personalizado (texto libre, sin año calendario real — anio queda
  // NULL para esos); "anio" sigue siendo el fallback correcto para el
  // caso Año de siempre, donde nunca se guardó una etiqueta.
  const filas = indicador.composicion === 'Categorias'
    ? (indicador.categorias || []).map(c => ({
        etiqueta: c.etiqueta,
        meta: parseFloat(c.valor_meta) || 0,
        real: parseFloat(c.valor_real) || 0,
      }))
    : (indicador.metas_anuales || []).map(m => ({
        etiqueta: m.etiqueta || String(m.anio),
        meta: parseFloat(m.valor_meta) || 0,
        real: parseFloat(m.valor_real) || 0,
      }));

  return (
    <TarjetaIndicador
      indicador={indicador}
      contexto={indicador.etapa_nombre ? `Etapa: ${indicador.etapa_nombre}` : null}
    >
      <GraficaIndicador filas={filas} tipo={indicador.tipo_grafico} />
    </TarjetaIndicador>
  );
}
