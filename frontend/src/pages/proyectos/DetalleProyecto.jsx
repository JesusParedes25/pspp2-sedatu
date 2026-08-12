/**
 * ARCHIVO: DetalleProyecto.jsx
 * PROPÓSITO: Página de detalle de un proyecto con tres pestañas principales
 *            (Seguimiento, Panorama del proyecto y Evidencias). Seguimiento
 *            tiene 5 subsecciones: Detalle (default), Diagrama, Vista lista,
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
import { ArrowLeft, Star, FileText, Settings, BarChart3, LayoutDashboard, Search, Pencil, FileSpreadsheet, Trash2, Table2, MapPin, GitBranch, Loader2, ChevronUp, ChevronDown, Copy } from 'lucide-react';
import { prefersReducedMotion } from '../../utils/motion';
import { useProyecto } from '../../hooks/useProyectos';
import { useEtapas } from '../../hooks/useEtapas';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { usePermisosProyecto, usePermisosGlobales } from '../../hooks/usePermisos';
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
import ModalDuplicarProyecto from '../../components/proyectos/ModalDuplicarProyecto';
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
  const { mostrarToast, sidebarAbierto } = useUI();
  const { proyecto, cargando, error, recargar: recargarProyecto } = useProyecto(id);
  const permisos = usePermisosProyecto(proyecto);
  const { puedeCrearProyecto } = usePermisosGlobales();
  const [dgSeleccionada, setDgSeleccionada] = useState(null);
  const { etapas, cargando: cargandoEtapas, recargar: recargarEtapas, recargarSilencioso: recargarEtapasSilencioso } = useEtapas(id, dgSeleccionada);
  const [searchParams, setSearchParams] = useSearchParams();
  // Deep-link desde Inicio/Panorama: ?tab=seguimiento&nodo=<id> debe abrir
  // directamente la pestaña y el nodo correspondiente. Seguimiento/Detalle
  // son el punto de entrada por defecto — es donde se captura día a día.
  const [pestanaActiva, setPestanaActiva] = useState(() => searchParams.get('tab') || 'seguimiento');
  const [subseccionActiva, setSubseccionActiva] = useState('etapas');

  // Encabezado compacto al hacer scroll: un sentinel justo debajo de "Volver
  // a proyectos" — cuando sale de vista, se muestra una barra fija de una
  // sola línea (título truncado + estatus) en su lugar, para no perder el
  // contexto sin gastar los ~170px del encabezado completo todo el tiempo.
  // Ref CALLBACK (no un useRef simple): mientras `cargando` es true, este
  // componente devuelve un esqueleto sin el sentinel real — con un useRef
  // normal el efecto de abajo mediría una sola vez con el ref en null y
  // nunca se volvería a disparar cuando el contenido real por fin monta,
  // dejando este comportamiento roto para siempre.
  //
  // El estado se decide con DOS observadores y una banda muerta entre
  // ellos (histéresis), no con uno solo. Con un único umbral, cualquier
  // cosa que desplace el layout aunque sea unos pocos píxeles al mostrar
  // la barra devuelve el sentinel a pantalla, el estado se revierte, el
  // layout vuelve, el sentinel sale... y la página "vibra" a la velocidad
  // de refresco. Ya pasó dos veces por caminos distintos: la barra siendo
  // `sticky` (aportaba su alto al flujo) y luego siendo hija del
  // contenedor `space-y-6` (aportaba 24px de gap aun sin alto propio).
  // Con la banda muerta, un desfase menor a BANDA_MUERTA_PX no puede
  // volver a cruzar el umbral contrario, así que el bucle es imposible
  // por construcción, venga el desplazamiento de donde venga.
  const BANDA_MUERTA_PX = 64;
  const sentinelElRef = useRef(null);
  const observersRef = useRef([]);
  const [headerCompacto, setHeaderCompacto] = useState(false);
  const desconectarObservers = () => {
    observersRef.current.forEach(o => o.disconnect());
    observersRef.current = [];
  };
  const sentinelHeaderRef = useCallback(node => {
    sentinelElRef.current = node;
    desconectarObservers();
    if (!node) return;
    // Compactar en cuanto el sentinel sale por arriba del viewport.
    const obsCompactar = new IntersectionObserver(
      ([entry]) => { if (!entry.isIntersecting) setHeaderCompacto(true); },
      { threshold: 0 }
    );
    // Volver al encabezado completo solo cuando el sentinel está de vuelta
    // bien dentro de la pantalla, no apenas asomando.
    const obsExpandir = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setHeaderCompacto(false); },
      { threshold: 0, rootMargin: `-${BANDA_MUERTA_PX}px 0px 0px 0px` }
    );
    obsCompactar.observe(node);
    obsExpandir.observe(node);
    observersRef.current = [obsCompactar, obsExpandir];
  }, []);
  useEffect(() => () => desconectarObservers(), []);

  // Encabezado contraíble por el usuario (distinto del "compacto por
  // scroll" de arriba): arranca contraído la primera vez, y la preferencia
  // se recuerda por USUARIO, no por proyecto — así entrar a otro proyecto
  // respeta cómo lo dejó, sin depender de qué proyecto sea.
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
  const [mostrarDuplicar, setMostrarDuplicar] = useState(false);
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
    <>
      {/* Barra compacta — solo visible cuando el encabezado completo ya
          salió de vista al hacer scroll.

          DOS cosas la mantienen fuera del layout, y hacen falta las dos:

          1. `fixed` (no `sticky`): sticky ocupa lugar en el flujo, así que
             aparecer empujaba ~37px hacia abajo todo lo que seguía.
          2. Fuera del `<div className="space-y-6">` de abajo. Aunque un
             elemento `fixed` no aporta altura, Tailwind pone
             `margin-top: 1.5rem` a todo hijo que NO sea el primero
             (`> * + *`): al montarse la barra como primer hijo, el header
             pasaba a ser el segundo y ganaba 24px de margen. La página
             crecía 24px con la barra puesta aunque la barra no midiera
             nada en el flujo.

          Cualquiera de las dos por separado deja vivo el bucle: la página
          crece → el sentinel que dispara este estado vuelve a entrar en
          pantalla → la barra se oculta → la página encoge → el sentinel
          sale → la barra aparece... alternando en cada cuadro. Se ve como
          la página vibrando arriba y abajo tras un solo click de rueda,
          con el scroll inmóvil (lo que se mueve es el contenido).

          Se posiciona contra el borde del contenido (el sidebar es fixed,
          w-64/w-16 según esté abierto).

          z-40 y no z-20: el panel del árbol de "Detalle" es `relative z-30`,
          así que con z-20 el contenido se pintaba ENCIMA de esta barra al
          pasarle por debajo al scrollear. Queda por debajo de modales y
          toasts (z-50), y del drawer del Diagrama (z-40 pero posterior en
          el DOM, así que gana él). */}
      {headerCompacto && (
        <div
          className="fixed top-0 right-0 z-40 px-6 py-2 bg-white border-b border-gray-200 shadow-sm flex items-center gap-2 transition-all duration-300"
          style={{ left: sidebarAbierto ? '16rem' : '4rem' }}
        >
          <span className="text-sm font-semibold text-gray-900 truncate">{proyecto.nombre}</span>
          <span className="text-xs text-gray-400 flex-shrink-0">{proyecto.estado?.replace(/_/g, ' ')}</span>
        </div>
      )}

      <div className="space-y-6">
      {/* Header del proyecto — contraíble. En compacto (default): sin banda
          propia de "Volver a proyectos" (queda como ícono junto al título)
          y el selector de Direcciones comparte fila con los tags. En
          expandido (como estaba antes de este cambio): "Volver a
          proyectos" en su propia línea y el selector de Direcciones en su
          propia fila. El contenido es el mismo en ambos casos — solo
          cambia dónde vive cada pieza. */}
      <div>
        <div ref={sentinelHeaderRef} />

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
            {/* Duplicar: el punto natural para pedirlo es estando parado en
                el proyecto que se quiere repetir. No exige permisos sobre
                ESTE proyecto — crea uno nuevo aparte y no toca el original —
                solo poder crear proyectos, que es lo que valida el backend. */}
            {puedeCrearProyecto && (
              <button onClick={() => setMostrarDuplicar(true)}
                title="Crear un proyecto nuevo con esta misma estructura"
                className="btn-secondary text-sm flex items-center gap-1.5">
                <Copy size={14} /> Duplicar
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

        {mostrarDuplicar && (
          <ModalDuplicarProyecto
            proyectoOrigen={proyecto}
            onCerrar={() => setMostrarDuplicar(false)}
            mostrarToast={mostrarToast}
            onDuplicado={(nuevo) => {
              setMostrarDuplicar(false);
              navigate(`/proyectos/${nuevo.id}?tab=seguimiento`);
            }}
          />
        )}

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
      <div className="border-b border-gray-200">
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

      {/* ═══ PESTAÑA PANORAMA DEL PROYECTO ═══ */}
      {pestanaActiva === 'resumen' && (
        <PanoramaProyecto proyecto={proyecto} etapas={etapas} proyectoId={id} refreshKey={statsKey} onNavegarNodo={irANodo} />
      )}

      {/* ═══ PESTAÑA SEGUIMIENTO ═══ */}
      {pestanaActiva === 'seguimiento' && (
        <div className="space-y-4">
          {/* Subsecciones de seguimiento, fusionadas con Importar/Reporte PDF
              en la misma banda — antes eran dos filas separadas y las
              subsecciones se estiraban a todo el ancho sin necesidad. */}
          <div className="flex items-center gap-3 flex-wrap">
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

          {/* Contenido de la subsección activa */}

          {/* 0. Diagrama — organigrama horizontal, solo lectura por ahora */}
          {subseccionActiva === 'diagrama' && (
            <Suspense fallback={
              <div className="flex items-center justify-center py-16 border border-gray-200 rounded-xl bg-white" style={{ minHeight: '600px' }}>
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
            <div className="space-y-3">
              <EtapasAvancesMD
                proyectoId={id}
                proyecto={proyecto}
                permisos={permisos}
                dgSeleccionada={dgSeleccionada}
                onStatsChange={() => { recargarEtapasSilencioso(); incrementarStats(); }}
              />
            </div>
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
    </>
  );
}
