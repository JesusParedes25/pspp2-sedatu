/**
 * ARCHIVO: NodoArbol.jsx
 * PROPÓSITO: Fila institucional del árbol izquierdo de Detalle —
 *            navegación pura (seleccionar, expandir/colapsar), nada más:
 *            sin edición rápida de avance ni "+Agregar" inline (viven en
 *            el panel derecho, ver fila de acciones). Listado de ancho
 *            completo separado por una línea de 1px, sin tarjetas ni
 *            esquinas redondeadas por fila; jerarquía solo por sangría
 *            (etapa 0, acción 36px, tarea 58px — una subacción comparte
 *            el nivel visual de "acción", sin un cuarto escalón: el
 *            modelo de 3 tipos de NIVELES ya no distingue más que eso, y
 *            el propio expandir/colapsar deja clara la anidación).
 */
import { ChevronRight, ChevronDown } from 'lucide-react';
import SemaforoDot from '../../common/SemaforoDot';
import { hijosDe } from './utils';

const INDENT_PX = { etapa: 0, accion: 36, tarea: 58 };

// Etiqueta corta de estatus — solo se muestra cuando NO es "en proceso
// sano" (el caso normal no necesita anunciarse). El riesgo abierto nunca
// entra en el color del semáforo (ver avance-semaforo.js::calcularSemaforo
// en el backend — el riesgo de un nodo no es un factor de esa fórmula),
// así que "En riesgo" vive aparte, como señal textual propia, con
// prioridad menor que vencida/bloqueada/concluida pero mayor que "sin
// iniciar".
function etiquetaFila(nodo) {
  if (nodo.estado === 'Completada') return 'Concluida';
  if (nodo.estado === 'Cancelada') return 'Cancelada';
  if (nodo.estado === 'Bloqueada') return 'Bloqueada';
  if ((nodo.semaforo_efectivo || nodo.semaforo) === 'rojo') return 'Vencida';
  if ((nodo.riesgos_abiertos || 0) > 0) return 'En riesgo';
  if (nodo.estado === 'Pendiente') return 'Sin iniciar';
  return null;
}

export default function NodoArbol({ nodo, tipo, expandidos, seleccionadoId, onToggle, onSelect }) {
  const esExpandido = expandidos.has(nodo.id);
  const esSeleccionado = seleccionadoId === nodo.id;
  const hijos = hijosDe(tipo, nodo);
  const tieneHijos = hijos.length > 0;
  const sem = nodo.semaforo_efectivo || 'gris';
  const avance = nodo.avance_efectivo ?? (tipo === 'etapa' ? parseFloat(nodo.porcentaje_calculado || 0) : parseFloat(nodo.porcentaje_avance || 0));
  const etiqueta = etiquetaFila(nodo);

  function activar() { onSelect(tipo, nodo.id, nodo); }

  return (
    <div>
      <div
        role="treeitem"
        aria-selected={esSeleccionado}
        aria-expanded={tieneHijos ? esExpandido : undefined}
        aria-level={tipo === 'etapa' ? 1 : tipo === 'accion' ? 2 : 3}
        tabIndex={0}
        onClick={activar}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activar(); }
          if (e.key === 'ArrowRight' && tieneHijos && !esExpandido) { e.preventDefault(); onToggle(nodo.id); }
          if (e.key === 'ArrowLeft' && tieneHijos && esExpandido) { e.preventDefault(); onToggle(nodo.id); }
        }}
        className={`flex items-center gap-1.5 pr-3 py-[7px] border-b border-gray-100 cursor-pointer outline-none transition-colors
          ${esSeleccionado ? 'bg-guinda-50/70 border-l-[3px] border-l-guinda-600' : 'border-l-[3px] border-l-transparent hover:bg-gray-50'}`}
        style={{ paddingLeft: `${INDENT_PX[tipo] + 10}px` }}
      >
        <button
          onClick={e => { e.stopPropagation(); if (tieneHijos) onToggle(nodo.id); }}
          tabIndex={-1}
          className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0"
        >
          {tieneHijos && (
            esExpandido ? <ChevronDown size={12} className="text-gray-400" /> : <ChevronRight size={12} className="text-gray-400" />
          )}
        </button>

        <SemaforoDot semaforo={sem} estado={nodo.estado} avance={avance} size={7} />

        <span className={`flex-1 min-w-0 truncate text-[13px] ${esSeleccionado ? 'font-semibold text-guinda-700' : 'text-gray-700'}`} title={nodo.nombre}>
          {nodo.nombre}
        </span>

        {etiqueta && (
          <span className="flex-shrink-0 text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded leading-none">
            {etiqueta}
          </span>
        )}

        <span className="flex-shrink-0 font-mono text-[11px] tabular-nums text-gray-500 w-9 text-right">
          {Math.round(avance)}%
        </span>
      </div>

      {esExpandido && hijos.map(h => (
        <NodoArbol
          key={h.nodo.id}
          nodo={h.nodo}
          tipo={h.tipo}
          expandidos={expandidos}
          seleccionadoId={seleccionadoId}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
