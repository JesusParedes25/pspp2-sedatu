/**
 * ARCHIVO: Notificaciones.jsx
 * PROPÓSITO: Página de notificaciones del usuario con lista y marcar como leídas.
 *
 * MINI-CLASE: Notificaciones como buzón personal
 * ─────────────────────────────────────────────────────────────────
 * Las notificaciones se generan automáticamente por eventos del
 * sistema (vencimientos, menciones, nuevos riesgos). Esta página
 * muestra las últimas 50 del usuario autenticado. Las no leídas
 * tienen fondo azul claro para distinguirlas. Click en una
 * notificación la marca como leída. El botón "Marcar todas como
 * leídas" limpia el contador del badge del header.
 * ─────────────────────────────────────────────────────────────────
 */
import { Bell, CheckCheck, Clock, AlertTriangle, MessageSquare, FileText } from 'lucide-react';
import { useNotificaciones } from '../hooks/useNotificaciones';
import EmptyState from '../components/common/EmptyState';

const iconosPorTipo = {
  Vencimiento:  Clock,
  Riesgo:       AlertTriangle,
  Mencion:      MessageSquare,
  Evidencia:    FileText,
  General:      Bell,
};

export default function Notificaciones() {
  const { notificaciones, noLeidas, cargando, marcarLeida, marcarTodasLeidas } = useNotificaciones();

  if (cargando) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/4" />
        {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-gray-200 rounded" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notificaciones</h1>
          <p className="text-sm text-gray-500 mt-1">
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

      {/* Lista de notificaciones */}
      {notificaciones.length === 0 ? (
        <EmptyState
          icono={Bell}
          titulo="Sin notificaciones"
          subtitulo="No tienes notificaciones aún. Aparecerán aquí cuando haya eventos relevantes."
        />
      ) : (
        <div className="space-y-2">
          {notificaciones.map(notificacion => {
            const Icono = iconosPorTipo[notificacion.tipo] || Bell;

            return (
              <button
                key={notificacion.id}
                onClick={() => !notificacion.leida && marcarLeida(notificacion.id)}
                className={`w-full text-left card p-4 flex items-start gap-4 transition-colors ${
                  notificacion.leida ? 'bg-white' : 'bg-blue-50 border-blue-200'
                } hover:shadow-sm`}
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
                    {notificacion.titulo}
                  </p>
                  {notificacion.mensaje && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notificacion.mensaje}</p>
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
