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
import { useNavigate } from 'react-router-dom';
import {
  Bell, CheckCheck, Clock, AlertTriangle, MessageSquare, FileText,
  UserPlus, MailCheck, Ban,
} from 'lucide-react';
import { useNotificaciones } from '../hooks/useNotificaciones';
import { misInvitaciones } from '../api/miembros';
import InvitacionesPendientes from '../components/notificaciones/InvitacionesPendientes';
import EmptyState from '../components/common/EmptyState';

const iconosPorTipo = {
  Vencimiento:         Clock,
  Riesgo:              AlertTriangle,
  Comentario:          MessageSquare,
  MencionUsuario:      MessageSquare,
  Evidencia:           FileText,
  PermisoNuevo:        UserPlus,
  Invitacion:          UserPlus,
  RespuestaInvitacion: MailCheck,
  AccionBloqueada:     Ban,
  General:             Bell,
};

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
  const { notificaciones, noLeidas, cargando, marcarLeida, marcarTodasLeidas } = useNotificaciones();
  const [invitaciones, setInvitaciones] = useState([]);

  const cargarInvitaciones = useCallback(async () => {
    try { setInvitaciones(await misInvitaciones()); } catch { /* buzón vacío */ }
  }, []);

  useEffect(() => { cargarInvitaciones(); }, [cargarInvitaciones]);

  function abrir(n) {
    if (!n.leida) marcarLeida(n.id);
    const ruta = rutaDe(n);
    if (ruta) navigate(ruta);
  }

  if (cargando) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/4" />
        {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-gray-200 rounded" />)}
      </div>
    );
  }

  const sinNada = notificaciones.length === 0 && invitaciones.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notificaciones</h1>
          <p className="text-sm text-gray-500 mt-1">
            {invitaciones.length > 0 && (
              <span className="text-guinda-700 font-medium">
                {invitaciones.length === 1
                  ? '1 invitación por responder'
                  : `${invitaciones.length} invitaciones por responder`}
                {' · '}
              </span>
            )}
            {noLeidas > 0 ? `${noLeidas} sin leer` : 'Todas leídas'}
          </p>
        </div>
        {noLeidas > 0 && (
          <button onClick={marcarTodasLeidas} className="btn-secondary text-xs flex items-center gap-2">
            <CheckCheck size={14} />
            Marcar todas como leídas
          </button>
        )}
      </div>

      <InvitacionesPendientes
        invitaciones={invitaciones}
        onRespondida={cargarInvitaciones}
      />

      {sinNada ? (
        <EmptyState
          icono={Bell}
          titulo="Sin notificaciones"
          subtitulo="No tienes notificaciones aún. Aparecerán aquí cuando haya eventos relevantes."
        />
      ) : (
        <div className="space-y-2">
          {invitaciones.length > 0 && notificaciones.length > 0 && (
            <h2 className="text-sm font-semibold text-gray-700 pt-2">Avisos</h2>
          )}
          {notificaciones.map(notificacion => {
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
