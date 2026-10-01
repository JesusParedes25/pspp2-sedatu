/**
 * ARCHIVO: DetalleProyectoLayout.jsx
 * PROPÓSITO: Layout compartido de la vista de un proyecto — encabezado
 *            (contraíble), breadcrumb, barra de secciones y el
 *            contenido de la sección activa vía <Outlet>. Reemplaza al
 *            antiguo DetalleProyecto.jsx monolítico, que manejaba la
 *            pestaña activa como estado local (`?tab=`) en vez de rutas
 *            reales.
 *
 * MINI-CLASE: de pestañas-en-estado a rutas anidadas
 * ─────────────────────────────────────────────────────────────────
 * Antes: una sola página montaba las 4 pestañas y las ocultaba con
 * `hidden` (para no perder su estado/datos al cambiar). Con rutas
 * reales (/proyectos/:id/seguimiento, /resumen, ...) cada sección es su
 * propia página — React Router ya resuelve "no perder lo que cargó"
 * mientras el usuario está EN esa sección; lo que se pierde al salir de
 * ella (volver a Portada, por ejemplo) es aceptable y hasta deseable
 * (datos frescos al volver más tarde).
 *
 * Los datos que SÍ se comparten entre secciones (proyecto, etapas,
 * permisos, DG seleccionada) se cargan una vez aquí y se pasan hacia
 * abajo vía <Outlet context={...}>, para no refetchear lo mismo en
 * cada sección.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate, useLocation, useSearchParams, Outlet } from 'react-router-dom';
import { ArrowLeft, Star, Pencil, Trash2, Copy, ChevronUp, ChevronDown, Settings, LayoutDashboard, FileText, BookText, LayoutGrid } from 'lucide-react';
import { prefersReducedMotion } from '../../utils/motion';
import { useProyecto } from '../../hooks/useProyectos';
import { useEtapas } from '../../hooks/useEtapas';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { usePermisosProyecto, usePermisosGlobales } from '../../hooks/usePermisos';
import ChipFuncion from '../../components/proyectos/ChipFuncion';
import SelectorEstado from '../../components/common/SelectorEstado';
import SelectorDG from '../../components/proyectos/SelectorDG';
import EmptyState from '../../components/common/EmptyState';
import ModalEditarProyecto from '../../components/proyectos/ModalEditarProyecto';
import ModalEliminarProyecto from '../../components/proyectos/ModalEliminarProyecto';
import ModalDuplicarProyecto from '../../components/proyectos/ModalDuplicarProyecto';
import Breadcrumb from '../../components/common/Breadcrumb';
import { urlSeguimientoProyecto } from '../../utils/navegacionProyecto';
import * as proyectosApi from '../../api/proyectos';

// Secciones del proyecto — "Portada" siempre primero, luego las 4 de
// siempre. Mismo set que antes vivía en PESTANAS, ahora apuntando a
// rutas reales en vez de a un `id` de pestaña en estado local.
const SECCIONES = [
  { to: '', etiqueta: 'Portada', icono: LayoutGrid, fin: true },
  { to: 'seguimiento', etiqueta: 'Seguimiento', icono: Settings },
  { to: 'resumen', etiqueta: 'Resumen', icono: LayoutDashboard },
  { to: 'documentos', etiqueta: 'Documentos', icono: FileText },
  { to: 'bitacora', etiqueta: 'Bitácora', icono: BookText },
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

export default function DetalleProyectoLayout() {
  const { id } = useParams();
  const { usuario } = useAuth();
  const { mostrarToast, sidebarAbierto } = useUI();
  const { proyecto, cargando, error, recargar: recargarProyecto, recargarSilencioso: recargarProyectoSilencioso } = useProyecto(id);
  const permisos = usePermisosProyecto(proyecto);
  const { puedeCrearProyecto } = usePermisosGlobales();
  const [dgSeleccionada, setDgSeleccionada] = useState(null);
  const { etapas, cargando: cargandoEtapas, recargar: recargarEtapas, recargarSilencioso: recargarEtapasSilencioso } = useEtapas(id, dgSeleccionada);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // ─── Compatibilidad con URLs viejas (?tab=&nodo=&riesgo=&foco=) ───
  // Siguen circulando en notificaciones, correos a las DG y enlaces ya
  // compartidos — nunca deben romperse. Si llega un `?tab=`, se traduce
  // a la ruta nueva equivalente preservando nodo/riesgo/foco, con
  // `replace` para no ensuciar el historial del navegador.
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (!tab) return;
    const nodo = searchParams.get('nodo');
    const riesgo = searchParams.get('riesgo');
    const foco = searchParams.get('foco');
    const destinoPorTab = { seguimiento: 'seguimiento', resumen: 'resumen', evidencias: 'documentos', bitacora: 'bitacora' };
    const destino = destinoPorTab[tab] || 'seguimiento';
    const params = new URLSearchParams();
    if (nodo) params.set('nodo', nodo);
    if (riesgo) params.set('riesgo', riesgo);
    if (foco) params.set('foco', foco);
    const qs = params.toString();
    navigate(`/proyectos/${id}/${destino}${qs ? `?${qs}` : ''}`, { replace: true });
  }, [searchParams, id, navigate]);

  // Clave de refresco para contadores/resumen — se incrementa en cada
  // mutación relevante, compartida por todas las secciones hijas.
  const [statsKey, setStatsKey] = useState(0);
  const incrementarStats = useCallback(() => setStatsKey(k => k + 1), []);

  // Encabezado contraíble por el usuario: arranca contraído la primera
  // vez, y la preferencia se recuerda por USUARIO, no por proyecto.
  const HEADER_EXPANDIDO_KEY = usuario?.id ? `pspp_header_proyecto_expandido_${usuario.id}` : null;
  const [headerExpandido, setHeaderExpandido] = useState(() => {
    if (!HEADER_EXPANDIDO_KEY) return false;
    try { return localStorage.getItem(HEADER_EXPANDIDO_KEY) === 'true'; } catch { return false; }
  });
  useEffect(() => {
    if (!HEADER_EXPANDIDO_KEY) return;
    try { localStorage.setItem(HEADER_EXPANDIDO_KEY, String(headerExpandido)); } catch {}
  }, [headerExpandido, HEADER_EXPANDIDO_KEY]);

  // Encabezado compacto al hacer scroll (barra fija de una línea cuando
  // el encabezado completo sale de vista) — mismo mecanismo de siempre,
  // con histéresis para que no "vibre" al cruzar el umbral.
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
    const obsCompactar = new IntersectionObserver(
      ([entry]) => { if (!entry.isIntersecting) setHeaderCompacto(true); },
      { threshold: 0 }
    );
    const obsExpandir = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setHeaderCompacto(false); },
      { threshold: 0, rootMargin: `-${BANDA_MUERTA_PX}px 0px 0px 0px` }
    );
    obsCompactar.observe(node);
    obsExpandir.observe(node);
    observersRef.current = [obsCompactar, obsExpandir];
  }, []);
  useEffect(() => () => desconectarObservers(), []);

  // Modales
  const [modalEditar, setModalEditar] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
  const [mostrarDuplicar, setMostrarDuplicar] = useState(false);
  const [eliminando, setEliminando] = useState(false);

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

  // Sección activa, derivada de la URL (último segmento del path) — para
  // resaltar el tab correcto y armar el breadcrumb.
  const segmentos = location.pathname.replace(/\/+$/, '').split('/');
  const seccionActivaId = segmentos.length > 3 ? segmentos[3] : '';
  const seccionActiva = SECCIONES.find(s => (s.fin ? seccionActivaId === '' : s.to === seccionActivaId)) || SECCIONES[0];

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

  const outletContext = {
    proyecto, cargando, error, recargarProyecto, recargarProyectoSilencioso,
    etapas, cargandoEtapas, recargarEtapas, recargarEtapasSilencioso,
    permisos, dgSeleccionada, setDgSeleccionada,
    statsKey, incrementarStats,
    proyectoId: id,
  };

  return (
    <>
      {headerCompacto && (
        <div
          className="fixed top-0 right-0 z-40 px-6 py-2 bg-white border-b border-gray-200 shadow-sm flex items-center gap-2 transition-all duration-300"
          style={{ left: sidebarAbierto ? '16rem' : '4rem' }}
        >
          <span className="text-sm font-semibold text-gray-900 truncate">{proyecto.nombre}</span>
          <span className="text-xs text-gray-400 flex-shrink-0">{proyecto.estado?.replace(/_/g, ' ')}</span>
        </div>
      )}

      <div className="space-y-4">
        <Breadcrumb pasos={[
          { etiqueta: 'Inicio', to: '/' },
          { etiqueta: 'Proyectos', to: '/proyectos' },
          { etiqueta: proyecto.nombre, to: `/proyectos/${id}` },
          { etiqueta: seccionActiva.etiqueta },
        ]} />

        {/* Header del proyecto — contraíble */}
        <div>
          <div ref={sentinelHeaderRef} />

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
                  <ChipFuncion proyecto={proyecto} permisos={permisos} />
                  <SelectorEstado
                    entidadTipo="Proyecto"
                    entidadId={proyecto.id}
                    estadoActual={proyecto.estado}
                    estadoOverride={proyecto.estado_override}
                    onCambio={() => { recargarProyecto(); incrementarStats(); }}
                    soloLectura={!permisos.puedeEditar}
                  />
                  <span className="text-sm text-gray-500 flex-shrink-0">{proyecto.tipo?.replace(/_/g, ' ')}</span>
                  {proyecto.programa_clave && <span className="text-sm text-gray-400 flex-shrink-0">{proyecto.programa_clave}</span>}
                  {!headerExpandido && proyecto.dgs && proyecto.dgs.length > 1 && (
                    <SelectorDG dgs={proyecto.dgs} dgSeleccionada={dgSeleccionada} onSeleccionar={setDgSeleccionada} />
                  )}
                </div>
                {proyecto.descripcion && <DescripcionColapsable texto={proyecto.descripcion} lineasColapsado={1} />}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {permisos.puedeEditar && (
                <button onClick={() => setModalEditar(true)} className="btn-secondary text-sm flex items-center gap-1.5">
                  <Pencil size={14} /> Editar
                </button>
              )}
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
                navigate(urlSeguimientoProyecto(nuevo.id));
              }}
            />
          )}

          {confirmandoEliminar && (
            <ModalEliminarProyecto
              proyecto={proyecto}
              eliminando={eliminando}
              onCerrar={() => setConfirmandoEliminar(false)}
              onConfirmar={eliminarProyecto}
            />
          )}

          {modalEditar && (
            <ModalEditarProyecto
              proyecto={proyecto}
              onCerrar={() => { setModalEditar(false); setConfirmandoEliminar(false); }}
              onGuardado={() => { mostrarToast('Proyecto actualizado', 'exito'); recargarProyecto(); incrementarStats(); }}
            />
          )}

          <div
            id="detalle-header-dgs"
            className={`overflow-hidden ${prefersReducedMotion ? '' : 'transition-all duration-200'} ${headerExpandido && proyecto.dgs && proyecto.dgs.length > 1 ? 'max-h-20 opacity-100 mt-3' : 'max-h-0 opacity-0'}`}
          >
            {proyecto.dgs && proyecto.dgs.length > 1 && (
              <SelectorDG dgs={proyecto.dgs} dgSeleccionada={dgSeleccionada} onSeleccionar={setDgSeleccionada} />
            )}
          </div>
        </div>

        {/* Barra de secciones — scroll horizontal en pantallas chicas, nunca envuelve en dos filas */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-5 overflow-x-auto" aria-label="Secciones del proyecto">
            {SECCIONES.map(sec => {
              const activa = sec === seccionActiva;
              const Icono = sec.icono;
              return (
                <Link
                  key={sec.to || 'portada'}
                  to={sec.to ? `/proyectos/${id}/${sec.to}` : `/proyectos/${id}`}
                  className={`flex items-center gap-2 px-1 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-guinda-300 rounded-t ${
                    activa ? 'border-guinda-500 text-guinda-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                  aria-current={activa ? 'page' : undefined}
                >
                  <Icono size={16} />
                  {sec.etiqueta}
                </Link>
              );
            })}
          </nav>
        </div>

        <Outlet context={outletContext} />
      </div>
    </>
  );
}
