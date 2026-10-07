/**
 * ARCHIVO: index.jsx
 * PROPÓSITO: Vista maestro-detalle "Detalle" — árbol izquierdo (navegación
 *            pura, institucional) + panel derecho con la ficha completa
 *            del nodo seleccionado. Orquesta la carga del árbol, filtros,
 *            selección de nodo y sincronía con la URL (?foco=&nodo=). El
 *            resto de las piezas viven en archivos separados en esta
 *            misma carpeta.
 *
 * Fase 1 del rediseño de Detalle (de 3 columnas a 2): antes existían dos
 * conceptos separados, "foco" (la rama que mostraba la columna central) y
 * "selección" (el elemento cuya ficha mostraba el rail derecho, que podía
 * ser un descendiente del foco sin cambiarlo) — el mismo nodo se describía
 * dos veces en pantalla (nombre, ruta y avance duplicados), que es la
 * causa real de que la vista se sintiera abrumadora. Con la columna
 * central retirada (su lista de hijos no ofrecía nada que el árbol no
 * tuviera ya — ver commit de esta fase) no hace falta la distinción: un
 * clic en el árbol o en la ruta clicable de la ficha selecciona un único
 * nodo, que es a la vez lo que se ve a la izquierda resaltado y lo que se
 * ve a la derecha completo.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, X, SlidersHorizontal, CheckCircle2, Filter, Layers, Search, ChevronsDown, ChevronsUp } from 'lucide-react';
import * as etapasApi from '../../../api/etapas';
import * as miembrosApi from '../../../api/miembros';
import { useUI } from '../../../context/UIContext';
import { useAuth } from '../../../context/AuthContext';
import { usePanelWidth } from '../../../hooks/usePanelWidth';
import { NIVELES } from '../../../config/niveles';
import { COLORES_SEMAFORO, LEYENDA_SEMAFORO } from '../../common/SemaforoDot';
import ResizeHandle from '../../common/ResizeHandle';
import NodoArbol from './NodoArbol';
import PanelDetalle from './PanelDetalle';
import CrearInline from './CrearInline';
import { ESTADOS, filtrarArbol, buscarNodoEnArbol, encontrarPath, recorrerArbol } from './utils';

export default function EtapasAvancesMD({ proyectoId, proyecto, permisos, dgSeleccionada, onStatsChange }) {
  const { mostrarToast } = useUI();
  const { usuario } = useAuth();
  // Ancho del árbol izquierdo, redimensionable — el árbol no existe en
  // Diagrama, así que no hay nada que homologar con él (key propia).
  const [anchoArbol, ajustarAnchoArbol] = usePanelWidth(
    `pspp_ancho_arbol_${usuario?.id || 'anon'}`, { default: 360, min: 260, max: 520 }
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const [arbol, setArbol] = useState([]);
  const [cargando, setCargando] = useState(true);
  // Miembros del PROYECTO (proyecto_usuarios) — separado del árbol: una
  // persona puede ser responsable/colaboradora del proyecto entero sin
  // estar etiquetada nodo por nodo en ningún `nodo_miembros` — ver el
  // filtro de usuario más abajo.
  const [miembrosProyecto, setMiembrosProyecto] = useState([]);
  // Único concepto de selección (antes "foco" + "selección" separados —
  // ver nota de cabecera). {tipo, id, data}.
  const [seleccion, setSeleccion] = useState(null);
  const [expandidos, setExpandidos] = useState(new Set());

  // Panel del árbol (hamburger en pantallas < lg, 1024px — el umbral
  // exacto que pidió el encargo para colapsar a un botón "Estructura")
  const [treePanelAbierto, setTreePanelAbierto] = useState(false);

  // Buscador del árbol — filtra por nombre, mismo criterio simple que el
  // resto de la app (incluye texto, sin acentos exactos). Los ancestros
  // de cualquier coincidencia se conservan (para no perder el contexto
  // de dónde vive) y se auto-expanden.
  const [busquedaArbol, setBusquedaArbol] = useState('');

  // Filtros del árbol
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [filtroDG, setFiltroDG] = useState(dgSeleccionada || '');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [filtroRiesgo, setFiltroRiesgo] = useState('');
  const [filtroVencido, setFiltroVencido] = useState(false);
  const filtrosActivos = [filtroDG, filtroEstado, filtroUsuario, filtroRiesgo].filter(Boolean).length + (filtroVencido ? 1 : 0);

  // Atajo "Ver lo vencido" de la Portada (?vencido=1): aplica el filtro de
  // vencidas de una vez al llegar, en vez de dejar el árbol completo sin
  // filtrar — se consume y limpia de la URL para no quedar "pegado" si el
  // usuario luego lo quita a mano y recarga.
  useEffect(() => {
    if (searchParams.get('vencido') === '1') {
      setFiltroVencido(true);
      setMostrarFiltros(true);
      setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete('vencido'); return p; }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Atajo "Registrar avance" de la Portada (?avance=1): si ya hay un nodo
  // seleccionado (deep-link con ?nodo=), abre el modal de avance directo
  // para él. Si no hay ninguno, el panel derecho muestra abajo un
  // selector explícito en vez del mensaje genérico "Selecciona un
  // elemento" — ver mostrarBuscadorAvance.
  const avanceSolicitado = searchParams.get('avance') === '1';
  const [abrirAvanceParaId, setAbrirAvanceParaId] = useState(null);
  useEffect(() => {
    if (avanceSolicitado && seleccion && abrirAvanceParaId !== seleccion.id) {
      setAbrirAvanceParaId(seleccion.id);
      setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete('avance'); return p; }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avanceSolicitado, seleccion]);

  function elegirNodoParaAvance(tipo, id, data) {
    irANodo(tipo, id, data);
    setAbrirAvanceParaId(id);
    setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete('avance'); return p; }, { replace: true });
  }

  // Resultados del buscador "¿A qué elemento quieres registrarle avance?"
  // (solo se usa cuando se llega con ?avance=1 y todavía no hay nada
  // seleccionado) — búsqueda plana por nombre en todo el árbol.
  const [busquedaAvance, setBusquedaAvance] = useState('');
  const resultadosBusquedaAvance = useMemo(() => {
    const q = busquedaAvance.trim().toLowerCase();
    if (q.length < 2) return [];
    const resultados = [];
    for (const etapa of arbol) {
      if (etapa.nombre?.toLowerCase().includes(q)) resultados.push({ tipo: 'etapa', id: etapa.id, data: etapa, etiqueta: etapa.nombre });
      for (const accion of (etapa.acciones || [])) {
        if (accion.nombre?.toLowerCase().includes(q)) resultados.push({ tipo: 'accion', id: accion.id, data: accion, etiqueta: accion.nombre });
        for (const tarea of (accion.tareas || [])) {
          if (tarea.nombre?.toLowerCase().includes(q)) resultados.push({ tipo: 'tarea', id: tarea.id, data: tarea, etiqueta: tarea.nombre });
        }
        for (const sub of (accion.subacciones || [])) {
          if (sub.nombre?.toLowerCase().includes(q)) resultados.push({ tipo: 'accion', id: sub.id, data: sub, etiqueta: sub.nombre });
          for (const tarea of (sub.tareas || [])) {
            if (tarea.nombre?.toLowerCase().includes(q)) resultados.push({ tipo: 'tarea', id: tarea.id, data: tarea, etiqueta: tarea.nombre });
          }
        }
      }
    }
    return resultados.slice(0, 8);
  }, [arbol, busquedaAvance]);

  // DGs únicas derivadas del árbol (responsable de cada nodo)
  const dgsEnArbol = useMemo(() => {
    const mapa = new Map();
    recorrerArbol(arbol, n => {
      if (n.responsable_dg_id) mapa.set(n.responsable_dg_id, n.responsable_dg_siglas || String(n.responsable_dg_id));
    });
    return Array.from(mapa.entries()).map(([id, siglas]) => ({ id, siglas })).sort((a, b) => a.siglas.localeCompare(b.siglas));
  }, [arbol]);

  // IDs de quienes son responsable/colaborador del PROYECTO completo
  // (no de un nodo puntual) — alguien así se cuenta como "de todo el
  // árbol" al filtrar: no tiene sentido pedirle que además esté
  // etiquetado nodo por nodo para que el filtro lo encuentre.
  const idsMiembrosProyecto = useMemo(() => new Set(
    miembrosProyecto.filter(m => m.estado === 'aceptada').map(m => String(m.id_usuario))
  ), [miembrosProyecto]);

  // Personas para el selector desplegable de "Usuario/Nombre": responsable
  // principal o colaborador de CUALQUIER nodo del árbol, más quien
  // participa a nivel de todo el proyecto (proyecto_usuarios) aunque no
  // tenga ninguna etiqueta puntual en `nodo_miembros`.
  const personasEnArbol = useMemo(() => {
    const mapa = new Map();
    recorrerArbol(arbol, n => {
      if (n.id_responsable) mapa.set(n.id_responsable, n.responsable_nombre || 'Sin nombre');
      (n.colaboradores || []).forEach(c => mapa.set(c.id, c.nombre || 'Sin nombre'));
    });
    miembrosProyecto.forEach(m => {
      if (m.estado === 'aceptada') mapa.set(m.id_usuario, m.nombre_completo || 'Sin nombre');
    });
    return Array.from(mapa.entries()).map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [arbol, miembrosProyecto]);

  // Árbol filtrado (client-side: estado, usuario, DG de responsable y riesgo).
  const usuarioEsDeTodoElProyecto = !!filtroUsuario && idsMiembrosProyecto.has(String(filtroUsuario));
  const usuarioParaFiltrar = usuarioEsDeTodoElProyecto ? '' : filtroUsuario;
  const arbolFiltrado = useMemo(() => {
    if (!filtroEstado && !usuarioParaFiltrar && !filtroDG && !filtroRiesgo && !filtroVencido) return arbol;
    return filtrarArbol(arbol, filtroEstado, usuarioParaFiltrar, filtroDG, filtroRiesgo, filtroVencido);
  }, [arbol, filtroEstado, usuarioParaFiltrar, filtroDG, filtroRiesgo, filtroVencido]);

  // Buscador por nombre — se aplica DESPUÉS de los filtros de arriba
  // (busca dentro de lo ya filtrado), conservando la cadena de ancestros
  // de cualquier coincidencia para no perder el contexto de dónde vive.
  const arbolVisible = useMemo(() => {
    const q = busquedaArbol.trim().toLowerCase();
    if (!q) return arbolFiltrado;
    return filtrarPorTexto(arbolFiltrado, q);
  }, [arbolFiltrado, busquedaArbol]);

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

  // Miembros del proyecto completo (para el selector de usuario) — carga
  // aparte y liviana (proyecto_usuarios), no depende del árbol.
  useEffect(() => {
    if (!proyectoId) return;
    let vivo = true;
    miembrosApi.listarMiembros(proyectoId)
      .then(res => { if (vivo) setMiembrosProyecto(res.datos || []); })
      .catch(() => { if (vivo) setMiembrosProyecto([]); });
    return () => { vivo = false; };
  }, [proyectoId]);

  // Auto-expandir todo cuando hay filtros o búsqueda activos
  useEffect(() => {
    if (filtroEstado || filtroUsuario || filtroDG || filtroRiesgo || filtroVencido || busquedaArbol.trim()) {
      const ids = new Set();
      recorrerArbol(arbolVisible, n => ids.add(n.id));
      setExpandidos(ids);
    }
  }, [filtroEstado, filtroUsuario, filtroDG, filtroRiesgo, filtroVencido, busquedaArbol, arbolVisible]);

  function limpiarFiltros() {
    setFiltroDG('');
    setFiltroEstado('');
    setFiltroUsuario('');
    setFiltroRiesgo('');
    setFiltroVencido(false);
  }

  function expandirTodo() {
    const ids = new Set();
    recorrerArbol(arbolVisible, n => ids.add(n.id));
    setExpandidos(ids);
  }
  function colapsarTodo() { setExpandidos(new Set()); }

  // Sincronizar selección con la URL (?foco=&nodo=, con ?foco= como
  // alias legacy de ?nodo= — ver DetalleProyectoLayout.jsx, que traduce
  // el formato viejo ?tab=&nodo=&riesgo=&foco= preservando ambos) — tanto
  // en la carga inicial como en cualquier deep-link posterior mientras
  // este componente sigue montado (Seguimiento/Panorama/Resumen conviven
  // en el mismo DetalleProyecto con CSS `hidden`, no con montaje
  // condicional, así que esto nunca se desmonta al cambiar de pestaña).
  useEffect(() => {
    if (arbol.length === 0) return;
    const id = searchParams.get('nodo') || searchParams.get('foco');
    if (!id) return;
    if (seleccion?.id === id) return;
    const encontrado = buscarNodoEnArbol(arbol, id);
    if (!encontrado) return;
    setSeleccion(encontrado);
    expandirHasta(encontrado, arbol);
  }, [arbol, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Único punto de entrada para seleccionar un nodo — desde el árbol (ya
  // trae tipo+id+data), o desde la ruta clicable de la ficha (solo id,
  // hay que resolver los datos en el árbol). Reemplaza lo que antes eran
  // 4 funciones separadas (irAFoco/seleccionarDesdeArbol/navegarFocoPorId/
  // seleccionarEnCentro) — con un solo concepto de selección ya no hace
  // falta distinguir "cambiar de rama" de "navegar dentro de la rama".
  function irANodo(tipo, id, data) {
    const nodo = data ? { tipo, id, data } : buscarNodoEnArbol(arbol, id);
    if (!nodo) return;
    setSeleccion(nodo);
    expandirHasta(nodo, arbol);
    setTreePanelAbierto(false);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('foco', nodo.id);
      next.set('nodo', nodo.id);
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

  async function recargar() {
    await cargarArbol(true);
    onStatsChange?.();
  }

  // Después de cargar el árbol, refrescar la selección con datos frescos.
  // Si el nodo seleccionado ya NO está en el árbol es que se eliminó: hay
  // que soltarlo (si no, `seleccion` se queda con una copia de datos ya
  // borrados) — se cae a la primera etapa que quede, o a nada si el
  // proyecto se quedó vacío.
  useEffect(() => {
    if (!seleccion || arbol.length === 0) return;
    const found = buscarNodoEnArbol(arbol, seleccion.id);
    if (found) {
      setSeleccion(found);
      return;
    }
    const primera = arbol[0];
    setSeleccion(primera ? { tipo: 'etapa', id: primera.id, data: primera } : null);
  }, [arbol]); // eslint-disable-line react-hooks/exhaustive-deps

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">Cargando estructura...</span>
      </div>
    );
  }

  // Sin alto forzado (ni fijo ni medido con JS): el alto lo determina el
  // contenido, igual que Vista lista y Cronograma.
  return (
    <div className="flex gap-0 border border-gray-200 rounded-xl overflow-hidden bg-white">
      {/* Overlay para árbol en móvil */}
      {treePanelAbierto && (
        <div className="fixed inset-0 bg-black/20 z-20 lg:hidden" onClick={() => setTreePanelAbierto(false)} />
      )}

      {/* ─── Panel izquierdo: Árbol ─── */}
      <div
        style={{ '--ancho-arbol': `${anchoArbol}px` }}
        className={[
          'flex-shrink-0 border-r border-gray-200 flex flex-col bg-white',
          'lg:w-[var(--ancho-arbol)] lg:relative lg:translate-x-0',
          treePanelAbierto
            ? 'fixed left-0 top-0 bottom-0 w-80 z-30 shadow-2xl translate-x-0'
            : 'fixed left-0 top-0 bottom-0 w-80 z-30 -translate-x-full lg:translate-x-0',
          'transition-transform duration-200',
        ].join(' ')}>
        {/* Cabecera */}
        <div className="px-3 py-2.5 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Estructura del proyecto</h3>
            <p className="text-[10px] text-gray-400">{arbol.length} etapa{arbol.length === 1 ? '' : 's'}</p>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={() => setTreePanelAbierto(false)}
              className="lg:hidden p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100"
              title="Cerrar"
            >
              <X size={13} />
            </button>
            <button onClick={expandirTodo} title="Expandir todo" className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100">
              <ChevronsDown size={13} />
            </button>
            <button onClick={colapsarTodo} title="Colapsar todo" className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100">
              <ChevronsUp size={13} />
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

        {/* Buscador — filtra por nombre, conserva ancestros de cada coincidencia */}
        <div className="px-3 py-2 border-b border-gray-200 flex-shrink-0">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
            <input
              type="text"
              value={busquedaArbol}
              onChange={e => setBusquedaArbol(e.target.value)}
              placeholder="Buscar en la estructura…"
              className="w-full text-xs border border-gray-200 rounded-md pl-7 pr-2 py-1.5 bg-white focus:outline-none focus:border-guinda-300"
            />
          </div>
        </div>

        {/* Panel de filtros */}
        {mostrarFiltros && (
          <div className="px-2.5 py-2 border-b border-gray-200 bg-gray-50/60 space-y-1.5 flex-shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Filtros</span>
              {filtrosActivos > 0 && (
                <button onClick={limpiarFiltros} className="text-[10px] text-guinda-500 hover:text-guinda-700 font-medium">Limpiar</button>
              )}
            </div>

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

            {personasEnArbol.length > 0 && (
              <div>
                <label className="text-[10px] text-gray-400 font-medium uppercase tracking-wide block mb-0.5">Usuario / Nombre</label>
                <select
                  value={filtroUsuario}
                  onChange={e => setFiltroUsuario(e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:border-guinda-300"
                >
                  <option value="">Todos los usuarios</option>
                  {personasEnArbol.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-[10px] text-gray-400 font-medium uppercase tracking-wide block mb-0.5">Riesgos</label>
              <select
                value={filtroRiesgo}
                onChange={e => setFiltroRiesgo(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:border-guinda-300"
              >
                <option value="">Todas</option>
                <option value="con">Con riesgo abierto</option>
                <option value="sin">Sin riesgo abierto</option>
              </select>
            </div>

            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={filtroVencido}
                onChange={e => setFiltroVencido(e.target.checked)}
                className="rounded border-gray-300 text-guinda-600 focus:ring-guinda-400"
              />
              Solo vencidas
            </label>
          </div>
        )}

        {/* Árbol — listado institucional, filas de ancho completo */}
        <div className="flex-1 overflow-y-auto" role="tree" aria-label="Estructura del proyecto">
          {arbolVisible.length === 0 ? (
            (filtrosActivos > 0 || busquedaArbol.trim()) ? (
              <div className="text-center py-8 px-3">
                <Filter size={20} className="mx-auto mb-2 text-gray-300" />
                <p className="text-xs text-gray-400">Sin resultados.</p>
                <button onClick={() => { limpiarFiltros(); setBusquedaArbol(''); }} className="mt-2 text-xs text-guinda-500 hover:text-guinda-700 font-medium">Limpiar búsqueda y filtros</button>
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-8">Sin etapas. Crea la primera.</p>
            )
          ) : (
            arbolVisible.map(etapa => (
              <NodoArbol
                key={etapa.id}
                nodo={etapa}
                tipo="etapa"
                expandidos={expandidos}
                seleccionadoId={seleccion?.id}
                onToggle={toggleExpandir}
                onSelect={irANodo}
              />
            ))
          )}
        </div>

        {/* Pie: leyenda del semáforo — texto importado de la misma fuente
            que usa el cálculo real (SemaforoDot/LEYENDA_SEMAFORO), no
            redactado aparte, para que nunca pueda desincronizarse de la
            regla real. */}
        <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 px-3 py-1.5 border-t border-gray-200 bg-gray-50/60 text-[9px] text-gray-500 flex-shrink-0">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORES_SEMAFORO.verde }} />{LEYENDA_SEMAFORO.verde}</span>
          <span className="flex items-center gap-1"><CheckCircle2 size={9} className="text-emerald-600 flex-shrink-0" />Completada</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORES_SEMAFORO.ambar }} />{LEYENDA_SEMAFORO.ambar}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORES_SEMAFORO.rojo }} />{LEYENDA_SEMAFORO.rojo}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full flex-shrink-0 border border-gray-300" style={{ backgroundColor: COLORES_SEMAFORO.gris }} />{LEYENDA_SEMAFORO.gris}</span>
        </div>
      </div>

      <ResizeHandle lado="derecho" label="Redimensionar árbol" onResize={ajustarAnchoArbol} />

      {/* ─── Panel derecho: ficha completa del nodo seleccionado ─── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {!seleccion && (
          <button
            onClick={() => setTreePanelAbierto(v => !v)}
            className="lg:hidden flex items-center gap-2 px-4 py-2 text-xs text-gray-500 border-b border-gray-100 hover:bg-gray-50"
          >
            <Layers size={13} />
            <span>Ver estructura</span>
          </button>
        )}
        {!seleccion ? (
          avanceSolicitado ? (
            <div className="flex-1 flex items-center justify-center text-gray-500 px-6">
              <div className="w-full max-w-sm text-center">
                <Layers size={32} className="mx-auto mb-3 text-guinda-300" />
                <p className="text-sm font-semibold text-gray-700 mb-0.5">¿A qué elemento quieres registrarle avance?</p>
                <p className="text-xs text-gray-400 mb-3">Busca una etapa, acción o tarea por su nombre.</p>
                <input
                  autoFocus
                  type="text"
                  value={busquedaAvance}
                  onChange={e => setBusquedaAvance(e.target.value)}
                  placeholder="Escribe para buscar…"
                  className="w-full h-9 px-3 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-guinda-300 text-left"
                />
                {resultadosBusquedaAvance.length > 0 && (
                  <ul className="mt-2 border border-gray-200 rounded-lg overflow-hidden text-left divide-y divide-gray-100">
                    {resultadosBusquedaAvance.map(r => (
                      <li key={r.id}>
                        <button
                          onClick={() => elegirNodoParaAvance(r.tipo, r.id, r.data)}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-guinda-50 transition-colors"
                        >
                          {r.etiqueta}
                          <span className="ml-1.5 text-[11px] text-gray-400">{NIVELES[r.tipo]?.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {busquedaAvance.trim().length >= 2 && resultadosBusquedaAvance.length === 0 && (
                  <p className="mt-2 text-xs text-gray-400">Sin resultados. También puedes elegir directamente desde el árbol.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <Layers size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Selecciona un elemento del árbol para ver su detalle</p>
              </div>
            </div>
          )
        ) : (
          <PanelDetalle
            key={seleccion.id}
            seleccion={seleccion}
            proyectoId={proyectoId}
            permisos={permisos}
            onActualizado={recargar}
            mostrarToast={mostrarToast}
            arbol={arbol}
            onNavegarNodo={irANodo}
            onAbrirArbol={() => setTreePanelAbierto(true)}
            riesgoAAbrir={searchParams.get('riesgo')}
            onRiesgoConsumido={() => setSearchParams(prev => {
              const next = new URLSearchParams(prev);
              next.delete('riesgo');
              return next;
            }, { replace: true })}
            avanceAAbrir={abrirAvanceParaId === seleccion.id}
          />
        )}
      </div>
    </div>
  );
}

// Filtra el árbol por texto de búsqueda, conservando la cadena de
// ancestros de cualquier coincidencia (un hijo que coincide mantiene a
// su padre visible, aunque el nombre del padre no coincida) — construye
// un árbol nuevo con los arreglos de hijos ya filtrados en cada nivel,
// no solo decide si mostrar la rama completa o no (eso dejaría pasar
// hermanos sin relación con la búsqueda).
function filtrarPorTexto(etapas, q) {
  // Si el propio nodo coincide, se conserva ENTERO tal cual (todos sus
  // descendientes, sin seguir filtrando hacia abajo) — buscar "Etapa 1" y
  // perder la mitad de sus acciones porque sus nombres no contienen el
  // texto sería un resultado incorrecto, no uno más preciso.
  function filtrarAccion(acc) {
    if (acc.nombre?.toLowerCase().includes(q)) return acc;
    const subacciones = (acc.subacciones || []).map(filtrarAccion).filter(Boolean);
    const tareas = (acc.tareas || []).filter(t => t.nombre?.toLowerCase().includes(q));
    if (subacciones.length === 0 && tareas.length === 0) return null;
    return { ...acc, subacciones, tareas };
  }
  return etapas.reduce((lista, etapa) => {
    if (etapa.nombre?.toLowerCase().includes(q)) { lista.push(etapa); return lista; }
    const acciones = (etapa.acciones || []).map(filtrarAccion).filter(Boolean);
    if (acciones.length > 0) lista.push({ ...etapa, acciones });
    return lista;
  }, []);
}
