/**
 * ARCHIVO: GanttCronograma.jsx
 * PROPÓSITO: Diagrama de Gantt jerárquico que muestra etapas → acciones
 *            → subacciones como barras horizontales sobre una línea de
 *            tiempo con meses.
 *
 * MINI-CLASE: Gantt jerárquico con carga bajo demanda
 * ─────────────────────────────────────────────────────────────────
 * Un Gantt es una tabla donde el eje Y son las tareas y el eje X
 * es el tiempo. Las etapas se expanden para mostrar acciones, y las
 * acciones con subacciones se expanden un nivel más. Las acciones
 * y subacciones se cargan bajo demanda (lazy loading) al expandir
 * la etapa correspondiente. Cada barra muestra el porcentaje de
 * avance como relleno interno, y un tooltip con detalles al hover.
 * La línea roja vertical marca el día de hoy.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronRight, Milestone, Layers } from 'lucide-react';
import * as accionesApi from '../../api/acciones';

const COLORES = {
  Completada:  { barra: 'bg-emerald-500', fondo: 'bg-emerald-100', texto: 'text-emerald-700' },
  En_proceso:  { barra: 'bg-blue-500',    fondo: 'bg-blue-100',    texto: 'text-blue-700'    },
  Pendiente:   { barra: 'bg-slate-400',   fondo: 'bg-slate-100',   texto: 'text-slate-600'   },
  Bloqueada:   { barra: 'bg-red-400',     fondo: 'bg-red-100',     texto: 'text-red-700'     },
  Cancelada:   { barra: 'bg-gray-300',    fondo: 'bg-gray-100',    texto: 'text-gray-500'    },
};

const ANCHO_NOMBRES = 'w-72';

export default function GanttCronograma({ etapas = [], fechaInicioProyecto, fechaFinProyecto }) {
  const [expandidas, setExpandidas] = useState({}); // { etapaId: true }
  const [accionesExpandidas, setAccionesExpandidas] = useState({}); // { accionId: true }
  const [accionesPorEtapa, setAccionesPorEtapa] = useState({}); // { etapaId: [] }
  const [subaccionesPorAccion, setSubaccionesPorAccion] = useState({}); // { accionId: [] }
  const [tooltip, setTooltip] = useState(null);

  // ─── Rango de tiempo ─────────────────────────────────────────
  const { inicioMs, finMs, meses } = useMemo(() => {
    let inicio = fechaInicioProyecto ? new Date(fechaInicioProyecto) : null;
    let fin = fechaFinProyecto ? new Date(fechaFinProyecto) : null;

    etapas.forEach(e => {
      if (e.fecha_inicio) {
        const fi = new Date(e.fecha_inicio);
        if (!inicio || fi < inicio) inicio = fi;
      }
      if (e.fecha_fin) {
        const ff = new Date(e.fecha_fin);
        if (!fin || ff > fin) fin = ff;
      }
    });

    if (!inicio) inicio = new Date();
    if (!fin) fin = new Date(inicio.getTime() + 180 * 86400000);

    const margenInicio = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
    const margenFin = new Date(fin.getFullYear(), fin.getMonth() + 2, 0);

    const listaMeses = [];
    const cursor = new Date(margenInicio);
    while (cursor <= margenFin) {
      listaMeses.push({
        etiqueta: cursor.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }),
        inicio: new Date(cursor),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return { inicioMs: margenInicio.getTime(), finMs: margenFin.getTime(), meses: listaMeses };
  }, [etapas, fechaInicioProyecto, fechaFinProyecto]);

  const rangoTotal = finMs - inicioMs || 1;

  function calcularBarra(fechaInicio, fechaFin) {
    if (!fechaInicio || !fechaFin) return null;
    const fi = new Date(fechaInicio).getTime();
    const ff = new Date(fechaFin).getTime();
    const left = Math.max(0, ((fi - inicioMs) / rangoTotal) * 100);
    const width = Math.max(0.5, ((ff - fi) / rangoTotal) * 100);
    return { left: `${left}%`, width: `${Math.min(width, 100 - left)}%` };
  }

  const hoyPos = useMemo(() => {
    const ahora = Date.now();
    if (ahora < inicioMs || ahora > finMs) return null;
    return `${((ahora - inicioMs) / rangoTotal) * 100}%`;
  }, [inicioMs, finMs, rangoTotal]);

  // ─── Carga bajo demanda ──────────────────────────────────────
  const toggleEtapa = useCallback(async (etapaId) => {
    const yaExpandida = expandidas[etapaId];
    setExpandidas(prev => ({ ...prev, [etapaId]: !yaExpandida }));
    if (!yaExpandida && !accionesPorEtapa[etapaId]) {
      try {
        const res = await accionesApi.obtenerAccionesEtapa(etapaId);
        setAccionesPorEtapa(prev => ({ ...prev, [etapaId]: res.datos || [] }));
      } catch (err) {
        console.error('Error cargando acciones para Gantt:', err);
      }
    }
  }, [expandidas, accionesPorEtapa]);

  const toggleAccion = useCallback(async (accionId) => {
    const yaExpandida = accionesExpandidas[accionId];
    setAccionesExpandidas(prev => ({ ...prev, [accionId]: !yaExpandida }));
    if (!yaExpandida && !subaccionesPorAccion[accionId]) {
      try {
        const res = await accionesApi.obtenerSubacciones(accionId);
        setSubaccionesPorAccion(prev => ({ ...prev, [accionId]: res.datos || [] }));
      } catch (err) {
        console.error('Error cargando subacciones para Gantt:', err);
      }
    }
  }, [accionesExpandidas, subaccionesPorAccion]);

  // ─── Formatear fecha para tooltip ────────────────────────────
  const fmtFecha = (f) => f ? new Date(f).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  // ─── Componente de fila de barra ─────────────────────────────
  function FilaGantt({ nombre, fechaInicio, fechaFin, estado, porcentaje, nivel, tieneHijos, estaExpandida, onToggle, esHito }) {
    const barra = calcularBarra(fechaInicio, fechaFin);
    const colores = COLORES[estado] || COLORES.Pendiente;
    const pct = parseFloat(porcentaje || 0);

    const paddingLeft = nivel === 0 ? 'pl-3' : nivel === 1 ? 'pl-9' : 'pl-14';
    const altoBarra = nivel === 0 ? 'h-6' : nivel === 1 ? 'h-4' : 'h-3';
    const bgFila = nivel === 0 ? 'hover:bg-gray-50' : nivel === 1 ? 'bg-slate-50/40 hover:bg-slate-50' : 'bg-slate-50/20 hover:bg-slate-100/50';

    return (
      <div className={`flex ${bgFila} transition-colors group`}>
        {/* Columna de nombre */}
        <div className={`${ANCHO_NOMBRES} flex-shrink-0 ${paddingLeft} pr-2 py-2 border-r border-gray-200 flex items-center gap-1.5 min-w-0`}>
          {tieneHijos ? (
            <button onClick={onToggle} className="flex-shrink-0 text-gray-400 hover:text-gray-600 p-0.5">
              {estaExpandida ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          ) : (
            <span className="w-5 flex-shrink-0" />
          )}

          {nivel === 0 && (
            <span className="w-5 h-5 bg-guinda-50 text-guinda-600 rounded text-[10px] font-bold flex items-center justify-center flex-shrink-0">
              <Layers size={11} />
            </span>
          )}
          {esHito && <Milestone size={12} className="text-purple-500 flex-shrink-0" />}

          <span className={`truncate ${nivel === 0 ? 'text-xs font-semibold text-gray-800' : nivel === 1 ? 'text-[11px] font-medium text-gray-700' : 'text-[11px] text-gray-500'}`} title={nombre}>
            {nombre}
          </span>

          {/* Chip porcentaje pequeño */}
          <span className={`ml-auto text-[10px] font-bold flex-shrink-0 px-1.5 py-0.5 rounded-full ${colores.fondo} ${colores.texto}`}>
            {pct.toFixed(0)}%
          </span>
        </div>

        {/* Columna de barras */}
        <div className="flex-1 relative py-2">
          {/* Grid de meses */}
          <div className="absolute inset-0 flex pointer-events-none">
            {meses.map((_, i) => (
              <div key={i} className="flex-1 border-r border-gray-100/60 last:border-r-0" />
            ))}
          </div>

          {/* Línea de hoy */}
          {hoyPos && (
            <div className="absolute top-0 bottom-0 w-0.5 bg-red-400/60 z-10 pointer-events-none" style={{ left: hoyPos }} />
          )}

          {/* Barra con progreso interno */}
          {barra && (
            <div
              className={`absolute top-1/2 -translate-y-1/2 ${altoBarra} rounded-md overflow-hidden cursor-pointer z-20 border border-black/5`}
              style={barra}
              onMouseEnter={(e) => setTooltip({
                x: e.clientX, y: e.clientY,
                nombre, estado, pct,
                fechas: `${fmtFecha(fechaInicio)} — ${fmtFecha(fechaFin)}`
              })}
              onMouseLeave={() => setTooltip(null)}
            >
              {/* Fondo */}
              <div className={`absolute inset-0 ${colores.fondo} opacity-60`} />
              {/* Progreso */}
              <div className={`absolute inset-y-0 left-0 ${colores.barra} transition-all duration-300`} style={{ width: `${Math.min(pct, 100)}%` }} />
              {/* Texto */}
              {nivel === 0 && (
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white mix-blend-difference">
                  {pct.toFixed(0)}%
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (etapas.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-gray-400">
        Sin etapas para mostrar en el cronograma.
      </div>
    );
  }

  return (
    <div className="card overflow-hidden relative">
      {/* Header con meses */}
      <div className="flex border-b border-gray-200 sticky top-0 z-30 bg-white">
        <div className={`${ANCHO_NOMBRES} flex-shrink-0 px-3 py-2.5 bg-gray-50 border-r border-gray-200`}>
          <span className="text-xs font-semibold text-gray-600">Etapa / Acción</span>
        </div>
        <div className="flex-1 flex relative bg-gray-50">
          {meses.map((mes, i) => (
            <div key={i} className="flex-1 px-1 py-2.5 text-center text-[11px] font-medium text-gray-500 border-r border-gray-200/50 last:border-r-0">
              {mes.etiqueta}
            </div>
          ))}
          {hoyPos && (
            <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10" style={{ left: hoyPos }}>
              <span className="absolute -top-0.5 -translate-x-1/2 bg-red-500 text-white text-[9px] font-bold px-1 rounded-b">HOY</span>
            </div>
          )}
        </div>
      </div>

      {/* Filas */}
      <div className="divide-y divide-gray-100/50 overflow-x-auto">
        {etapas.map(etapa => {
          const estaExpandida = expandidas[etapa.id];
          const acciones = accionesPorEtapa[etapa.id] || [];
          const tieneAcciones = parseInt(etapa.total_acciones) > 0;

          return (
            <div key={etapa.id}>
              {/* Fila etapa */}
              <FilaGantt
                nombre={etapa.nombre}
                fechaInicio={etapa.fecha_inicio}
                fechaFin={etapa.fecha_fin}
                estado={etapa.estado}
                porcentaje={etapa.porcentaje_calculado}
                nivel={0}
                tieneHijos={tieneAcciones}
                estaExpandida={estaExpandida}
                onToggle={() => toggleEtapa(etapa.id)}
              />

              {/* Acciones de la etapa */}
              {estaExpandida && acciones.map(accion => {
                const tieneSubs = parseInt(accion.total_subacciones) > 0;
                const subsExpandidas = accionesExpandidas[accion.id];
                const subs = subaccionesPorAccion[accion.id] || [];

                return (
                  <div key={accion.id}>
                    <FilaGantt
                      nombre={accion.nombre}
                      fechaInicio={accion.fecha_inicio}
                      fechaFin={accion.fecha_fin}
                      estado={accion.estado}
                      porcentaje={accion.porcentaje_avance}
                      nivel={1}
                      tieneHijos={tieneSubs}
                      estaExpandida={subsExpandidas}
                      onToggle={() => toggleAccion(accion.id)}
                      esHito={accion.tipo === 'Hito'}
                    />

                    {/* Subacciones */}
                    {subsExpandidas && subs.map(sub => (
                      <FilaGantt
                        key={sub.id}
                        nombre={sub.nombre}
                        fechaInicio={sub.fecha_inicio}
                        fechaFin={sub.fecha_fin}
                        estado={sub.estado}
                        porcentaje={sub.porcentaje_avance}
                        nivel={2}
                        tieneHijos={false}
                      />
                    ))}
                  </div>
                );
              })}

              {/* Loading */}
              {estaExpandida && acciones.length === 0 && tieneAcciones && (
                <div className="pl-12 py-2 text-[11px] text-gray-400 border-r border-gray-200">Cargando acciones...</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Leyenda */}
      <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-200 flex items-center gap-5 text-[11px] text-gray-500 flex-wrap">
        {Object.entries(COLORES).filter(([k]) => k !== 'Cancelada').map(([estado, c]) => (
          <span key={estado} className="flex items-center gap-1.5">
            <span className={`w-4 h-2.5 rounded-sm ${c.barra}`} />
            {estado.replace(/_/g, ' ')}
          </span>
        ))}
        {hoyPos && (
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-0.5 bg-red-500" /> Hoy
          </span>
        )}
        <span className="ml-auto text-gray-400">Barras muestran avance real</span>
      </div>

      {/* Tooltip flotante */}
      {tooltip && (
        <div
          className="fixed z-50 bg-gray-900 text-white rounded-lg shadow-xl px-3 py-2 text-xs pointer-events-none"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <p className="font-semibold mb-0.5">{tooltip.nombre}</p>
          <p className="text-gray-300">{tooltip.fechas}</p>
          <p className="text-gray-300">{tooltip.estado?.replace(/_/g, ' ')} · {tooltip.pct?.toFixed(0)}%</p>
        </div>
      )}
    </div>
  );
}
