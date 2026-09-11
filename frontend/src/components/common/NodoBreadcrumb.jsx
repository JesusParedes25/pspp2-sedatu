/**
 * ARCHIVO: NodoBreadcrumb.jsx
 * PROPÓSITO: Chips de Etapa › Acción › Tarea para ubicar de un vistazo en
 *            qué nivel de la jerarquía vive un item (vencida, riesgo,
 *            evento de actividad, estatus cualitativo) — mismo criterio
 *            de color por tipo que ya usan MapaProyecto.jsx y
 *            MapaTerritorialInicio.jsx (TIPO_COLOR), para que se lea como
 *            el mismo lenguaje visual en toda la plataforma.
 *
 * Espera los campos que ya devuelven inicio.queries.js y carteras.queries.js
 * para estos items: tipo_nodo, etapa_nombre, accion_nombre,
 * accion_padre_nombre (subacción), tarea_nombre.
 */
import { ChevronRight } from 'lucide-react';

const TIPO_COLOR = {
  etapa: 'text-indigo-600 bg-indigo-50',
  accion: 'text-blue-600 bg-blue-50',
  tarea: 'text-teal-700 bg-teal-50',
};

export default function NodoBreadcrumb({ item }) {
  const pasos = [];
  if (item.etapa_nombre) pasos.push({ tipo: 'etapa', nombre: item.etapa_nombre });
  if (item.accion_padre_nombre) pasos.push({ tipo: 'accion', nombre: item.accion_padre_nombre });
  if (item.accion_nombre) pasos.push({ tipo: 'accion', nombre: item.accion_nombre });
  if (item.tarea_nombre) pasos.push({ tipo: 'tarea', nombre: item.tarea_nombre });

  if (pasos.length === 0) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {pasos.map((p, i) => (
        <span key={i} className="flex items-center gap-1 min-w-0">
          {i > 0 && <ChevronRight size={9} className="text-gray-300 flex-shrink-0" />}
          <span className={`text-[9.5px] font-semibold px-1.5 py-0.5 rounded truncate max-w-[160px] ${TIPO_COLOR[p.tipo]}`}>
            {p.nombre}
          </span>
        </span>
      ))}
    </div>
  );
}
