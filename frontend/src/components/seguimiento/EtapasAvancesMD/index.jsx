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
import { Loader2, X, SlidersHorizontal, CheckCircle2, Filter, Layers } from 'lucide-react';
import * as etapasApi from '../../../api/etapas';
import * as miembrosApi from '../../../api/miembros';
import { useUI } from '../../../context/UIContext';
import { useAuth } from '../../../context/AuthContext';
import { usePanelWidth } from '../../../hooks/usePanelWidth';
import { NIVELES } from '../../../config/niveles';
import { COLORES_SEMAFORO } from '../../common/SemaforoDot';
import ResizeHandle from '../../common/ResizeHandle';
import NodoArbol from './NodoArbol';
import PanelDetalle from './PanelDetalle';
import CrearInline from './CrearInline';
import { ESTADOS, filtrarArbol, buscarNodoEnArbol, encontrarPath, recorrerArbol } from './utils';

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
  // Miembros del PROYECTO (proyecto_usuarios) — separado del árbol: una
  // persona puede ser responsable/colaboradora del proyecto entero sin
  // estar etiquetada nodo por nodo en ningún `nodo_miembros` — ver el
  // filtro de usuario más abajo.
  const [miembrosProyecto, setMiembrosProyecto] = useState([]);
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
  // enfocado (deep-link futuro con ?nodo=), abre el modal de avance
  // directo para él. Si no hay ninguno, el panel derecho muestra abajo un
  // selector explícito en vez del mensaje genérico "Selecciona un
  // elemento" — ver mostrarBuscadorAvance.
  const avanceSolicitado = searchParams.get('avance') === '1';
  const [abrirAvanceParaId, setAbrirAvanceParaId] = useState(null);
  useEffect(() => {
    if (avanceSolicitado && foco && abrirAvanceParaId !== foco.id) {
      setAbrirAvanceParaId(foco.id);
      setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete('avance'); return p; }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avanceSolicitado, foco]);

  function elegirNodoParaAvance(tipo, id, data) {
    seleccionarDesdeArbol(tipo, id, data);
    setAbrirAvanceParaId(id);
    setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete('avance'); return p; }, { replace: true });
  }

  // Resultados del buscador "¿A qué elemento quieres registrarle avance?"
  // (solo se usa cuando se llega con ?avance=1 y todavía no hay nada
  // enfocado) — búsqueda plana por nombre en todo el árbol, mismo criterio
  // simple que ya usa el buscador de proyectos del Header.
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
  // tenga ninguna etiqueta puntual en `nodo_miembros`. Antes era un input
  // de texto libre que solo comparaba contra `responsable_nombre` (y, por
  // error, también contra el nombre del propio nodo) — un colaborador (no
  // responsable principal) de cualquier nivel nunca coincidía, sin
  // importar qué se escribiera.
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
  // Si la persona elegida participa a nivel de TODO el proyecto, filtrar
  // por ella no debe restringir nada — se trata como "sin filtro de
  // usuario" y se dejan actuar solo los demás filtros activos.
  const usuarioEsDeTodoElProyecto = !!filtroUsuario && idsMiembrosProyecto.has(String(filtroUsuario));
  const usuarioParaFiltrar = usuarioEsDeTodoElProyecto ? '' : filtroUsuario;
  const arbolFiltrado = useMemo(() => {
    if (!filtroEstado && !usuarioParaFiltrar && !filtroDG && !filtroRiesgo && !filtroVencido) return arbol;
    return filtrarArbol(arbol, filtroEstado, usuarioParaFiltrar, filtroDG, filtroRiesgo, filtroVencido);
  }, [arbol, filtroEstado, usuarioParaFiltrar, filtroDG, filtroRiesgo, filtroVencido]);

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

  // Auto-expandir todo cuando hay filtros activos
  useEffect(() => {
    if (filtroEstado || filtroUsuario || filtroDG || filtroRiesgo || filtroVencido) {
      const ids = new Set();
      recorrerArbol(arbolFiltrado, n => ids.add(n.id));
      setExpandidos(ids);
    }
  }, [filtroEstado, filtroUsuario, filtroDG, filtroRiesgo, filtroVencido, arbolFiltrado]);

  function limpiarFiltros() {
    setFiltroDG('');
    setFiltroEstado('');
    setFiltroUsuario('');
    setFiltroRiesgo('');
    setFiltroVencido(false);
  }

  // Sincronizar foco/selección con la URL (?foco=&nodo=) — tanto en la
  // carga inicial como en cualquier deep-link posterior mientras este
  // componente sigue montado (Seguimiento/Panorama/Resumen conviven en el
  // mismo DetalleProyecto con CSS `hidden`, no con montaje condicional —
  // ver DetalleProyecto.jsx — así que EtapasAvancesMD nunca se desmonta al
  // cambiar de pestaña). Antes esto solo corría "la primera vez que el
  // árbol carga" (guardado con `if (foco) return`) — un clic en un riesgo
  // desde Panorama SÍ actualizaba la URL, pero como `foco` ya tenía algo
  // de la carga inicial, el efecto nunca volvía a correr y el panel se
  // quedaba mostrando el nodo de antes, no el del riesgo. Comparar contra
  // lo que YA está reflejado (en vez de "ya corrió alguna vez") deja
  // resincronizar en cada deep-link nuevo sin generar un loop con
  // irAFoco/seleccionarEnCentro, que escriben la URL DESPUÉS de haber
  // actualizado este mismo estado (por eso, cuando ellos disparan el
  // cambio, la comparación de abajo ya coincide y el efecto no repite).
  useEffect(() => {
    if (arbol.length === 0) return;
    const focoId = searchParams.get('foco') || searchParams.get('nodo');
    const nodoId = searchParams.get('nodo') || searchParams.get('foco');
    if (!focoId) return;
    if (foco?.id === focoId && seleccionId === nodoId) return;
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
  //
  // Si el nodo enfocado ya NO está en el árbol es que se eliminó (desde el
  // botón de la ficha, desde el Diagrama, o por otro usuario): hay que
  // soltarlo, porque `foco` guarda una copia de sus datos y el `seleccion`
  // de arriba cae de vuelta en él cuando no encuentra el id — sin esto el
  // centro y el rail se quedaban mostrando un elemento ya borrado. Se cae a
  // la primera etapa que quede, o a nada si el proyecto se quedó vacío.
  useEffect(() => {
    if (!foco || arbol.length === 0) return;
    const found = buscarNodoEnArbol(arbol, foco.id);
    if (found) {
      setFoco(found);
      return;
    }
    const primera = arbol[0];
    setFoco(primera ? { tipo: 'etapa', id: primera.id, data: primera } : null);
    setSeleccionId(null);
  }, [arbol]); // eslint-disable-line react-hooks/exhaustive-deps

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-gray-400" />
        <span className="ml-2 text-sm text-gray-500">Cargando estructura...</span>
      </div>
    );
  }

  // Sin alto forzado (ni fijo ni medido con JS): igual que Vista lista y
  // Cronograma, el alto lo determina el contenido — nada de "llenar el
  // viewport", que es justo lo que hacía sentir esto como una caja aparte
  // en vez de una sección más de la página que scrollea junto con todo.
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

            {/* Usuario — responsable o colaborador de cualquier nodo, lista
                desplegable en vez de texto libre (ver personasEnArbol). */}
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

            {/* Riesgos */}
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

            {/* Vencidas — mismo criterio que el punto rojo del árbol
                (semaforo_efectivo), no un campo nuevo que calcular aquí. */}
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
            riesgoAAbrir={searchParams.get('riesgo')}
            onRiesgoConsumido={() => setSearchParams(prev => {
              const next = new URLSearchParams(prev);
              next.delete('riesgo');
              return next;
            }, { replace: true })}
            avanceAAbrir={abrirAvanceParaId === foco.id}
          />
        )}
      </div>
    </div>
  );
}
