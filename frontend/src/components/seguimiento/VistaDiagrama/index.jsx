/**
 * ARCHIVO: index.jsx (VistaDiagrama)
 * PROPÓSITO: Organigrama horizontal (izquierda → derecha) de la jerarquía
 *            completa del proyecto (etapa → acción → tarea). Es un visor
 *            de solo lectura en esta entrega — crear/editar/eliminar desde
 *            aquí se agrega en una fase posterior, reusando los mismos
 *            hooks y componentes que ya usa "Detalle" (useJerarquiaProyecto,
 *            PropiedadesElemento).
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ReactFlow, ReactFlowProvider, Background, MiniMap, Panel, useReactFlow, useStore,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { Search, ZoomIn, ZoomOut, Maximize2, ChevronsDownUp, Loader2, X, CheckCircle2 } from 'lucide-react';
import * as etapasApi from '../../../api/etapas';
import { COLORES_SEMAFORO, LEYENDA_SEMAFORO } from '../../common/SemaforoDot';
import { useLayoutJerarquia } from './useLayoutJerarquia';
import NodoEtapa from './NodoEtapa';
import NodoAccion from './NodoAccion';
import NodoTarea from './NodoTarea';
import { ariaLabelConfigEs } from './ariaLabels';

const nodeTypes = { etapa: NodoEtapa, accion: NodoAccion, tarea: NodoTarea };

const prefersReducedMotion = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Busca en qué etapa vive un nodo (para saber qué etapa NO colapsar de
// inicio cuando se entra con ?nodo=<id>).
function encontrarEtapaDe(arbol, nodoId) {
  for (const etapa of arbol) {
    if (etapa.id === nodoId) return etapa.id;
    for (const accion of (etapa.acciones || [])) {
      if (accion.id === nodoId) return etapa.id;
      for (const tarea of (accion.tareas || [])) {
        if (tarea.id === nodoId) return etapa.id;
      }
    }
  }
  return null;
}

function zoomSelector(s) { return s.transform[2]; }

function VistaDiagramaInterna({ proyectoId, permisos }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const nodoInicialRef = useRef(searchParams.get('nodo'));
  const [arbol, setArbol] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [colapsados, setColapsados] = useState(new Set());
  const [inicializado, setInicializado] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [seleccionadoId, setSeleccionadoId] = useState(nodoInicialRef.current || null);
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const zoom = useStore(zoomSelector);

  const cargarArbol = useCallback(async (silencioso = false) => {
    if (!proyectoId) return;
    if (!silencioso) setCargando(true);
    try {
      const res = await etapasApi.obtenerArbol(proyectoId);
      setArbol(res.datos || []);
    } catch (err) {
      console.error('Error cargando árbol para el diagrama:', err);
    } finally {
      if (!silencioso) setCargando(false);
    }
  }, [proyectoId]);

  useEffect(() => { cargarArbol(); }, [cargarArbol]);

  // Arranca colapsado a nivel Etapa, salvo la rama del nodo que venga en
  // ?nodo= (solo una vez, al cargar el árbol por primera vez).
  useEffect(() => {
    if (inicializado || arbol.length === 0) return;
    const idsEtapas = new Set(arbol.map(e => e.id));
    if (nodoInicialRef.current) {
      const etapaAMantenerAbierta = encontrarEtapaDe(arbol, nodoInicialRef.current);
      if (etapaAMantenerAbierta) idsEtapas.delete(etapaAMantenerAbierta);
    }
    setColapsados(idsEtapas);
    setInicializado(true);
  }, [arbol, inicializado]);

  // Centrar en el nodo inicial (?nodo=) una vez que el diagrama ya tiene layout.
  useEffect(() => {
    if (!inicializado || !nodoInicialRef.current) return;
    const t = setTimeout(() => {
      fitView({ nodes: [{ id: nodoInicialRef.current }], duration: prefersReducedMotion ? 0 : 400, maxZoom: 1 });
    }, 50);
    return () => clearTimeout(t);
  }, [inicializado, fitView]);

  const toggleColapsar = useCallback((id) => {
    setColapsados(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const colapsarTodo = useCallback(() => {
    const ids = new Set();
    function recorrer(etapas) {
      etapas.forEach(e => {
        ids.add(e.id);
        (e.acciones || []).forEach(a => { if ((a.tareas || []).length > 0) ids.add(a.id); });
      });
    }
    recorrer(arbol);
    setColapsados(ids);
  }, [arbol]);

  const expandirTodo = useCallback(() => setColapsados(new Set()), []);

  const { nodes: nodosBase, edges } = useLayoutJerarquia(arbol, colapsados);

  const qNorm = busqueda.trim().toLowerCase();
  const nodes = useMemo(() => nodosBase.map(n => ({
    ...n,
    selected: n.id === seleccionadoId,
    data: {
      ...n.data,
      onToggleColapsar: toggleColapsar,
      atenuado: qNorm.length > 0 && !n.data.nombre.toLowerCase().includes(qNorm),
    },
  })), [nodosBase, toggleColapsar, qNorm, seleccionadoId]);

  function onNodeClick(_e, nodo) {
    setSeleccionadoId(nodo.id);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('nodo', nodo.id);
      return next;
    }, { replace: true });
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16 border border-gray-200 rounded-xl bg-white" style={{ minHeight: '600px' }}>
        <Loader2 size={24} className="animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">Cargando diagrama...</span>
      </div>
    );
  }

  if (arbol.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 border border-gray-200 rounded-xl bg-white text-gray-400 text-sm" style={{ minHeight: '600px' }}>
        Sin etapas todavía — créalas desde la vista Detalle.
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white" style={{ height: '650px' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onlyRenderVisibleElements
        fitView
        fitViewOptions={{ padding: 0.3, duration: 0 }}
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        ariaLabelConfig={ariaLabelConfigEs}
      >
        <Background color="#e5e7eb" gap={24} />

        {/* ── Controles (arriba a la izquierda) ── */}
        <Panel position="top-left" className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg shadow-sm px-1.5 py-1">
          <button onClick={() => zoomOut({ duration: prefersReducedMotion ? 0 : 200 })} title="Alejar" className="p-1.5 text-gray-500 hover:text-[#7B1C3E] hover:bg-gray-50 rounded">
            <ZoomOut size={14} />
          </button>
          <span className="text-[10px] tabular-nums text-gray-500 w-9 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => zoomIn({ duration: prefersReducedMotion ? 0 : 200 })} title="Acercar" className="p-1.5 text-gray-500 hover:text-[#7B1C3E] hover:bg-gray-50 rounded">
            <ZoomIn size={14} />
          </button>
          <span className="w-px h-4 bg-gray-200 mx-0.5" />
          <button onClick={() => fitView({ padding: 0.3, duration: prefersReducedMotion ? 0 : 300 })} title="Centrar" className="p-1.5 text-gray-500 hover:text-[#7B1C3E] hover:bg-gray-50 rounded flex items-center gap-1">
            <Maximize2 size={14} />
            <span className="text-[10px] font-medium hidden sm:inline">Centrar</span>
          </button>
          <button onClick={colapsarTodo} title="Colapsar todo" className="p-1.5 text-gray-500 hover:text-[#7B1C3E] hover:bg-gray-50 rounded flex items-center gap-1">
            <ChevronsDownUp size={14} />
            <span className="text-[10px] font-medium hidden sm:inline">Colapsar todo</span>
          </button>

          {/* Buscador — atenúa lo que no coincide, no filtra */}
          <span className="w-px h-4 bg-gray-200 mx-0.5" />
          <div className="relative">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar..."
              aria-label="Buscar elemento en el diagrama"
              className="text-xs border border-gray-200 rounded-md pl-6 pr-6 py-1 w-32 focus:outline-none focus:border-guinda-300"
            />
            {busqueda && (
              <button onClick={() => setBusqueda('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={11} />
              </button>
            )}
          </div>
        </Panel>

        {/* ── Leyenda (abajo a la izquierda) — idéntica a la de Detalle ── */}
        <Panel position="bottom-left" className="flex items-center flex-wrap gap-x-2.5 gap-y-1 bg-white border border-gray-200 rounded-lg shadow-sm px-3 py-1.5 text-[9px] text-gray-500 max-w-xs">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORES_SEMAFORO.verde }} />{LEYENDA_SEMAFORO.verde}</span>
          <span className="flex items-center gap-1"><CheckCircle2 size={9} className="text-emerald-600 flex-shrink-0" />Completada</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORES_SEMAFORO.ambar }} />{LEYENDA_SEMAFORO.ambar}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORES_SEMAFORO.rojo }} />{LEYENDA_SEMAFORO.rojo}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full flex-shrink-0 border border-gray-300" style={{ backgroundColor: COLORES_SEMAFORO.gris }} />{LEYENDA_SEMAFORO.gris}</span>
        </Panel>

        <MiniMap
          nodeColor={(n) => COLORES_SEMAFORO[n.data?.semaforo_efectivo] || COLORES_SEMAFORO.gris}
          nodeStrokeWidth={0}
          maskColor="rgba(255,255,255,0.6)"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}

export default function VistaDiagrama(props) {
  return (
    <ReactFlowProvider>
      <VistaDiagramaInterna {...props} />
    </ReactFlowProvider>
  );
}
