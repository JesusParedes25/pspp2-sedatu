/**
 * ARCHIVO: ActividadCartera.jsx
 * PROPÓSITO: Timeline de actividad cruzada de todos los proyectos de una
 *            cartera (comentarios, evidencias, cambios de estado, altas
 *            de miembro) — reusa actividad_log vía
 *            GET /carteras/:id/actividad.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare, FileText, Clock, UserPlus, Activity, Loader2 } from 'lucide-react';
import * as carterasApi from '../../api/carteras';

const ICONO_POR_TIPO = {
  comentario: { icono: MessageSquare, color: 'bg-purple-100 text-purple-500' },
  evidencia: { icono: FileText, color: 'bg-green-100 text-green-500' },
  estado: { icono: Clock, color: 'bg-yellow-100 text-yellow-600' },
  miembro: { icono: UserPlus, color: 'bg-blue-100 text-blue-500' },
};

function fechaRelativa(fecha) {
  const diff = Date.now() - new Date(fecha).getTime();
  const minutos = Math.floor(diff / 60000);
  const horas = Math.floor(diff / 3600000);
  const dias = Math.floor(diff / 86400000);
  if (minutos < 1) return 'Ahora';
  if (minutos < 60) return `Hace ${minutos}min`;
  if (horas < 24) return `Hace ${horas}h`;
  if (dias < 30) return `Hace ${dias}d`;
  return new Date(fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ActividadCartera({ carteraId }) {
  const [actividades, setActividades] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!carteraId) return;
    setCargando(true);
    carterasApi.obtenerActividadCartera(carteraId)
      .then(res => setActividades(res.datos))
      .catch(err => console.error('Error cargando actividad de la cartera:', err))
      .finally(() => setCargando(false));
  }, [carteraId]);

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
        <Loader2 size={16} className="animate-spin" /> Cargando actividad...
      </div>
    );
  }

  if (actividades.length === 0) {
    return (
      <div className="card p-8 text-center">
        <Activity size={28} className="mx-auto text-gray-200 mb-3" />
        <p className="text-sm text-gray-500">Sin actividad registrada</p>
        <p className="text-xs text-gray-400 mt-1">Los movimientos de los proyectos de esta cartera aparecerán aquí.</p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">Actividad de la cartera</h2>
      <div className="relative">
        <div className="absolute left-4 top-4 bottom-4 w-px bg-gray-200" />
        <div className="space-y-4">
          {actividades.map(ev => {
            const config = ICONO_POR_TIPO[ev.tipo] || { icono: Activity, color: 'bg-gray-100 text-gray-500' };
            const Icono = config.icono;
            return (
              <div key={ev.id} className="flex gap-3 relative">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${config.color}`}>
                  <Icono size={14} />
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <p className="text-sm text-gray-800">{ev.titulo}</p>
                  {ev.descripcion && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{ev.descripcion}</p>}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {ev.actor && <span className="text-xs text-gray-400">{ev.actor}</span>}
                    <Link to={`/proyectos/${ev.proyecto_id}`} className="text-[10.5px] bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 text-gray-600 hover:text-guinda-600 hover:border-guinda-200">
                      {ev.proyecto_nombre}
                    </Link>
                    <span className="text-xs text-gray-300">{fechaRelativa(ev.created_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
