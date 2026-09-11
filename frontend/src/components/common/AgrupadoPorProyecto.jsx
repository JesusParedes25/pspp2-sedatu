/**
 * ARCHIVO: AgrupadoPorProyecto.jsx
 * PROPÓSITO: Agrupa una lista de items (vencidas, riesgos, actividad,
 *            estatus cualitativo) por proyecto, para listas que mezclan
 *            varios proyectos a la vez (Tablero, Resumen de cartera) —
 *            antes se leían como una sola lista plana y había que fijarse
 *            en el texto gris de cada línea para saber de qué proyecto
 *            era cada cosa.
 *
 * items debe traer `proyecto_nombre` y, opcionalmente, `dg_siglas`, y un
 * id de proyecto bajo `proyecto_id` o `id_proyecto` (getProyectoId lo
 * resuelve). El orden de los grupos respeta el orden de aparición de los
 * items (ya vienen ordenados por fecha/severidad desde el backend).
 */
import { FolderKanban } from 'lucide-react';

export default function AgrupadoPorProyecto({
  items = [],
  getProyectoId = item => item.proyecto_id ?? item.id_proyecto,
  renderItem,
  vacio = 'Nada que mostrar.',
  className = 'space-y-2',
}) {
  if (items.length === 0) {
    return <p className="text-xs text-gray-400 italic">{vacio}</p>;
  }

  const grupos = [];
  const indice = new Map();
  for (const item of items) {
    const pid = getProyectoId(item);
    if (!indice.has(pid)) {
      indice.set(pid, grupos.length);
      grupos.push({ id: pid, nombre: item.proyecto_nombre || 'Proyecto', dgSiglas: item.dg_siglas, items: [] });
    }
    grupos[indice.get(pid)].items.push(item);
  }

  return (
    <div className={className}>
      {grupos.map(g => (
        <div key={g.id}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <FolderKanban size={11} className="text-guinda-400 flex-shrink-0" />
            <span className="text-[11px] font-bold text-guinda-700 truncate">{g.nombre}</span>
            {g.dgSiglas && (
              <span className="text-[9px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded flex-shrink-0">{g.dgSiglas}</span>
            )}
          </div>
          <div className="space-y-1.5 pl-2.5 border-l-2 border-gray-100">
            {g.items.map(renderItem)}
          </div>
        </div>
      ))}
    </div>
  );
}
