/**
 * ARCHIVO: EtapasAvancesMD.jsx
 * PROPÓSITO: Vista maestro-detalle de "Etapas y avances" con árbol y panel de detalle.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ChevronRight, ChevronDown, Plus, Lock, Layers, Zap, ListChecks,
  FileText, AlertTriangle, MessageSquare, BarChart3, Loader2, X,
  Upload, Link2, Trash2, Filter, Search, SlidersHorizontal, Users
} from 'lucide-react';
import * as etapasApi from '../../api/etapas';
import * as accionesApi from '../../api/acciones';
import * as tareasApi from '../../api/tareas';
import * as evidenciasApi from '../../api/evidencias';
import * as indicadoresApi from '../../api/indicadores';
import { obtenerRiesgosEtapa, obtenerRiesgosAccion, crearRiesgo, actualizarRiesgo } from '../../api/riesgos';
import { obtenerComentarios, crearComentario } from '../../api/comentarios';
import client from '../../api/client';
import EstadoChip from '../common/EstadoChip';
import SeccionAportaciones from './SeccionAportaciones';
import SeccionMiembrosNodo from './SeccionMiembrosNodo';
import { useUI } from '../../context/UIContext';

// ─── Constantes ────────────────────────────────────────────────
const COLORES_SEMAFORO = { verde: '#16a34a', ambar: '#d97706', rojo: '#dc2626', gris: '#94a3b8' };
const ESTADOS = ['Pendiente', 'En_proceso', 'Bloqueada', 'Completada', 'Cancelada'];
const PRIORIDADES = ['Baja', 'Media', 'Alta', 'Muy Alta', 'Crítica'];

// ─── Filtro recursivo del árbol ────────────────────────────────
function filtrarArbol(nodos, nivelTipo, estado, usuario, dg) {
  return nodos.reduce((acc, nodo) => {
    const hijosKey = nivelTipo === 'etapa' ? 'acciones' : 'tareas';
    const hijos = nodo[hijosKey] || [];
    const nextTipo = nivelTipo === 'etapa' ? 'accion' : 'tarea';
    const hijosFiltrados = hijos.length > 0 ? filtrarArbol(hijos, nextTipo, estado, usuario, dg) : [];

    const matchEstado = !estado || nodo.estado === estado;
    const q = usuario.toLowerCase();
    const matchUsuario = !usuario ||
      (nodo.responsable_nombre || '').toLowerCase().includes(q) ||
      nodo.nombre.toLowerCase().includes(q);
    const matchDG = !dg ||
      String(nodo.responsable_dg_id) === String(dg) ||
      String(nodo.id_dg) === String(dg);
    const coincide = matchEstado && matchUsuario && matchDG;

    if (coincide || hijosFiltrados.length > 0) {
      acc.push({ ...nodo, [hijosKey]: hijosFiltrados });
    }
    return acc;
  }, []);
}

function recogerIds(nodos, hijosKey) {
  const ids = new Set();
  function recorrer(ns, key) {
    ns.forEach(n => {
      ids.add(n.id);
      const hijos = n[key] || [];
      if (hijos.length) recorrer(hijos, key === 'acciones' ? 'tareas' : 'tareas');
    });
  }
  recorrer(nodos, hijosKey);
  return ids;
}

// ─── Componente principal ──────────────────────────────────────
export default function EtapasAvancesMD({ proyectoId, proyecto, permisos, dgSeleccionada, onStatsChange }) {
  const { mostrarToast } = useUI();
  const [searchParams, setSearchParams] = useSearchParams();
  const [arbol, setArbol] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nodoSeleccionado, setNodoSeleccionado] = useState(null); // {tipo, id, data}
  const [expandidos, setExpandidos] = useState(new Set());

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

  async function recargarYActualizarNodo() {
    await cargarArbol(true);
    onStatsChange?.();
    // Re-seleccionar nodo actual con datos frescos
    if (nodoSeleccionado) {
      const found = buscarNodoEnArbol(arbol, nodoSeleccionado.id);
      if (found) setNodoSeleccionado(found);
    }
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
    <div className="flex gap-0 border border-gray-200 rounded-xl overflow-hidden bg-white" style={{ minHeight: '600px' }}>
      {/* ─── Panel izquierdo: Árbol ─── */}
      <div className="w-80 flex-shrink-0 border-r border-gray-200 flex flex-col bg-gray-50/50">
        {/* Cabecera */}
        <div className="px-3 py-2.5 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Estructura del proyecto</h3>
          <div className="flex items-center gap-1">
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
              />
            ))
          )}
        </div>
      </div>

      {/* ─── Panel derecho: Detalle ─── */}
      <div className="flex-1 min-w-0 flex flex-col">
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
          />
        )}
      </div>
    </div>
  );
}

// ─── Nodo del árbol ────────────────────────────────────────────
function NodoArbol({ nodo, tipo, nivel, expandidos, seleccionadoId, onToggle, onSelect, permisos, proyectoId, onCreado }) {
  const esExpandido = expandidos.has(nodo.id);
  const esSeleccionado = seleccionadoId === nodo.id;
  const hijos = tipo === 'etapa' ? (nodo.acciones || []) : (nodo.tareas || []);
  const tieneHijos = hijos.length > 0;
  const sem = nodo.semaforo_efectivo || 'gris';
  const avance = nodo.avance_efectivo ?? (tipo === 'etapa' ? parseFloat(nodo.porcentaje_calculado || 0) : parseFloat(nodo.porcentaje_avance || 0));
  const Icono = tipo === 'etapa' ? Layers : tipo === 'accion' ? Zap : ListChecks;
  const colorIcono = tipo === 'etapa' ? 'text-blue-500' : tipo === 'accion' ? 'text-amber-500' : 'text-purple-400';

  return (
    <div>
      <div
        className={`flex items-center gap-1 pr-2 cursor-pointer transition-colors group
          ${esSeleccionado ? 'bg-[#7B1C3E]/5 border-l-2 border-[#7B1C3E]' : 'border-l-2 border-transparent hover:bg-gray-100'}`}
        style={{ paddingLeft: `${nivel * 16 + 8}px` }}
      >
        {/* Triángulo expandir */}
        <button
          onClick={(e) => { e.stopPropagation(); if (tieneHijos) onToggle(nodo.id); }}
          className="w-4 h-4 flex items-center justify-center flex-shrink-0"
        >
          {tieneHijos ? (
            esExpandido ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />
          ) : <span className="w-3" />}
        </button>

        {/* Punto semáforo */}
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORES_SEMAFORO[sem] }} />

        {/* Nombre */}
        <button
          onClick={() => onSelect(tipo, nodo.id, nodo)}
          className="flex-1 text-left truncate py-1.5 min-w-0"
        >
          <span className={`text-xs ${esSeleccionado ? 'font-semibold text-[#7B1C3E]' : 'text-gray-700'} truncate block`}>
            {nodo.nombre}
          </span>
        </button>

        {/* % avance */}
        <span className="text-[10px] tabular-nums font-medium text-gray-400 flex-shrink-0 w-8 text-right">
          {Math.round(avance)}%
        </span>
      </div>

      {/* Hijos */}
      {esExpandido && hijos.map(hijo => (
        <NodoArbol
          key={hijo.id}
          nodo={hijo}
          tipo={tipo === 'etapa' ? 'accion' : 'tarea'}
          nivel={nivel + 1}
          expandidos={expandidos}
          seleccionadoId={seleccionadoId}
          onToggle={onToggle}
          onSelect={onSelect}
          permisos={permisos}
          proyectoId={proyectoId}
          onCreado={onCreado}
        />
      ))}

      {/* Botón "+ Acción" o "+ Tarea" al final de rama expandida */}
      {esExpandido && permisos.puedeCrearAccion && (
        <div style={{ paddingLeft: `${(nivel + 1) * 16 + 8}px` }}>
          <CrearInline
            tipo={tipo === 'etapa' ? 'accion' : 'tarea'}
            padreId={nodo.id}
            proyectoId={proyectoId}
            onCreado={onCreado}
          />
        </div>
      )}
    </div>
  );
}

