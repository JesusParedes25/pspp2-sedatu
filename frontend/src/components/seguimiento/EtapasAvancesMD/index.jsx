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
import { useAuth } from '../../../context/AuthContext';
import { usePanelWidth } from '../../../hooks/usePanelWidth';
import { COLORES_SEMAFORO } from '../../common/SemaforoDot';
import ResizeHandle from '../../common/ResizeHandle';
import NodoArbol from './NodoArbol';
import PanelDetalle from './PanelDetalle';
import CrearInline from './CrearInline';
import { ESTADOS, filtrarArbol, buscarNodoEnArbol, encontrarPath } from './utils';

export default function EtapasAvancesMD({ proyectoId, proyecto, permisos, dgSeleccionada, onStatsChange }) {
  const { mostrarToast } = useUI();
  const { usuario } = useAuth();
  // Ancho del árbol izquierdo, redimensionable — solo aplica aquí (el árbol
  // no existe en Diagrama, así que no hay nada que homologar con él).
  const [anchoArbol, ajustarAnchoArbol] = usePanelWidth(
    `pspp_ancho_arbol_${usuario?.id || 'anon'}`, { default: 320, min: 220, max: 480 }
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const [arbol, setArbol] = useState([]);
  const [cargando, setCargando] = useState(true);
  // "foco": la rama que muestra el centro (encabezado + lista) — cambia
  // solo desde el árbol izquierdo o el lineage del propio encabezado.
  // "seleccionId": el elemento cuya ficha muestra el panel derecho y cuya
  // Actividad muestra el feed del centro — cambia también al hacer clic en
  // un hijo dentro de la lista del centro, SIN mover el foco. Arrancan
  // iguales; se separan cuando el usuario navega dentro de la rama
  // enfocada sin cambiar de rama.
  const [foco, setFoco] = useState(null); // {tipo, id, data}
  const [seleccionId, setSeleccionId] = useState(null);
  const [expandidos, setExpandidos] = useState(new Set()); // árbol izquierdo
  const [expandidosCentro, setExpandidosCentro] = useState(new Set()); // lista central

  const seleccion = useMemo(() => {
    if (!seleccionId) return foco;
    return buscarNodoEnArbol(arbol, seleccionId) || foco;
  }, [arbol, seleccionId, foco]);

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

  // Sincronizar foco/selección con la URL (?foco=&nodo=) — solo la
  // PRIMERA vez que el árbol carga con datos; después el estado interno
  // manda y esta misma función escribe la URL, no al revés. Compatible
  // con enlaces viejos que solo traían `?nodo=`: si falta `foco`, se usa
  // el mismo id (equivale al comportamiento de antes, foco = selección).
  useEffect(() => {
    if (foco || arbol.length === 0) return;
    const focoId = searchParams.get('foco') || searchParams.get('nodo');
    const nodoId = searchParams.get('nodo') || searchParams.get('foco');
    if (!focoId) return;
    const encontradoFoco = buscarNodoEnArbol(arbol, focoId);
    if (!encontradoFoco) return;
    setFoco(encontradoFoco);
    expandirHasta(encontradoFoco, arbol);
    setSeleccionId(nodoId);
    // Si la selección va más profundo que el foco (deep-link directo a un
    // nieto), expande también esa ruta dentro de la lista central.
    if (nodoId && nodoId !== focoId) {
      const pathSeleccion = encontrarPath(arbol, nodoId);
      if (pathSeleccion) setExpandidosCentro(new Set(pathSeleccion));
    }
  }, [arbol]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Cambia de RAMA: árbol izquierdo o lineage del encabezado central. Mueve
  // foco Y selección juntos, y resetea qué está expandido en el centro —
  // es una renavegación completa, no un drill-down dentro de lo mismo.
  function irAFoco(tipo, id, data) {
    const nodo = { tipo, id, data };
    setFoco(nodo);
    setSeleccionId(id);
    setExpandidosCentro(new Set());
    expandirHasta(nodo, arbol);
    setTreePanelAbierto(false);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('foco', id);
      next.set('nodo', id);
      return next;
    }, { replace: true });
  }

  // Ancla del árbol izquierdo: siempre conocemos tipo+data ahí mismo.
  function seleccionarDesdeArbol(tipo, id, data) { irAFoco(tipo, id, data); }

  // Ancla del lineage (solo trae id) — busca los datos en el árbol.
  function navegarFocoPorId(_tipo, id) {
    const encontrado = buscarNodoEnArbol(arbol, id);
    if (encontrado) irAFoco(encontrado.tipo, encontrado.id, encontrado.data);
  }

  // Drill-down DENTRO de la rama enfocada: clic en una fila de la lista
  // central. Mueve solo la selección — el centro no se reconstruye.
  function seleccionarEnCentro(tipo, id) {
    setSeleccionId(id);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('nodo', id);
      return next;
    }, { replace: true });
  }

  function toggleExpandir(id) {
    setExpandidos(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleCentroExpandir(id) {
    setExpandidosCentro(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function recargar() {
    await cargarArbol(true);
    onStatsChange?.();
  }

  // Después de cargar el árbol, refrescar el foco con datos frescos (la
  // selección se re-deriva sola vía el useMemo de arriba).
  useEffect(() => {
    if (foco && arbol.length > 0) {
      const found = buscarNodoEnArbol(arbol, foco.id);
      if (found) setFoco(found);
    }
  }, [arbol]); // eslint-disable-line react-hooks/exhaustive-deps

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">Cargando estructura...</span>
      </div>
    );
  }

  // h-full (no una altura medida con JS): el padre (DetalleProyecto) ya
  // cascada un alto real acotado al viewport hasta aquí — ver Layout.jsx
  // y el flex-1 min-h-0 que envuelve esta subvista. min-h como piso, por
  // si el padre da menos de lo razonable en una ventana muy chica.
  return (
    <div
      className="flex gap-0 border border-gray-200 rounded-xl overflow-hidden bg-white h-full"
      style={{ minHeight: 520 }}
    >
      {/* Overlay para árbol en móvil */}
      {treePanelAbierto && (
        <div className="fixed inset-0 bg-black/20 z-20 lg:hidden" onClick={() => setTreePanelAbierto(false)} />
      )}

      {/* ─── Panel izquierdo: Árbol ─── */}
      <div
        style={{ '--ancho-arbol': `${anchoArbol}px` }}
        className={[
          'flex-shrink-0 border-r border-gray-200 flex flex-col bg-gray-50/50',
          /* Desktop: siempre visible como columna inline, ancho ajustable
             por el usuario (arrastrando el ResizeHandle de abajo) */
          'lg:w-[var(--ancho-arbol)] lg:relative lg:translate-x-0',
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
                seleccionadoId={foco?.id}
                onToggle={toggleExpandir}
                onSelect={seleccionarDesdeArbol}
                permisos={permisos}
                proyectoId={proyectoId}
                onCreado={recargar}
                mostrarToast={mostrarToast}
              />
            ))
          )}
        </div>
      </div>

      <ResizeHandle lado="derecho" label="Redimensionar árbol" onResize={ajustarAnchoArbol} />

      {/* ─── Panel derecho: Detalle ─── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Barra de hamburger visible solo en móvil */}
        {!foco && (
          <button
            onClick={() => setTreePanelAbierto(v => !v)}
            className="lg:hidden flex items-center gap-2 px-4 py-2 text-xs text-gray-500 border-b border-gray-100 hover:bg-gray-50"
          >
            <Layers size={13} />
            <span>Ver estructura</span>
          </button>
        )}
        {!foco ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <Layers size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Selecciona un elemento del árbol para ver su detalle</p>
            </div>
          </div>
        ) : (
          <PanelDetalle
            key={foco.id}
            foco={foco}
            seleccion={seleccion}
            proyectoId={proyectoId}
            permisos={permisos}
            onActualizado={recargar}
            mostrarToast={mostrarToast}
            arbol={arbol}
            expandidosCentro={expandidosCentro}
            onToggleCentro={toggleCentroExpandir}
            onSeleccionarEnCentro={seleccionarEnCentro}
            onNavegarFoco={navegarFocoPorId}
            onAbrirArbol={() => setTreePanelAbierto(true)}
          />
        )}
      </div>
    </div>
  );
}
