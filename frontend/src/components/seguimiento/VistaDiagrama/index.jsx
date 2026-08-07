/**
 * ARCHIVO: index.jsx (VistaDiagrama)
 * PROPÓSITO: Organigrama horizontal (izquierda → derecha) de la jerarquía
 *            completa del proyecto (etapa → acción → tarea). Clic en un
 *            nodo abre un drawer con sus propiedades y acciones (mismos
 *            componentes que "Detalle": useJerarquiaProyecto,
 *            PropiedadesElemento, NodoCard, ActividadStream); cada nodo
 *            con permiso de crear muestra un NodeToolbar con "+ hijo" y
 *            "Eliminar" al seleccionarse, más un nodo fantasma "+ Etapa"
 *            al final de la columna raíz.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ReactFlow, ReactFlowProvider, Background, MiniMap, Panel, useReactFlow, useStore,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { Search, ZoomIn, ZoomOut, Maximize2, ChevronsDownUp, Loader2, X, CheckCircle2 } from 'lucide-react';
import * as etapasApi from '../../../api/etapas';
import { useUI } from '../../../context/UIContext';
import { useAlturaHastaFinal } from '../../../hooks/useAlturaHastaFinal';
import { useJerarquiaProyecto } from '../../../hooks/useJerarquiaProyecto';
import { COLORES_SEMAFORO, LEYENDA_SEMAFORO } from '../../common/SemaforoDot';
import ConfirmDialog from '../../common/ConfirmDialog';
import CrearInline from '../EtapasAvancesMD/CrearInline';
import { buscarNodoEnArbol } from '../EtapasAvancesMD/utils';
import { prefersReducedMotion } from '../../../utils/motion';
import { useLayoutJerarquia, ROW_HEIGHT, contarDescendientes } from './useLayoutJerarquia';
import NodoEtapa from './NodoEtapa';
import NodoAccion from './NodoAccion';
import NodoTarea from './NodoTarea';
import NodoGhostEtapa from './NodoGhostEtapa';
import PanelDrawer from './PanelDrawer';
import { ariaLabelConfigEs } from './ariaLabels';

const nodeTypes = { etapa: NodoEtapa, accion: NodoAccion, tarea: NodoTarea, ghostEtapa: NodoGhostEtapa };

const TIPO_LABEL_ELIMINAR = { etapa: 'etapa', accion: 'acción', tarea: 'tarea' };

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
  const { mostrarToast } = useUI();
  const { crear, eliminar } = useJerarquiaProyecto(proyectoId);
  const [searchParams, setSearchParams] = useSearchParams();
  const nodoInicialRef = useRef(searchParams.get('nodo'));
  const [arbol, setArbol] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [colapsados, setColapsados] = useState(new Set());
  const [inicializado, setInicializado] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [seleccionadoId, setSeleccionadoId] = useState(nodoInicialRef.current || null);
  const [nodoAbiertoId, setNodoAbiertoId] = useState(nodoInicialRef.current || null);
  const [confirmEliminar, setConfirmEliminar] = useState(null); // {tipo, id, nombre, numDescendientes}
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const zoom = useStore(zoomSelector);
  // Misma altura MEDIDA que usa "Detalle" (useAlturaHastaFinal) — así el
  // lienzo también llena el alto disponible del viewport en vez de quedar
  // a una altura fija en px, y ambas subvistas quedan homologadas.
  const [diagramaRef, alturaDiagrama] = useAlturaHastaFinal(24, 520);

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

  // ─── Crear / eliminar — mismo hook que ya usa "Detalle", solo que aquí
  // el resultado (toast + recarga) se centraliza en vez de dejarlo a cada
  // componente hijo, porque los botones viven dentro del propio nodo. ───
  const crearHijo = useCallback(async (tipoHijo, padreId, nombre) => {
    try {
      await crear(tipoHijo, padreId, { nombre });
      mostrarToast('Creado', 'exito');
      await cargarArbol(true);
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'Error al crear', 'error');
    }
  }, [crear, mostrarToast, cargarArbol]);

  const solicitarEliminar = useCallback((tipo, id, nombre, numDescendientes) => {
    setConfirmEliminar({ tipo, id, nombre, numDescendientes });
  }, []);

  async function confirmarEliminar() {
    if (!confirmEliminar) return;
    const { tipo, id } = confirmEliminar;
    try {
      await eliminar(tipo, id);
      mostrarToast('Eliminado', 'exito');
      if (seleccionadoId === id) setSeleccionadoId(null);
      if (nodoAbiertoId === id) setNodoAbiertoId(null);
      await cargarArbol(true);
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'Error al eliminar', 'error');
    } finally {
      setConfirmEliminar(null);
    }
  }

  const qNorm = busqueda.trim().toLowerCase();
  const nodes = useMemo(() => nodosBase.map(n => {
    const tipoHijo = n.type === 'etapa' ? 'accion' : n.type === 'accion' ? 'tarea' : null;
    const tipoHijoLabel = tipoHijo === 'accion' ? 'Acción' : tipoHijo === 'tarea' ? 'Tarea' : null;
    const puedeCrearHijo = !!tipoHijo && !!permisos.puedeCrearAccion;
    const puedeEliminarNodo = !!permisos.puedeEliminar;
    return {
      ...n,
      selected: n.id === seleccionadoId,
      data: {
        ...n.data,
        onToggleColapsar: toggleColapsar,
        onSeleccionar: () => seleccionarNodo(n.id),
        atenuado: qNorm.length > 0 && !n.data.nombre.toLowerCase().includes(qNorm),
        tipoHijoLabel,
        puedeCrearHijo,
        puedeEliminar: puedeEliminarNodo,
        onCrearHijo: puedeCrearHijo ? (nombre) => crearHijo(tipoHijo, n.id, nombre) : undefined,
        onEliminar: puedeEliminarNodo
          ? () => solicitarEliminar(n.type, n.id, n.data.nombre, contarDescendientes(n.data, n.type))
          : undefined,
      },
    };
  }), [nodosBase, toggleColapsar, qNorm, seleccionadoId, permisos, crearHijo, solicitarEliminar]);

  // Nodo fantasma "+ Etapa" al final de la columna raíz — se agrega DESPUÉS
  // del map de arriba para no pasar por la lógica de atenuado/búsqueda
  // (no tiene nombre real que comparar).
  const nodesFinal = useMemo(() => {
    if (!permisos.puedeCrearEtapa) return nodes;
    const etapas = nodes.filter(n => n.type === 'etapa');
    const maxY = etapas.length > 0 ? Math.max(...etapas.map(n => n.position.y)) : 0;
    const ghost = {
      id: '__crear_etapa__',
      type: 'ghostEtapa',
      draggable: false,
      selectable: false,
      position: { x: 0, y: etapas.length > 0 ? maxY + ROW_HEIGHT : 0 },
      data: { onCrear: (nombre) => crearHijo('etapa', null, nombre) },
    };
    return [...nodes, ghost];
  }, [nodes, permisos.puedeCrearEtapa, crearHijo]);

  function seleccionarNodo(id) {
    setSeleccionadoId(id);
    setNodoAbiertoId(id);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('nodo', id);
      return next;
    }, { replace: true });
  }

  function onNodeClick(_e, nodo) {
    if (nodo.type === 'ghostEtapa') return;
    seleccionarNodo(nodo.id);
  }

  function onPaneClick() {
    setSeleccionadoId(null);
    setNodoAbiertoId(null);
  }

  // Navegar a un hijo desde la lista dentro del propio drawer (sin volver
  // al lienzo) — si el nodo actual estaba colapsado, se expande primero
  // para que el lienzo quede consistente con lo que ahora muestra el drawer.
  function navegarANodo(id) {
    setColapsados(prev => {
      if (!nodoAbiertoId || !prev.has(nodoAbiertoId)) return prev;
      const next = new Set(prev);
      next.delete(nodoAbiertoId);
      return next;
    });
    setSeleccionadoId(id);
    setNodoAbiertoId(id);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('nodo', id);
      return next;
    }, { replace: true });
    setTimeout(() => fitView({ nodes: [{ id }], duration: prefersReducedMotion ? 0 : 400, maxZoom: 1 }), 60);
  }

  const nodoAbierto = nodoAbiertoId ? buscarNodoEnArbol(arbol, nodoAbiertoId) : null;

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

  // Espera también a "inicializado": el <ReactFlow fitView> de abajo ajusta
  // el zoom UNA sola vez, en su primer render — si montara con "colapsados"
  // todavía vacío (antes de que el efecto de arriba calcule el colapso
  // inicial por etapa), encuadraría el árbol completo expandido y el zoom
  // quedaba mucho más chico de lo necesario para el estado colapsado real
  // que aparece un instante después.
  if (!inicializado) {
    return (
      <div className="flex items-center justify-center py-16 border border-gray-200 rounded-xl bg-white" style={{ minHeight: '600px' }}>
        <Loader2 size={24} className="animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">Cargando diagrama...</span>
      </div>
    );
  }

  // Altura MEDIDA (no una altura fija en px): igual que "Detalle", así el
  // lienzo llena el alto disponible del viewport en vez de quedar fijo a
  // 650px en monitores donde sobra pantalla. ReactFlow necesita que este
  // contenedor tenga una altura explícita (se la da alturaDiagrama, no un %).
  return (
    <div
      ref={diagramaRef}
      className="border border-gray-200 rounded-xl overflow-hidden bg-white"
      style={{ height: alturaDiagrama ? `${alturaDiagrama}px` : undefined, minHeight: 520 }}
    >
      <ReactFlow
        nodes={nodesFinal}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        onlyRenderVisibleElements
        fitView
        // Sin "nodes" aquí, el fantasma "+ Etapa" (que vive una fila más
        // abajo del último elemento real) se contaba en el cálculo del
        // encuadre inicial y forzaba un zoom más chico de lo necesario —
        // se ve "vacío" hasta que el usuario da clic en "Centrar" a mano.
        fitViewOptions={{ padding: 0.3, duration: 0, nodes: nodes.map(n => ({ id: n.id })) }}
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

          {permisos.puedeCrearEtapa && (
            <>
              <span className="w-px h-4 bg-gray-200 mx-0.5" />
              <CrearInline tipo="etapa" proyectoId={proyectoId} onCreado={() => cargarArbol(true)} />
            </>
          )}

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

      {nodoAbierto && (
        <PanelDrawer
          key={nodoAbierto.id}
          nodo={nodoAbierto}
          proyectoId={proyectoId}
          permisos={permisos}
          arbol={arbol}
          onActualizado={() => cargarArbol(true)}
          mostrarToast={mostrarToast}
          onCerrar={() => setNodoAbiertoId(null)}
          onNavegar={navegarANodo}
        />
      )}

      <ConfirmDialog
        abierto={!!confirmEliminar}
        titulo={`Eliminar ${TIPO_LABEL_ELIMINAR[confirmEliminar?.tipo] || ''}`}
        mensaje={
          confirmEliminar?.numDescendientes > 0
            ? `"${confirmEliminar?.nombre}" y sus ${confirmEliminar.numDescendientes} elemento${confirmEliminar.numDescendientes > 1 ? 's' : ''} relacionados se eliminarán permanentemente. Esta acción no se puede deshacer.`
            : `"${confirmEliminar?.nombre}" se eliminará permanentemente. Esta acción no se puede deshacer.`
        }
        textoConfirmar="Eliminar"
        onConfirmar={confirmarEliminar}
        onCancelar={() => setConfirmEliminar(null)}
      />
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
