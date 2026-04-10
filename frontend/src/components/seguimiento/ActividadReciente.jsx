/**
 * ARCHIVO: ActividadReciente.jsx
 * PROPÓSITO: Feed de actividad reciente del proyecto (tipo timeline).
 *
 * MINI-CLASE: Feed de actividad como auditoría visual
 * ─────────────────────────────────────────────────────────────────
 * La actividad reciente muestra los últimos eventos del proyecto:
 * cambios de estado, avances de porcentaje, evidencias subidas,
 * riesgos creados, comentarios, etc. Es una línea de tiempo
 * vertical donde cada evento tiene un ícono, descripción, autor
 * y hora relativa. Los datos vienen de las notificaciones del
 * proyecto y/o de un endpoint de actividad.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect } from 'react';
import {
  TrendingUp, FileText, AlertTriangle, MessageSquare,
  CheckCircle, Clock, User, Shield
} from 'lucide-react';
import * as notificacionesApi from '../../api/notificaciones';

const iconosPorTipo = {
  Avance:       { icono: TrendingUp,    color: 'bg-blue-100 text-blue-500' },
  Evidencia:    { icono: FileText,       color: 'bg-green-100 text-green-500' },
  Riesgo:       { icono: AlertTriangle,  color: 'bg-orange-100 text-orange-500' },
  Comentario:   { icono: MessageSquare,  color: 'bg-purple-100 text-purple-500' },
  Completada:   { icono: CheckCircle,    color: 'bg-green-100 text-green-600' },
  Estado:       { icono: Clock,          color: 'bg-yellow-100 text-yellow-600' },
  Mitigacion:   { icono: Shield,         color: 'bg-blue-100 text-blue-600' },
  General:      { icono: User,           color: 'bg-gray-100 text-gray-500' },
};

// Formatear fecha relativa
function fechaRelativa(fecha) {
  const ahora = new Date();
  const diff = ahora - new Date(fecha);
  const minutos = Math.floor(diff / 60000);
  const horas = Math.floor(diff / 3600000);
  const dias = Math.floor(diff / 86400000);

  if (minutos < 1) return 'Ahora';
  if (minutos < 60) return `Hace ${minutos}min`;
  if (horas < 24) return `Hace ${horas}h`;
  if (dias < 7) return `Hace ${dias}d`;
  return new Date(fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

export default function ActividadReciente({ proyectoId }) {
  const [actividades, setActividades] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!proyectoId) return;

    async function cargar() {
      try {
        // Usa las notificaciones del usuario como fuente de actividad
        const res = await notificacionesApi.obtenerNotificaciones();
        // La respuesta es { datos: { notificaciones: [...], no_leidas: N } }
        const todas = res.datos?.notificaciones || res.datos || [];
        // Filtrar solo las del proyecto actual si es posible
        const filtradas = Array.isArray(todas)
          ? todas.filter(n => n.proyecto_id === proyectoId || n.entidad_id === proyectoId)
          : [];
        setActividades(filtradas);
      } catch (err) {
        console.error('Error cargando actividad:', err);
        setActividades([]);
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, [proyectoId]);

  if (cargando) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex gap-3">
            <div className="w-8 h-8 bg-gray-200 rounded-full" />
            <div className="flex-1">
              <div className="h-3 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-2 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (actividades.length === 0) {
    return (
      <div className="text-center py-8">
        <Clock size={32} className="mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-gray-400">Sin actividad reciente</p>
        <p className="text-xs text-gray-300 mt-1">Los eventos del proyecto aparecerán aquí</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Línea vertical del timeline */}
      <div className="absolute left-4 top-4 bottom-4 w-px bg-gray-200" />

      <div className="space-y-4">
        {actividades.map((actividad, index) => {
          const config = iconosPorTipo[actividad.tipo] || iconosPorTipo.General;
          const Icono = config.icono;

          return (
            <div key={actividad.id || index} className="flex gap-3 relative">
              {/* Ícono del evento */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${config.color}`}>
                <Icono size={14} />
              </div>

              {/* Contenido */}
              <div className="flex-1 min-w-0 pt-1">
                <p className="text-sm text-gray-800">{actividad.titulo}</p>
                {actividad.mensaje && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{actividad.mensaje}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  {actividad.autor_nombre && (
                    <span className="text-xs text-gray-400">{actividad.autor_nombre}</span>
                  )}
                  <span className="text-xs text-gray-300">{fechaRelativa(actividad.created_at)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
