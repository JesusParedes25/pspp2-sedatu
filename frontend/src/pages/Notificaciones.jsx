/**
 * ARCHIVO: Notificaciones.jsx
 * PROPÓSITO: Buzón del usuario: pendientes por responder en una pestaña,
 *            historial de avisos ya vistos/resueltos en otra.
 *
 * MINI-CLASE: avisos que se leen vs. avisos que hay que contestar
 * ─────────────────────────────────────────────────────────────────
 * Las notificaciones son un buzón de solo lectura: se generan por
 * eventos (vencimientos, riesgos, menciones), se leen y se olvidan.
 * Las invitaciones, solicitudes y asignaciones de riesgo no: hasta que
 * la persona no acepta o rechaza, alguien queda esperando una decisión.
 * Por eso viven en su propia pestaña ("Pendientes"), separada de todo
 * lo que ya es solo historial ("Historial").
 *
 * MINI-CLASE: por qué un filtro de proyecto y categoría en vez de
 * secciones apiladas
 * ─────────────────────────────────────────────────────────────────
 * La primera versión apilaba una sección por categoría (Riesgos,
 * Solicitudes, Actividad...) una debajo de otra: con pocas
 * notificaciones se veía bien, pero en cuanto alguien acumulaba
 * actividad en varios proyectos, tenía que scrollear cada sección
 * completa para llegar a la siguiente. Aquí "Historial" es una sola
 * lista cronológica (como el "Todo" de Gmail), y la categorización se
 * hace con filtros —chips de categoría y un selector de proyecto—, no
 * con más secciones que crecen sin límite. Un "Cargar más" evita mandar
 * cientos de tarjetas al DOM de una vez.
 *
 * Al hacer clic, cada notificación lleva a lo que la originó. Eso exige
 * saber en qué proyecto vive la entidad avisada; el backend lo resuelve
 * y lo devuelve como id_proyecto (y nombre_proyecto, para el filtro).
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  Bell, CheckCheck, Clock, AlertTriangle, MessageSquare, FileText,
  UserPlus, MailCheck, Ban, MailQuestion, Shield, TrendingUp, Inbox, History, UserMinus,
} from 'lucide-react';
import { useNotificaciones } from '../hooks/useNotificaciones';
import { misInvitaciones } from '../api/miembros';
import { solicitudesPorResolver, solicitudesResueltas } from '../api/solicitudes';
import { asignacionesRiesgoPendientes } from '../api/riesgos';
import InvitacionesPendientes from '../components/notificaciones/InvitacionesPendientes';
import SolicitudesPorResolver from '../components/notificaciones/SolicitudesPorResolver';
import SolicitudResueltaCard from '../components/notificaciones/SolicitudesResueltas';
import AsignacionesRiesgoPendientes from '../components/notificaciones/AsignacionesRiesgoPendientes';
import EmptyState from '../components/common/EmptyState';

const iconosPorTipo = {
  Vencimiento:              Clock,
  Inactividad:              Clock,
  Riesgo:                   AlertTriangle,
  Comentario:               MessageSquare,
  MencionUsuario:           MessageSquare,
  Evidencia:                FileText,
  PermisoNuevo:             UserPlus,
  Invitacion:               UserPlus,
  RespuestaInvitacion:      MailCheck,
  Solicitud:                MailQuestion,
  RespuestaSolicitud:       MailCheck,
  AsignacionRiesgo:         Shield,
  RespuestaAsignacionRiesgo: Shield,
  AccionBloqueada:          Ban,
  AvanceDG:                 TrendingUp,
  RetiroParticipante:       UserMinus,
  General:                  Bell,
};

// Catálogo de "Historial" por categoría — usado por los chips de filtro,
// no para apilar secciones. Un tipo no listado aquí cae en "Sistema".
const CATEGORIAS_AVISO = [
  { titulo: 'Riesgos', tipos: ['Riesgo', 'RespuestaAsignacionRiesgo'] },
  { titulo: 'Solicitudes e invitaciones', tipos: ['RespuestaSolicitud', 'RespuestaInvitacion', 'RetiroParticipante'] },
  { titulo: 'Actividad del proyecto', tipos: ['Comentario', 'MencionUsuario', 'AccionBloqueada', 'AvanceDG', 'PermisoNuevo', 'Evidencia'] },
];
function categoriaDe(tipo) {
  return CATEGORIAS_AVISO.find(c => c.tipos.includes(tipo))?.titulo || 'Sistema';
}

// Dónde vive lo que originó el aviso. Sin id_proyecto no hay a dónde ir. Y
// a quien lo quitaron de algo tampoco tiene caso mandarlo ahí: si fue de
// todo el proyecto, ya no tiene acceso y el enlace solo llevaría a un
// error; si fue de una parte, puede que tampoco.
function rutaDe(n) {
  if (n.tipo === 'RetiroParticipante') return null;
  if (!n.id_proyecto) return null;
  if (n.entidad_tipo === 'Proyecto') return `/proyectos/${n.id_proyecto}`;
  if (['Etapa', 'Accion', 'Tarea'].includes(n.entidad_tipo)) {
    return `/proyectos/${n.id_proyecto}?tab=seguimiento&nodo=${n.entidad_id}`;
  }
  return `/proyectos/${n.id_proyecto}`;
}

const PAGINA = 15;

export default function Notificaciones() {
  const navigate = useNavigate();
  // Compartido con Header vía Layout: cualquier acción que se resuelva
  // aquí (leer un aviso, aceptar una invitación o una solicitud) tiene
  // que reflejarse en la campanita al instante, no en el siguiente
  // polling de 30s — si no, alguien podría creer que su clic no surtió
  // efecto.
  const { recargarResumen } = useOutletContext() || {};
  const { notificaciones, noLeidas, cargando, marcarLeida, marcarTodasLeidas } = useNotificaciones();
  const [invitaciones, setInvitaciones] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [resueltas, setResueltas] = useState([]);
  const [asignacionesRiesgo, setAsignacionesRiesgo] = useState([]);
  const [tab, setTab] = useState('pendientes');
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todas');
  const [proyectoFiltro, setProyectoFiltro] = useState('');
  const [visibles, setVisibles] = useState(PAGINA);

  const cargarInvitaciones = useCallback(async () => {
    try { setInvitaciones(await misInvitaciones()); } catch { /* buzón vacío */ }
  }, []);

  const cargarSolicitudes = useCallback(async () => {
    try { setSolicitudes(await solicitudesPorResolver()); } catch { /* nada que resolver */ }
  }, []);

  const cargarResueltas = useCallback(async () => {
    try { setResueltas(await solicitudesResueltas()); } catch { /* sin historial todavía */ }
  }, []);

  const cargarAsignacionesRiesgo = useCallback(async () => {
    try { setAsignacionesRiesgo(await asignacionesRiesgoPendientes()); } catch { /* nada pendiente */ }
  }, []);

  useEffect(() => {
    cargarInvitaciones(); cargarSolicitudes(); cargarResueltas(); cargarAsignacionesRiesgo();
  }, [cargarInvitaciones, cargarSolicitudes, cargarResueltas, cargarAsignacionesRiesgo]);

  const pendientesTotal = invitaciones.length + solicitudes.length + asignacionesRiesgo.length;

  // Al cargar, si no hay nada pendiente por responder no tiene caso abrir
  // en esa pestaña vacía — se arranca directo en Historial. Solo se decide
  // una vez (tabElegida): después de eso manda lo que la persona haya
  // clicado, aunque un pendiente nuevo llegue por polling mientras mira
  // Historial.
  const [tabElegida, setTabElegida] = useState(false);
  useEffect(() => {
    if (!cargando && !tabElegida) {
      setTab(pendientesTotal > 0 ? 'pendientes' : 'historial');
      setTabElegida(true);
    }
  }, [cargando, tabElegida, pendientesTotal]);

  // Cambiar de filtro (proyecto, categoría o pestaña) reinicia cuántas
  // tarjetas se muestran — si no, alguien podría filtrar y seguir viendo
  // "Cargar más" en un punto que ya no corresponde a los primeros 15
  // resultados del nuevo filtro.
  useEffect(() => {
    setVisibles(PAGINA);
  }, [categoriaFiltro, proyectoFiltro, tab]);

  function alResponderInvitacion() {
    cargarInvitaciones();
    recargarResumen?.();
  }

  // Al resolver una solicitud pendiente, se cae de esa lista y hay que
  // recargar el historial para que aparezca ahí de inmediato — si no, la
  // decisión que se acaba de tomar parece esfumarse hasta el próximo
  // refresh de la página.
  function alResolverSolicitud() {
    cargarSolicitudes();
    cargarResueltas();
    recargarResumen?.();
  }

  // Una asignación de riesgo respondida no tiene una sección de "historial"
  // propia (a diferencia de las solicitudes) — la respuesta ya le llega a
  // quien asignó como notificación (RespuestaAsignacionRiesgo) en Avisos,
  // así que aquí solo hace falta que se caiga de la bandeja de pendientes.
  function alResponderAsignacionRiesgo() {
    cargarAsignacionesRiesgo();
    recargarResumen?.();
  }

  function abrir(n) {
    if (!n.leida) { marcarLeida(n.id); recargarResumen?.(); }
    const ruta = rutaDe(n);
    if (ruta) navigate(ruta);
  }

  function alMarcarTodasLeidas() {
    marcarTodasLeidas();
    recargarResumen?.();
  }

  if (cargando) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/4" />
        {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-gray-200 rounded" />)}
      </div>
    );
  }

  // Historial: notificaciones y solicitudes resueltas fusionadas en una
  // sola lista cronológica — no una sección por tipo. La categoría viaja
  // con cada ítem para que los chips de filtro puedan usarla sin volver
  // a apilar nada.
  const itemsHistorial = [
    ...notificaciones.map(n => ({
      id: `n-${n.id}`,
      fecha: n.created_at,
      categoria: categoriaDe(n.tipo),
      id_proyecto: n.id_proyecto,
      nombre_proyecto: n.nombre_proyecto,
      render: () => <NotificacionCard key={n.id} notificacion={n} onAbrir={abrir} />,
    })),
    ...resueltas.map(sol => ({
      id: `s-${sol.id}`,
      fecha: sol.respondida_en,
      categoria: 'Solicitudes e invitaciones',
      id_proyecto: sol.id_proyecto,
      nombre_proyecto: sol.nombre_proyecto,
      render: () => <SolicitudResueltaCard key={sol.id} solicitud={sol} />,
    })),
  ].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  // Proyectos presentes en cualquier parte del buzón (pendientes o
  // historial) — el selector de proyecto filtra ambas pestañas con el
  // mismo criterio, así que se arma una sola vez a partir de todo.
  const mapaProyectos = new Map();
  [...invitaciones, ...solicitudes, ...asignacionesRiesgo, ...itemsHistorial].forEach(item => {
    if (item.id_proyecto && item.nombre_proyecto && !mapaProyectos.has(item.id_proyecto)) {
      mapaProyectos.set(item.id_proyecto, item.nombre_proyecto);
    }
  });
  const proyectosDisponibles = [...mapaProyectos.entries()]
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const categoriasConItems = ['Todas', ...CATEGORIAS_AVISO.map(c => c.titulo), 'Sistema']
    .filter(cat => cat === 'Todas' || itemsHistorial.some(item => item.categoria === cat));

  const invitacionesFiltradas = proyectoFiltro ? invitaciones.filter(i => i.id_proyecto === proyectoFiltro) : invitaciones;
  const solicitudesFiltradas = proyectoFiltro ? solicitudes.filter(s => s.id_proyecto === proyectoFiltro) : solicitudes;
  const asignacionesFiltradas = proyectoFiltro ? asignacionesRiesgo.filter(r => r.id_proyecto === proyectoFiltro) : asignacionesRiesgo;
  const pendientesFiltradosTotal = invitacionesFiltradas.length + solicitudesFiltradas.length + asignacionesFiltradas.length;

  const itemsFiltrados = itemsHistorial.filter(item =>
    (categoriaFiltro === 'Todas' || item.categoria === categoriaFiltro) &&
    (!proyectoFiltro || item.id_proyecto === proyectoFiltro)
  );
  const itemsVisibles = itemsFiltrados.slice(0, visibles);
  const hayMas = itemsFiltrados.length > itemsVisibles.length;

  const historialVacio = itemsHistorial.length === 0;
  const historialSinResultados = !historialVacio && itemsFiltrados.length === 0;

  function limpiarFiltros() {
    setCategoriaFiltro('Todas');
    setProyectoFiltro('');
  }

  const TABS = [
    { id: 'pendientes', etiqueta: 'Pendientes', icono: Inbox, cuenta: pendientesTotal },
    { id: 'historial', etiqueta: 'Historial', icono: History, cuenta: noLeidas },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notificaciones</h1>
          <p className="text-sm text-gray-500 mt-1">
            {pendientesTotal > 0
              ? `${pendientesTotal} ${pendientesTotal === 1 ? 'pendiente' : 'pendientes'} por responder · `
              : ''}
            {noLeidas > 0 ? `${noLeidas} sin leer` : 'Todo al día'}
          </p>
        </div>
        {tab === 'historial' && noLeidas > 0 && (
          <button onClick={alMarcarTodasLeidas} className="btn-secondary text-xs flex items-center gap-2">
            <CheckCheck size={14} />
            Marcar todas como leídas
          </button>
        )}
      </div>

      {/* Pestañas */}
      <div className="border-b border-gray-200 flex gap-6">
        {TABS.map(t => {
          const Icono = t.icono;
          const activa = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activa
                  ? 'border-guinda-500 text-guinda-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icono size={15} />
              {t.etiqueta}
              {t.cuenta > 0 && (
                <span className={`text-[10px] font-medium rounded-full px-1.5 py-0.5 ${
                  activa ? 'bg-guinda-100 text-guinda-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {t.cuenta}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filtros: proyecto (ambas pestañas) y categoría (solo Historial).
          Solo se muestran si hay algo que filtrar — con un solo proyecto
          en juego, un selector con una opción no aporta nada. */}
      {(proyectosDisponibles.length > 1 || (tab === 'historial' && categoriasConItems.length > 2)) && (
        <div className="flex flex-wrap items-center gap-3">
          {proyectosDisponibles.length > 1 && (
            <select
              value={proyectoFiltro}
              onChange={e => setProyectoFiltro(e.target.value)}
              className="h-8 px-2.5 text-xs border border-gray-300 rounded-lg bg-white text-gray-700 outline-none focus:ring-2 focus:ring-guinda-200"
            >
              <option value="">Todos los proyectos</option>
              {proyectosDisponibles.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          )}

          {tab === 'historial' && categoriasConItems.length > 2 && (
            <div className="flex flex-wrap gap-1.5">
              {categoriasConItems.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoriaFiltro(cat)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    categoriaFiltro === cat
                      ? 'bg-guinda-600 border-guinda-600 text-white'
                      : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'pendientes' ? (
        pendientesFiltradosTotal === 0 ? (
          <EmptyState
            icono={Inbox}
            titulo="Sin pendientes"
            subtitulo={
              proyectoFiltro && pendientesTotal > 0
                ? 'No tienes pendientes en ese proyecto. Quita el filtro para ver los demás.'
                : 'No tienes invitaciones, solicitudes ni riesgos asignados esperando tu respuesta.'
            }
          />
        ) : (
          <div className="space-y-6">
            <InvitacionesPendientes
              invitaciones={invitacionesFiltradas}
              onRespondida={alResponderInvitacion}
            />

            <SolicitudesPorResolver
              solicitudes={solicitudesFiltradas}
              onRespondida={alResolverSolicitud}
            />

            <AsignacionesRiesgoPendientes
              asignaciones={asignacionesFiltradas}
              onRespondida={alResponderAsignacionRiesgo}
            />
          </div>
        )
      ) : historialVacio ? (
        <EmptyState
          icono={Bell}
          titulo="Sin notificaciones"
          subtitulo="No tienes notificaciones aún. Aparecerán aquí cuando haya eventos relevantes."
        />
      ) : historialSinResultados ? (
        <div className="text-center py-12">
          <p className="text-sm text-gray-500">Nada coincide con este filtro.</p>
          <button onClick={limpiarFiltros} className="text-xs text-guinda-600 font-medium mt-2 hover:underline">
            Quitar filtros
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {itemsVisibles.map(item => item.render())}

          {hayMas && (
            <button
              onClick={() => setVisibles(v => v + PAGINA)}
              className="w-full text-center text-xs font-medium text-guinda-600 hover:text-guinda-700 py-3"
            >
              Cargar más ({itemsFiltrados.length - itemsVisibles.length} restantes)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Tarjeta de una notificación de solo lectura (avisos del sistema).
function NotificacionCard({ notificacion, onAbrir }) {
  const Icono = iconosPorTipo[notificacion.tipo] || Bell;
  const clicable = !!rutaDe(notificacion);

  return (
    <button
      onClick={() => onAbrir(notificacion)}
      className={`w-full text-left card p-4 flex items-start gap-4 transition-colors ${
        notificacion.leida ? 'bg-white' : 'bg-blue-50 border-blue-200'
      } ${clicable ? 'hover:shadow-sm cursor-pointer' : 'cursor-default'}`}
    >
      {/* Ícono */}
      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
        notificacion.leida ? 'bg-gray-100 text-gray-400' : 'bg-guinda-100 text-guinda-500'
      }`}>
        <Icono size={18} />
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${notificacion.leida ? 'text-gray-600' : 'text-gray-900 font-medium'}`}>
          {notificacion.mensaje}
        </p>
        {clicable && (
          <p className="text-xs text-guinda-600 mt-0.5">Ver</p>
        )}
      </div>

      {/* Fecha */}
      <span className="text-xs text-gray-400 flex-shrink-0">
        {formatearFechaRelativa(notificacion.created_at)}
      </span>

      {/* Indicador de no leída */}
      {!notificacion.leida && (
        <div className="w-2.5 h-2.5 bg-guinda-500 rounded-full flex-shrink-0 mt-1" />
      )}
    </button>
  );
}

// Formatear fecha relativa
function formatearFechaRelativa(fecha) {
  const ahora = new Date();
  const diff = ahora - new Date(fecha);
  const minutos = Math.floor(diff / 60000);
  const horas = Math.floor(diff / 3600000);
  const dias = Math.floor(diff / 86400000);

  if (minutos < 1) return 'Ahora';
  if (minutos < 60) return `${minutos}min`;
  if (horas < 24) return `${horas}h`;
  if (dias < 7) return `${dias}d`;
  return new Date(fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}
