/**
 * ARCHIVO: DetalleProyecto.jsx
 * PROPÓSITO: Página de detalle de un proyecto con tres pestañas principales
 *            (Resumen, Seguimiento y Evidencias). Seguimiento tiene 4
 *            subsecciones: Etapas y avances, Cronograma, Actividad, Equipo.
 *
 * MINI-CLASE: Pestañas + subsecciones como navegación interna
 * ─────────────────────────────────────────────────────────────────
 * La pestaña "Resumen" muestra un dashboard universal del proyecto con
 * métricas calculadas de etapas, acciones, plazos y actividad reciente.
 * "Seguimiento" contiene 4 sub-vistas: Etapas y avances, Cronograma
 * (Gantt), Actividad reciente y Equipo.
 *
 * Ya NO hay pestañas separadas de "Riesgos" ni "Comentarios":
 * - Los comentarios se hacen inline en cada etapa/acción (Facebook-style).
 * - Los riesgos se asignan por etapa con acción asociada.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Star, FileText, Settings, BarChart3, Clock, UsersRound, LayoutDashboard, Search, Plus, Pencil, X, FileSpreadsheet, Trash2, AlertTriangle, Table2, MapPin, Columns, CheckSquare } from 'lucide-react';
import { useProyecto } from '../../hooks/useProyectos';
import { useEtapas } from '../../hooks/useEtapas';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { usePermisosProyecto } from '../../hooks/usePermisos';
import EstadoChip from '../../components/common/EstadoChip';
import SelectorEstado from '../../components/common/SelectorEstado';
import EtapaCard from '../../components/seguimiento/EtapaCard';
import GanttCronograma from '../../components/seguimiento/GanttCronograma';
import PanoramaProyecto from '../../components/seguimiento/PanoramaProyecto';
import SelectorDG from '../../components/proyectos/SelectorDG';
import EvidenciaRow from '../../components/evidencias/EvidenciaRow';
import EmptyState from '../../components/common/EmptyState';
import ModalNuevaEtapa from '../../components/seguimiento/ModalNuevaEtapa';
import ModalNuevaAccion from '../../components/seguimiento/ModalNuevaAccion';
import ImportarWizard from '../../components/importar/ImportarWizard';
import EtapasAvancesMD from '../../components/seguimiento/EtapasAvancesMD';
import ModalEditarProyecto from '../../components/proyectos/ModalEditarProyecto';
import ModalEliminarProyecto from '../../components/proyectos/ModalEliminarProyecto';
import VistaLista from '../../components/seguimiento/VistaLista';
import VistaKanban from '../../components/seguimiento/VistaKanban';
import VistaChecklist from '../../components/seguimiento/VistaChecklist';
import MapaProyecto from '../../components/seguimiento/MapaProyecto';
import GenerarReporteBtn from '../../components/reportes/GenerarReporteBtn';
import PanelAccionInline from '../../components/seguimiento/PanelAccionInline';
import * as evidenciasApi from '../../api/evidencias';
import * as etapasApi from '../../api/etapas';
import * as accionesApi from '../../api/acciones';
import * as proyectosApi from '../../api/proyectos';

// Pestañas principales: Resumen, Seguimiento, Evidencias
const PESTANAS = [
  { id: 'resumen', etiqueta: 'Panorama del proyecto', icono: LayoutDashboard },
  { id: 'seguimiento', etiqueta: 'Seguimiento', icono: Settings },
  { id: 'evidencias', etiqueta: 'Evidencias', icono: FileText },
];

// Subsecciones dentro de Seguimiento
// PART 5 del refactor de tarjetas: Kanban y Checklist se ocultan de la barra
// de sub-pestañas (los componentes siguen en el codebase, solo no se listan
// ni se renderizan aquí).
const SUBSECCIONES = [
  { id: 'etapas', etiqueta: 'Etapas y avances', icono: Settings },
  { id: 'lista', etiqueta: 'Vista lista', icono: Table2 },
  { id: 'mapa', etiqueta: 'Mapa', icono: MapPin },
  { id: 'cronograma', etiqueta: 'Cronograma', icono: BarChart3 },
];

function DescripcionColapsable({ texto }) {
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
        style={expandida ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
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
  const [accionesDirectas, setAccionesDirectas] = useState([]);
  const [cargandoDirectas, setCargandoDirectas] = useState(false);
  const [accionDirectaExpandida, setAccionDirectaExpandida] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // Deep-link desde Inicio/Panorama: ?tab=seguimiento&nodo=<id> debe abrir
  // directamente la pestaña y el nodo correspondiente, no el default.
  const [pestanaActiva, setPestanaActiva] = useState(() => searchParams.get('tab') || 'resumen');
  const [subseccionActiva, setSubseccionActiva] = useState('etapas');
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

  // Cargar acciones directas del proyecto (sin etapa)
  const cargarAccionesDirectas = useCallback(async () => {
    if (!id) return;
    setCargandoDirectas(true);
    try {
      const res = await accionesApi.obtenerAccionesDirectas(id);
      setAccionesDirectas(res.datos || []);
    } catch { /* silenciar */ }
    finally { setCargandoDirectas(false); }
  }, [id]);

  useEffect(() => { cargarAccionesDirectas(); }, [cargarAccionesDirectas]);

  async function eliminarAccionDirecta(accionId, nombre) {
    if (!confirm(`¿Eliminar la acción "${nombre}"?`)) return;
    try {
      await accionesApi.eliminarAccion(accionId);
      mostrarToast('Acción eliminada', 'exito');
      cargarAccionesDirectas();
      incrementarStats();
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'Error al eliminar acción', 'error');
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
    <div className="space-y-6">
      {/* Header del proyecto */}
      <div>
        <Link to="/proyectos" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-guinda-500 mb-3 transition-colors">
          <ArrowLeft size={16} />
          Volver a proyectos
        </Link>

        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-gray-900">{proyecto.nombre}</h1>
              {proyecto.es_prioritario && <Star size={20} className="text-yellow-500 fill-yellow-500" />}
            </div>
            {proyecto.descripcion && <DescripcionColapsable texto={proyecto.descripcion} />}
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span className="font-medium text-guinda-600">{proyecto.dg_lider_siglas}</span>
              {proyecto.direccion_area_lider_siglas && <span>/ {proyecto.direccion_area_lider_siglas}</span>}
              <SelectorEstado
                entidadTipo="Proyecto"
                entidadId={proyecto.id}
                estadoActual={proyecto.estado}
                onCambio={() => { recargarProyecto(); incrementarStats(); }}
                soloLectura={!permisos.puedeEditar}
              />
              <span>{proyecto.tipo?.replace(/_/g, ' ')}</span>
              {proyecto.programa_clave && <span className="text-gray-400">{proyecto.programa_clave}</span>}
            </div>
          </div>

          {/* Botones Editar / Eliminar */}
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
      </div>

      {/* Selector de DGs */}
      {proyecto.dgs && proyecto.dgs.length > 1 && (
        <SelectorDG
          dgs={proyecto.dgs}
          dgSeleccionada={dgSeleccionada}
          onSeleccionar={setDgSeleccionada}
        />
      )}

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
          {/* Subsecciones de seguimiento */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
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

          {/* Contenido de la subsección activa */}

          {/* 1. Etapas y avances — Maestro-Detalle */}
          {subseccionActiva === 'etapas' && (
            <div className="space-y-3">
              {/* Barra de acciones superior */}
              <div className="flex items-center gap-2">
                <button onClick={() => setModalCSV(true)}
                  className="btn-secondary text-sm flex items-center gap-1.5">
                  <FileSpreadsheet size={14} /> Importar
                </button>
                <GenerarReporteBtn
                  proyectoId={id}
                  proyecto={proyecto}
                />
              </div>

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

          {/* 3. Kanban */}
          {subseccionActiva === 'kanban' && (
            <VistaKanban
              etapas={etapas}
              proyectoId={id}
              onRefresh={() => { recargarEtapasSilencioso(); incrementarStats(); }}
            />
          )}

          {/* 4. Checklist */}
          {subseccionActiva === 'checklist' && (
            <VistaChecklist
              etapas={etapas}
              proyectoId={id}
              onRefresh={() => { recargarEtapasSilencioso(); incrementarStats(); }}
            />
          )}

          {/* 5. Mapa de cobertura territorial */}
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
  );
}
