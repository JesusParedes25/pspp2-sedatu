/**
 * ARCHIVO: FilaCentro.jsx
 * PROPÓSITO: Fila de navegación (no de acciones) dentro de la lista de la
 *            rama enfocada, en la columna central de Detalle. Clic en la
 *            fila selecciona el nodo (actualiza el panel derecho y la
 *            Actividad, sin cambiar la rama enfocada); clic en el chevron
 *            expande sus hijos anidados debajo, con sangría — nunca
 *            reemplaza la lista. Solo información: tipo, nombre,
 *            responsable, fecha, avance — cero botones de acción, ni en
 *            hover (esas viven todas en el panel derecho).
 */
import { ChevronRight, ChevronDown } from 'lucide-react';
import SemaforoDot from '../../common/SemaforoDot';
import { NIVELES } from '../../../config/niveles';
import { formatFecha } from '../../../utils/fecha';
import { hijosDe } from './utils';

export default function FilaCentro({ tipo, nodo, profundidad, expandidos, onToggle, seleccionId, onSeleccionar }) {
  const nivelInfo = NIVELES[tipo];
  const Icono = nivelInfo.icono;
  const hijos = hijosDe(tipo, nodo);
  const tieneHijos = hijos.length > 0;
  const expandido = expandidos.has(nodo.id);
  const seleccionado = seleccionId === nodo.id;
  const sem = nodo.semaforo_efectivo || 'gris';
  const avance = nodo.avance_efectivo ?? (tipo === 'etapa' ? parseFloat(nodo.porcentaje_calculado || 0) : parseFloat(nodo.porcentaje_avance || 0));
  const fecha = nodo.fecha_limite || nodo.fecha_fin || null;

  function activar() { onSeleccionar(tipo, nodo.id); }

  return (
    <div>
      <div
        role="treeitem"
        aria-expanded={tieneHijos ? expandido : undefined}
        aria-selected={seleccionado}
        tabIndex={0}
        onClick={activar}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activar(); }
          if (e.key === 'ArrowRight' && tieneHijos && !expandido) { e.preventDefault(); onToggle(nodo.id); }
          if (e.key === 'ArrowLeft' && tieneHijos && expandido) { e.preventDefault(); onToggle(nodo.id); }
        }}
        style={{ marginLeft: profundidad * 18 }}
        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-guinda-300 ${
          seleccionado ? 'border-guinda-300 bg-guinda-50' : 'border-gray-100 hover:bg-gray-50'
        }`}
      >
        <button
          onClick={e => { e.stopPropagation(); if (tieneHijos) onToggle(nodo.id); }}
          tabIndex={-1}
          className="w-4 h-4 flex-shrink-0 flex items-center justify-center"
        >
          {tieneHijos ? (
            expandido ? <ChevronDown size={13} className="text-gray-400" /> : <ChevronRight size={13} className="text-gray-400" />
          ) : <span className="w-3" />}
        </button>
        <Icono size={11} style={{ color: nivelInfo.color }} className="flex-shrink-0" aria-hidden="true" />
        <SemaforoDot semaforo={sem} estado={nodo.estado} size={7} />
        <span className={`flex-1 min-w-0 text-xs truncate ${seleccionado ? 'font-semibold text-guinda-700' : 'text-gray-700'}`} title={nodo.nombre}>
          {nodo.nombre}
        </span>
        {nodo.responsable_nombre && (
          <span className="hidden sm:block text-[10px] text-gray-400 truncate max-w-[110px] flex-shrink-0">{nodo.responsable_nombre}</span>
        )}
        <span className="hidden md:block text-[10px] text-gray-400 tabular-nums flex-shrink-0 w-14 text-right">{formatFecha(fecha) || '—'}</span>
        <span className="text-xs font-medium text-gray-600 tabular-nums w-9 text-right flex-shrink-0">{Math.round(avance)}%</span>
      </div>

      {expandido && hijos.map(h => (
        <FilaCentro
          key={h.nodo.id}
          tipo={h.tipo}
          nodo={h.nodo}
          profundidad={profundidad + 1}
          expandidos={expandidos}
          onToggle={onToggle}
          seleccionId={seleccionId}
          onSeleccionar={onSeleccionar}
        />
      ))}
    </div>
  );
}
