/**
 * ARCHIVO: FilaCompacta.jsx
 * PROPÓSITO: Fila de una sola línea para una etapa/acción/tarea — mismo
 *            dato esencial que una NodoCard (nivel, semáforo, nombre,
 *            fecha, avance) pero sin expandir checkbox/botones/metadata,
 *            para listas largas donde una tarjeta completa por item pesa
 *            demasiado (p. ej. "Vencidas" con 200+ resultados).
 *
 * Con onExpandir: fila clicable que pide mostrar el detalle completo (el
 * llamador decide qué "completo" significa — en ArbolActividadesProyecto
 * es sustituir esta fila por la NodoCard real). Sin onExpandir: fila de
 * solo lectura, sin afordancia de clic (uso como previsualización, p. ej.
 * en una columna de la vista Semana de Agenda).
 */
import { NIVELES } from '../../config/niveles';
import { COLORES_SEMAFORO } from '../common/SemaforoDot';
import { formatFecha } from '../../utils/fecha';

export default function FilaCompacta({ it, onExpandir }) {
  const info = NIVELES[it.tipo];
  const Icono = info.icono;
  const fecha = it.fecha_limite || it.fecha_fin;
  const avance = Math.round(it.avance_efectivo ?? it.avance_actual ?? 0);

  const contenido = (
    <>
      <Icono size={12} className="flex-shrink-0" style={{ color: info.color }} aria-hidden="true" />
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: COLORES_SEMAFORO[it.semaforo_efectivo || it.semaforo || 'gris'] }}
      />
      <span className="text-xs text-gray-800 truncate flex-1" title={it.nombre}>{it.nombre}</span>
      {fecha && <span className="text-[10px] text-gray-400 flex-shrink-0 tabular-nums">{formatFecha(fecha, { day: '2-digit', month: 'short' })}</span>}
      <span className="text-[10px] text-gray-500 tabular-nums w-8 text-right flex-shrink-0">{avance}%</span>
    </>
  );

  if (onExpandir) {
    return (
      <button
        onClick={onExpandir}
        className="w-full flex items-center gap-1.5 py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
      >
        {contenido}
      </button>
    );
  }
  return <div className="flex items-center gap-1.5 py-1 px-1">{contenido}</div>;
}