// ─── Crear inline ──────────────────────────────────────────────
function CrearInline({ tipo, padreId, proyectoId, onCreado }) {
  const [activo, setActivo] = useState(false);
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const refInput = useRef(null);

  useEffect(() => {
    if (activo && refInput.current) refInput.current.focus();
  }, [activo]);

  const etiqueta = tipo === 'etapa' ? '+ Etapa' : tipo === 'accion' ? '+ Acción' : '+ Tarea';

  async function guardar() {
    if (!nombre.trim() || guardando) return;
    setGuardando(true);
    try {
      if (tipo === 'etapa') {
        await etapasApi.crearEtapa(proyectoId, { nombre: nombre.trim() });
      } else if (tipo === 'accion') {
        await accionesApi.crearAccionEnEtapa(padreId, { nombre: nombre.trim() });
      } else {
        await tareasApi.crearTarea(padreId, { nombre: nombre.trim() });
      }
      setNombre('');
      setActivo(false);
      onCreado?.();
    } catch (err) {
      console.error(err);
    } finally {
      setGuardando(false);
    }
  }

  if (!activo) {
    return (
      <button
        onClick={() => setActivo(true)}
        className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-[#7B1C3E] py-1 px-1 transition-colors"
      >
        <Plus size={10} /> {etiqueta}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 py-0.5 px-1">
      <input
        ref={refInput}
        value={nombre}
        onChange={e => setNombre(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') { setActivo(false); setNombre(''); } }}
        onBlur={() => { if (!nombre.trim()) { setActivo(false); setNombre(''); } }}
        placeholder={`Nombre de ${tipo}...`}
        className="text-xs border border-gray-300 rounded px-1.5 py-0.5 flex-1 min-w-0 focus:border-[#7B1C3E] focus:ring-1 focus:ring-[#7B1C3E]/20 outline-none"
        disabled={guardando}
      />
      {guardando && <Loader2 size={10} className="animate-spin text-gray-400" />}
    </div>
  );
}

// ─── Panel de detalle ──────────────────────────────────────────
function PanelDetalle({ nodo, proyectoId, permisos, onActualizado, mostrarToast, arbol, onSeleccionarNodo }) {
  const { tipo, id, data } = nodo;
  const [tabActiva, setTabActiva] = useState('subitems');
  const [propiedadesAbiertas, setPropiedadesAbiertas] = useState(true);

  // Datos para pestañas
  const [evidencias, setEvidencias] = useState([]);
  const [riesgos, setRiesgos] = useState([]);
  const [comentarios, setComentarios] = useState([]);

  // Catálogos (cargados una vez)
  const [catalogs, setCatalogs] = useState({
    escalas: [], instrumentos: [], estados_geo: [], municipios: [], zm: [], usuarios: []
  });
  const [muniFilter, setMuniFilter] = useState(data.cve_ent || null);

  useEffect(() => { setTabActiva('subitems'); setPropiedadesAbiertas(true); }, [id]);

  // Cargar catálogos una vez
  useEffect(() => {
    (async () => {
      try {
        const [escRes, instRes, estRes, zmRes, usrRes] = await Promise.all([
          client.get('/catalogos/valores', { params: { tipo: 'escala_territorial' } }),
          client.get('/catalogos/valores', { params: { tipo: 'instrumento' } }),
          client.get('/catalogos/estados'),
          client.get('/catalogos/zonas-metropolitanas'),
          client.get('/catalogos/usuarios'),
        ]);
        setCatalogs({
          escalas: (escRes.data.datos || []).map(c => c.valor),
          instrumentos: (instRes.data.datos || []).map(c => c.valor),
          estados_geo: estRes.data.datos || [],
          municipios: [],
          zm: zmRes.data.datos || [],
          usuarios: usrRes.data.datos || [],
        });
      } catch (e) { console.error('Error cargando catálogos:', e); }
    })();
  }, []);

  // Cargar municipios cuando cambia el estado geográfico
  useEffect(() => {
    if (!muniFilter) { setCatalogs(prev => ({ ...prev, municipios: [] })); return; }
    (async () => {
      try {
        const res = await client.get('/catalogos/municipios-por-clave', { params: { cve_ent: muniFilter } });
        setCatalogs(prev => ({ ...prev, municipios: res.data.datos || [] }));
      } catch { setCatalogs(prev => ({ ...prev, municipios: [] })); }
    })();
  }, [muniFilter]);

  // Cargar datos de todas las pestañas al montar (para contadores)
  useEffect(() => {
    cargarEvidencias();
    cargarRiesgos();
    cargarComentarios();
  }, [id]);

  async function cargarEvidencias() {
    try {
      const res = tipo === 'etapa'
        ? await evidenciasApi.obtenerEvidenciasEtapa(id)
        : await evidenciasApi.obtenerEvidenciasAccion(id);
      setEvidencias(res.datos || []);
    } catch { setEvidencias([]); }
  }

  async function cargarRiesgos() {
    try {
      const res = tipo === 'etapa'
        ? await obtenerRiesgosEtapa(id)
        : await obtenerRiesgosAccion(id);
      setRiesgos(res.datos || []);
    } catch { setRiesgos([]); }
  }

  async function cargarComentarios() {
    try {
      const res = await obtenerComentarios(tipo === 'etapa' ? 'Etapa' : 'Accion', id);
      setComentarios(res.datos || []);
    } catch { setComentarios([]); }
  }

  const sem = data.semaforo_efectivo || 'gris';
  const avance = data.avance_efectivo ?? (tipo === 'etapa' ? parseFloat(data.porcentaje_calculado || 0) : parseFloat(data.porcentaje_avance || 0));
  const esContenedor = tipo === 'etapa' || (data.es_hoja === false);
  const tipoLabel = tipo === 'etapa' ? 'ETAPA' : (tipo === 'tarea' ? 'TAREA' : (data.id_accion_padre ? 'TAREA' : 'ACCIÓN'));

  // Sub-items
  const subItems = tipo === 'etapa' ? (data.acciones || []) : (data.tareas || []);
  const subItemLabel = tipo === 'etapa' ? 'Acciones' : 'Tareas';

  // Tabs
  const tabs = [
    { id: 'subitems', label: `${subItemLabel} (${subItems.length})`, icono: Layers },
    { id: 'equipo', label: 'Equipo', icono: Users },
    { id: 'archivos', label: `Archivos (${evidencias.length || 0})`, icono: FileText },
    { id: 'riesgos', label: `Riesgos (${riesgos.length || 0})`, icono: AlertTriangle },
    { id: 'comentarios', label: `Comentarios (${comentarios.length || 0})`, icono: MessageSquare },
  ];

  // ─── PATCH handler ───
  async function guardarCampo(campo, valor) {
    try {
      if (tipo === 'etapa') {
        await etapasApi.patchEtapa(id, { [campo]: valor });
      } else if (tipo === 'tarea') {
        await tareasApi.patchTarea(id, { [campo]: valor });
      } else {
        await accionesApi.patchAccion(id, { [campo]: valor });
      }
      mostrarToast('Actualizado', 'exito');
      onActualizado?.();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'Error al actualizar', 'error');
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-500 uppercase tracking-wider">
            {tipoLabel}
          </span>
          <EstadoChip estado={data.estado || 'Pendiente'} />
          {data.prioridad && (
            <span className="text-[10px] text-gray-500">Prioridad: <strong>{data.prioridad}</strong></span>
          )}
        </div>
        <CampoTextoInline
          valor={data.nombre}
          campo="nombre"
          onGuardar={v => guardarCampo('nombre', v)}
          soloLectura={permisos.esSoloLectura}
          className="text-lg font-bold text-gray-900 leading-tight"
        />
        <CampoTextoInline
          valor={data.descripcion || ''}
          campo="descripcion"
          onGuardar={v => guardarCampo('descripcion', v)}
          soloLectura={permisos.esSoloLectura}
          placeholder="Agregar descripción..."
          className="text-xs text-gray-500 mt-1"
          multiline
        />

        {/* Barra de avance */}
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.min(avance, 100)}%`, backgroundColor: COLORES_SEMAFORO[sem] }}
            />
          </div>
          <span className="text-sm font-bold tabular-nums" style={{ color: COLORES_SEMAFORO[sem] }}>
            {Math.round(avance)}%
          </span>
        </div>
      </div>

      {/* Propiedades desplegables */}
      <div className="border-b border-gray-100">
        <button
          onClick={() => setPropiedadesAbiertas(!propiedadesAbiertas)}
          className="w-full flex items-center justify-between px-5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <span>Propiedades</span>
          {propiedadesAbiertas ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {propiedadesAbiertas && (<>
          <div className="px-5 pb-3 grid grid-cols-3 gap-x-4 gap-y-2">
            {/* Fila 1: Estado, Prioridad, Tipo */}
            {esContenedor ? (
              <div>
                <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">Estatus</span>
                <div className="flex items-center gap-1.5">
                  <Lock size={10} className="text-gray-400" />
                  <span className="text-xs text-gray-500">{(data.estado || 'Pendiente').replace(/_/g, ' ')}</span>
                </div>
                <p className="text-[9px] text-gray-400 mt-0.5 italic">Se calcula desde sus partes</p>
              </div>
            ) : (
              <CampoSelect
                label="Estatus"
                valor={data.estado || 'Pendiente'}
                opciones={ESTADOS}
                onChange={v => guardarCampo('estado', v)}
                soloLectura={permisos.esSoloLectura}
                formatLabel={v => v.replace(/_/g, ' ')}
              />
            )}
            <CampoSelect
              label="Prioridad"
              valor={data.prioridad || ''}
              opciones={PRIORIDADES}
              onChange={v => guardarCampo('prioridad', v)}
              soloLectura={permisos.esSoloLectura}
            />
            <CampoSelect
              label="Responsable"
              valor={data.id_responsable || ''}
              opciones={catalogs.usuarios.map(u => ({ value: u.id, label: `${u.nombre_completo}${u.dg_siglas ? ' — ' + u.dg_siglas : ''}` }))}
              onChange={v => guardarCampo('id_responsable', v || null)}
              soloLectura={permisos.esSoloLectura}
              useObjects
            />
            {/* Fila 2: Fechas */}
            <CampoFecha
              label="Fecha inicio"
              valor={data.fecha_inicio ? data.fecha_inicio.substring(0, 10) : ''}
              onChange={v => guardarCampo('fecha_inicio', v || null)}
              soloLectura={permisos.esSoloLectura}
            />
            <CampoFecha
              label="Fecha límite"
              valor={data.fecha_limite ? data.fecha_limite.substring(0, 10) : ''}
              onChange={v => guardarCampo('fecha_limite', v || null)}
              soloLectura={permisos.esSoloLectura}
            />
            <CampoEditable
              label="Última actualización"
              valor={data.updated_at ? new Date(data.updated_at).toLocaleString('es-MX') : '—'}
              soloLectura={true}
            />
            {/* Fila 3: Avance y Semáforo */}
            <CampoAvance
              valor={data.avance_actual}
              avanceEfectivo={avance}
              esContenedor={esContenedor}
              estado={data.estado}
              onChange={v => guardarCampo('avance_actual', v)}
              soloLectura={permisos.esSoloLectura}
            />
            <CampoSemaforo
              valor={data.semaforo}
              override={data.semaforo_override}
              efectivo={sem}
              onChange={v => guardarCampo('semaforo', v)}
              soloLectura={permisos.esSoloLectura}
            />
            {tipo !== 'tarea' && (
              <CampoSelect
                label="Escala territorial"
                valor={data.escala_territorial || ''}
                opciones={catalogs.escalas}
                onChange={v => guardarCampo('escala_territorial', v || null)}
                soloLectura={permisos.esSoloLectura}
              />
            )}
            {/* Fila 4: Catálogos */}
            {tipo !== 'tarea' && (
              <>
                <CampoSelect
                  label="Instrumento principal"
                  valor={data.instrumento || ''}
                  opciones={catalogs.instrumentos}
                  onChange={v => guardarCampo('instrumento', v || null)}
                  soloLectura={permisos.esSoloLectura}
                />
                <CampoSelect
                  label="Estado (geográfico)"
                  valor={data.cve_ent || ''}
                  opciones={catalogs.estados_geo.map(e => ({ value: e.cve_ent || e.clave, label: e.nom_ent || e.nombre }))}
                  onChange={v => { setMuniFilter(v || null); guardarCampo('cve_ent', v || null); }}
                  soloLectura={permisos.esSoloLectura}
                  useObjects
                />
                <CampoSelect
                  label="Municipio"
                  valor={data.cve_mun || ''}
                  opciones={catalogs.municipios.map(m => ({ value: m.cve_mun || m.clave, label: m.nom_mun || m.nombre }))}
                  onChange={v => guardarCampo('cve_mun', v || null)}
                  soloLectura={permisos.esSoloLectura}
                  useObjects
                />
              </>
            )}
          </div>
          {/* Aportación a indicadores */}
          {tipo !== 'tarea' && (
            <SeccionAportaciones
              tipo={tipo}
              nodoId={id}
              proyectoId={proyectoId}
              avanceEfectivo={avance}
              soloLectura={permisos.esSoloLectura}
            />
          )}
        </>)}
      </div>

      {/* Pestañas */}
      <div className="flex border-b border-gray-200 px-5">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setTabActiva(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors mr-1
              ${tabActiva === tab.id
                ? 'border-[#7B1C3E] text-[#7B1C3E]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
          >
            <tab.icono size={12} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Contenido de pestaña */}
      <div className="flex-1 overflow-y-auto">
        {tabActiva === 'subitems' && (
          <TabSubItems
            items={subItems}
            tipo={tipo}
            padreId={id}
            proyectoId={proyectoId}
            permisos={permisos}
            onActualizado={onActualizado}
            mostrarToast={mostrarToast}
            onSeleccionarNodo={onSeleccionarNodo}
          />
        )}
        {tabActiva === 'equipo' && (
          <div className="px-5 py-4">
            <SeccionMiembrosNodo tipo={tipo === 'tarea' ? 'accion' : tipo} idNodo={id} permisos={permisos} />
          </div>
        )}
        {tabActiva === 'archivos' && (
          <TabArchivos evidencias={evidencias} tipo={tipo} id={id} onRecargar={cargarEvidencias} permisos={permisos} />
        )}
        {tabActiva === 'riesgos' && (
          <TabRiesgos riesgos={riesgos} tipo={tipo} id={id} onRecargar={cargarRiesgos} permisos={permisos} proyectoId={proyectoId} />
        )}
        {tabActiva === 'comentarios' && (
          <TabComentarios comentarios={comentarios} tipo={tipo} id={id} onRecargar={cargarComentarios} />
        )}
      </div>
    </div>
  );
}

// ─── Campo texto inline (click-to-edit) ──────────────────────
function CampoTextoInline({ valor, campo, onGuardar, soloLectura, placeholder, className, multiline }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(valor || '');
  const ref = useRef(null);

  useEffect(() => { setTexto(valor || ''); }, [valor]);
  useEffect(() => { if (editando && ref.current) ref.current.focus(); }, [editando]);

  function confirmar() {
    setEditando(false);
    if (texto.trim() !== (valor || '').trim()) onGuardar(texto.trim() || null);
  }

  if (soloLectura || !editando) {
    return (
      <div
        onClick={() => !soloLectura && setEditando(true)}
        className={`${className} ${!soloLectura ? 'cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1' : ''} ${!valor && !soloLectura ? 'italic text-gray-300' : ''}`}
        title={!soloLectura ? 'Clic para editar' : undefined}
      >
        {valor || placeholder || '—'}
      </div>
    );
  }

  if (multiline) {
    return (
      <textarea
        ref={ref}
        value={texto}
        onChange={e => setTexto(e.target.value)}
        onBlur={confirmar}
        onKeyDown={e => { if (e.key === 'Escape') { setTexto(valor || ''); setEditando(false); } }}
        placeholder={placeholder}
        rows={2}
        className={`${className} w-full border border-[#7B1C3E]/30 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-[#7B1C3E]/20 resize-none`}
      />
    );
  }

  return (
    <input
      ref={ref}
      value={texto}
      onChange={e => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={e => { if (e.key === 'Enter') confirmar(); if (e.key === 'Escape') { setTexto(valor || ''); setEditando(false); } }}
      placeholder={placeholder}
      className={`${className} w-full border border-[#7B1C3E]/30 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-[#7B1C3E]/20`}
    />
  );
}

// ─── Campos editables inline ───────────────────────────────────
function CampoEditable({ label, valor, soloLectura }) {
  return (
    <div>
      <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">{label}</span>
      <span className="text-xs text-gray-700">{valor}</span>
    </div>
  );
}

function CampoSelect({ label, valor, opciones, onChange, soloLectura, formatLabel, useObjects }) {
  const displayVal = useObjects
    ? (opciones.find(o => o.value === valor)?.label || valor || '—')
    : (formatLabel ? formatLabel(valor) : valor || '—');
  if (soloLectura) return <CampoEditable label={label} valor={displayVal} soloLectura />;
  return (
    <div>
      <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">{label}</span>
      <select
        value={valor}
        onChange={e => onChange(e.target.value)}
        className="text-xs border border-gray-200 rounded px-1.5 py-0.5 w-full bg-white focus:border-[#7B1C3E] outline-none"
      >
        <option value="">—</option>
        {useObjects
          ? opciones.map(o => <option key={o.value} value={o.value}>{o.label}</option>)
          : opciones.map(o => <option key={o} value={o}>{formatLabel ? formatLabel(o) : o}</option>)
        }
      </select>
    </div>
  );
}

function CampoFecha({ label, valor, onChange, soloLectura }) {
  if (soloLectura) return <CampoEditable label={label} valor={valor ? new Date(valor).toLocaleDateString('es-MX') : '—'} soloLectura />;
  return (
    <div>
      <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">{label}</span>
      <input
        type="date"
        value={valor || ''}
        onChange={e => onChange(e.target.value)}
        className="text-xs border border-gray-200 rounded px-1.5 py-0.5 w-full bg-white focus:border-[#7B1C3E] outline-none"
      />
    </div>
  );
}

function CampoAvance({ valor, avanceEfectivo, esContenedor, estado, onChange, soloLectura }) {
  const mostrado = valor != null ? valor : Math.round(avanceEfectivo);
  if (esContenedor) {
    return (
      <div>
        <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">Avance actual</span>
        <div className="flex items-center gap-1.5">
          <Lock size={10} className="text-gray-400" />
          <span className="text-xs text-gray-500">{mostrado}%</span>
        </div>
        <p className="text-[9px] text-gray-400 mt-0.5 italic leading-snug">El avance y el estatus se calculan a partir de sus partes. Para avanzar, actualiza las tareas/acciones que contiene.</p>
      </div>
    );
  }
  // Hoja: avance bloqueado si no es En_proceso
  const estadoActual = estado || 'Pendiente';
  const bloqueado = soloLectura || estadoActual === 'Completada' || estadoActual === 'Pendiente' || estadoActual === 'Bloqueada' || estadoActual === 'Cancelada';
  if (bloqueado) {
    const nota = estadoActual === 'Completada' ? 'Completada: 100%'
      : estadoActual === 'Pendiente' ? 'Pendiente: 0%'
      : estadoActual === 'Bloqueada' ? 'Bloqueada: avance congelado'
      : estadoActual === 'Cancelada' ? 'Cancelada' : '';
    return (
      <div>
        <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">Avance actual</span>
        <span className="text-xs text-gray-500">{mostrado}%</span>
        {nota && <p className="text-[9px] text-gray-400 mt-0.5 italic">{nota}</p>}
        <p className="text-[9px] text-gray-400 mt-0.5 italic leading-snug">{"Captura el avance parcial mientras está 'En proceso'. Marca 'Completada' para llegar al 100%."}</p>
      </div>
    );
  }
  return (
    <div>
      <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">Avance actual</span>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min="0"
          max="99"
          value={valor ?? 0}
          onChange={e => onChange(parseInt(e.target.value))}
          className="flex-1 h-1.5 accent-[#7B1C3E]"
        />
        <span className="text-xs font-bold tabular-nums w-8 text-right">{valor ?? 0}%</span>
      </div>
      <p className="text-[9px] text-gray-400 mt-0.5 italic leading-snug">Captura el avance parcial (0-99). Marca 'Completada' para llegar al 100%.</p>
    </div>
  );
}

function CampoSemaforo({ valor, override, efectivo, onChange, soloLectura }) {
  const colorMostrado = override && valor ? valor : efectivo;
  if (soloLectura) {
    return (
      <div>
        <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">Semáforo</span>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: COLORES_SEMAFORO[colorMostrado] }} />
          <span className="text-xs capitalize">{colorMostrado}</span>
          {override && <span className="text-[8px] bg-gray-200 text-gray-600 px-1 rounded font-bold">M</span>}
        </div>
      </div>
    );
  }
  return (
    <div>
      <span className="text-[10px] text-gray-400 uppercase tracking-wider block mb-0.5">Semáforo</span>
      <div className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: COLORES_SEMAFORO[colorMostrado] }} />
        <select
          value={override ? valor : ''}
          onChange={e => onChange(e.target.value === '' ? null : e.target.value)}
          className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white focus:border-[#7B1C3E] outline-none"
        >
          <option value="">Automático</option>
          <option value="verde">🟢 Verde</option>
          <option value="ambar">🟡 Ámbar</option>
          <option value="rojo">🔴 Rojo</option>
          <option value="gris">⚪ Gris</option>
        </select>
        {override && <span className="text-[8px] bg-gray-200 text-gray-600 px-1 rounded font-bold">M</span>}
      </div>
    </div>
  );
}

// ─── Tab: Sub-items ────────────────────────────────────────────
function TabSubItems({ items, tipo, padreId, proyectoId, permisos, onActualizado, mostrarToast, onSeleccionarNodo }) {
  const subTipo = tipo === 'etapa' ? 'accion' : 'tarea';
  const subLabel = tipo === 'etapa' ? 'acción' : 'tarea';
  const esTarea = tipo !== 'etapa';

  async function cambiarEstadoRapido(e, itemId) {
    e.stopPropagation();
    try {
      if (esTarea) {
        await tareasApi.patchTarea(itemId, { estado: e.target.value });
      } else {
        await accionesApi.patchAccion(itemId, { estado: e.target.value });
      }
      mostrarToast('Estado actualizado', 'exito');
      onActualizado?.();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'Error', 'error');
    }
  }

  async function cambiarAvance(e, itemId) {
    e.stopPropagation();
    const val = parseInt(e.target.value);
    try {
      if (esTarea) {
        await tareasApi.patchTarea(itemId, { avance_actual: val });
      } else {
        await accionesApi.patchAccion(itemId, { avance_actual: val });
      }
      onActualizado?.();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'Error', 'error');
    }
  }

  function navegarAItem(item) {
    if (onSeleccionarNodo) {
      onSeleccionarNodo(subTipo === 'accion' ? 'accion' : 'tarea', item.id, item);
    }
  }

  return (
    <div className="p-3 space-y-1">
      {items.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-4 italic">Sin {subLabel}s</p>
      )}
      {items.map(item => {
        const sem = item.semaforo_efectivo || item.semaforo || 'gris';
        const pct = item.avance_efectivo ?? item.avance_actual ?? parseFloat(item.porcentaje_avance || 0);
        const itemEsContenedor = item.es_hoja === false || (item.tareas && item.tareas.length > 0);
        const itemEstado = item.estado || 'Pendiente';
        const avanceEditable = !itemEsContenedor && itemEstado === 'En_proceso';
        return (
          <div
            key={item.id}
            onClick={() => navegarAItem(item)}
            className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-gray-50 group cursor-pointer transition-colors"
          >
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORES_SEMAFORO[sem] }} />
            <span className="text-xs text-gray-800 flex-1 truncate hover:text-[#7B1C3E] hover:underline">{item.nombre}</span>
            {!permisos.esSoloLectura && !itemEsContenedor && (
              <select
                value={itemEstado}
                onChange={e => cambiarEstadoRapido(e, item.id)}
                onClick={e => e.stopPropagation()}
                className="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
              >
                {ESTADOS.map(e => <option key={e} value={e}>{e.replace(/_/g, ' ')}</option>)}
              </select>
            )}
            {itemEsContenedor && (
              <Lock size={10} className="text-gray-300 flex-shrink-0" title="Calculado desde sus partes" />
            )}
            {!permisos.esSoloLectura && avanceEditable && (
              <input
                type="number"
                min="0"
                max="99"
                value={Math.round(pct)}
                onChange={e => cambiarAvance(e, item.id)}
                onClick={e => e.stopPropagation()}
                className="w-12 text-[10px] text-center border border-gray-200 rounded px-0.5 py-0.5 bg-white opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
                title="Avance %"
              />
            )}
            {(permisos.esSoloLectura || !avanceEditable) && (
              <span className="text-[10px] tabular-nums font-medium text-gray-400 w-7 text-right">{Math.round(pct)}%</span>
            )}
          </div>
        );
      })}

      {/* Crear inline */}
      {permisos.puedeCrearAccion && (
        <CrearInline
          tipo={subTipo}
          padreId={padreId}
          proyectoId={proyectoId}
          onCreado={onActualizado}
        />
      )}
    </div>
  );
}

