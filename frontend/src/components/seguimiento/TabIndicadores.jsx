/**
 * TabIndicadores.jsx
 * Pestaña "Indicadores" del panel central de detalle de nodo.
 * Muestra todos los indicadores del proyecto en tarjetas de 2 columnas.
 * Permite vincular/desvincular este nodo y editar el valor de aportación.
 */
import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Plus, Trash2, Loader2, ChevronDown, ChevronRight, Link2 } from 'lucide-react';
import * as indicadoresApi from '../../api/indicadores';
import { useUI } from '../../context/UIContext';

const VERDE  = '#16a34a';
const DORADO = '#A57F2C';
const GUINDA = '#7B1C3E';

const TIPO_CONFIG = {
  Avance_fisico: { label: 'Avance físico', color: VERDE,  badgeCls: 'bg-green-50 text-green-700 border-green-200' },
  Gestion:       { label: 'Gestión',        color: DORADO, badgeCls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  Financiero:    { label: 'Financiero',     color: DORADO, badgeCls: 'bg-amber-50 text-amber-700 border-amber-200' },
  Otro:          { label: 'Otro',           color: GUINDA, badgeCls: 'bg-guinda-50 text-guinda-700 border-guinda-200' },
};

const MODOS = [
  { valor: 'proporcional', etiqueta: 'Proporcional al avance' },
  { valor: 'al_concluir',  etiqueta: 'Al concluir (100%)' },
];

function stripeColor(tipo) {
  return TIPO_CONFIG[tipo]?.color || GUINDA;
}

function tipoLabel(tipo) {
  return TIPO_CONFIG[tipo]?.label || tipo;
}

function tipoBadge(tipo) {
  return TIPO_CONFIG[tipo]?.badgeCls || 'bg-gray-100 text-gray-600 border-gray-200';
}

function unidadLabel(ind) {
  if (ind.unidad === 'Porcentaje') return '%';
  if (ind.unidad === 'Moneda_MXN') return '$MXN';
  return ind.etiqueta_unidad || ind.unidad_personalizada || '#';
}

// ─── Componente principal ──────────────────────────────────────
export default function TabIndicadores({ tipo, nodoId, proyectoId, soloLectura }) {
  const { mostrarToast } = useUI();
  const [indicadores, setIndicadores] = useState([]);
  const [aportaciones, setAportaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(null);
  const [mostrarVincular, setMostrarVincular] = useState(false);

  // Las tareas no tienen ruta /tareas/:id/aportaciones en el backend;
  // solo etapas y acciones pueden contribuir directamente a indicadores.
  const puedeVincular = tipo !== 'tarea';

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const promises = [indicadoresApi.listarTodosPorProyecto(proyectoId)];
      if (puedeVincular) {
        promises.push(indicadoresApi.obtenerAportacionesNodo(tipo, nodoId));
      }
      const [inds, apRes] = await Promise.all(promises);
      setIndicadores(inds || []);
      setAportaciones(puedeVincular ? (apRes?.datos || []) : []);
    } catch (e) {
      console.error('Error cargando indicadores:', e);
    } finally {
      setCargando(false);
    }
  }, [proyectoId, tipo, nodoId, puedeVincular]);

  useEffect(() => { cargar(); }, [cargar]);

  const aportMap = {};
  aportaciones.forEach(a => { aportMap[a.id_indicador] = a; });

  const vinculados   = indicadores.filter(i => aportMap[i.id]);
  const noVinculados = indicadores.filter(i => !aportMap[i.id]);

  async function toggleVincular(ind) {
    if (!puedeVincular) return;
    const existente = aportMap[ind.id];
    setGuardando(ind.id);
    try {
      if (existente) {
        await indicadoresApi.eliminarAportacion(existente.id);
        mostrarToast('Aportación eliminada', 'exito');
      } else {
        await indicadoresApi.crearAportacion(ind.id, {
          tipo_nodo: tipo,
          id_nodo:   nodoId,
          valor_aportacion: 0,
          modo: 'proporcional',
        });
        mostrarToast('Indicador vinculado', 'exito');
        setMostrarVincular(false);
      }
      await cargar();
    } catch (e) {
      mostrarToast(e.response?.data?.mensaje || 'Error', 'error');
    } finally {
      setGuardando(null);
    }
  }

  async function actualizarAportacion(apId, campo, valor) {
    setGuardando(apId);
    try {
      await indicadoresApi.actualizarAportacion(apId, { [campo]: valor });
      await cargar();
    } catch (e) {
      mostrarToast(e.response?.data?.mensaje || 'Error al actualizar', 'error');
    } finally {
      setGuardando(null);
    }
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm">Cargando indicadores…</span>
      </div>
    );
  }

  if (!indicadores.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
        <BarChart3 size={36} className="opacity-30" />
        <p className="text-sm">Este proyecto no tiene indicadores configurados.</p>
      </div>
    );
  }

  return (
    <div className="p-5">
      {/* Grid 2 columnas */}
      <div className="grid gap-4 sm:grid-cols-2">
        {indicadores.map(ind => (
          <IndicadorCard
            key={ind.id}
            ind={ind}
            ap={aportMap[ind.id]}
            soloLectura={soloLectura}
            guardando={guardando}
            onToggleVincular={toggleVincular}
            onActualizar={actualizarAportacion}
          />
        ))}
      </div>

      {/* Botón vincular / picker — solo para etapas y acciones */}
      {puedeVincular && !soloLectura && noVinculados.length > 0 && (
        <div className="mt-5">
          {!mostrarVincular ? (
            <button
              onClick={() => setMostrarVincular(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-guinda-200 rounded-xl text-sm font-medium text-guinda-700 hover:bg-guinda-50 transition-colors"
            >
              <Plus size={14} />
              Vincular este nodo a un indicador del proyecto
            </button>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                <span className="text-xs font-semibold text-gray-600">Selecciona un indicador para vincular</span>
                <button onClick={() => setMostrarVincular(false)} className="text-gray-400 hover:text-gray-600">
                  <ChevronDown size={14} />
                </button>
              </div>
              {noVinculados.map(ind => (
                <button
                  key={ind.id}
                  onClick={() => toggleVincular(ind)}
                  disabled={guardando === ind.id}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 border-b last:border-0 transition-colors"
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: stripeColor(ind.tipo) }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-800 truncate block">{ind.nombre}</span>
                    <span className="text-[11px] text-gray-400">{tipoLabel(ind.tipo)} · {unidadLabel(ind)}</span>
                  </div>
                  {guardando === ind.id
                    ? <Loader2 size={13} className="animate-spin text-gray-400 flex-shrink-0" />
                    : <Link2 size={13} className="text-guinda-500 flex-shrink-0" />
                  }
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tarjeta de indicador ──────────────────────────────────────
function IndicadorCard({ ind, ap, soloLectura, guardando, onToggleVincular, onActualizar }) {
  const [expandido, setExpandido] = useState(true);

  const meta     = parseFloat(ind.meta_global) || 0;
  const realiz   = parseFloat(ind.valor_actual) || 0;
  const tieneMeta = meta > 0;
  const pct      = tieneMeta ? Math.min(100, (realiz / meta) * 100) : null;
  const unidad   = unidadLabel(ind);
  const stripe   = stripeColor(ind.tipo);

  return (
    <div className="relative border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">
      {/* Franja de color */}
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: stripe }} />

      <div className="pl-4 pr-3 pt-3 pb-3">
        {/* Nombre + tipo badge */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-sm font-bold text-gray-900 leading-snug flex-1 min-w-0">{ind.nombre}</p>
          <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${tipoBadge(ind.tipo)}`}>
            {tipoLabel(ind.tipo)}
          </span>
        </div>

        {/* Números: Realizado + Meta */}
        <div className="flex items-baseline gap-4 mb-2">
          <div>
            <p className="text-[10px] text-gray-400 mb-0.5">Realizado</p>
            <p className="text-xl font-bold tabular-nums" style={{ color: VERDE }}>
              {realiz.toLocaleString('es-MX')}
            </p>
          </div>
          {tieneMeta && (
            <div>
              <p className="text-[10px] text-gray-400 mb-0.5">Meta global</p>
              <p className="text-xl font-bold tabular-nums" style={{ color: GUINDA }}>
                {meta.toLocaleString('es-MX')}
              </p>
            </div>
          )}
        </div>

        {/* Barra de progreso (solo si meta > 0) */}
        {tieneMeta && (
          <div className="mb-2">
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, pct || 0)}%`, backgroundColor: stripe }}
              />
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {pct !== null ? `${pct.toFixed(1)}% de la meta` : '—'}
            </p>
          </div>
        )}

        {/* Unidad */}
        <p className="text-[11px] text-gray-400 mb-2">
          Unidad: <span className="font-medium text-gray-600">{unidad}</span>
          {!tieneMeta && <span className="ml-1 italic">· Sin meta definida</span>}
        </p>

        {/* Aportación de este nodo */}
        {ap ? (
          <div className="border-t border-gray-100 pt-2 mt-2">
            <button
              onClick={() => setExpandido(v => !v)}
              className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-700 mb-1.5"
            >
              {expandido ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              Aportación de este nodo
            </button>
            {expandido && (
              <div className="flex items-center gap-2 flex-wrap pl-4">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-gray-500">Valor:</span>
                  <input
                    type="number" step="any" min="0"
                    value={ap.aportacion ?? ''}
                    onChange={e => {
                      const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                      onActualizar(ap.id, 'valor_aportacion', val);
                    }}
                    disabled={soloLectura || guardando === ap.id}
                    className="w-20 text-xs border border-gray-300 rounded px-1.5 py-0.5 text-right focus:border-guinda-500 focus:ring-1 focus:ring-guinda-500/20 outline-none disabled:opacity-60"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-gray-500">Modo:</span>
                  <select
                    value={ap.modo}
                    onChange={e => onActualizar(ap.id, 'modo', e.target.value)}
                    disabled={soloLectura || guardando === ap.id}
                    className="text-[11px] border border-gray-300 rounded px-1 py-0.5 focus:border-guinda-500 focus:ring-1 focus:ring-guinda-500/20 outline-none bg-white disabled:opacity-60"
                  >
                    {MODOS.map(m => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
                  </select>
                </div>
                {!soloLectura && (
                  <button
                    onClick={() => onToggleVincular(ind)}
                    disabled={guardando === ind.id}
                    className="ml-auto text-gray-400 hover:text-red-500 transition-colors p-0.5 rounded"
                    title="Desvincular"
                  >
                    {guardando === ind.id
                      ? <Loader2 size={11} className="animate-spin" />
                      : <Trash2 size={11} />
                    }
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="border-t border-gray-100 pt-2 mt-2">
            <p className="text-[10px] text-gray-400 italic">Este nodo no aporta a este indicador.</p>
          </div>
        )}
      </div>
    </div>
  );
}
