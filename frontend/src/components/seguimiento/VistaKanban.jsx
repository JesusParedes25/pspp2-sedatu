/**
 * ARCHIVO: VistaKanban.jsx
 * PROPÓSITO: Vista tipo tablero Kanban agrupada por estado.
 *            Permite drag & drop para cambiar estado de acciones.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { GripVertical, MapPin, AlertTriangle, Calendar } from 'lucide-react';
import client from '../../api/client';
import SemaforoChip from '../common/SemaforoChip';

const COLUMNAS = [
  { estado: 'Pendiente', color: 'bg-gray-100', border: 'border-gray-300', dot: 'bg-gray-400' },
  { estado: 'En_proceso', color: 'bg-blue-50', border: 'border-blue-300', dot: 'bg-blue-500' },
  { estado: 'Bloqueada', color: 'bg-red-50', border: 'border-red-300', dot: 'bg-red-500' },
  { estado: 'Completada', color: 'bg-green-50', border: 'border-green-300', dot: 'bg-green-500' },
];

export default function VistaKanban({ etapas, proyectoId, onRefresh }) {
  const [acciones, setAcciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  useEffect(() => {
    if (!etapas || etapas.length === 0) { setCargando(false); return; }
    setCargando(true);
    Promise.all(
      etapas.map(e => client.get(`/etapas/${e.id}/acciones`).then(r => r.data.datos || []).catch(() => []))
    ).then(results => {
      setAcciones(results.flat().filter(a => !a.id_accion_padre));
      setCargando(false);
    });
  }, [etapas]);

  const etapaMap = useMemo(() => {
    const m = {};
    for (const e of (etapas || [])) m[e.id] = e.nombre;
    return m;
  }, [etapas]);

  const porEstado = useMemo(() => {
    const map = {};
    for (const col of COLUMNAS) map[col.estado] = [];
    for (const a of acciones) {
      const est = a.estado || 'Pendiente';
      if (map[est]) map[est].push(a);
      else map['Pendiente'].push(a);
    }
    return map;
  }, [acciones]);

  const handleDragStart = (e, accion) => {
    setDragging(accion.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', accion.id);
  };

  const handleDragOver = (e, estado) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(estado);
  };

  const handleDrop = async (e, nuevoEstado) => {
    e.preventDefault();
    setDragOver(null);
    const accionId = e.dataTransfer.getData('text/plain');
    const accion = acciones.find(a => a.id === accionId);
    if (!accion || accion.estado === nuevoEstado) { setDragging(null); return; }

    // Optimistic update
    setAcciones(prev => prev.map(a => a.id === accionId ? { ...a, estado: nuevoEstado } : a));
    setDragging(null);

    try {
      await client.put('/estado', {
        entidad_tipo: 'Accion',
        entidad_id: accionId,
        estado: nuevoEstado,
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Error al cambiar estado:', err);
      // Revert
      setAcciones(prev => prev.map(a => a.id === accionId ? { ...a, estado: accion.estado } : a));
    }
  };

  if (cargando) {
    return <p className="text-sm text-gray-400 text-center py-8">Cargando vista kanban...</p>;
  }

  return (
    <div className="grid grid-cols-4 gap-3 min-h-[400px]">
      {COLUMNAS.map(col => (
        <div
          key={col.estado}
          className={`rounded-lg border-2 ${dragOver === col.estado ? col.border : 'border-transparent'} ${col.color} p-2 transition-colors`}
          onDragOver={e => handleDragOver(e, col.estado)}
          onDragLeave={() => setDragOver(null)}
          onDrop={e => handleDrop(e, col.estado)}
        >
          {/* Column header */}
          <div className="flex items-center gap-2 mb-3 px-1">
            <span className={`w-2 h-2 rounded-full ${col.dot}`} />
            <span className="text-xs font-semibold text-gray-700">{col.estado.replace(/_/g, ' ')}</span>
            <span className="text-[10px] text-gray-400 ml-auto">{(porEstado[col.estado] || []).length}</span>
          </div>

          {/* Cards */}
          <div className="space-y-2">
            {(porEstado[col.estado] || []).map(accion => (
              <div
                key={accion.id}
                draggable
                onDragStart={e => handleDragStart(e, accion)}
                onDragEnd={() => setDragging(null)}
                className={`bg-white rounded-lg border shadow-sm p-3 cursor-grab active:cursor-grabbing transition-opacity ${
                  dragging === accion.id ? 'opacity-40' : 'opacity-100'
                } hover:shadow-md`}
              >
                <div className="flex items-start gap-1.5">
                  <GripVertical size={12} className="text-gray-300 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-800 truncate">{accion.nombre}</p>
                    {accion.id_etapa && (
                      <p className="text-[10px] text-gray-400 truncate">{etapaMap[accion.id_etapa] || ''}</p>
                    )}
                  </div>
                  <SemaforoChip valor={accion.semaforo} size="xs" />
                </div>

                {/* Meta info */}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {accion.fecha_fin && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
                      <Calendar size={9} />
                      {new Date(accion.fecha_fin).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                    </span>
                  )}
                  {accion.porcentaje_avance > 0 && (
                    <span className="text-[10px] font-mono text-gray-500">{accion.porcentaje_avance}%</span>
                  )}
                  {accion.motivo_bloqueo && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-red-500">
                      <AlertTriangle size={9} />
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