// ─── Modal de vista previa de archivos ────────────────────────
function FilePreviewModal({ evidencia, onClose }) {
  const [geoData, setGeoData] = useState(null);
  const [geoError, setGeoError] = useState(null);
  const [loading, setLoading] = useState(false);

  const nombre = evidencia.nombre_original || evidencia.nombre_archivo || '';
  const ext = nombre.split('.').pop().toLowerCase();
  const url = evidenciasApi.obtenerUrlDescarga(evidencia.id);

  const esPdf = ext === 'pdf';
  const esImagen = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext);
  const esAudio = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext);
  const esTexto = ['txt', 'md', 'csv', 'json', 'xml', 'log'].includes(ext);
  const esKml = ['kml', 'kmz'].includes(ext);
  const esShp = ext === 'zip' && (evidencia.categoria || '').toLowerCase().includes('capa');

  useEffect(() => {
    if (!esKml && !esShp) return;
    setLoading(true);
    (async () => {
      try {
        if (esKml) {
          const resp = await fetch(url);
          let text;
          if (ext === 'kmz') {
            const JSZip = (await import('jszip')).default;
            const zip = await JSZip.loadAsync(await resp.arrayBuffer());
            const kmlFile = Object.keys(zip.files).find(f => f.endsWith('.kml'));
            text = await zip.files[kmlFile].async('string');
          } else {
            text = await resp.text();
          }
          const parser = new DOMParser();
          const doc = parser.parseFromString(text, 'text/xml');
          const features = [];
          doc.querySelectorAll('Placemark').forEach(pm => {
            const coords = pm.querySelector('coordinates');
            if (!coords) return;
            const parts = coords.textContent.trim().split(/\s+/).map(c => {
              const [lng, lat] = c.split(',').map(Number);
              return [lat, lng];
            });
            features.push({ name: pm.querySelector('name')?.textContent || '', coords: parts });
          });
          setGeoData(features);
        } else {
          const shp = await import('shpjs');
          const resp = await fetch(url);
          const buf = await resp.arrayBuffer();
          const geojson = await shp.default(buf);
          setGeoData(geojson);
        }
      } catch (err) {
        console.error('Error cargando geodatos:', err);
        setGeoError('No se pudo cargar la vista previa geográfica.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[90vw] max-w-4xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Title bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-gray-50 rounded-t-xl">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={14} className="text-[#7B1C3E] flex-shrink-0" />
            <span className="text-sm font-semibold text-gray-800 truncate">{nombre}</span>
          </div>
          <div className="flex items-center gap-2">
            <a href={url} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 px-2.5 py-1 text-[10px] bg-[#7B1C3E] text-white rounded hover:bg-[#5a1430]">
              <Upload size={10} className="rotate-180" /> Descargar
            </a>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-200">
              <X size={16} />
            </button>
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-auto p-1 min-h-0">
          {esPdf && (
            <iframe src={url} className="w-full h-full min-h-[60vh] rounded" title={nombre} />
          )}
          {esImagen && (
            <div className="flex items-center justify-center h-full p-4">
              <img src={url} alt={nombre} className="max-w-full max-h-[70vh] object-contain rounded" />
            </div>
          )}
          {(esKml || esShp) && loading && (
            <div className="flex items-center justify-center h-64">
              <Loader2 size={24} className="animate-spin text-[#7B1C3E]" />
              <span className="ml-2 text-sm text-gray-500">Cargando vista previa geográfica…</span>
            </div>
          )}
          {(esKml || esShp) && geoError && (
            <div className="flex flex-col items-center justify-center h-64 gap-2">
              <AlertTriangle size={20} className="text-amber-500" />
              <p className="text-sm text-gray-500">{geoError}</p>
              <a href={url} target="_blank" rel="noreferrer" className="text-xs text-[#7B1C3E] underline">Descargar archivo</a>
            </div>
          )}
          {(esKml || esShp) && geoData && !loading && !geoError && (
            <GeoPreviewMap data={geoData} isGeoJSON={esShp} />
          )}
          {esAudio && (
            <div className="flex items-center justify-center h-64 p-4">
              <audio controls src={url} className="w-full max-w-md" />
            </div>
          )}
          {esTexto && (
            <iframe src={url} className="w-full h-full min-h-[60vh] rounded bg-gray-50 font-mono text-sm" title={nombre} />
          )}
          {!esPdf && !esImagen && !esKml && !esShp && !esAudio && !esTexto && (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <FileText size={40} className="text-gray-300" />
              <p className="text-sm text-gray-500">Vista previa no disponible para este tipo de archivo.</p>
              <a href={url} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 px-4 py-2 bg-[#7B1C3E] text-white text-sm rounded-lg hover:bg-[#5a1430]">
                <Upload size={14} className="rotate-180" /> Descargar archivo
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GeoPreviewMap({ data, isGeoJSON }) {
  const mapRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      if (cancelled || mapRef.current) return;

      const map = L.map(containerRef.current).setView([23.6345, -102.5528], 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(map);

      let layer;
      if (isGeoJSON) {
        layer = L.geoJSON(data, {
          style: { color: '#7B1C3E', weight: 2, fillOpacity: 0.15 },
          onEachFeature: (feature, lyr) => {
            if (feature.properties) {
              const props = Object.entries(feature.properties)
                .filter(([, v]) => v != null && v !== '')
                .map(([k, v]) => `<b>${k}:</b> ${v}`).join('<br/>');
              if (props) lyr.bindPopup(`<div style="font-size:11px;max-height:200px;overflow:auto">${props}</div>`);
            }
          }
        }).addTo(map);
      } else {
        layer = L.featureGroup();
        (data || []).forEach(f => {
          if (f.coords.length === 1) {
            L.circleMarker(f.coords[0], { radius: 5, color: '#7B1C3E' }).bindPopup(f.name || '').addTo(layer);
          } else {
            L.polyline(f.coords, { color: '#7B1C3E', weight: 2 }).bindPopup(f.name || '').addTo(layer);
          }
        });
        layer.addTo(map);
      }

      if (layer && layer.getBounds && layer.getLayers && layer.getLayers().length > 0) {
        try { map.fitBounds(layer.getBounds(), { padding: [30, 30] }); } catch {}
      }

      mapRef.current = map;
    })();

    return () => { cancelled = true; if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } };
  }, [data, isGeoJSON]);

  return <div ref={containerRef} style={{ width: '100%', height: '60vh' }} />;
}

// ─── Tab: Archivos con formulario de subida (2 pasos) ────────
const CATEGORIAS_EVIDENCIA = [
  { value: 'Documento', icon: '📄' },
  { value: 'Fotografía', icon: '📷' },
  { value: 'Capa geográfica', icon: '🗺️' },
  { value: 'Paquete de capas geográficas', icon: '📦' },
  { value: 'Video', icon: '🎬' },
  { value: 'Repositorio', icon: '💻' },
  { value: 'Audio', icon: '🎵' },
  { value: 'Otro', icon: '📎' },
];

function TabArchivos({ evidencias, tipo, id, onRecargar, permisos }) {
  // Wizard: 'lista' | 'paso1_categoria' | 'paso2_medio'
  const [paso, setPaso] = useState('lista');
  const [categoria, setCategoria] = useState('');
  const [tipoMedio, setTipoMedio] = useState(null); // 'archivo' | 'link'
  const [archivo, setArchivo] = useState(null);
  const [urlLink, setUrlLink] = useState('');
  const [notas, setNotas] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [detalleEv, setDetalleEv] = useState(null);
  const [previewEv, setPreviewEv] = useState(null);

  function resetForm() {
    setPaso('lista'); setCategoria(''); setTipoMedio(null);
    setArchivo(null); setUrlLink(''); setNotas('');
  }

  async function enviar() {
    if (subiendo) return;
    setSubiendo(true);
    try {
      if (tipoMedio === 'link') {
        if (!urlLink.trim()) return;
        if (tipo === 'etapa') {
          await evidenciasApi.registrarLinkEtapa(id, urlLink.trim(), { categoria, notas });
        } else {
          await evidenciasApi.registrarLinkAccion(id, urlLink.trim(), { categoria, notas });
        }
      } else {
        if (!archivo) return;
        if (tipo === 'etapa') {
          await evidenciasApi.subirEvidenciaEtapa(id, archivo, { categoria, notas });
        } else {
          await evidenciasApi.subirEvidenciaAccion(id, archivo, { categoria, notas });
        }
      }
      resetForm();
      onRecargar?.();
    } catch (err) {
      console.error('Error subiendo evidencia:', err);
    } finally {
      setSubiendo(false);
    }
  }

  function iconoParaTipo(ev) {
    if (ev.tipo_medio === 'link') return <Link2 size={13} className="text-blue-500 flex-shrink-0" />;
    const cat = ev.categoria || '';
    if (cat.includes('Foto')) return <span className="text-xs">📷</span>;
    if (cat.includes('Video')) return <span className="text-xs">🎬</span>;
    if (cat.includes('Audio')) return <span className="text-xs">🎵</span>;
    if (cat.includes('Capa') || cat.includes('geográfica')) return <span className="text-xs">🗺️</span>;
    if (cat.includes('Repositorio')) return <span className="text-xs">💻</span>;
    return <FileText size={13} className="text-gray-400 flex-shrink-0" />;
  }

  // ─── Detalle de una evidencia ───
  if (detalleEv) {
    const esLink = detalleEv.tipo_medio === 'link';
    return (
      <div className="p-3 space-y-3">
        <button onClick={() => setDetalleEv(null)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
          <ChevronRight size={12} className="rotate-180" /> Volver a la lista
        </button>
        <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-2">
          <div className="flex items-start gap-2">
            {iconoParaTipo(detalleEv)}
            <div className="flex-1 min-w-0">
              {esLink ? (
                <a href={detalleEv.url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline break-all">
                  {detalleEv.url}
                </a>
              ) : (
                <p className="text-sm font-medium text-gray-800 truncate">{detalleEv.nombre_original || detalleEv.nombre_archivo}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mt-2">
            <div><span className="text-gray-400">Categoría:</span> <span className="text-gray-700 font-medium">{detalleEv.categoria}</span></div>
            <div><span className="text-gray-400">Tipo:</span> <span className="text-gray-700 font-medium">{esLink ? 'Enlace externo' : 'Archivo'}</span></div>
            <div><span className="text-gray-400">Subido por:</span> <span className="text-gray-700 font-medium">{detalleEv.autor_nombre || '—'}</span></div>
            <div><span className="text-gray-400">Fecha:</span> <span className="text-gray-700 font-medium">
              {detalleEv.created_at ? new Date(detalleEv.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
            </span></div>
            <div><span className="text-gray-400">Hora:</span> <span className="text-gray-700 font-medium">
              {detalleEv.created_at ? new Date(detalleEv.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—'}
            </span></div>
            {!esLink && detalleEv.tamano_bytes && (
              <div><span className="text-gray-400">Tamaño:</span> <span className="text-gray-700 font-medium">
                {detalleEv.tamano_bytes > 1048576
                  ? `${(detalleEv.tamano_bytes / 1048576).toFixed(1)} MB`
                  : `${(detalleEv.tamano_bytes / 1024).toFixed(0)} KB`}
              </span></div>
            )}
          </div>
          {detalleEv.notas && (
            <div className="mt-1 border-t border-gray-100 pt-1.5">
              <span className="text-[10px] text-gray-400 uppercase">Notas:</span>
              <p className="text-xs text-gray-600 mt-0.5">{detalleEv.notas}</p>
            </div>
          )}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            {esLink ? (
              <a href={detalleEv.url} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">
                <Link2 size={12} /> Abrir enlace
              </a>
            ) : (
              <>
                <button onClick={() => setPreviewEv(detalleEv)}
                  className="flex items-center gap-1 px-3 py-1 bg-[#7B1C3E] text-white text-xs rounded hover:bg-[#5a1430]">
                  <FileText size={12} /> Vista previa
                </button>
                <a href={evidenciasApi.obtenerUrlDescarga(detalleEv.id)} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 px-3 py-1 border border-gray-300 text-gray-700 text-xs rounded hover:bg-gray-100">
                  <Upload size={12} className="rotate-180" /> Descargar
                </a>
              </>
            )}
            {!permisos?.esSoloLectura && (
              <button onClick={async () => {
                try { await evidenciasApi.eliminarEvidencia(detalleEv.id); setDetalleEv(null); onRecargar?.(); } catch {}
              }} className="flex items-center gap-1 px-3 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded">
                <Trash2 size={12} /> Eliminar
              </button>
            )}
          </div>
          {previewEv && <FilePreviewModal evidencia={previewEv} onClose={() => setPreviewEv(null)} />}
        </div>
      </div>
    );
  }

  // ─── Paso 1: Elegir categoría ───
  if (paso === 'paso1_categoria') {
    return (
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-gray-700">Paso 1: Tipo de evidencia</span>
          <button onClick={resetForm} className="text-[10px] text-gray-400 hover:text-gray-600">Cancelar</button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {CATEGORIAS_EVIDENCIA.map(cat => (
            <button
              key={cat.value}
              onClick={() => { setCategoria(cat.value); setPaso('paso2_medio'); }}
              className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg hover:border-[#7B1C3E] hover:bg-[#7B1C3E]/5 text-left transition-colors group"
            >
              <span className="text-base">{cat.icon}</span>
              <span className="text-xs text-gray-700 group-hover:text-[#7B1C3E] font-medium">{cat.value}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─── Paso 2: Archivo o Link ───
  if (paso === 'paso2_medio') {
    return (
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <button onClick={() => setPaso('paso1_categoria')} className="text-gray-400 hover:text-gray-600">
              <ChevronRight size={14} className="rotate-180" />
            </button>
            <span className="text-xs font-semibold text-gray-700">Paso 2: Subir evidencia</span>
          </div>
          <button onClick={resetForm} className="text-[10px] text-gray-400 hover:text-gray-600">Cancelar</button>
        </div>
        <div className="text-[10px] text-gray-500 bg-gray-50 rounded px-2 py-1">
          Categoría seleccionada: <strong className="text-gray-700">{categoria}</strong>
        </div>

        {/* Tipo: archivo o link */}
        {!tipoMedio && (
          <div className="flex gap-2">
            <button
              onClick={() => setTipoMedio('archivo')}
              className="flex-1 flex items-center justify-center gap-2 py-3 border border-gray-200 rounded-lg hover:border-[#7B1C3E] hover:bg-[#7B1C3E]/5 transition-colors"
            >
              <Upload size={16} className="text-gray-500" />
              <span className="text-xs font-medium text-gray-700">Subir archivo</span>
            </button>
            <button
              onClick={() => setTipoMedio('link')}
              className="flex-1 flex items-center justify-center gap-2 py-3 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
            >
              <Link2 size={16} className="text-gray-500" />
              <span className="text-xs font-medium text-gray-700">Pegar enlace</span>
            </button>
          </div>
        )}

        {/* Link input */}
        {tipoMedio === 'link' && (
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-gray-500 uppercase block mb-0.5">URL del enlace</label>
              <input
                value={urlLink}
                onChange={e => setUrlLink(e.target.value)}
                placeholder="https://..."
                className="text-xs border border-gray-200 rounded px-2 py-1.5 w-full focus:border-blue-400 outline-none"
                autoFocus
              />
            </div>
            <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              <AlertTriangle size={12} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-700 leading-relaxed">
                Asegúrese de que el enlace sea <strong>público</strong> o accesible para cualquiera que tenga el link, para que otros usuarios del sistema puedan abrirlo.
              </p>
            </div>
          </div>
        )}

        {/* File input */}
        {tipoMedio === 'archivo' && (
          <div>
            <label className="text-[10px] text-gray-500 uppercase block mb-0.5">Seleccionar archivo</label>
            <input
              type="file"
              onChange={e => setArchivo(e.target.files?.[0] || null)}
              className="text-xs w-full"
            />
            {archivo && (
              <p className="text-[10px] text-gray-500 mt-1">
                {archivo.name} — {archivo.size > 1048576 ? `${(archivo.size / 1048576).toFixed(1)} MB` : `${(archivo.size / 1024).toFixed(0)} KB`}
              </p>
            )}
          </div>
        )}

        {/* Notas */}
        {tipoMedio && (
          <>
            <div>
              <label className="text-[10px] text-gray-500 uppercase block mb-0.5">Notas o comentarios (opcional)</label>
              <textarea
                value={notas}
                onChange={e => setNotas(e.target.value)}
                placeholder="Descripción breve, contexto, observaciones..."
                rows={2}
                className="text-xs border border-gray-200 rounded px-2 py-1 w-full resize-none focus:border-[#7B1C3E] outline-none"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={enviar}
                disabled={subiendo || (tipoMedio === 'archivo' && !archivo) || (tipoMedio === 'link' && !urlLink.trim())}
                className="flex items-center gap-1 px-3 py-1.5 bg-[#7B1C3E] text-white text-xs rounded-lg hover:bg-[#5a1430] disabled:opacity-50 transition-colors"
              >
                {subiendo ? <Loader2 size={12} className="animate-spin" /> : (tipoMedio === 'link' ? <Link2 size={12} /> : <Upload size={12} />)}
                {subiendo ? 'Guardando...' : (tipoMedio === 'link' ? 'Registrar enlace' : 'Subir archivo')}
              </button>
              <button onClick={() => setTipoMedio(null)} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">
                Atrás
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ─── Lista de evidencias ───
  return (
    <div className="p-3">
      {evidencias.length > 0 && (
        <div className="space-y-0.5 mb-3">
          {evidencias.map(ev => {
            const esLink = ev.tipo_medio === 'link';
            return (
              <div
                key={ev.id}
                onClick={() => setDetalleEv(ev)}
                className="flex items-center gap-2 py-2 px-2.5 rounded-lg hover:bg-gray-50 cursor-pointer group transition-colors"
              >
                {iconoParaTipo(ev)}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-800 truncate group-hover:text-[#7B1C3E]">
                    {esLink ? ev.url : (ev.nombre_original || ev.nombre_archivo)}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] text-gray-400">{ev.autor_nombre || ''}</span>
                    {ev.created_at && (
                      <span className="text-[9px] text-gray-400">
                        {new Date(ev.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">{ev.categoria}</span>
                {!esLink && ev.tamano_bytes && (
                  <span className="text-[9px] text-gray-400">
                    {ev.tamano_bytes > 1048576 ? `${(ev.tamano_bytes / 1048576).toFixed(1)} MB` : `${(ev.tamano_bytes / 1024).toFixed(0)} KB`}
                  </span>
                )}
                {esLink && <Link2 size={10} className="text-blue-400" />}
              </div>
            );
          })}
        </div>
      )}
      {evidencias.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-4 italic">Sin evidencias adjuntas</p>
      )}

      {!permisos?.esSoloLectura && (
        <button
          onClick={() => setPaso('paso1_categoria')}
          className="flex items-center gap-1.5 text-xs text-[#7B1C3E] hover:text-[#5a1430] font-medium py-1.5"
        >
          <Plus size={12} /> Agregar evidencia
        </button>
      )}
    </div>
  );
}

// ─── Tab: Riesgos con edición inline ─────────────────────────
function RiesgoItem({ riesgo, soloLectura, onActualizado }) {
  const [editField, setEditField] = useState(null);
  const [tempVal, setTempVal] = useState('');

  async function guardar(campo, valor) {
    try {
      await actualizarRiesgo(riesgo.id, { [campo]: valor });
      onActualizado?.();
    } catch (err) { console.error(err); }
    setEditField(null);
  }

  function iniciarEdicion(campo, valorActual) {
    if (soloLectura) return;
    setEditField(campo);
    setTempVal(valorActual || '');
  }

  const NIVELES = ['Bajo', 'Medio', 'Alto', 'Crítico'];
  const ESTADOS_R = ['Abierto', 'En_mitigacion', 'Resuelto', 'Cerrado'];

  return (
    <div className="border border-gray-200 rounded-lg p-2.5 space-y-1.5 bg-white">
      <div className="flex items-start gap-2">
        <AlertTriangle size={12} className={`mt-0.5 flex-shrink-0 ${
          riesgo.nivel === 'Alto' || riesgo.nivel === 'Crítico' ? 'text-red-500' :
          riesgo.nivel === 'Medio' ? 'text-amber-500' : 'text-green-500'
        }`} />
        {editField === 'descripcion' ? (
          <textarea
            autoFocus
            value={tempVal}
            onChange={e => setTempVal(e.target.value)}
            onBlur={() => guardar('descripcion', tempVal)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); guardar('descripcion', tempVal); } if (e.key === 'Escape') setEditField(null); }}
            className="flex-1 text-xs border border-[#7B1C3E]/30 rounded px-1.5 py-0.5 resize-none outline-none focus:ring-1 focus:ring-[#7B1C3E]/20"
            rows={2}
          />
        ) : (
          <span
            onClick={() => iniciarEdicion('descripcion', riesgo.descripcion || riesgo.titulo)}
            className={`flex-1 text-xs text-gray-700 ${!soloLectura ? 'cursor-pointer hover:bg-gray-50 rounded px-1 -mx-1' : ''}`}
            title={!soloLectura ? 'Clic para editar' : undefined}
          >
            {riesgo.descripcion || riesgo.titulo}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 pl-5">
        {editField === 'nivel' ? (
          <select
            autoFocus
            value={tempVal}
            onChange={e => guardar('nivel', e.target.value)}
            onBlur={() => setEditField(null)}
            className="text-[10px] border border-[#7B1C3E]/30 rounded px-1 py-0.5 bg-white outline-none"
          >
            {NIVELES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        ) : (
          <span
            onClick={() => iniciarEdicion('nivel', riesgo.nivel)}
            className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
              riesgo.nivel === 'Alto' || riesgo.nivel === 'Crítico' ? 'bg-red-100 text-red-700' :
              riesgo.nivel === 'Medio' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
            } ${!soloLectura ? 'cursor-pointer hover:ring-1 hover:ring-gray-300' : ''}`}
            title={!soloLectura ? 'Clic para cambiar nivel' : undefined}
          >
            {riesgo.nivel}
          </span>
        )}
        {editField === 'estado' ? (
          <select
            autoFocus
            value={tempVal}
            onChange={e => guardar('estado', e.target.value)}
            onBlur={() => setEditField(null)}
            className="text-[10px] border border-[#7B1C3E]/30 rounded px-1 py-0.5 bg-white outline-none"
          >
            {ESTADOS_R.map(e => <option key={e} value={e}>{e.replace(/_/g, ' ')}</option>)}
          </select>
        ) : (
          <span
            onClick={() => iniciarEdicion('estado', riesgo.estado)}
            className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
              riesgo.estado === 'Cerrado' || riesgo.estado === 'Resuelto' ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-700'
            } ${!soloLectura ? 'cursor-pointer hover:ring-1 hover:ring-gray-300' : ''}`}
            title={!soloLectura ? 'Clic para cambiar estado' : undefined}
          >
            {(riesgo.estado || '').replace(/_/g, ' ')}
          </span>
        )}
      </div>
    </div>
  );
}

function TabRiesgos({ riesgos, tipo, id, onRecargar, permisos, proyectoId }) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [desc, setDesc] = useState('');
  const [nivel, setNivel] = useState('Medio');
  const [estadoR, setEstadoR] = useState('Abierto');
  const [guardando, setGuardando] = useState(false);

  async function crearRiesgoHandler() {
    if (!desc.trim() || guardando) return;
    setGuardando(true);
    try {
      await crearRiesgo({
        titulo: desc.trim().substring(0, 80),
        descripcion: desc.trim(),
        nivel,
        estado: estadoR,
        tipo: 'Riesgo',
        entidad_tipo: tipo === 'etapa' ? 'Etapa' : 'Accion',
        entidad_id: id,
      });
      setDesc(''); setNivel('Medio'); setEstadoR('Abierto'); setMostrarForm(false);
      onRecargar?.();
    } catch (err) {
      console.error('Error creando riesgo:', err);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="p-3">
      {riesgos.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {riesgos.map(r => (
            <RiesgoItem key={r.id} riesgo={r} soloLectura={permisos?.esSoloLectura} onActualizado={onRecargar} />
          ))}
        </div>
      )}
      {riesgos.length === 0 && !mostrarForm && (
        <p className="text-xs text-gray-400 text-center py-4 italic">Sin riesgos registrados</p>
      )}

      {!permisos?.esSoloLectura && !mostrarForm && (
        <button
          onClick={() => setMostrarForm(true)}
          className="flex items-center gap-1.5 text-xs text-[#7B1C3E] hover:text-[#5a1430] font-medium py-1"
        >
          <Plus size={12} /> Registrar riesgo
        </button>
      )}

      {mostrarForm && (
        <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
          <div>
            <label className="text-[10px] text-gray-500 uppercase block mb-0.5">Descripción</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Describe el riesgo..."
              rows={2}
              className="text-xs border border-gray-200 rounded px-2 py-1 w-full resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-500 uppercase block mb-0.5">Nivel</label>
              <select value={nivel} onChange={e => setNivel(e.target.value)}
                className="text-xs border border-gray-200 rounded px-1.5 py-1 w-full bg-white">
                {['Bajo', 'Medio', 'Alto', 'Crítico'].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase block mb-0.5">Estado</label>
              <select value={estadoR} onChange={e => setEstadoR(e.target.value)}
                className="text-xs border border-gray-200 rounded px-1.5 py-1 w-full bg-white">
                {['Abierto', 'En_mitigacion', 'Resuelto', 'Cerrado'].map(e => <option key={e} value={e}>{e.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={crearRiesgoHandler}
              disabled={!desc.trim() || guardando}
              className="flex items-center gap-1 px-3 py-1 bg-[#7B1C3E] text-white text-xs rounded hover:bg-[#5a1430] disabled:opacity-50"
            >
              {guardando ? <Loader2 size={12} className="animate-spin" /> : <AlertTriangle size={12} />}
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
            <button
              onClick={() => { setMostrarForm(false); setDesc(''); }}
              className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Comentarios ──────────────────────────────────────────
function TabComentarios({ comentarios, tipo, id, onRecargar }) {
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);

  async function enviarComentario() {
    if (!texto.trim() || guardando) return;
    setGuardando(true);
    try {
      await crearComentario({ entidad_tipo: tipo === 'etapa' ? 'Etapa' : 'Accion', entidad_id: id, contenido: texto.trim() });
      setTexto('');
      onRecargar?.();
    } catch (err) {
      console.error(err);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="p-3 flex flex-col h-full">
      <div className="flex-1 space-y-2 overflow-y-auto mb-3">
        {comentarios.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4 italic">Sin comentarios</p>
        )}
        {comentarios.map(c => (
          <div key={c.id} className="bg-gray-50 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-5 h-5 rounded-full bg-[#7B1C3E] flex items-center justify-center text-white text-[8px] font-bold">
                {(c.autor_nombre || 'U')[0]}
              </div>
              <span className="text-[10px] font-medium text-gray-700">{c.autor_nombre || 'Usuario'}</span>
              <span className="text-[9px] text-gray-400 ml-auto">
                {c.created_at ? new Date(c.created_at).toLocaleString('es-MX') : ''}
              </span>
            </div>
            <p className="text-xs text-gray-600">{c.contenido || c.texto}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-2 border-t border-gray-100 pt-2">
        <input
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') enviarComentario(); }}
          placeholder="Escribir comentario..."
          className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:border-[#7B1C3E] outline-none"
          disabled={guardando}
        />
        <button
          onClick={enviarComentario}
          disabled={!texto.trim() || guardando}
          className="px-3 py-1.5 bg-[#7B1C3E] text-white text-xs rounded-lg hover:bg-[#5a1430] disabled:opacity-50 transition-colors"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}

// ─── Utilidades ────────────────────────────────────────────────
function buscarNodoEnArbol(arbol, id) {
  for (const etapa of arbol) {
    if (etapa.id === id) return { tipo: 'etapa', id: etapa.id, data: etapa };
    for (const acc of (etapa.acciones || [])) {
      if (acc.id === id) return { tipo: 'accion', id: acc.id, data: acc };
      for (const tarea of (acc.tareas || [])) {
        if (tarea.id === id) return { tipo: 'tarea', id: tarea.id, data: tarea };
      }
    }
  }
  return null;
}

function encontrarPath(arbol, targetId) {
  for (const etapa of arbol) {
    if (etapa.id === targetId) return [etapa.id];
    for (const acc of (etapa.acciones || [])) {
      if (acc.id === targetId) return [etapa.id, acc.id];
      for (const tarea of (acc.tareas || [])) {
        if (tarea.id === targetId) return [etapa.id, acc.id, tarea.id];
      }
    }
  }
  return null;
}
