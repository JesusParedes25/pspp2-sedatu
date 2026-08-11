/**
 * ARCHIVO: CronogramaCartera.jsx
 * PROPÓSITO: Línea de tiempo consolidada de la cartera — una barra por
 *            proyecto, no por etapa/acción (eso ya existe por proyecto
 *            individual en GanttCronograma.jsx). Sirve para ver
 *            traslapes entre los proyectos de la cartera.
 *
 * Usa fecha_inicio_efectiva/fecha_fin_efectiva (carteras.queries.js):
 * proyectos.fecha_inicio/fecha_limite son campos manuales opcionales del
 * formulario de creación y casi siempre quedan vacíos — la fecha real se
 * calcula a partir de etapas.fecha_inicio/fecha_fin (que a su vez se
 * recalculan automáticamente desde acciones/tareas), con el campo del
 * proyecto solo como respaldo si la etapa no tiene fechas.
 */
import { Link } from 'react-router-dom';
import { Calendar } from 'lucide-react';
import { parseFechaLocal } from '../../utils/fecha';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function colorBarra(p) {
  if (p.vencido) return 'bg-red-500';
  if (p.estado === 'Completada') return 'bg-green-500';
  if (p.estado === 'En_proceso') return 'bg-blue-500';
  if (p.estado === 'Bloqueada') return 'bg-red-400';
  if (p.estado === 'Cancelada') return 'bg-gray-400';
  return 'bg-gray-300';
}

export default function CronogramaCartera({ proyectos = [] }) {
  const conFechas = proyectos
    .map(p => ({ ...p, ini: parseFechaLocal(p.fecha_inicio_efectiva), fin: parseFechaLocal(p.fecha_fin_efectiva) }))
    .filter(p => p.ini && p.fin && p.fin > p.ini);

  if (conFechas.length === 0) {
    return (
      <div className="card p-8 text-center">
        <Calendar size={28} className="mx-auto text-gray-200 mb-3" />
        <p className="text-sm text-gray-500">Sin fechas suficientes para el cronograma</p>
        <p className="text-xs text-gray-400 mt-1">Los proyectos de esta cartera necesitan fecha de inicio y fecha límite capturadas.</p>
      </div>
    );
  }

  const minFecha = new Date(Math.min(...conFechas.map(p => p.ini.getTime())));
  const maxFecha = new Date(Math.max(...conFechas.map(p => p.fin.getTime())));
  const totalDias = Math.max(1, (maxFecha - minFecha) / 86400000);
  const hoy = new Date();
  const hoyPct = ((hoy - minFecha) / 86400000 / totalDias) * 100;

  // Etiquetas de mes: un marcador por cada 1ro de mes dentro del rango
  const marcasMes = [];
  const cursor = new Date(minFecha.getFullYear(), minFecha.getMonth(), 1);
  while (cursor <= maxFecha) {
    const pct = ((cursor - minFecha) / 86400000 / totalDias) * 100;
    marcasMes.push({ etiqueta: `${MESES[cursor.getMonth()]} ${String(cursor.getFullYear()).slice(2)}`, pct });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
        <Calendar size={14} className="text-guinda-500" /> Cronograma consolidado
      </h2>
      <p className="text-xs text-gray-400 mb-4">
        Ventana de ejecución de cada proyecto de la cartera (calculada a partir de sus etapas), en una sola línea de tiempo.
      </p>
      <div className="overflow-x-auto">
        <div style={{ minWidth: 720 }}>
          {/* Encabezado de meses */}
          <div className="relative h-5 mb-2 border-b border-gray-200 ml-[220px]">
            {marcasMes.map((m, i) => (
              <span key={i} className="absolute text-[10px] text-gray-400 font-medium -translate-x-1/2" style={{ left: `${m.pct}%` }}>
                {m.etiqueta}
              </span>
            ))}
          </div>
          {/* Filas */}
          <div className="space-y-2">
            {conFechas.map(p => {
              const izq = ((p.ini - minFecha) / 86400000 / totalDias) * 100;
              const ancho = Math.max(0.8, ((p.fin - p.ini) / 86400000 / totalDias) * 100);
              const avance = Math.round(parseFloat(p.porcentaje_calculado) || 0);
              return (
                <div key={p.id} className="flex items-center">
                  <Link to={`/proyectos/${p.id}`} className="w-[220px] flex-shrink-0 pr-3 text-xs text-gray-700 hover:text-guinda-600 truncate">
                    {p.nombre}
                  </Link>
                  <div className="relative flex-1 h-5 bg-gray-50 rounded" style={{ backgroundImage: 'linear-gradient(to right, #f1f3f5 1px, transparent 1px)', backgroundSize: `${100 / (marcasMes.length || 1)}% 100%` }}>
                    {hoyPct >= 0 && hoyPct <= 100 && (
                      <div className="absolute top-0 bottom-0 w-px bg-guinda-400 opacity-60" style={{ left: `${hoyPct}%` }} />
                    )}
                    <div
                      className={`absolute top-0.5 h-4 rounded-full flex items-center px-2 text-white text-[9px] font-bold overflow-hidden whitespace-nowrap ${colorBarra(p)}`}
                      style={{ left: `${izq}%`, width: `${ancho}%` }}
                      title={`${p.nombre}: ${p.fecha_inicio_efectiva?.slice(0, 10)} a ${p.fecha_fin_efectiva?.slice(0, 10)} — ${avance}%`}
                    >
                      {avance}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {proyectos.length > conFechas.length && (
        <p className="text-[11px] text-gray-400 mt-3">
          {proyectos.length - conFechas.length} proyecto(s) sin fecha de inicio y/o fecha límite no se muestran aquí.
        </p>
      )}
    </div>
  );
}
