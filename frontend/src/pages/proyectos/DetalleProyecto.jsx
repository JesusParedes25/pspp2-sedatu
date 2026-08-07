/**
 * ARCHIVO: DetalleProyecto.jsx
 * PROPÓSITO: Página de detalle de un proyecto con tres pestañas principales
 *            (Seguimiento, Panorama del proyecto y Evidencias). Seguimiento
 *            tiene 5 subsecciones: Diagrama (default), Detalle, Vista lista,
 *            Mapa y Cronograma.
 *
 * MINI-CLASE: Pestañas + subsecciones como navegación interna
 * ─────────────────────────────────────────────────────────────────
 * "Seguimiento" es la pestaña por defecto al abrir un proyecto — es donde
 * se captura y da seguimiento día a día. "Panorama del proyecto" muestra un
 * dashboard con métricas calculadas de etapas, acciones, plazos y actividad
 * reciente, para consulta ejecutiva.
 *
 * Ya NO hay pestañas separadas de "Riesgos" ni "Comentarios":
 * - Los comentarios se hacen inline en cada etapa/acción (Facebook-style).
 * - Los riesgos se asignan por etapa con acción asociada.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useMemo, useCallback, useRef, Suspense, lazy } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Star, FileText, Settings, BarChart3, LayoutDashboard, Search, Pencil, FileSpreadsheet, Trash2, Table2, MapPin, GitBranch, Loader2, ChevronUp, ChevronDown } from 'lucide-react';
import { prefersReducedMotion } from '../../utils/motion';
import { useProyecto } from '../../hooks/useProyectos';
import { useEtapas } from '../../hooks/useEtapas';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { usePermisosProyecto } from '../../hooks/usePermisos';
import EstadoChip from '../../components/common/EstadoChip';
import SelectorEstado from '../../components/common/SelectorEstado';
import GanttCronograma from '../../components/seguimiento/GanttCronograma';
import PanoramaProyecto from '../../components/seguimiento/PanoramaProyecto';
import SelectorDG from '../../components/proyectos/SelectorDG';
import EvidenciaRow from '../../components/evidencias/EvidenciaRow';
import EmptyState from '../../components/common/EmptyState';
import ModalNuevaEtapa from '../../components/seguimiento/ModalNuevaEtapa';
import ModalNuevaAccion from '../../components/seguimiento/ModalNuevaAccion';
import ImportarWizard from '../../components/importar/ImportarWizard';
import EtapasAvancesMD from '../../components/seguimiento/EtapasAvancesMD';
// Carga diferida: @xyflow/react + d3-hierarchy son pesados y solo hacen
// falta cuando el usuario realmente abre la subpestaña Diagrama — así no
// engordan el bundle inicial del resto de la app.
const VistaDiagrama = lazy(() => import('../../components/seguimiento/VistaDiagrama'));
import ModalEditarProyecto from '../../components/proyectos/ModalEditarProyecto';
import ModalEliminarProyecto from '../../components/proyectos/ModalEliminarProyecto';
import VistaLista from '../../components/seguimiento/VistaLista';
import MapaProyecto from '../../components/seguimiento/MapaProyecto';
import GenerarReporteBtn from '../../components/reportes/GenerarReporteBtn';
import * as evidenciasApi from '../../api/evidencias';
import * as etapasApi from '../../api/etapas';
import * as accionesApi from '../../api/acciones';
import * as proyectosApi from '../../api/proyectos';

// Pestañas principales: Seguimiento (default), Panorama del proyecto, Evidencias
const PESTANAS = [
  { id: 'seguimiento', etiqueta: 'Seguimiento', icono: Settings },
  { id: 'resumen', etiqueta: 'Panorama del proyecto', icono: LayoutDashboard },
  { id: 'evidencias', etiqueta: 'Evidencias', icono: FileText },
];

// Subsecciones dentro de Seguimiento. Los `id` internos se mantienen sin
// cambio aunque se renombren las etiquetas visibles — nada los persiste en
// URL/localStorage hoy, pero es buena práctica no tocarlos de todos modos.
// Kanban y Checklist (y su código) se eliminaron por completo: llevaban
// tiempo ocultos y sin usar (ver historial de commits).
const SUBSECCIONES = [
  { id: 'etapas', etiqueta: 'Detalle', icono: Settings },
  { id: 'diagrama', etiqueta: 'Diagrama', icono: GitBranch },
  { id: 'lista', etiqueta: 'Vista lista', icono: Table2 },
  { id: 'mapa', etiqueta: 'Mapa', icono: MapPin },
  { id: 'cronograma', etiqueta: 'Cronograma', icono: BarChart3 },
];

function DescripcionColapsable({ texto, lineasColapsado = 2 }) {
  const [expandida, setExpandida] = useState(false);
  const refTexto = useRef(null);
  const [necesitaToggle, setNecesitaToggle] = useState(false);

  useEffect(() => {
    const el = refTexto.current;
    if (el) setNecesitaToggle(el.scrollHeight > el.clientHeight + 1);
  }, [texto]);

  return (
    <div className="mb-2">
      <p
        ref={refTexto}
        className="text-sm text-gray-500"
        style={expandida ? {} : { display: '-webkit-box', WebkitLineClamp: lineasColapsado, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
      >
        {texto}
      </p>
      {necesitaToggle && (
        <button
          type="button"
          onClick={() => setExpandida(v => !v)}
          className="text-xs text-guinda-600 hover:text-guinda-800 font-medium mt-0.5 cursor-pointer"
        >
          {expandida ? 'Ver menos' : 'Ver más'}
        </button>
      )}
    </div>
  );
}

export default function DetalleProyecto() {
  const { id } = useParams();
  const { usuario } = useAuth();
  const { mostrarToast } = useUI();
  const { proyecto, cargando, error, recargar: recargarProyecto } = useProyecto(id);
  const permisos = usePermisosProyecto(proyecto);
  const [dgSeleccionada, setDgSeleccionada] = useState(null);
  const { etapas, cargando: cargandoEtapas, recargar: recargarEtapas, recargarSilencioso: recargarEtapasSilencioso } = useEtapas(id, dgSeleccionada);
  const [searchParams, setSearchParams] = useSearchParams();
  // Deep-link desde Inicio/Panorama: ?tab=seguimiento&nodo=<id> debe abrir
  // directamente la pestaña y el nodo correspondiente. Seguimiento/Diagrama
  // son el punto de entrada por defecto — es donde se captura día a día.
  const [pestanaActiva, setPestanaActiva] = useState(() => searchParams.get('tab') || 'seguimiento');
  const [subseccionActiva, setSubseccionActiva] = useState('diagrama');

  // Encabezado contraíble por el usuario: arranca contraído la primera vez
  // (antes existía además una barra compacta que aparecía sola al hacer
  // scroll — quedó de más y se quitó: con el layout ahora acotado al alto
  // real del viewport, ver Layout.jsx, este encabezado ya no se desplaza
  // fuera de vista, así que ese mecanismo nunca podía dispararse). La
  // preferencia se recuerda por USUARIO, no por proyecto — así entrar a
  // otro proyecto respeta cómo lo dejó, sin depender de qué proyecto sea.
  const HEADER_EXPANDIDO_KEY = usuario?.id ? `pspp_header_proyecto_expandido_${usuario.id}` : null;
  const [headerExpandido, setHeaderExpandido] = useState(() => {
    if (!HEADER_EXPANDIDO_KEY) return false;
    try { return localStorage.getItem(HEADER_EXPANDIDO_KEY) === 'true'; } catch { return false; }
  });
  useEffect(() => {
    if (!HEADER_EXPANDIDO_KEY) return;
    try { localStorage.setItem(HEADER_EXPANDIDO_KEY, String(headerExpandido)); } catch {}
  }, [headerExpandido, HEADER_EXPANDIDO_KEY]);
  // Si el usuario navega de un proyecto a otro sin desmontar (mismo patrón de
  // ruta), el useState inicial no vuelve a correr — re-sincroniza con la URL.
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setPestanaActiva(tab);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link a un nodo específico (etapa/acción/tarea) desde Panorama:
  // cambia de pestaña y setea ?nodo=<id>, que EtapasAvancesMD ya sabe leer.
  function irANodo(nodoId) {
    setPestanaActiva('seguimiento');
    setSubseccionActiva('etapas');
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', 'seguimiento');
      next.set('nodo', nodoId);
      return next;
    });
  }

  // Modales
  const [modalEtapa, setModalEtapa] = useState(false);
  const [modalAccion, setModalAccion] = useState(null); // null = cerrado, 'proyecto' = directa, etapaId = en etapa
  const [modalCSV, setModalCSV] = useState(false);

  const navigate = useNavigate();

  // Modal de edición de proyecto
  const [modalEditar, setModalEditar] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  // Clave de refresco para el resumen — se incrementa en cada mutación relevante
  const [statsKey, setStatsKey] = useState(0);
  const incrementarStats = useCallback(() => setStatsKey(k => k + 1), []);

  // Datos de evidencias (carga bajo demanda)
  const [evidencias, setEvidencias] = useState([]);
  const [filtroEvidencias, setFiltroEvidencias] = useState({ busqueda: '', categoria: '', etapa: '' });

  // Cargar evidencias cuando se activa la pestaña
  useEffect(() => {
    if (!id || pestanaActiva !== 'evidencias') return;
    async function cargar() {
      try {
        const res = await evidenciasApi.obtenerEvidenciasProyecto(id);
        setEvidencias(res.datos || []);
      } catch (err) {
        console.error('Error cargando evidencias:', err);
      }
    }
    cargar();
  }, [id, pestanaActiva, statsKey]);

  // Filtrar evidencias en el cliente
  const evidenciasFiltradas = useMemo(() => {
    let resultado = evidencias;
    if (filtroEvidencias.busqueda) {
      const q = filtroEvidencias.busqueda.toLowerCase();
      resultado = resultado.filter(e =>
        e.nombre_original?.toLowerCase().includes(q) ||
        e.notas?.toLowerCase().includes(q) ||
        e.autor_nombre?.toLowerCase().includes(q)
      );
    }
    if (filtroEvidencias.categoria) {
      resultado = resultado.filter(e => e.categoria === filtroEvidencias.categoria);
    }
    if (filtroEvidencias.etapa) {
      resultado = resultado.filter(e => e.etapa_nombre === filtroEvidencias.etapa);
    }
    return resultado;
  }, [evidencias, filtroEvidencias]);

  const categoriasUnicas = useMemo(() => [...new Set(evidencias.map(e => e.categoria).filter(Boolean))], [evidencias]);
  const etapasUnicas = useMemo(() => [...new Set(evidencias.map(e => e.etapa_nombre).filter(Boolean))], [evidencias]);

  // ─── Handlers ──────────────────────────────────────────────
  async function crearEtapaHandler(datos) {
    try {
      await etapasApi.crearEtapa(id, datos);
      mostrarToast('Etapa creada exitosamente', 'exito');
      setModalEtapa(false);
      recargarEtapas();
      incrementarStats();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'Error al crear etapa', 'error');
    }
  }

  async function crearAccionHandler(datos) {
    try {
      if (modalAccion === 'proyecto') {
        await accionesApi.crearAccionEnProyecto(id, datos);
      } else {
        await accionesApi.crearAccionEnEtapa(modalAccion, datos);
      }
      mostrarToast('Acción creada exitosamente', 'exito');
      setModalAccion(null);
      recargarEtapas();
      cargarAccionesDirectas();
      incrementarStats();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'Error al crear acción', 'error');
    }
  }

  async function eliminarProyecto() {
    setEliminando(true);
    try {
      await proyectosApi.eliminarProyecto(id);
      mostrarToast('Proyecto eliminado', 'exito');
      navigate('/proyectos');
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'Error al eliminar', 'error');
      setEliminando(false);
      setConfirmandoEliminar(false);
    }
  }

  if (cargando) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/3" />
        <div className="h-4 bg-gray-200 rounded w-1/2" />
        <div className="h-48 bg-gray-200 rounded" />
      </div>
    );
  }

  if (error || !proyecto) {
    return (
      <EmptyState titulo="Proyecto no encontrado" subtitulo={error || 'El proyecto solicitado no existe o fue eliminado.'} />
    );
  }

  return (
    // h-full (llena a main, ya acotado en Layout.jsx) + flex-col: el
    // encabezado y las pestañas son flex-shrink-0 (su alto natural), y el
    // contenido de la pestaña activa es flex-1 min-h-0 — así "Detalle"
    // puede pedir h-full de verdad y quedarse exacto al espacio que
    // sobra, en vez de crecer a su alto de contenido y dejar franja vacía
    // debajo. Las demás subvistas (Diagrama, Vista lista, Mapa,
    // Cronograma) no cambian: si su contenido no cabe, este mismo
    // contenedor scrollea igual que antes hacía toda la página.
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header del proyecto — contraíble. En compacto (default): sin banda
          propia de "Volver a proyectos" (queda como ícono junto al título)
          y el selector de Direcciones comparte fila con los tags. En
          expandido (como estaba antes de este cambio): "Volver a
          proyectos" en su propia línea y el selector de Direcciones en su
          propia fila. El contenido es el mismo en ambos casos — solo
          cambia dónde vive cada pieza. */}
      <div className="flex-shrink-0">
        {/* "Volver a proyectos" como banda propia — solo expandido */}
        <div
          id="detalle-header-volver"
          className={`overflow-hidden ${prefersReducedMotion ? '' : 'transition-all duration-200'} ${headerExpandido ? 'max-h-8 opacity-100 mb-3' : 'max-h-0 opacity-0'}`}
        >
          <Link to="/proyectos" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-guinda-500 transition-colors">
            <ArrowLeft size={16} />
            Volver a proyectos
          </Link>
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-1.5 flex-1 min-w-0">
            {/* Mismo destino que el link de arriba, como ícono — visible
                solo cuando esa banda está contraída, para no duplicar. */}
            {!headerExpandido && (
              <Link
                to="/proyectos"
                title="Volver a proyectos"
                aria-label="Volver a proyectos"
                className="p-1 -ml-1 mt-1 text-gray-400 hover:text-guinda-500 rounded hover:bg-gray-50 transition-colors flex-shrink-0"
              >
                <ArrowLeft size={16} />
              </Link>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap mb-1">
                <h1 className="text-2xl font-bold text-gray-900">{proyecto.nombre}</h1>
                {proyecto.es_prioritario && <Star size={18} className="text-yellow-500 fill-yellow-500 flex-shrink-0" />}
                <span className="font-medium text-guinda-600 text-sm flex-shrink-0">
                  {proyecto.dg_lider_siglas}{proyecto.direccion_area_lider_siglas && ` / ${proyecto.direccion_area_lider_siglas}`}
                </span>
                <SelectorEstado
                  entidadTipo="Proyecto"
                  entidadId={proyecto.id}
                  estadoActual={proyecto.estado}
                  onCambio={() => { recargarProyecto(); incrementarStats(); }}
                  soloLectura={!permisos.puedeEditar}
                />
                <span className="text-sm text-gray-500 flex-shrink-0">{proyecto.tipo?.replace(/_/g, ' ')}</span>
                {proyecto.programa_clave && <span className="text-sm text-gray-400 flex-shrink-0">{proyecto.programa_clave}</span>}
                {/* Selector de Direcciones, fusionado en la fila de tags — solo compacto */}
                {!headerExpandido && proyecto.dgs && proyecto.dgs.length > 1 && (
                  <SelectorDG dgs={proyecto.dgs} dgSeleccionada={dgSeleccionada} onSeleccionar={setDgSeleccionada} />
                )}
              </div>
              {proyecto.descripcion && <DescripcionColapsable texto={proyecto.descripcion} lineasColapsado={1} />}
            </div>
          </div>

          {/* Botones Editar / Eliminar + contraer/expandir */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {permisos.puedeEditar && (
              <button onClick={() => setModalEditar(true)} className="btn-secondary text-sm flex items-center gap-1.5">
                <Pencil size={14} /> Editar
              </button>
            )}
            {permisos.puedeEliminar && (
              <button onClick={() => setConfirmandoEliminar(true)}
                className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-red-500 border border-red-200 hover:bg-red-50 transition-colors">
                <Trash2 size={14} /> Eliminar
              </button>
            )}
            <button
              type="button"
              onClick={() => setHeaderExpandido(v => !v)}
              aria-expanded={headerExpandido}
              aria-controls="detalle-header-volver detalle-header-dgs"
              title={headerExpandido ? 'Contraer encabezado' : 'Expandir encabezado'}
              className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 outline-none focus-visible:ring-2 focus-visible:ring-guinda-400 transition-colors"
            >
              {headerExpandido ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>

        {/* ─── Modal eliminar proyecto ─── */}
        {confirmandoEliminar && (
          <ModalEliminarProyecto
            proyecto={proyecto}
            eliminando={eliminando}
            onCerrar={() => setConfirmandoEliminar(false)}
            onConfirmar={eliminarProyecto}
          />
        )}

        {/* ─── Modal editar proyecto ─── */}
        {modalEditar && (
          <ModalEditarProyecto
            proyecto={proyecto}
            onCerrar={() => { setModalEditar(false); setConfirmandoEliminar(false); }}
            onGuardado={() => { mostrarToast('Proyecto actualizado', 'exito'); recargarProyecto(); incrementarStats(); }}
          />
        )}

        {/* Selector de Direcciones en su propia fila — solo expandido */}
        <div
          id="detalle-header-dgs"
          className={`overflow-hidden ${prefersReducedMotion ? '' : 'transition-all duration-200'} ${headerExpandido && proyecto.dgs && proyecto.dgs.length > 1 ? 'max-h-20 opacity-100 mt-3' : 'max-h-0 opacity-0'}`}
        >
          {proyecto.dgs && proyecto.dgs.length > 1 && (
            <SelectorDG dgs={proyecto.dgs} dgSeleccionada={dgSeleccionada} onSeleccionar={setDgSeleccionada} />
          )}
        </div>
      </div>

      {/* Pestañas principales */}
      <div className="flex-shrink-0 mt-6 border-b border-gray-200">
        <div className="flex gap-6">
          {PESTANAS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setPestanaActiva(tab.id)}
              className={`flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                pestanaActiva === tab.id
                  ? 'border-guinda-500 text-guinda-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icono size={16} />
              {tab.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido de la pestaña activa — flex-1 min-h-0: ocupa el resto
          del alto disponible. Panorama y Evidencias no lo necesitan (su
          contenido es naturalmente más corto o ya pagina), así que solo
          heredan el overflow-y-auto de este contenedor si algún día hace
          falta — Seguimiento es el único que lo aprovecha de verdad. */}
      <div className="flex-1 min-h-0 overflow-y-auto mt-6">
        {/* ═══ PESTAÑA PANORAMA DEL PROYECTO ═══ */}
        {pestanaActiva === 'resumen' && (
          <PanoramaProyecto proyecto={proyecto} etapas={etapas} proyectoId={id} refreshKey={statsKey} onNavegarNodo={irANodo} />
        )}

        {/* ═══ PESTAÑA SEGUIMIENTO ═══ */}
        {pestanaActiva === 'seguimiento' && (
          <div className="h-full flex flex-col">
            {/* Subsecciones de seguimiento, fusionadas con Importar/Reporte PDF
                en la misma banda — antes eran dos filas separadas y las
                subsecciones se estiraban a todo el ancho sin necesidad. */}
            <div className="flex-shrink-0 flex items-center gap-3 flex-wrap mb-4">
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1 flex-1 min-w-0">
                {SUBSECCIONES.map(sub => (
                  <button
                    key={sub.id}
                    onClick={() => setSubseccionActiva(sub.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-all flex-1 justify-center ${
                      subseccionActiva === sub.id
                        ? 'bg-white text-guinda-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <sub.icono size={14} />
                    <span className="hidden sm:inline">{sub.etiqueta}</span>
                  </button>
                ))}
              </div>
              {subseccionActiva === 'etapas' && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => setModalCSV(true)}
                    className="btn-secondary text-sm flex items-center gap-1.5">
                    <FileSpreadsheet size={14} /> Importar
                  </button>
                  <GenerarReporteBtn
                    proyectoId={id}
                    proyecto={proyecto}
                  />
                </div>
              )}
            </div>

            {/* Contenido de la subsección activa. "flex flex-col" (no solo
                flex-1 min-h-0): Detalle y Diagrama son los únicos que
                necesitan llenar el alto disponible de verdad, y lo hacen
                pidiendo flex-1 min-h-0 a SU VEZ sobre este contenedor — eso
                requiere que este sea un contenedor flex de columna (no un
                simple bloque), porque flex-grow se resuelve contra el
                espacio libre real del flex container, sin las ambigüedades
                de "height: 100%" contra un padre que no sea flex. Las demás
                subvistas no cambian: al no pedir flex-1, se siguen
                dimensionando por su contenido y, si no cabe, este mismo div
                deja que el overflow-y-auto de arriba scrollee, igual que
                scrolleaba toda la página antes. */}
            <div className="flex-1 min-h-0 flex flex-col">
              {/* 0. Diagrama — organigrama horizontal, solo lectura por ahora */}
              {subseccionActiva === 'diagrama' && (
                <Suspense fallback={
                  <div className="flex-1 min-h-0 flex items-center justify-center border border-gray-200 rounded-xl bg-white" style={{ minHeight: 400 }}>
                    <Loader2 size={24} className="animate-spin text-gray-400" />
                    <span className="ml-2 text-sm text-gray-500">Cargando diagrama...</span>
                  </div>
                }>
                  <VistaDiagrama proyectoId={id} permisos={permisos} />
                </Suspense>
              )}

              {/* 1. Etapas y avances — Maestro-Detalle (Importar/Reporte PDF ya
                  se muestran arriba, fusionados con la banda de subsecciones) */}
              {subseccionActiva === 'etapas' && (
                <EtapasAvancesMD
                  proyectoId={id}
                  proyecto={proyecto}
                  permisos={permisos}
                  dgSeleccionada={dgSeleccionada}
                  onStatsChange={() => { recargarEtapasSilencioso(); incrementarStats(); }}
                />
              )}

              {/* 2. Vista Lista (DataGrid) */}
              {subseccionActiva === 'lista' && (
                <VistaLista
                  etapas={etapas}
                  proyectoId={id}
                  onRefresh={() => { recargarEtapasSilencioso(); incrementarStats(); }}
                />
              )}

              {/* 3. Mapa de cobertura territorial */}
              {subseccionActiva === 'mapa' && (
                <MapaProyecto
                  proyectoId={id}
                  onNavegarEtapas={() => setSubseccionActiva('etapas')}
                />
              )}

              {/* 4. Cronograma (Gantt) */}
              {subseccionActiva === 'cronograma' && (
                <GanttCronograma
                  etapas={etapas}
                  fechaInicioProyecto={proyecto.fecha_inicio}
                  fechaFinProyecto={proyecto.fecha_limite}
                />
              )}
            </div>
          </div>
        )}

        {/* ═══ PESTAÑA EVIDENCIAS ═══ */}
        {pestanaActiva === 'evidencias' && (
          <div className="space-y-4">
            {/* Filtros de evidencias */}
            {evidencias.length > 0 && (
              <div className="card p-3 flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar por nombre, notas o autor..."
                    value={filtroEvidencias.busqueda}
                    onChange={e => setFiltroEvidencias(prev => ({ ...prev, busqueda: e.target.value }))}
                    className="input-base pl-9 text-sm h-9"
                  />
                </div>
                {categoriasUnicas.length > 1 && (
                  <select
                    value={filtroEvidencias.categoria}
                    onChange={e => setFiltroEvidencias(prev => ({ ...prev, categoria: e.target.value }))}
                    className="input-base text-sm h-9 w-auto"
                  >
                    <option value="">Todas las categorías</option>
                    {categoriasUnicas.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                {etapasUnicas.length > 1 && (
                  <select
                    value={filtroEvidencias.etapa}
                    onChange={e => setFiltroEvidencias(prev => ({ ...prev, etapa: e.target.value }))}
                    className="input-base text-sm h-9 w-auto"
                  >
                    <option value="">Todas las etapas</option>
                    {etapasUnicas.map(et => <option key={et} value={et}>{et}</option>)}
                  </select>
                )}
                {(filtroEvidencias.busqueda || filtroEvidencias.categoria || filtroEvidencias.etapa) && (
                  <button
                    onClick={() => setFiltroEvidencias({ busqueda: '', categoria: '', etapa: '' })}
                    className="text-xs text-guinda-500 hover:text-guinda-700 font-medium"
                  >
                    Limpiar
                  </button>
                )}
                <span className="text-xs text-gray-400 ml-auto">{evidenciasFiltradas.length} de {evidencias.length}</span>
              </div>
            )}

            {/* Lista filtrada */}
            <div className="space-y-2">
              {evidencias.length === 0 ? (
                <EmptyState icono={FileText} titulo="Sin evidencias" subtitulo="Las evidencias se suben desde las acciones de cada etapa." />
              ) : evidenciasFiltradas.length === 0 ? (
                <EmptyState icono={Search} titulo="Sin resultados" subtitulo="Ninguna evidencia coincide con los filtros aplicados." />
              ) : (
                evidenciasFiltradas.map(ev => <EvidenciaRow key={ev.id} evidencia={ev} />)
              )}
            </div>
          </div>
        )}
      </div>
      {/* ═══ MODALES ═══ */}
      {modalEtapa && (
        <ModalNuevaEtapa
          proyecto={proyecto}
          etapas={etapas}
          onGuardar={crearEtapaHandler}
          onCerrar={() => setModalEtapa(false)}
        />
      )}

      {modalAccion && (
        <ModalNuevaAccion
          proyecto={proyecto}
          etapaId={modalAccion === 'proyecto' ? null : modalAccion}
          onGuardar={crearAccionHandler}
          onCerrar={() => setModalAccion(null)}
        />
      )}

      {modalCSV && (
        <ImportarWizard
          proyectoId={id}
          onImportado={() => { recargarEtapas(); recargarProyecto(); incrementarStats(); }}
          onCerrar={() => setModalCSV(false)}
        />
      )}
    </div>
  );
}
