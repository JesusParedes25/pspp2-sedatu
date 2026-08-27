/**
 * ARCHIVO: MisActividades.jsx
 * PROPÓSITO: Módulo "Mis actividades" — pestañas Pendientes (nodos donde el
 *            usuario es responsable/asignado) y Agenda (el módulo de Agenda
 *            existente, embebido tal cual).
 *
 * MINI-CLASE: filtro de rango vs. filtro de estado
 * ─────────────────────────────────────────────────────────────────
 * Los botones Semana/Mes/Trimestre/Año filtran por CUÁNDO vence algo
 * (una ventana de días alrededor de hoy). Las tarjetas Vencidas/
 * Próximas/En proceso/Completadas filtran por QUÉ ESTADO tiene. Ambos
 * filtros se combinan con AND: primero se decide qué estados mostrar,
 * luego de ese subconjunto se recorta al rango de fechas elegido.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useMemo } from 'react';
import { ListChecks, CalendarDays, AlertTriangle, Clock, TrendingUp, CheckCircle2, X } from 'lucide-react';
import * as accionesApi from '../api/acciones';
import NodoCard from '../components/nodos/NodoCard';
import Agenda from './Agenda';

const PERIODOS = [
  { id: 'semana', label: 'Semana', dias: 7 },
  { id: 'mes', label: 'Mes', dias: 30 },
  { id: 'trimestre', label: 'Trimestre', dias: 90 },
  { id: 'anio', label: 'Año', dias: 365 },
];

// Tarjetas de estado convertidas en filtros — 'total' (Actualizado) no es
// filtrable, es solo informativa, según lo pedido explícitamente.
const FILTROS_ESTADO = [
  { id: 'vencidas', lbl: 'Vencidas', I: AlertTriangle, iconCls: 'text-red-400', activoCls: 'bg-red-600 text-white' },
  { id: 'proximas', lbl: 'Próximas (≤7d)', I: Clock, iconCls: 'text-amber-400', activoCls: 'bg-amber-500 text-white' },
  { id: 'enProceso', lbl: 'En proceso', I: TrendingUp, iconCls: 'text-blue-400', activoCls: 'bg-blue-600 text-white' },
  { id: 'completadas', lbl: 'Completadas', I: CheckCircle2, iconCls: 'text-emerald-400', activoCls: 'bg-emerald-600 text-white' },
];

const PERMISOS_PROPIOS = { esSoloLectura: false, puedeInvitar: true, puedeCrearAccion: false };

function diasRestantes(fecha) {
  if (!fecha) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const [y, m, d] = String(fecha).slice(0, 10).split('-').map(Number);
  if (!y) return null;
  return Math.ceil((new Date(y, m - 1, d) - hoy) / 86400000);
}

// A qué categorías de estado pertenece un ítem (puede ser varias a la vez,
// ej. "vencida" y nada más, o ninguna si está Pendiente sin vencer).
function categoriasDe(it) {
  const cats = new Set();
  const activo = it.estado !== 'Completada' && it.estado !== 'Cancelada';
  const d = diasRestantes(it.fecha_fin);
  if (activo && d !== null && d < 0) cats.add('vencidas');
  if (activo && d !== null && d >= 0 && d <= 7) cats.add('proximas');
  if (it.estado === 'En_proceso') cats.add('enProceso');
  if (it.estado === 'Completada') cats.add('completadas');
  return cats;
}

export default function MisActividades() {
  const [tab, setTab] = useState('pendientes');
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [periodo, setPeriodo] = useState('mes');
  const [filtrosEstado, setFiltrosEstado] = useState(() => new Set());

  async function cargar() {
    setCargando(true);
    try {
      const res = await accionesApi.obtenerAgenda();
      setItems(res.datos || []);
    } catch (err) {
      console.error('Error cargando pendientes:', err);
    } finally { setCargando(false); }
  }

  useEffect(() => { cargar(); }, []);

  function toggleFiltroEstado(id) {
    setFiltrosEstado(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // Base: nunca se muestran Canceladas (no hay tarjeta/filtro para eso).
  const disponibles = useMemo(() => items.filter(it => it.estado !== 'Cancelada'), [items]);

  // Filtro de estado. Sin selección ("Todas") = comportamiento actual:
  // excluye Completadas. Con selección, un ítem entra si coincide con
  // CUALQUIERA de los filtros activos (OR entre chips, AND con el rango).
  const porEstado = useMemo(() => {
    if (filtrosEstado.size === 0) return disponibles.filter(it => it.estado !== 'Completada');
    return disponibles.filter(it => {
      const cats = categoriasDe(it);
      for (const f of filtrosEstado) if (cats.has(f)) return true;
      return false;
    });
  }, [disponibles, filtrosEstado]);

  // Filtro de rango de tiempo — ventana simétrica alrededor de hoy, así
  // Semana ⊆ Mes ⊆ Trimestre ⊆ Año. Antes solo comparaba "d <= dias", lo
  // que dejaba pasar cualquier vencida sin importar hace cuánto (una
  // acción vencida hace 55 días aparecía igual en "Semana").
  const filtrados = useMemo(() => {
    const dias = PERIODOS.find(p => p.id === periodo)?.dias ?? 30;
    return porEstado
      .filter(it => {
        const d = diasRestantes(it.fecha_fin);
        return d === null || (d >= -dias && d <= dias);
      })
      .sort((a, b) => {
        const da = diasRestantes(a.fecha_fin); const db = diasRestantes(b.fecha_fin);
        if (da === null) return 1; if (db === null) return -1;
        return da - db;
      });
  }, [porEstado, periodo]);

  // Conteos de las tarjetas: totales estables (no se mueven al cambiar de
  // periodo ni de chip activo) para que sirvan de referencia consistente.
  const resumen = useMemo(() => {
    const activos = disponibles.filter(it => it.estado !== 'Completada');
    const vencidas = activos.filter(it => categoriasDe(it).has('vencidas')).length;
    const proximas = activos.filter(it => categoriasDe(it).has('proximas')).length;
    const enProceso = activos.filter(it => it.estado === 'En_proceso').length;
    const completadas = disponibles.filter(it => it.estado === 'Completada').length;
    return { total: activos.length, vencidas, proximas, enProceso, completadas };
  }, [disponibles]);

  const CONTEO_POR_FILTRO = { vencidas: resumen.vencidas, proximas: resumen.proximas, enProceso: resumen.enProceso, completadas: resumen.completadas };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mis actividades</h1>
        <p className="text-sm text-gray-500 mt-0.5">Tus etapas, acciones y tareas asignadas — y tu agenda.</p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {[{ id: 'pendientes', lbl: 'Pendientes', I: ListChecks }, { id: 'agenda', lbl: 'Agenda', I: CalendarDays }].map(({ id, lbl, I }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-all ${tab === id ? 'bg-white text-guinda-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <I size={13} />{lbl}
          </button>
        ))}
      </div>

      {tab === 'pendientes' ? (
        <div className="space-y-4">
          {/* Resumen — "Actualizado" es informativo; el resto son filtros clicables */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="card p-3.5">
              <div className="flex items-center gap-1.5 mb-1"><ListChecks size={13} className="text-gray-400" /><span className="text-xs text-gray-500">Actualizado</span></div>
              <div className="text-2xl font-bold text-gray-800">{resumen.total}</div>
            </div>
            {FILTROS_ESTADO.map(f => {
              const activo = filtrosEstado.has(f.id);
              return (
                <button
                  key={f.id}
                  onClick={() => toggleFiltroEstado(f.id)}
                  title={`Filtrar por ${f.lbl.toLowerCase()}`}
                  className={`card p-3.5 text-left transition-colors ${activo ? 'ring-2 ring-offset-1 ring-guinda-400' : 'hover:bg-gray-50'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1"><f.I size={13} className={f.iconCls} /><span className="text-xs text-gray-500">{f.lbl}</span></div>
                  <div className={`inline-flex items-center justify-center text-2xl font-bold rounded-md px-1.5 ${activo ? f.activoCls : 'text-gray-800'}`}>
                    {CONTEO_POR_FILTRO[f.id]}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Filtro de periodo + limpiar filtros de estado */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {PERIODOS.map(p => (
              <button key={p.id} onClick={() => setPeriodo(p.id)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${periodo === p.id ? 'bg-guinda-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                {p.label}
              </button>
            ))}
            {filtrosEstado.size > 0 && (
              <button onClick={() => setFiltrosEstado(new Set())}
                className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full text-guinda-600 hover:bg-guinda-50">
                <X size={11} /> Limpiar filtros ({filtrados.length})
              </button>
            )}
            {filtrosEstado.size === 0 && (
              <span className="text-xs text-gray-400 px-1">{filtrados.length} resultado{filtrados.length !== 1 ? 's' : ''}</span>
            )}
          </div>

          {/* Lista */}
          {cargando ? (
            <div className="space-y-2 animate-pulse">{[1, 2, 3].map(i => <div key={i} className="h-14 bg-gray-200 rounded-lg" />)}</div>
          ) : filtrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <ListChecks size={32} className="mb-2 text-gray-200" />
              <p className="text-sm">Sin actividades con los filtros seleccionados.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtrados.map(it => {
                const breadcrumb = [it.proyecto_nombre, it.etapa_nombre, it.accion_nombre].filter(Boolean).join(' › ');
                return (
                  <NodoCard
                    key={`${it.tipo}-${it.id}`}
                    tipo={it.tipo}
                    nodo={it}
                    // Etapa siempre es contenedor — antes se trataba toda
                    // fila como hoja, así que una etapa pendiente ofrecía
                    // "marcar completada"/"reportar riesgo" directo, que
                    // no aplica a un nodo cuyo avance se calcula de sus
                    // partes. Acción/tarea pueden ser contenedor si tienen
                    // hijos, pero esta consulta de agenda (6 ramas UNION)
                    // no trae es_hoja — se deja como caso de borde aparte.
                    esContenedor={it.tipo === 'etapa'}
                    proyectoId={it.proyecto_id}
                    permisos={PERMISOS_PROPIOS}
                    breadcrumb={breadcrumb}
                    onProyectoClick={`/proyectos/${it.proyecto_id}?tab=seguimiento&nodo=${it.id}`}
                    onCambiado={cargar}
                  />
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <Agenda />
      )}
    </div>
  );
}
