/**
 * ARCHIVO: ModalDuplicarNodo.jsx
 * PROPÓSITO: Duplicar una acción hacia otras etapas, o una tarea hacia
 *            otras acciones — para proyectos donde varias etapas repiten
 *            la misma estructura y capturarla a mano una por una es
 *            laborioso.
 *
 * MINI-CLASE: copia independiente, no referencia compartida
 * ─────────────────────────────────────────────────────────────────
 * "Duplicar" crea filas NUEVAS e independientes (mismo nombre/
 * descripción/tipo/prioridad) en cada destino elegido — cada copia
 * arranca en Pendiente, 0%, sin fechas/territorio/responsable propios.
 * No se comparte una misma acción/tarea entre varios nodos: eso
 * requeriría rediseñar el modelo de datos (hoy una acción pertenece a
 * una sola etapa) y el cálculo de avance/semáforo, que asume que cada
 * nodo tiene un único padre y un progreso propio.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect } from 'react';
import { X, Loader2, Copy } from 'lucide-react';
import * as etapasApi from '../../api/etapas';
import * as accionesApi from '../../api/acciones';
import * as tareasApi from '../../api/tareas';

export default function ModalDuplicarNodo({ tipo, nodo, proyectoId, onCerrar, onCompletado, mostrarToast }) {
  const [cargandoDestinos, setCargandoDestinos] = useState(true);
  const [etapas, setEtapas] = useState([]); // para tipo 'accion': lista plana de etapas
  const [gruposAcciones, setGruposAcciones] = useState([]); // para tipo 'tarea': [{etapa, acciones:[]}]
  const [seleccionados, setSeleccionados] = useState(() => new Set());
  const [duplicando, setDuplicando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      setCargandoDestinos(true);
      try {
        if (tipo === 'accion') {
          const res = await etapasApi.obtenerEtapasProyecto(proyectoId);
          setEtapas((res.datos || []).filter(e => e.id !== nodo.id_etapa));
        } else {
          const res = await etapasApi.obtenerArbol(proyectoId);
          const grupos = (res.datos || [])
            .map(e => ({
              etapa: e,
              acciones: (e.acciones || []).filter(a => a.id !== nodo.id_accion && !a.id_accion_padre),
            }))
            .filter(g => g.acciones.length > 0);
          setGruposAcciones(grupos);
        }
      } catch {
        setError('No se pudieron cargar los destinos disponibles.');
      } finally {
        setCargandoDestinos(false);
      }
    })();
  }, [tipo, proyectoId, nodo]);

  function toggle(id) {
    setSeleccionados(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function confirmar() {
    if (seleccionados.size === 0) return;
    setDuplicando(true);
    setError(null);
    let exitos = 0;
    let fallos = 0;

    if (tipo === 'accion') {
      const datosBase = {
        nombre: nodo.nombre,
        descripcion: nodo.descripcion || '',
        tipo: nodo.tipo,
        prioridad: nodo.prioridad || undefined,
      };
      const tareasFuente = nodo.tareas || [];
      for (const etapaId of seleccionados) {
        try {
          const res = await accionesApi.crearAccionEnEtapa(etapaId, datosBase);
          const nuevaId = res.datos?.id;
          if (nuevaId) {
            for (const t of tareasFuente) {
              try {
                await tareasApi.crearTarea(nuevaId, {
                  nombre: t.nombre,
                  descripcion: t.descripcion || '',
                  prioridad: t.prioridad || undefined,
                });
              } catch { /* una tarea que falla no debe abortar el resto */ }
            }
          }
          exitos++;
        } catch { fallos++; }
      }
    } else {
      const datosBase = {
        nombre: nodo.nombre,
        descripcion: nodo.descripcion || '',
        prioridad: nodo.prioridad || undefined,
      };
      for (const accionId of seleccionados) {
        try {
          await tareasApi.crearTarea(accionId, datosBase);
          exitos++;
        } catch { fallos++; }
      }
    }

    setDuplicando(false);
    if (exitos > 0) {
      mostrarToast?.(
        fallos > 0
          ? `Duplicado en ${exitos} de ${exitos + fallos} destinos — ${fallos} fallaron`
          : `Duplicado en ${exitos} destino${exitos !== 1 ? 's' : ''}`,
        fallos > 0 ? 'info' : 'exito'
      );
      onCompletado?.();
      onCerrar();
    } else {
      setError('No se pudo duplicar en ningún destino. Intenta de nuevo.');
    }
  }

  const sinDestinos = !cargandoDestinos && tipo === 'accion' ? etapas.length === 0 : (!cargandoDestinos && gruposAcciones.length === 0);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Copy size={16} className="text-guinda-600" />
            <h3 className="text-sm font-semibold text-gray-800">
              Duplicar {tipo === 'accion' ? 'acción a otras etapas' : 'tarea a otras acciones'}
            </h3>
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <div className="px-4 py-3 flex-1 overflow-y-auto">
          <p className="text-xs text-gray-500 mb-3">
            Se crearán copias independientes de "<strong>{nodo.nombre}</strong>"
            {tipo === 'accion' && (nodo.tareas || []).length > 0 && ` (con sus ${nodo.tareas.length} tareas)`} en
            cada destino que elijas. Cada copia empieza en Pendiente, 0%, sin fechas ni territorio propios.
          </p>

          {cargandoDestinos ? (
            <div className="flex items-center justify-center py-8 text-gray-400">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : sinDestinos ? (
            <p className="text-xs text-gray-400 italic py-4 text-center">
              No hay {tipo === 'accion' ? 'otras etapas' : 'otras acciones'} en este proyecto todavía.
            </p>
          ) : tipo === 'accion' ? (
            <div className="space-y-1">
              {etapas.map(e => (
                <label key={e.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm text-gray-700">
                  <input type="checkbox" checked={seleccionados.has(e.id)} onChange={() => toggle(e.id)} className="accent-guinda-600" />
                  {e.nombre}
                </label>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {gruposAcciones.map(g => (
                <div key={g.etapa.id}>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{g.etapa.nombre}</p>
                  <div className="space-y-1">
                    {g.acciones.map(a => (
                      <label key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm text-gray-700">
                        <input type="checkbox" checked={seleccionados.has(a.id)} onChange={() => toggle(a.id)} className="accent-guinda-600" />
                        {a.nombre}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100">
          <button onClick={onCerrar} className="text-xs text-gray-500 px-3 py-1.5 hover:text-gray-700">Cancelar</button>
          <button
            onClick={confirmar}
            disabled={seleccionados.size === 0 || duplicando}
            className="flex items-center gap-1.5 text-xs font-medium bg-guinda-600 text-white px-3.5 py-1.5 rounded-lg hover:bg-guinda-700 disabled:opacity-40"
          >
            {duplicando && <Loader2 size={12} className="animate-spin" />}
            Duplicar {seleccionados.size > 0 ? `(${seleccionados.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
