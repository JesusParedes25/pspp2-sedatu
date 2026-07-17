/**
 * ARCHIVO: VistaChecklist.jsx
 * PROPÓSITO: Vista de checklist agrupada por etapa con toggles de completado.
 */
import { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, Circle, ChevronDown, ChevronRight, MapPin } from 'lucide-react';
import client from '../../api/client';

export default function VistaChecklist({ etapas, proyectoId, onRefresh }) {
  const [acciones, setAcciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [expandidas, setExpandidas] = useState({});

  useEffect(() => {
    if (!etapas || etapas.length === 0) { setCargando(false); return; }
    setCargando(true);
    Promise.all(
      etapas.map(e => client.get(`/etapas/${e.id}/acciones`).then(r => r.data.datos || []).catch(() => []))
    ).then(results => {
      setAcciones(results.flat());
      setCargando(false);
      // Expandir todas las etapas por defecto
      const exp = {};
      for (const e of etapas) exp[e.id] = true;
      setExpandidas(exp);
    });
  }, [etapas]);

  const toggleExpandir = (id) => {
    setExpandidas(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleCompletar = async (accion) => {
    const nuevoEstado = accion.estado === 'Completada' ? 'En_proceso' : 'Completada';

    // Optimistic
    setAcciones(prev => prev.map(a => a.id === accion.id ? { ...a, estado: nuevoEstado } : a));

    try {
      await client.put('/estado', {
        entidad_tipo: accion.id_accion_padre ? 'Subaccion' : 'Accion',
        entidad_id: accion.id,
        estado: nuevoEstado,
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Error al cambiar estado:', err);
      setAcciones(prev => prev.map(a => a.id === accion.id ? { ...a, estado: accion.estado } : a));
    }
  };

  const accionesPorEtapa = useMemo(() => {
    const map = {};
    for (const e of (etapas || [])) map[e.id] = [];
    for (const a of acciones) {
      if (!a.id_accion_padre && map[a.id_etapa]) {
        map[a.id_etapa].push(a);
      }
    }
    return map;
  }, [etapas, acciones]);

  const subaccionesPorPadre = useMemo(() => {
    const map = {};
    for (const a of acciones) {
      if (a.id_accion_padre) {
        if (!map[a.id_accion_padre]) map[a.id_accion_padre] = [];
        map[a.id_accion_padre].push(a);
      }
    }
    return map;
  }, [acciones]);

  if (cargando) {
    return <p className="text-sm text-gray-400 text-center py-8">Cargando checklist...</p>;
  }

  // Stats globales
  const totalAcciones = acciones.filter(a => !a.id_accion_padre).length;
  const completadas = acciones.filter(a => !a.id_accion_padre && a.estado === 'Completada').length;
  const pctGlobal = totalAcciones > 0 ? Math.round((completadas / totalAcciones) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Progress bar global */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Progreso general</span>
          <span className="text-sm font-bold text-gray-900">{completadas}/{totalAcciones} ({pctGlobal}%)</span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-green-500 transition-all duration-300"
            style={{ width: `${pctGlobal}%` }}
          />
        </div>
      </div>

      {/* Etapas con checklists */}
      {(etapas || []).map(etapa => {
        const accionesEtapa = accionesPorEtapa[etapa.id] || [];
        const compEtapa = accionesEtapa.filter(a => a.estado === 'Completada').length;
        const totalEtapa = accionesEtapa.length;
        const pctEtapa = totalEtapa > 0 ? Math.round((compEtapa / totalEtapa) * 100) : 0;
        const isExpanded = expandidas[etapa.id];

        return (
          <div key={etapa.id} className="card overflow-hidden">
            {/* Etapa header */}
            <button
              onClick={() => toggleExpandir(etapa.id)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              {isExpanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
              <span className="text-sm font-semibold text-gray-800 flex-1 text-left">{etapa.nombre}</span>
              <span className="text-xs text-gray-500">{compEtapa}/{totalEtapa}</span>
              <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-green-500" style={{ width: `${pctEtapa}%` }} />
              </div>
            </button>

            {/* Acciones */}
            {isExpanded && (
              <div className="border-t divide-y divide-gray-50">
                {accionesEtapa.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-gray-400">Sin acciones en esta etapa</p>
                ) : (
                  accionesEtapa.map(accion => (
                    <div key={accion.id}>
                      <ChecklistItem
                        accion={accion}
                        onToggle={toggleCompletar}
                        depth={0}
                      />
                      {/* Subacciones */}
                      {(subaccionesPorPadre[accion.id] || []).map(sub => (
                        <ChecklistItem
                          key={sub.id}
                          accion={sub}
                          onToggle={toggleCompletar}
                          depth={1}
                        />
                      ))}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChecklistItem({ accion, onToggle, depth }) {
  const isCompleted = accion.estado === 'Completada';
  const isBloqueada = accion.estado === 'Bloqueada';

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer ${
        depth > 0 ? 'pl-10' : ''
      }`}
      onClick={() => !isBloqueada && onToggle(accion)}
    >
      {isCompleted ? (
        <CheckCircle2 size={18} className="text-green-500 shrink-0" />
      ) : (
        <Circle size={18} className={`shrink-0 ${isBloqueada ? 'text-red-300' : 'text-gray-300 hover:text-green-400'}`} />
      )}

      <span className={`text-sm flex-1 ${isCompleted ? 'text-gray-400 line-through' : isBloqueada ? 'text-red-600' : 'text-gray-700'}`}>
        {accion.nombre}
      </span>

      {isBloqueada && (
        <span className="text-[10px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded">Bloqueada</span>
      )}

      {accion.fecha_fin && (
        <span className={`text-[10px] ${
          new Date(accion.fecha_fin) < new Date() && !isCompleted ? 'text-red-500' : 'text-gray-400'
        }`}>
          {new Date(accion.fecha_fin).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
        </span>
      )}
    </div>
  );
}
