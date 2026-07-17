/**
 * SeccionAportaciones.jsx
 * Subsección dentro de Propiedades de una etapa/acción que permite
 * vincular indicadores del proyecto y definir el valor de aportación.
 */
import { useState, useEffect, useCallback } from 'react';
import { BarChart3, Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import * as indicadoresApi from '../../api/indicadores';
import { useUI } from '../../context/UIContext';

const MODOS = [
  { valor: 'proporcional', etiqueta: 'Proporcional al avance' },
  { valor: 'al_concluir', etiqueta: 'Al concluir (100%)' },
];

export default function SeccionAportaciones({ tipo, nodoId, proyectoId, avanceEfectivo, soloLectura }) {
  const { mostrarToast } = useUI();
  const [indicadores, setIndicadores] = useState([]);
  const [aportaciones, setAportaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const [indRes, apRes] = await Promise.all([
        indicadoresApi.listarTodosPorProyecto(proyectoId),
        indicadoresApi.obtenerAportacionesNodo(tipo, nodoId),
      ]);
      setIndicadores(indRes || []);
      setAportaciones(apRes.datos || []);
    } catch (e) {
      console.error('Error cargando aportaciones:', e);
    } finally {
      setCargando(false);
    }
  }, [proyectoId, tipo, nodoId]);

  useEffect(() => { cargar(); }, [cargar]);

  // Map: id_indicador -> aportacion
  const aportMap = {};
  aportaciones.forEach(a => { aportMap[a.id_indicador] = a; });

  async function toggleIndicador(ind) {
    const existente = aportMap[ind.id];
    setGuardando(ind.id);
    try {
      if (existente) {
        await indicadoresApi.eliminarAportacion(existente.id);
        mostrarToast('Aportación eliminada', 'exito');
      } else {
        await indicadoresApi.crearAportacion(ind.id, {
          tipo_nodo: tipo === 'etapa' ? 'etapa' : 'accion',
          id_nodo: nodoId,
          valor_aportacion: 0,
          modo: 'proporcional',
        });
        mostrarToast('Indicador vinculado', 'exito');
      }
      await cargar();
    } catch (e) {
      mostrarToast(e.response?.data?.mensaje || 'Error', 'error');
    } finally {
      setGuardando(null);
    }
  }

  async function actualizarAportacion(aportId, campo, valor) {
    setGuardando(aportId);
    try {
      await indicadoresApi.actualizarAportacion(aportId, { [campo]: valor });
      await cargar();
    } catch (e) {
      mostrarToast(e.response?.data?.mensaje || 'Error al actualizar', 'error');
    } finally {
      setGuardando(null);
    }
  }

  if (cargando) {
    return (
      <div className="px-5 py-3 flex items-center gap-2 text-xs text-gray-400">
        <Loader2 size={12} className="animate-spin" /> Cargando indicadores…
      </div>
    );
  }

  if (!indicadores.length) return null;

  const vinculados = indicadores.filter(i => aportMap[i.id]);
  const noVinculados = indicadores.filter(i => !aportMap[i.id]);

  return (
    <div className="px-5 py-3 border-t border-gray-100">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 size={12} className="text-gray-500" />
        <span className="text-xs font-semibold text-gray-600">Aportación a indicadores</span>
      </div>

      {/* Indicadores vinculados */}
      {vinculados.map(ind => {
        const ap = aportMap[ind.id];
        const unidadLabel = ind.etiqueta_unidad || ind.unidad_personalizada || ind.unidad;
        return (
          <div key={ind.id} className="mb-2 rounded border border-gray-200 bg-gray-50 p-2">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs font-medium text-gray-700 flex-1 min-w-0">
                <input
                  type="checkbox"
                  checked
                  onChange={() => !soloLectura && toggleIndicador(ind)}
                  disabled={soloLectura || guardando === ind.id}
                  className="rounded text-[#7B1C3E] focus:ring-[#7B1C3E]/30"
                />
                <span className="truncate">{ind.nombre}</span>
                <span className="text-[10px] text-gray-400 shrink-0">({unidadLabel})</span>
              </label>
              {guardando === ind.id && <Loader2 size={10} className="animate-spin text-gray-400" />}
            </div>

            <div className="mt-1.5 flex items-center gap-3 pl-6">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-500">Aportación:</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={ap.aportacion ?? ''}
                  onChange={e => {
                    const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                    actualizarAportacion(ap.id, 'valor_aportacion', val);
                  }}
                  disabled={soloLectura}
                  className="w-20 text-xs border border-gray-300 rounded px-1.5 py-0.5 text-right focus:border-[#7B1C3E] focus:ring-1 focus:ring-[#7B1C3E]/20 outline-none"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-gray-500">Modo:</span>
                <select
                  value={ap.modo}
                  onChange={e => actualizarAportacion(ap.id, 'modo', e.target.value)}
                  disabled={soloLectura}
                  className="text-xs border border-gray-300 rounded px-1 py-0.5 focus:border-[#7B1C3E] focus:ring-1 focus:ring-[#7B1C3E]/20 outline-none bg-white"
                >
                  {MODOS.map(m => <option key={m.valor} value={m.valor}>{m.etiqueta}</option>)}
                </select>
              </div>
              {ind.meta_global > 0 && ap.aportacion > 0 && (
                <span className="text-[10px] text-gray-400">
                  {((ap.aportacion / ind.meta_global) * 100).toFixed(1)}% de la meta
                </span>
              )}
              {(!ind.meta_global || ind.meta_global <= 0) && ap.aportacion > 0 && (
                <span className="text-[10px] text-gray-400">
                  {ap.aportacion} {unidadLabel}
                </span>
              )}
            </div>
            <p className="text-[9px] text-gray-400 pl-6 mt-1 leading-snug">
              {ap.modo === 'proporcional'
                ? 'Proporcional al avance: la aportación crece conforme avanza el nodo.'
                : 'Al concluir: cuenta el valor completo solo cuando el nodo se marca como Completada; antes cuenta 0.'}
            </p>
          </div>
        );
      })}

      {/* Indicadores no vinculados */}
      {!soloLectura && noVinculados.length > 0 && (
        <div className="mt-1">
          {noVinculados.map(ind => (
            <label
              key={ind.id}
              className="flex items-center gap-2 text-xs text-gray-500 py-0.5 hover:text-gray-700 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={false}
                onChange={() => toggleIndicador(ind)}
                disabled={guardando === ind.id}
                className="rounded text-[#7B1C3E] focus:ring-[#7B1C3E]/30"
              />
              <span className="truncate">{ind.nombre}</span>
              {guardando === ind.id && <Loader2 size={10} className="animate-spin text-gray-400" />}
            </label>
          ))}
        </div>
      )}

      {soloLectura && !vinculados.length && (
        <p className="text-[10px] text-gray-400 italic">Sin aportaciones configuradas</p>
      )}
    </div>
  );
}
