/**
 * ARCHIVO: ResumenProyecto.jsx
 * PROPÓSITO: Dashboard de resumen del proyecto — diseño tipo "executive summary".
 *
 * LAYOUT:
 * ─────────────────────────────────────────────────────────────────
 * Header: anillo de avance + pills + descripción + fechas + meta.
 * Dos columnas (colapsa a 1 en mobile):
 *   - Izquierda: etapas desplegables con mosaico de tarjetas de acciones.
 *   - Derecha (220px): métricas, atrasadas, próximas, riesgos, datos.
 * Actividad reciente: full-width abajo.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar, AlertTriangle, Shield, ChevronDown, BarChart3,
  Lock, Paperclip, Tag, Users, Clock,
  Target, CheckCircle2, Info, Zap, MessageSquare, User, GitBranch, Layers
} from 'lucide-react';
import client from '../../api/client';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(f) {
  if (!f) return '—';
  return new Date(f).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtCorto(f) {
  if (!f) return '—';
  return new Date(f).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
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

const ECFG = {
  Completada: { bar: 'bg-emerald-400', text: 'text-emerald-600', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Completada' },
  En_proceso: { bar: 'bg-orange-400',  text: 'text-orange-500',  badge: 'bg-orange-50 text-orange-700 border-orange-200',   label: 'En proceso' },
  Pendiente:  { bar: 'bg-gray-300',    text: 'text-gray-400',    badge: 'bg-gray-50 text-gray-500 border-gray-200',          label: 'Pendiente' },
  Bloqueada:  { bar: 'bg-red-400',     text: 'text-red-600',     badge: 'bg-red-50 text-red-700 border-red-200',             label: 'Bloqueada' },
  Cancelada:  { bar: 'bg-gray-200',    text: 'text-gray-300',    badge: 'bg-gray-50 text-gray-400 border-gray-100',          label: 'Cancelada' },
};

// ─── Anillo SVG de avance ─────────────────────────────────────────────────────
function Anillo({ pct, size = 82, stroke = 8 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const color = pct >= 100 ? '#10b981' : pct >= 60 ? '#9f2241' : pct >= 30 ? '#f59e0b' : '#d1d5db';
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${(pct / 100) * circ} ${circ}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-black tabular-nums leading-none" style={{ color }}>{pct.toFixed(0)}%</span>
        <span className="text-[9px] text-gray-400 font-medium leading-tight text-center">acciones</span>
      </div>
    </div>
  );
}

// ─── Tooltip de acción con info detallada ────────────────────────────────────
function TooltipAccion({ accion }) {
  const cfg = ECFG[accion.estado] || ECFG.Pendiente;
  const pct = parseFloat(accion.porcentaje_avance) || 0;
  const subs = Array.isArray(accion.subacciones) ? accion.subacciones : [];
  const ahora = new Date();
  const estaVencida = accion.fecha_fin && new Date(accion.fecha_fin) < ahora && accion.estado !== 'Completada';
  const diasAtraso = estaVencida ? Math.ceil((ahora - new Date(accion.fecha_fin)) / 86400000) : null;
  const subsCompletadas = subs.filter(s => s.estado === 'Completada').length;
  const subsAtrasadas = subs.filter(s => s.fecha_fin && new Date(s.fecha_fin) < ahora && s.estado !== 'Completada' && s.estado !== 'Cancelada').length;
  const totalComentarios = parseInt(accion.total_comentarios) || 0;
  const totalEvidencias = parseInt(accion.total_evidencias) || 0;

  return (
    <div className="w-72 bg-white rounded-xl shadow-2xl border border-gray-200 p-3.5 space-y-2.5 text-left z-[100]">
      {/* Header del tooltip */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${cfg.badge}`}>{cfg.label}</span>
          <span className={`text-[11px] font-black tabular-nums ${cfg.text}`}>{pct.toFixed(0)}%</span>
          {estaVencida && (
            <span className="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold border border-orange-200">
              -{diasAtraso}d atraso
            </span>
          )}
        </div>
        <p className="text-[12px] font-semibold text-gray-800 leading-snug">{accion.nombre}</p>
      </div>

      {/* Responsable */}
      {accion.responsable_nombre && (
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <User size={10} className="text-gray-400 flex-shrink-0" />
          <span>{accion.responsable_nombre}</span>
        </div>
      )}

      {/* Fechas */}
      <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
        <Calendar size={10} className="text-gray-400 flex-shrink-0" />
        <span>{fmt(accion.fecha_inicio)} — {fmt(accion.fecha_fin)}</span>
      </div>

      {/* Bloqueo */}
      {accion.motivo_bloqueo && (
        <div className="flex items-start gap-1.5 bg-red-50 rounded-lg px-2 py-1.5 border border-red-100">
          <Lock size={10} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-red-600 leading-snug">{accion.motivo_bloqueo}</p>
        </div>
      )}

      {/* Subacciones */}
      {subs.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
            Subacciones ({subsCompletadas}/{subs.length})
            {subsAtrasadas > 0 && <span className="text-orange-500 normal-case"> · {subsAtrasadas} atrasada{subsAtrasadas > 1 ? 's' : ''}</span>}
          </p>
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {subs.map(s => {
              const sCfg = ECFG[s.estado] || ECFG.Pendiente;
              const sVencida = s.fecha_fin && new Date(s.fecha_fin) < ahora && s.estado !== 'Completada';
              return (
                <div key={s.id} className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sCfg.bar}`} />
                  <span className={`text-[10px] leading-snug truncate flex-1 ${s.estado === 'Completada' ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                    {s.nombre}
                  </span>
                  {sVencida && <span className="text-[8px] text-orange-500 font-bold flex-shrink-0">atrasada</span>}
                  <span className={`text-[9px] font-bold tabular-nums flex-shrink-0 ${sCfg.text}`}>
                    {(parseFloat(s.porcentaje_avance) || 0).toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Comentarios y evidencias */}
      {(totalComentarios > 0 || totalEvidencias > 0) && (
        <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
          {totalComentarios > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-gray-500">
              <MessageSquare size={10} className="text-blue-400" /> {totalComentarios} comentario{totalComentarios !== 1 ? 's' : ''}
            </span>
          )}
          {totalEvidencias > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-gray-500">
              <Paperclip size={10} className="text-guinda-400" /> {totalEvidencias} evidencia{totalEvidencias !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tarjeta de acción en el mosaico ─────────────────────────────────────────
function TarjetaAccion({ accion, numero }) {
  const [hover, setHover] = useState(false);
  const [posicion, setPosicion] = useState({ top: 0, left: 0 });
  const refTarjeta = useRef(null);
  const timerRef = useRef(null);

  function mostrarTooltip() {
    timerRef.current = setTimeout(() => {
      if (refTarjeta.current) {
        const rect = refTarjeta.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceRight = window.innerWidth - rect.left;
        setPosicion({
          top: spaceBelow < 260 ? rect.top - 8 : rect.bottom + 8,
          left: Math.min(rect.left, window.innerWidth - 300),
          arriba: spaceBelow < 260,
        });
      }
      setHover(true);
    }, 350);
  }

  function ocultarTooltip() {
    clearTimeout(timerRef.current);
    setHover(false);
  }

  const cfg = ECFG[accion.estado] || ECFG.Pendiente;
  const pct = parseFloat(accion.porcentaje_avance) || 0;
  const esCompletada = accion.estado === 'Completada';
  const esBloqueada = accion.estado === 'Bloqueada';
  const subs = Array.isArray(accion.subacciones) ? accion.subacciones : [];
  const ahora = new Date();
  const estaVencida = accion.fecha_fin && new Date(accion.fecha_fin) < ahora && !esCompletada;
  const diasAtraso = estaVencida
    ? Math.ceil((ahora - new Date(accion.fecha_fin)) / 86400000)
    : null;

  return (
    <div
      ref={refTarjeta}
      onMouseEnter={mostrarTooltip}
      onMouseLeave={ocultarTooltip}
      className={`relative rounded-xl border p-3 flex flex-col gap-1.5 overflow-hidden cursor-default ${
      esCompletada ? 'opacity-40 border-gray-100 bg-gray-50'
      : estaVencida ? 'border-orange-300 border-dashed bg-white'
      : esBloqueada ? 'border-red-200 bg-red-50/30'
      : 'border-gray-100 bg-white hover:shadow-md hover:border-gray-200 transition-shadow'
    }`}>
      <span className={`text-3xl font-black tabular-nums leading-none ${cfg.text} opacity-15 select-none`}>
        {String(numero).padStart(2, '0')}
      </span>
      <div className="flex flex-wrap gap-1 -mt-1">
        {esBloqueada && (
          <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold border border-red-200 flex items-center gap-0.5">
            <Lock size={8} /> Bloq.
          </span>
        )}
        {estaVencida && (
          <span className="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold border border-orange-200">
            -{diasAtraso}d
          </span>
        )}
      </div>
      <p className={`text-[11px] font-semibold leading-tight line-clamp-2 ${esCompletada ? 'line-through text-gray-400' : 'text-gray-800'}`}>
        {accion.nombre}
      </p>
      {subs.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-0.5">
          {subs.slice(0, 12).map(s => {
            const subVencida = s.fecha_fin && new Date(s.fecha_fin) < ahora && s.estado !== 'Completada';
            return (
              <span key={s.id} title={s.nombre} className={`w-2 h-2 rounded-full flex-shrink-0 ${
                s.estado === 'Completada' ? 'bg-emerald-400'
                : s.estado === 'Bloqueada' ? 'bg-red-400'
                : subVencida ? 'bg-orange-400'
                : s.estado === 'En_proceso' ? 'bg-orange-300'
                : 'bg-gray-200'
              }`} />
            );
          })}
          {subs.length > 12 && <span className="text-[8px] text-gray-400">+{subs.length - 12}</span>}
        </div>
      )}
      <div className="flex items-center justify-between mt-auto pt-1.5">
        <span className={`text-[11px] font-black tabular-nums ${cfg.text}`}>{pct.toFixed(0)}%</span>
        {accion.fecha_fin && (
          <span className={`text-[9px] ${estaVencida ? 'text-orange-500 font-semibold' : 'text-gray-400'}`}>
            {fmtCorto(accion.fecha_fin)}
          </span>
        )}
      </div>
      <div className={`absolute bottom-0 left-0 right-0 h-[3px] ${cfg.bar}`} />

      {/* Tooltip flotante */}
      {hover && createPortal(
        <div
          className="fixed pointer-events-none animate-in fade-in duration-150"
          style={{
            top: posicion.arriba ? undefined : posicion.top,
            bottom: posicion.arriba ? (window.innerHeight - posicion.top) : undefined,
            left: posicion.left,
            zIndex: 9999,
          }}
        >
          <TooltipAccion accion={accion} />
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Etapa desplegable con mosaico de acciones ────────────────────────────────
function BloqueEtapa({ etapa, accionesDeEtapa, indice, abiertaInicial }) {
  const [abierta, setAbierta] = useState(abiertaInicial);
  const cfg = ECFG[etapa.estado] || ECFG.Pendiente;
  const pct = parseFloat(etapa.porcentaje_calculado || etapa.porcentaje_avance) || 0;
  const ahora = new Date();
  const completadas = accionesDeEtapa.filter(a => a.estado === 'Completada').length;
  const enProceso  = accionesDeEtapa.filter(a => a.estado === 'En_proceso').length;
  const bloqueadas = accionesDeEtapa.filter(a => a.estado === 'Bloqueada').length;
  const atrasadas  = accionesDeEtapa.filter(a =>
    a.fecha_fin && new Date(a.fecha_fin) < ahora
    && a.estado !== 'Completada' && a.estado !== 'Cancelada'
  ).length;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setAbierta(!abierta)}
        className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-gray-50 transition-colors"
      >
        <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-black text-white ${cfg.bar}`}>
          {indice + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[13px] font-semibold text-gray-800 truncate">{etapa.nombre}</p>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium flex-shrink-0 ${cfg.badge}`}>{cfg.label}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] flex-wrap">
            {completadas > 0 && <span className="text-emerald-600 font-medium">{completadas} completada{completadas !== 1 ? 's' : ''}</span>}
            {enProceso > 0  && <span className="text-orange-500 font-medium">{enProceso} en proceso</span>}
            {bloqueadas > 0 && <span className="text-red-600 font-medium">{bloqueadas} bloqueada{bloqueadas !== 1 ? 's' : ''}</span>}
            {atrasadas > 0  && <span className="text-orange-500 font-medium">{atrasadas} atrasada{atrasadas !== 1 ? 's' : ''}</span>}
            {accionesDeEtapa.length === 0 && <span className="text-gray-400">Sin acciones</span>}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="hidden sm:block text-right">
            <p className={`text-[15px] font-black tabular-nums ${cfg.text}`}>{pct.toFixed(0)}%</p>
            <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden mt-0.5">
              <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
          <ChevronDown size={16} className={`text-gray-300 transition-transform duration-200 ${abierta ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {abierta && (
        <div className="px-4 pb-4 border-t border-gray-50">
          {accionesDeEtapa.length === 0 ? (
            <p className="text-[12px] text-gray-400 italic py-3 text-center">Sin acciones en esta etapa</p>
          ) : (
            <div className="grid gap-2.5 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {accionesDeEtapa.map((accion, idx) => (
                <TarjetaAccion key={accion.id} accion={accion} numero={idx + 1} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Item de actividad reciente ───────────────────────────────────────────────
function ItemActividad({ item }) {
  const esComentario = item.tipo === 'comentario';
  const iniciales = (item.actor || 'U').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
        esComentario ? 'bg-blue-100 text-blue-600' : 'bg-guinda-100 text-guinda-600'
      }`}>
        {iniciales}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-gray-700 leading-snug">
          <span className="font-semibold">{item.actor || 'Usuario'}</span>
          {item.actor_dg && <span className="text-gray-400 text-[10px]"> ({item.actor_dg})</span>}
          <span className="text-gray-400"> {esComentario ? 'comentó:' : 'subió:'} </span>
          <span className="text-gray-600">
            {(item.descripcion || '').length > 70
              ? item.descripcion.substring(0, 70) + '…'
              : item.descripcion}
          </span>
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5">{rel(item.created_at)}</p>
      </div>
      <div className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${
        esComentario ? 'bg-blue-50' : 'bg-guinda-50'
      }`}>
        {esComentario
          ? <MessageSquare size={10} className="text-blue-500" />
          : <Paperclip size={10} className="text-guinda-500" />
        }
      </div>
    </div>
  );
}

// ─── Sección de indicadores con desglose expandible ──────────────────────────
function SeccionIndicadores({ indicadores }) {
  const [abiertos, setAbiertos] = useState({});
  const toggle = (id) => setAbiertos(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="mt-4 pt-4 border-t border-gray-50">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1">
        <BarChart3 size={10} /> Avance de indicadores
        <span className="font-normal normal-case text-gray-300 ml-1">
          (aportación comprometida vs meta)
        </span>
      </p>
      <div className="space-y-2">
        {indicadores.map(ind => {
          const barColor = ind.pct_avance >= 100 ? 'bg-emerald-400'
            : ind.pct_avance >= 60 ? 'bg-guinda-400'
            : ind.pct_avance >= 30 ? 'bg-amber-400'
            : 'bg-gray-200';
          const textColor = ind.pct_avance >= 100 ? 'text-emerald-600'
            : ind.pct_avance >= 60 ? 'text-guinda-600'
            : ind.pct_avance >= 30 ? 'text-amber-600'
            : 'text-gray-400';
          const hayDesglose = ind.aportaciones && ind.aportaciones.length > 0;
          const abierto = abiertos[ind.id];

          return (
            <div key={ind.id} className="rounded-lg border border-gray-100 overflow-hidden">
              {/* Fila principal del indicador */}
              <button
                type="button"
                onClick={() => hayDesglose && toggle(ind.id)}
                className={`w-full text-left px-3 py-2 ${hayDesglose ? 'hover:bg-gray-50 cursor-pointer' : 'cursor-default'}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0 border ${
                      ind.nivel === 'etapa'
                        ? 'bg-amber-50 text-amber-600 border-amber-100'
                        : 'bg-guinda-50 text-guinda-600 border-guinda-100'
                    }`}>
                      {ind.nivel === 'etapa' ? ind.etapa_nombre || 'Etapa' : 'Proyecto'}
                    </span>
                    <span className="text-[11px] font-semibold text-gray-700 truncate">{ind.nombre}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[10px] text-gray-400 tabular-nums">
                      {Number(ind.total_aportado).toLocaleString()} / {Number(ind.meta_global).toLocaleString()} {ind.unidad_label}
                    </span>
                    <span className={`text-[12px] font-black tabular-nums ${textColor}`}>
                      {ind.pct_avance.toFixed(0)}%
                    </span>
                    {hayDesglose && (
                      <ChevronDown size={11} className={`text-gray-300 transition-transform flex-shrink-0 ${abierto ? 'rotate-180' : ''}`} />
                    )}
                  </div>
                </div>
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${barColor}`}
                    style={{ width: `${Math.min(ind.pct_avance, 100)}%` }} />
                </div>
              </button>

              {/* Desglose de aportaciones por acción/subacción */}
              {abierto && hayDesglose && (
                <div className="border-t border-gray-100 bg-gray-50/60 px-3 py-2 space-y-1">
                  {ind.aportaciones.map((ap, i) => {
                    const cfg = ECFG[ap.estado] || ECFG.Pendiente;
                    const pctAp = ind.meta_global > 0
                      ? Math.min(100, (ap.valor_aportado / ind.meta_global) * 100)
                      : 0;
                    return (
                      <div key={i} className="flex items-center gap-2 py-0.5">
                        <div className="flex-shrink-0">
                          {ap.tipo === 'subaccion'
                            ? <GitBranch size={9} className="text-gray-300 ml-2" />
                            : <Layers size={9} className="text-gray-300" />
                          }
                        </div>
                        <span className="text-[10px] text-gray-600 flex-1 truncate min-w-0">
                          {ap.tipo === 'subaccion' && <span className="text-gray-300 mr-1">└</span>}
                          {ap.nombre}
                          {ap.etapa_nombre && (
                            <span className="text-gray-300 ml-1">· {ap.etapa_nombre}</span>
                          )}
                        </span>
                        <span className={`text-[9px] px-1 py-0.5 rounded font-medium border flex-shrink-0 ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                        <span className="text-[10px] font-bold tabular-nums text-gray-600 flex-shrink-0 w-16 text-right">
                          {Number(ap.valor_aportado).toLocaleString()} {ind.unidad_label}
                        </span>
                        <span className="text-[9px] tabular-nums text-gray-400 flex-shrink-0 w-8 text-right">
                          {pctAp.toFixed(0)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Fila de métrica en sidebar ───────────────────────────────────────────────
function FilaMetrica({ icono: Icono, label, valor, color = 'gray', alerta }) {
  const CLS = {
    guinda:  'text-guinda-600 bg-guinda-50',
    emerald: 'text-emerald-600 bg-emerald-50',
    orange:  'text-orange-600 bg-orange-50',
    red:     'text-red-600 bg-red-50',
    blue:    'text-blue-600 bg-blue-50',
    gray:    'text-gray-500 bg-gray-100',
  }[color] || 'text-gray-500 bg-gray-100';

  return (
    <div className="flex items-center gap-2.5 py-2 border-b border-gray-50 last:border-0">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${CLS}`}>
        <Icono size={13} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide leading-none">{label}</p>
        <p className="text-[15px] font-black tabular-nums text-gray-800 leading-tight">{valor}</p>
      </div>
      {alerta && (
        <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold border border-red-200 flex-shrink-0">
          {alerta}
        </span>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ResumenProyecto({ proyecto, etapas = [], proyectoId, onIrSeguimiento, refreshKey = 0 }) {
  const [stats, setStats] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [datosAbiertos, setDatosAbiertos] = useState(false);

  useEffect(() => {
    if (!proyectoId) return;
    setCargando(true);
    client.get(`/proyectos/${proyectoId}/stats`)
      .then(res => setStats(res.data.datos))
      .catch(err => console.error('Error stats:', err))
      .finally(() => setCargando(false));
  }, [proyectoId, refreshKey]);

  const pct = parseFloat(proyecto?.porcentaje_calculado) || 0;
  const accionesStats = stats?.acciones || { por_estado: {}, total: 0 };
  const evidenciasTotal = stats?.evidencias?.total || 0;
  const riesgosStats = stats?.riesgos || { total: 0, criticos: 0 };
  const actividad = stats?.actividad || [];
  const accionesResumen = stats?.acciones_resumen || [];
  const atrasadas = stats?.atrasadas || [];
  const proximasAVencer = stats?.proximas_a_vencer || [];
  const riesgosDetalle = stats?.riesgos_detalle || [];
  const indicadores = stats?.indicadores || [];

  // Agrupar acciones por etapa
  const accionesPorEtapa = {};
  for (const accion of accionesResumen) {
    const key = accion.id_etapa || '__sin_etapa__';
    if (!accionesPorEtapa[key]) accionesPorEtapa[key] = [];
    accionesPorEtapa[key].push(accion);
  }

  const accionesBloqueadas = accionesResumen.filter(a => a.estado === 'Bloqueada');

  // Días restantes del proyecto
  const fechaFin = proyecto?.fecha_limite || proyecto?.fecha_fin;
  const diasRest = fechaFin
    ? Math.ceil((new Date(fechaFin).getTime() - Date.now()) / 86400000)
    : null;

  // Porcentajes barra apilada
  const totalAcc = accionesStats.total || 1;
  const pctC = ((accionesStats.por_estado?.Completada || 0) / totalAcc) * 100;
  const pctE = ((accionesStats.por_estado?.En_proceso  || 0) / totalAcc) * 100;
  const pctB = ((accionesStats.por_estado?.Bloqueada   || 0) / totalAcc) * 100;
  const pctP = ((accionesStats.por_estado?.Pendiente   || 0) / totalAcc) * 100;

  return (
    <div className="pb-8 space-y-4">

      {/* ═══ HEADER: Anillo + pills + descripción + fechas ═══════════════════ */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-start gap-5">
          <Anillo pct={pct} size={82} stroke={8} />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {proyecto?.tipo && (
                <span className="text-[11px] bg-guinda-50 text-guinda-600 px-2 py-0.5 rounded-full font-medium border border-guinda-100">
                  {proyecto.tipo.replace(/_/g, ' ')}
                </span>
              )}
              {proyecto?.estado && (
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${
                  proyecto.estado === 'Activo'
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                    : 'bg-gray-50 text-gray-500 border-gray-200'
                }`}>{proyecto.estado}</span>
              )}
              {proyecto?.dg_lider_siglas && (
                <span className="text-[11px] bg-gray-50 text-gray-600 px-2 py-0.5 rounded-full font-medium border border-gray-200">
                  {proyecto.dg_lider_siglas}
                  {proyecto?.direccion_area_lider_siglas && ` / ${proyecto.direccion_area_lider_siglas}`}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-400">
              {(proyecto?.fecha_inicio || fechaFin) && (
                <span className="flex items-center gap-1">
                  <Calendar size={10} />
                  {fmt(proyecto?.fecha_inicio)} — {fmt(fechaFin)}
                  {diasRest !== null && (
                    <span className={`ml-1.5 font-semibold ${
                      diasRest < 0 ? 'text-red-500' : diasRest <= 7 ? 'text-orange-500' : 'text-gray-500'
                    }`}>
                      {diasRest < 0
                        ? `· Venció hace ${Math.abs(diasRest)}d`
                        : diasRest === 0 ? '· Vence hoy'
                        : `· ${diasRest}d restantes`}
                    </span>
                  )}
                </span>
              )}
              {proyecto?.meta_descripcion && (
                <span className="flex items-center gap-1">
                  <Target size={10} className="text-blue-400 flex-shrink-0" />
                  <span className="text-gray-500">Meta:</span>
                  <span className="text-gray-600">
                    {proyecto.meta_descripcion.length > 80
                      ? proyecto.meta_descripcion.substring(0, 80) + '…'
                      : proyecto.meta_descripcion}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Barra apilada de distribución de acciones */}
        {accionesStats.total > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-50 flex items-center gap-3">
            <div className="flex-1 flex h-2 rounded-full overflow-hidden gap-px">
              {pctC > 0 && <div className="bg-emerald-400" style={{ width: `${pctC}%` }} />}
              {pctE > 0 && <div className="bg-orange-400" style={{ width: `${pctE}%` }} />}
              {pctB > 0 && <div className="bg-red-400"    style={{ width: `${pctB}%` }} />}
              {pctP > 0 && <div className="bg-gray-200"   style={{ width: `${pctP}%` }} />}
            </div>
            <div className="flex items-center gap-3 text-[10px] text-gray-500 flex-shrink-0 flex-wrap">
              {accionesStats.por_estado?.Completada > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                  {accionesStats.por_estado.Completada} comp.
                </span>
              )}
              {accionesStats.por_estado?.En_proceso > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
                  {accionesStats.por_estado.En_proceso} en proc.
                </span>
              )}
              {accionesStats.por_estado?.Bloqueada > 0 && (
                <span className="flex items-center gap-1 text-red-600 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                  {accionesStats.por_estado.Bloqueada} bloq.
                </span>
              )}
              {accionesStats.por_estado?.Pendiente > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />
                  {accionesStats.por_estado.Pendiente} pend.
                </span>
              )}
            </div>
          </div>
        )}

        {/* Indicadores en cascada — progreso por indicador con desglose expandible */}
        {indicadores.length > 0 && (
          <SeccionIndicadores indicadores={indicadores} />
        )}
      </div>

      {/* ═══ LAYOUT 2 COLUMNAS ═══════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-4">

        {/* ── COLUMNA PRINCIPAL: Etapas desplegables ───────────────────────── */}
        <div className="space-y-3">
          {cargando ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 h-16 animate-pulse" />
              ))}
            </div>
          ) : etapas.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <p className="text-sm text-gray-400">Sin etapas registradas</p>
            </div>
          ) : (
            etapas.map((etapa, idx) => (
              <BloqueEtapa
                key={etapa.id}
                etapa={etapa}
                accionesDeEtapa={accionesPorEtapa[etapa.id] || []}
                indice={idx}
                abiertaInicial={idx === 0}
              />
            ))
          )}
          {!cargando && accionesPorEtapa['__sin_etapa__']?.length > 0 && (
            <BloqueEtapa
              etapa={{ nombre: 'Sin etapa', estado: 'Pendiente', porcentaje_calculado: 0 }}
              accionesDeEtapa={accionesPorEtapa['__sin_etapa__']}
              indice={etapas.length}
              abiertaInicial={false}
            />
          )}
        </div>

        {/* ── SIDEBAR DERECHO ──────────────────────────────────────────────── */}
        <div className="space-y-3">

          {/* Métricas */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Métricas</p>
            <FilaMetrica
              icono={CheckCircle2}
              label="Acciones"
              valor={accionesStats.total}
              color={accionesStats.por_estado?.Bloqueada > 0 ? 'red' : 'emerald'}
              alerta={accionesStats.por_estado?.Bloqueada > 0 ? `${accionesStats.por_estado.Bloqueada} bloq.` : null}
            />
            <FilaMetrica icono={Paperclip} label="Evidencias" valor={evidenciasTotal} color="blue" />
            <FilaMetrica
              icono={Shield}
              label="Riesgos activos"
              valor={riesgosStats.total}
              color={riesgosStats.criticos > 0 ? 'red' : riesgosStats.total > 0 ? 'orange' : 'gray'}
              alerta={riesgosStats.criticos > 0 ? `${riesgosStats.criticos} crít.` : null}
            />
          </div>

          {/* Atrasadas */}
          {atrasadas.length > 0 && (
            <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-3.5">
              <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Clock size={10} /> Atrasadas
              </p>
              <div className="space-y-1.5">
                {atrasadas.map(a => (
                  <div key={a.id} className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-1.5 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0 mt-1.5" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-gray-800 leading-snug truncate">
                          {a.id_accion_padre ? `↳ ${a.nombre}` : a.nombre}
                        </p>
                        <p className="text-[10px] text-gray-400">al vencer</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full flex-shrink-0 border border-red-100 whitespace-nowrap">
                      -{a.dias_atraso}d
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Próximas a vencer */}
          {proximasAVencer.length > 0 && (
            <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-3.5">
              <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <AlertTriangle size={10} /> Próximas a vencer
              </p>
              <div className="space-y-1.5">
                {proximasAVencer.map(a => (
                  <div key={a.id} className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-1.5 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0 mt-1.5" />
                      <p className="text-[11px] font-medium text-gray-800 leading-snug truncate">
                        {a.id_accion_padre ? `↳ ${a.nombre}` : a.nombre}
                      </p>
                    </div>
                    <span className="text-[10px] font-black text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full flex-shrink-0 border border-orange-100 whitespace-nowrap">
                      {a.dias_restantes === 0 ? 'Hoy' : `${a.dias_restantes}d`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Riesgos y bloqueos */}
          {(riesgosDetalle.length > 0 || accionesBloqueadas.length > 0) && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3.5">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Shield size={10} /> Riesgos y bloqueos
              </p>
              {riesgosDetalle.map(r => (
                <div key={r.id} className="flex items-start gap-1.5 mb-1.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${
                    r.nivel === 'Critico' ? 'bg-red-500'
                    : r.nivel === 'Alto'  ? 'bg-orange-400'
                    : r.nivel === 'Medio' ? 'bg-yellow-400'
                    : 'bg-blue-300'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-gray-800 leading-snug truncate">{r.titulo}</p>
                    <div className="flex items-center gap-1">
                      <span className={`text-[9px] font-bold ${
                        r.nivel === 'Critico' ? 'text-red-600'
                        : r.nivel === 'Alto'  ? 'text-orange-500'
                        : 'text-gray-400'
                      }`}>{r.nivel}</span>
                      {r.entidad_tipo && r.entidad_tipo !== 'Proyecto' && (
                        <span className="text-[9px] text-gray-300">· {r.entidad_tipo === 'Subaccion' ? 'Tarea' : r.entidad_tipo}{r.etiqueta ? `: ${r.etiqueta}` : ''}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {accionesBloqueadas.map(a => (
                <div key={a.id} className="flex items-start gap-1.5 mb-1.5 px-2 py-1 bg-red-50 rounded-lg border border-red-100">
                  <Lock size={10} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-red-700 truncate">{a.nombre}</p>
                    {a.motivo_bloqueo && (
                      <p className="text-[10px] text-red-500 leading-snug">{a.motivo_bloqueo}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Datos del proyecto (colapsable) */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <button
              onClick={() => setDatosAbiertos(!datosAbiertos)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-gray-50 transition-colors"
            >
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <Info size={10} /> Datos del proyecto
              </span>
              <ChevronDown size={12} className={`text-gray-300 transition-transform ${datosAbiertos ? 'rotate-180' : ''}`} />
            </button>
            {datosAbiertos && (
              <div className="px-3.5 pb-3.5 border-t border-gray-50 space-y-2.5 pt-2.5">
                {[
                  { label: 'DG Líder',   val: proyecto?.dg_lider_nombre || proyecto?.dg_lider_siglas },
                  { label: 'Área',       val: proyecto?.direccion_area_lider_nombre || proyecto?.direccion_area_lider_siglas },
                  { label: 'Etapas',     val: etapas.length > 0 ? String(etapas.length) : null },
                  { label: 'Programa',   val: proyecto?.programa_nombre },
                  { label: 'Creado por', val: proyecto?.creador_nombre },
                ].filter(f => f.val).map(({ label, val }) => (
                  <div key={label}>
                    <p className="text-[9px] text-gray-400 uppercase tracking-wide font-semibold">{label}</p>
                    <p className="text-[12px] text-gray-700">{val}</p>
                  </div>
                ))}
                {proyecto?.etiquetas?.length > 0 && (
                  <div>
                    <p className="text-[9px] text-gray-400 uppercase tracking-wide font-semibold mb-1 flex items-center gap-1">
                      <Tag size={8} /> Etiquetas
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {proyecto.etiquetas.map((et, i) => (
                        <span key={i} className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full border border-gray-200">{et}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ ACTIVIDAD RECIENTE — full width ════════════════════════════════ */}
      {actividad.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Zap size={10} /> Actividad reciente
          </h3>
          <div>
            {actividad.map((item, idx) => (
              <ItemActividad key={idx} item={item} />
            ))}
          </div>
        </div>
      )}

      {cargando && (
        <div className="text-center py-4">
          <div className="inline-flex items-center gap-2 text-xs text-gray-400">
            <div className="w-3 h-3 border-2 border-guinda-300 border-t-guinda-500 rounded-full animate-spin" />
            Cargando estadísticas…
          </div>
        </div>
      )}
    </div>
  );
}
