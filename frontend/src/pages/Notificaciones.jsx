/**
 * ARCHIVO: Notificaciones.jsx
 * PROPÓSITO: Buzón del usuario: invitaciones por responder arriba, y
 *            debajo el historial de avisos del sistema.
 *
 * MINI-CLASE: avisos que se leen vs. avisos que hay que contestar
 * ─────────────────────────────────────────────────────────────────
 * Las notificaciones son un buzón de solo lectura: se generan por
 * eventos (vencimientos, riesgos, menciones), se leen y se olvidan.
 * Las invitaciones no: hasta que la persona no acepta o rechaza, no
 * tiene permisos y quien invitó no sabe si puede contar con ella. Por
 * eso viven en su propia sección, arriba y destacadas, y no se pueden
 * "marcar como leídas" para hacerlas desaparecer.
 *
 * Al hacer clic, cada notificación lleva a lo que la originó. Eso exige
 * saber en qué proyecto vive la entidad avisada; el backend lo resuelve
 * y lo devuelve como id_proyecto, porque el navegador solo tiene el id
 * de la etapa o la acción.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  Bell, CheckCheck, Clock, AlertTriangle, MessageSquare, FileText,
  UserPlus, MailCheck, Ban, MailQuestion, Shield, TrendingUp, Inbox, History,
} from 'lucide-react';
import { useNotificaciones } from '../hooks/useNotificaciones';
import { misInvitaciones } from '../api/miembros';
import { solicitudesPorResolver, solicitudesResueltas } from '../api/solicitudes';
import { asignacionesRiesgoPendientes } from '../api/riesgos';
import InvitacionesPendientes from '../components/notificaciones/InvitacionesPendientes';
import SolicitudesPorResolver from '../components/notificaciones/SolicitudesPorResolver';
import SolicitudesResueltas from '../components/notificaciones/SolicitudesResueltas';
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
  General:                  Bell,
};

// Catálogo de "Avisos" por categoría — para que una bandeja con varios
// tipos de notificación distintos se lea de un vistazo en vez de como una
// sola lista plana. El orden de las categorías es el orden en que
// aparecen; un tipo no listado aquí cae en "Sistema" (catch-all).
const CATEGORIAS_AVISO = [
  { titulo: 'Riesgos', tipos: ['Riesgo', 'RespuestaAsignacionRiesgo'] },
  { titulo: 'Solicitudes e invitaciones', tipos: ['RespuestaSolicitud', 'RespuestaInvitacion'] },
  { titulo: 'Actividad del proyecto', tipos: ['Comentario', 'MencionUsuario', 'AccionBloqueada', 'AvanceDG', 'PermisoNuevo', 'Evidencia'] },
];
function categoriaDe(tipo) {
  return CATEGORIAS_AVISO.find(c => c.tipos.includes(tipo))?.titulo || 'Sistema';
}

// Dónde vive lo que originó el aviso. Sin id_proyecto no hay a dónde ir.
function rutaDe(n) {
  if (!n.id_proyecto) return null;
  if (n.entidad_tipo === 'Proyecto') return `/proyectos/${n.id_proyecto}`;
  if (['Etapa', 'Accion', 'Tarea'].includes(n.entidad_tipo)) {
    return `/proyectos/${n.id_proyecto}?tab=seguimiento&nodo=${n.entidad_id}`;
  }
  return `/proyectos/${n.id_proyecto}`;
}

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

  // Avisos agrupados por categoría, en el orden de CATEGORIAS_AVISO — así
  // "varios tipos de notificación" se leen como secciones, no como una
  // sola lista larga donde un comentario y un vencimiento se mezclan sin
  // distinción. Los encabezados de categoría se muestran siempre, incluso
  // con una sola categoría presente: son los que le dan sentido a
  // "catalogado", no un extra que solo aparece cuando hay variedad.
  const gruposAviso = [...CATEGORIAS_AVISO.map(c => c.titulo), 'Sistema']
    .map(titulo => ({ titulo, items: notificaciones.filter(n => categoriaDe(n.tipo) === titulo) }))
    .filter(g => g.items.length > 0);

  const historialVacio = resueltas.length === 0 && notificaciones.length === 0;

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

      {tab === 'pendientes' ? (
        pendientesTotal === 0 ? (
          <EmptyState
            icono={Inbox}
            titulo="Sin pendientes"
            subtitulo="No tienes invitaciones, solicitudes ni riesgos asignados esperando tu respuesta."
          />
        ) : (
          <div className="space-y-6">
            <InvitacionesPendientes
              invitaciones={invitaciones}
              onRespondida={alResponderInvitacion}
            />

            <SolicitudesPorResolver
              solicitudes={solicitudes}
              onRespondida={alResolverSolicitud}
            />

            <AsignacionesRiesgoPendientes
              asignaciones={asignacionesRiesgo}
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
      ) : (
        <div className="space-y-6">
          <SolicitudesResueltas solicitudes={resueltas} />

          {gruposAviso.map(grupo => (
            <div key={grupo.titulo} className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{grupo.titulo}</h3>
              {grupo.items.map(notificacion => {
                const Icono = iconosPorTipo[notificacion.tipo] || Bell;
                const clicable = !!rutaDe(notificacion);

                return (
                  <button
                    key={notificacion.id}
                    onClick={() => abrir(notificacion)}
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
              })}
            </div>
          ))}
        </div>
      )}
    </div>
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
