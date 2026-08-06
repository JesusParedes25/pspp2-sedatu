/**
 * ARCHIVO: index.jsx
 * PROPÓSITO: Vista maestro-detalle "Detalle" (antes "Etapas y avances") —
 *            árbol izquierdo + panel de detalle a la derecha. Orquesta la
 *            carga del árbol, filtros, selección de nodo y sincronía con
 *            la URL (?nodo=<id>). El resto de las piezas viven en archivos
 *            separados en esta misma carpeta.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, X, SlidersHorizontal, CheckCircle2, Search, Filter, Layers } from 'lucide-react';
import * as etapasApi from '../../../api/etapas';
import { useUI } from '../../../context/UIContext';
import { COLORES_SEMAFORO } from '../../common/SemaforoDot';
import NodoArbol from './NodoArbol';
import PanelDetalle from './PanelDetalle';
import CrearInline from './CrearInline';
import { ESTADOS, filtrarArbol, buscarNodoEnArbol, encontrarPath } from './utils';

export default function EtapasAvancesMD({ proyectoId, proyecto, permisos, dgSeleccionada, onStatsChange }) {
  const { mostrarToast } = useUI();
  const [searchParams, setSearchParams] = useSearchParams();
  const [arbol, setArbol] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nodoSeleccionado, setNodoSeleccionado] = useState(null); // {tipo, id, data}
  const [expandidos, setExpandidos] = useState(new Set());

  // Panel del árbol (hamburger en pantallas < lg)
  const [treePanelAbierto, setTreePanelAbierto] = useState(false);

  // Filtros del árbol
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [filtroDG, setFiltroDG] = useState(dgSeleccionada || '');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroUsuario, setFiltroUsuario] = useState('');
  const filtrosActivos = [filtroDG, filtroEstado, filtroUsuario].filter(Boolean).length;

  // DGs únicas derivadas del árbol (responsable de cada nodo)
  const dgsEnArbol = useMemo(() => {
    const mapa = new Map();
    function recoger(ns) {
      ns.forEach(n => {
        if (n.responsable_dg_id) mapa.set(n.responsable_dg_id, n.responsable_dg_siglas || String(n.responsable_dg_id));
        if (n.acciones?.length) recoger(n.acciones);
        if (n.tareas?.length) recoger(n.tareas);
      });
    }
    recoger(arbol);
    return Array.from(mapa.entries()).map(([id, siglas]) => ({ id, siglas })).sort((a, b) => a.siglas.localeCompare(b.siglas));
  }, [arbol]);

  // Árbol filtrado (client-side: estado, usuario y DG de responsable)
  const arbolFiltrado = useMemo(() => {
    if (!filtroEstado && !filtroUsuario && !filtroDG) return arbol;
    return filtrarArbol(arbol, 'etapa', filtroEstado, filtroUsuario, filtroDG);
  }, [arbol, filtroEstado, filtroUsuario, filtroDG]);

  // Cargar árbol (dgSeleccionada = filtro de DG propietaria del proyecto, server-side)
  const cargarArbol = useCallback(async (silencioso = false) => {
    if (!proyectoId) return;
    if (!silencioso) setCargando(true);
    try {
      const res = await etapasApi.obtenerArbol(proyectoId, dgSeleccionada || null);
      setArbol(res.datos || []);
    } catch (err) {
      console.error('Error cargando árbol:', err);
    } finally {
      if (!silencioso) setCargando(false);
    }
  }, [proyectoId, dgSeleccionada]);

  useEffect(() => { cargarArbol(); }, [cargarArbol]);

  // Auto-expandir todo cuando hay filtros activos
  useEffect(() => {
    if (filtroEstado || filtroUsuario || filtroDG) {
      const ids = new Set();
      function recoger(ns) {
        ns.forEach(n => {
          ids.add(n.id);
          if (n.acciones?.length) recoger(n.acciones);
          if (n.tareas?.length) recoger(n.tareas);
        });
      }
      recoger(arbolFiltrado);
      setExpandidos(ids);
    }
  }, [filtroEstado, filtroUsuario, filtroDG, arbolFiltrado]);

  function limpiarFiltros() {
    setFiltroDG('');
    setFiltroEstado('');
    setFiltroUsuario('');
  }

  // Sincronizar nodo seleccionado con URL
  useEffect(() => {
    const nodoId = searchParams.get('nodo');
    if (nodoId && arbol.length > 0) {
      const found = buscarNodoEnArbol(arbol, nodoId);
      if (found) {
        setNodoSeleccionado(found);
        // Expandir padres
        expandirHasta(found, arbol);
      }
    }
  }, [arbol, searchParams]);

  function expandirHasta(nodo, arbolData) {
    const path = encontrarPath(arbolData, nodo.id);
    if (path) {
      setExpandidos(prev => {
        const next = new Set(prev);
        path.forEach(id => next.add(id));
        return next;
      });
    }
  }

  function seleccionarNodo(tipo, id, data) {
    const nodo = { tipo, id, data };
    setNodoSeleccionado(nodo);
    expandirHasta(nodo, arbol);
    setTreePanelAbierto(false); // cerrar slide-over en móvil al seleccionar
    setSearchParams(prev => {
      prev.set('nodo', id);
      return prev;
    }, { replace: true });
  }

  function toggleExpandir(id) {
    setExpandidos(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function recargar() {
    await cargarArbol(true);
    onStatsChange?.();
  }

  // Después de cargar el árbol, actualizar el nodo seleccionado si existe
  useEffect(() => {
    if (nodoSeleccionado && arbol.length > 0) {
      const found = buscarNodoEnArbol(arbol, nodoSeleccionado.id);
      if (found) setNodoSeleccionado(found);
    }
  }, [arbol]);

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">Cargando estructura...</span>
      </div>
    );
  }

  return (
    /* Altura acotada (no solo mínima): un overflow-y-auto interno solo
       funciona de verdad si este contenedor tiene un alto fijo — con
       minHeight nada más, el árbol y el rail crecían con su contenido y
       terminaba desplazándose la página completa en vez de cada columna
       por separado. */
    <div className="flex gap-0 border border-gray-200 rounded-xl overflow-hidden bg-white h-[calc(100vh-380px)] min-h-[520px]">
      {/* Overlay para árbol en móvil */}
      {treePanelAbierto && (
        <div className="fixed inset-0 bg-black/20 z-20 lg:hidden" onClick={() => setTreePanelAbierto(false)} />
      )}

      {/* ─── Panel izquierdo: Árbol ─── */}
      <div className={[
        'flex-shrink-0 border-r border-gray-200 flex flex-col bg-gray-50/50',
        /* Desktop: siempre visible como columna inline */
        'lg:w-80 lg:relative lg:translate-x-0',
        /* Móvil: slide-over controlado por estado */
        treePanelAbierto
          ? 'fixed left-0 top-0 bottom-0 w-80 z-30 shadow-2xl translate-x-0'
          : 'fixed left-0 top-0 bottom-0 w-80 z-30 -translate-x-full lg:translate-x-0',
        'transition-transform duration-200',
      ].join(' ')}>
        {/* Cabecera */}
        <div className="px-3 py-2.5 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Estructura del proyecto</h3>
          <div className="flex items-center gap-1">
            {/* Cerrar slide-over en móvil */}
            <button
              onClick={() => setTreePanelAbierto(false)}
              className="lg:hidden p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-200"
              title="Cerrar"
            >
              <X size={13} />
            </button>
            <button
              onClick={() => setMostrarFiltros(v => !v)}
              title="Filtros"
              className={`relative p-1 rounded transition-colors ${
                mostrarFiltros || filtrosActivos > 0
                  ? 'text-guinda-600 bg-guinda-50'
                  : 'text-gray-400 hover:bg-gray-100'
              }`}
            >
              <SlidersHorizontal size={13} />
              {filtrosActivos > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-guinda-500 text-white rounded-full text-[8px] flex items-center justify-center font-bold leading-none">
                  {filtrosActivos}
                </span>
              )}
            </button>
            {permisos.puedeCrearEtapa && (
              <CrearInline tipo="etapa" proyectoId={proyectoId} onCreado={recargar} />
            )}
          </div>
        </div>

        {/* Leyenda de colores — siempre visible, sin depender de hover */}
        <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 px-3 py-1.5 border-b border-gray-200 bg-white text-[9px] text-gray-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORES_SEMAFORO.verde }} />En proceso, sin riesgo</span>
          <span className="flex items-center gap-1"><CheckCircle2 size={9} className="text-emerald-600 flex-shrink-0" />Completada</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORES_SEMAFORO.ambar }} />Por vencer</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORES_SEMAFORO.rojo }} />Vencida</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full flex-shrink-0 border border-gray-300" style={{ backgroundColor: COLORES_SEMAFORO.gris }} />Sin iniciar / cancelada</span>
        </div>

        {/* Panel de filtros */}
        {mostrarFiltros && (
          <div className="px-2.5 py-2 border-b border-gray-200 bg-white space-y-1.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Filtros</span>
              {filtrosActivos > 0 && (
                <button onClick={limpiarFiltros} className="text-[10px] text-guinda-500 hover:text-guinda-700 font-medium">Limpiar</button>
              )}
            </div>

            {/* DG */}
            {dgsEnArbol.length > 0 && (
              <div>
                <label className="text-[10px] text-gray-400 font-medium uppercase tracking-wide block mb-0.5">DG (responsable)</label>
                <select
                  value={filtroDG}
                  onChange={e => setFiltroDG(e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:border-guinda-300"
                >
                  <option value="">Todas las DGs</option>
                  {dgsEnArbol.map(dg => (
                    <option key={dg.id} value={dg.id}>{dg.siglas}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Estatus */}
            <div>
              <label className="text-[10px] text-gray-400 font-medium uppercase tracking-wide block mb-0.5">Estatus</label>
              <select
                value={filtroEstado}
                onChange={e => setFiltroEstado(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:border-guinda-300"
              >
                <option value="">Todos los estatus</option>
                {ESTADOS.map(e => (
                  <option key={e} value={e}>{e.replace('_', ' ')}</option>
                ))}
              </select>
            </div>

            {/* Usuario */}
            <div>
              <label className="text-[10px] text-gray-400 font-medium uppercase tracking-wide block mb-0.5">Usuario / Nombre</label>
              <div className="relative">
                <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Responsable o nombre..."
                  value={filtroUsuario}
                  onChange={e => setFiltroUsuario(e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded-md px-2 py-1 pl-6 bg-white focus:outline-none focus:border-guinda-300"
                />
                {filtroUsuario && (
                  <button onClick={() => setFiltroUsuario('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Árbol */}
        <div className="flex-1 overflow-y-auto py-1">
          {arbolFiltrado.length === 0 ? (
            filtrosActivos > 0 ? (
              <div className="text-center py-8 px-3">
                <Filter size={20} className="mx-auto mb-2 text-gray-300" />
                <p className="text-xs text-gray-400">Sin resultados con los filtros aplicados.</p>
                <button onClick={limpiarFiltros} className="mt-2 text-xs text-guinda-500 hover:text-guinda-700 font-medium">Limpiar filtros</button>
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-8">Sin etapas. Crea la primera.</p>
            )
          ) : (
            arbolFiltrado.map(etapa => (
              <NodoArbol
                key={etapa.id}
                nodo={etapa}
                tipo="etapa"
                nivel={0}
                expandidos={expandidos}
                seleccionadoId={nodoSeleccionado?.id}
                onToggle={toggleExpandir}
                onSelect={seleccionarNodo}
                permisos={permisos}
                proyectoId={proyectoId}
                onCreado={recargar}
                mostrarToast={mostrarToast}
              />
            ))
          )}
        </div>
      </div>

      {/* ─── Panel derecho: Detalle ─── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Barra de hamburger visible solo en móvil */}
        {!nodoSeleccionado && (
          <button
            onClick={() => setTreePanelAbierto(v => !v)}
            className="lg:hidden flex items-center gap-2 px-4 py-2 text-xs text-gray-500 border-b border-gray-100 hover:bg-gray-50"
          >
            <Layers size={13} />
            <span>Ver estructura</span>
          </button>
        )}
        {!nodoSeleccionado ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Layers size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Selecciona un elemento del árbol para ver su detalle</p>
            </div>
          </div>
        ) : (
          <PanelDetalle
            key={nodoSeleccionado.id}
            nodo={nodoSeleccionado}
            proyectoId={proyectoId}
            permisos={permisos}
            onActualizado={recargar}
            mostrarToast={mostrarToast}
            arbol={arbol}
            onSeleccionarNodo={seleccionarNodo}
            onAbrirArbol={() => setTreePanelAbierto(true)}
          />
        )}
      </div>
    </div>
  );
}
