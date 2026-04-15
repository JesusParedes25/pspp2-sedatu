/**
 * ARCHIVO: AccionFicha.jsx
 * PROPÓSITO: Tarjeta visual de acción para el grid de seguimiento.
 *            Replica el estilo de TarjetaAccion del resumen ejecutivo:
 *            número grande translúcido, dots de subacciones, barra de
 *            color inferior por estado, tooltip flotante en hover.
 *            Al hacer click abre el drawer de detalle completo.
 *
 * MINI-CLASE: Ficha con tooltip portal
 * ─────────────────────────────────────────────────────────────────
 * El tooltip se renderiza con createPortal en document.body para
 * escapar del overflow:hidden del card padre. Se posiciona
 * dinámicamente según el espacio disponible en pantalla.
 * Click abre DrawerAccion; hover muestra el tooltip de preview.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Lock, Paperclip, MessageSquare, Calendar, User, AlertCircle } from 'lucide-react';

// ── Config por estado ────────────────────────────────────────────
const ECFG = {
  Completada: { bar: 'bg-emerald-400', text: 'text-emerald-600', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-400', label: 'Completada' },
  En_proceso: { bar: 'bg-orange-400',  text: 'text-orange-500',  badge: 'bg-orange-50 text-orange-700 border-orange-200',   dot: 'bg-orange-400',  label: 'En proceso' },
  Pendiente:  { bar: 'bg-gray-300',    text: 'text-gray-400',    badge: 'bg-gray-50 text-gray-500 border-gray-200',          dot: 'bg-gray-300',    label: 'Pendiente'  },
  Bloqueada:  { bar: 'bg-red-400',     text: 'text-red-600',     badge: 'bg-red-50 text-red-700 border-red-200',             dot: 'bg-red-400',     label: 'Bloqueada'  },
  Cancelada:  { bar: 'bg-gray-200',    text: 'text-gray-300',    badge: 'bg-gray-50 text-gray-400 border-gray-100',          dot: 'bg-gray-200',    label: 'Cancelada'  },
};

const fmtCorto = (f) => f ? new Date(f).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '—';
const fmt      = (f) => f ? new Date(f).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ── Tooltip flotante de preview ──────────────────────────────────
function TooltipAccion({ accion }) {
  const cfg  = ECFG[accion.estado] || ECFG.Pendiente;
  const pct  = parseFloat(accion.porcentaje_avance) || 0;
  const subs = Array.isArray(accion.subacciones) ? accion.subacciones : [];
  const ahora = new Date();
  const estaVencida     = accion.fecha_fin && new Date(accion.fecha_fin) < ahora && accion.estado !== 'Completada';
  const diasAtraso      = estaVencida ? Math.ceil((ahora - new Date(accion.fecha_fin)) / 86400000) : null;
  const subsCompletadas = subs.filter(s => s.estado === 'Completada').length;
  const subsAtrasadas   = subs.filter(s => s.fecha_fin && new Date(s.fecha_fin) < ahora && s.estado !== 'Completada' && s.estado !== 'Cancelada').length;
  const totalComentarios = parseInt(accion.total_comentarios) || 0;
  const totalEvidencias  = parseInt(accion.total_evidencias)  || 0;

  return (
    <div className="w-72 bg-white rounded-xl shadow-2xl border border-gray-200 p-3.5 space-y-2.5 text-left pointer-events-none">
      <div>
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${cfg.badge}`}>{cfg.label}</span>
          <span className={`text-[11px] font-black tabular-nums ${cfg.text}`}>{pct.toFixed(0)}%</span>
          {estaVencida && (
            <span className="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold border border-orange-200 flex items-center gap-0.5">
              <AlertCircle size={8} /> -{diasAtraso}d
            </span>
          )}
        </div>
        <p className="text-[12px] font-semibold text-gray-800 leading-snug">{accion.nombre}</p>
      </div>

      {accion.responsable_nombre && (
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
          <User size={10} className="text-gray-400 flex-shrink-0" />
          {accion.responsable_nombre}
        </div>
      )}

      <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
        <Calendar size={10} className="text-gray-400 flex-shrink-0" />
        {fmt(accion.fecha_inicio)} — {fmt(accion.fecha_fin)}
      </div>

      {accion.motivo_bloqueo && (
        <div className="flex items-start gap-1.5 bg-red-50 rounded-lg px-2 py-1.5 border border-red-100">
          <Lock size={10} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-red-600 leading-snug">{accion.motivo_bloqueo}</p>
        </div>
      )}

      {subs.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
            Subacciones ({subsCompletadas}/{subs.length})
            {subsAtrasadas > 0 && <span className="text-orange-500 normal-case"> · {subsAtrasadas} atrasada{subsAtrasadas > 1 ? 's' : ''}</span>}
          </p>
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {subs.map(s => {
              const sCfg = ECFG[s.estado] || ECFG.Pendiente;
              const sVencida = s.fecha_fin && new Date(s.fecha_fin) < ahora && s.estado !== 'Completada';
              return (
                <div key={s.id} className="flex items-center gap-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sCfg.dot}`} />
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

      {(totalComentarios > 0 || totalEvidencias > 0) && (
        <div className="flex items-center gap-3 pt-1.5 border-t border-gray-100">
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

      <p className="text-[10px] text-guinda-400 font-medium pt-0.5">Click para ver detalle completo →</p>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────
export default function AccionFicha({ accion, numero, onClick }) {
  const [hover, setHover]       = useState(false);
  const [posicion, setPosicion] = useState({ top: 0, left: 0, arriba: false });
  const refCard  = useRef(null);
  const timerRef = useRef(null);

  const cfg          = ECFG[accion.estado] || ECFG.Pendiente;
  const pct          = parseFloat(accion.porcentaje_avance) || 0;
  const esCompletada = accion.estado === 'Completada';
  const esBloqueada  = accion.estado === 'Bloqueada';
  const esHito       = accion.tipo === 'Hito';
  const subs         = Array.isArray(accion.subacciones) ? accion.subacciones : [];
  const totalSubs    = parseInt(accion.total_subacciones) || subs.length;
  const ahora        = new Date();
  const estaVencida  = accion.fecha_fin && new Date(accion.fecha_fin) < ahora && !esCompletada && accion.estado !== 'Cancelada';
  const diasAtraso   = estaVencida ? Math.ceil((ahora - new Date(accion.fecha_fin)) / 86400000) : null;

  function mostrarTooltip() {
    timerRef.current = setTimeout(() => {
      if (refCard.current) {
        const rect = refCard.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        setPosicion({
          top:    spaceBelow < 280 ? rect.top - 8 : rect.bottom + 8,
          left:   Math.min(rect.left, window.innerWidth - 308),
          arriba: spaceBelow < 280,
        });
      }
      setHover(true);
    }, 320);
  }

  function ocultarTooltip() {
    clearTimeout(timerRef.current);
    setHover(false);
  }

  return (
    <button
      ref={refCard}
      onClick={onClick}
      onMouseEnter={mostrarTooltip}
      onMouseLeave={ocultarTooltip}
      className={`group relative w-full text-left rounded-xl border p-3 flex flex-col gap-1.5 overflow-hidden transition-all duration-150
        ${
          esCompletada ? 'opacity-50 border-gray-100 bg-gray-50'
          : estaVencida ? 'border-orange-300 border-dashed bg-white hover:shadow-md hover:border-orange-400'
          : esBloqueada ? 'border-red-200 bg-red-50/30 hover:shadow-md'
          : 'border-gray-100 bg-white hover:shadow-md hover:border-gray-200'
        }`}
    >
      {/* Número grande translúcido */}
      <span className={`text-3xl font-black tabular-nums leading-none ${cfg.text} opacity-15 select-none`}>
        {String(numero).padStart(2, '0')}
      </span>

      {/* Badges */}
      <div className="flex flex-wrap gap-1 -mt-1">
        {esHito && (
          <span className="text-[9px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full font-bold border border-purple-200">HITO</span>
        )}
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

      {/* Nombre */}
      <p className={`text-[11px] font-semibold leading-tight line-clamp-2 ${
        esCompletada ? 'line-through text-gray-400' : esBloqueada ? 'text-red-700' : 'text-gray-800'
      }`}>
        {accion.nombre}
      </p>

      {/* Dots de subacciones */}
      {subs.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-0.5">
          {subs.slice(0, 12).map(s => {
            const subVencida = s.fecha_fin && new Date(s.fecha_fin) < ahora && s.estado !== 'Completada' && s.estado !== 'Cancelada';
            return (
              <span key={s.id} title={s.nombre}
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
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
      {subs.length === 0 && totalSubs > 0 && (
        <p className="text-[10px] text-gray-400">{totalSubs} tarea{totalSubs !== 1 ? 's' : ''}</p>
      )}

      {/* Fila inferior: porcentaje + fecha */}
      <div className="flex items-center justify-between mt-auto pt-1.5">
        <span className={`text-[11px] font-black tabular-nums ${cfg.text}`}>{pct.toFixed(0)}%</span>
        {accion.fecha_fin && (
          <span className={`text-[9px] ${estaVencida ? 'text-orange-500 font-semibold' : 'text-gray-400'}`}>
            {fmtCorto(accion.fecha_fin)}
          </span>
        )}
      </div>

      {/* Barra de color inferior */}
      <div className={`absolute bottom-0 left-0 right-0 h-[3px] ${cfg.bar}`} />

      {/* Tooltip flotante */}
      {hover && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            top:    posicion.arriba ? undefined : posicion.top,
            bottom: posicion.arriba ? (window.innerHeight - posicion.top) : undefined,
            left:   posicion.left,
          }}
        >
          <TooltipAccion accion={accion} />
        </div>,
        document.body
      )}
    </button>
  );
}
