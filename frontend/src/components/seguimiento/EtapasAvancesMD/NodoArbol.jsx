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
 *
 * Fase 3 del modelo de permisos (docs/modelo-permisos.md, "estado de
 * consulta en la interfaz"): un nodo donde el usuario no puede capturar
 * (`permisos.puedeEditarNodo(tipo, id)` — la MISMA fuente que usa el
 * servidor para aceptar o rechazar la escritura, nunca un cálculo propio
 * de este componente) lleva un candado y queda atenuada. El atenuado NO
 * es una sola opacidad sobre todo el renglón: se aplicó por elemento,
 * partiendo siempre del tono más fuerte del texto (`gray-900`, no el
 * tenue de cada quien) para que, incluso ya mezclado al 65% contra el
 * fondo blanco de la fila, nombre/porcentaje/candado sigan pasando el
 * mínimo de contraste de texto (4.5:1 — medido, no supuesto: con el gris
 * normal de cada uno el resultado caía a 3.79:1 y 2.52:1). El punto del
 * semáforo queda deliberadamente SIN atenuar: medido también, ninguna
 * opacidad entre 0.80 y 1.00 deja pasar los cuatro colores el mínimo
 * gráfico de 3:1 a la vez (el gris ya falla incluso a opacidad plena,
 * 2.56:1 — un hallazgo previo a este PR, anotado en la sección de
 * pendientes) — oscurecer la base para forzarlo tampoco sirve, porque
 * acerca los cuatro colores entre sí en vez de separarlos. No se tocó
 * SemaforoDot/COLORES_SEMAFORO por esto: es la única fuente de verdad
 * visual del semáforo en toda la plataforma.
 */
import { ChevronRight, ChevronDown, Lock } from 'lucide-react';
import SemaforoDot from '../../common/SemaforoDot';
import { hijosDe } from './utils';

// Mismo tono (`gray-900`) para los tres elementos de texto/ícono de una
// fila de consulta — es el color más fuerte que ya usa esta pantalla
// (el título del nodo en EncabezadoDetalle.jsx), no uno nuevo. Mezclado
// al 65% contra el blanco de la fila mide 5.52:1 — con margen cómodo
// sobre el mínimo de 4.5:1. `opacity-[0.65]` va en el elemento mismo,
// no en un contenedor que envuelva también al punto del semáforo.
const CLASE_ATENUADA = 'text-gray-900 opacity-[0.65]';

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

export default function NodoArbol({ nodo, tipo, expandidos, seleccionadoId, onToggle, onSelect, permisos }) {
  const esExpandido = expandidos.has(nodo.id);
  const esSeleccionado = seleccionadoId === nodo.id;
  const hijos = hijosDe(tipo, nodo);
  const tieneHijos = hijos.length > 0;
  const sem = nodo.semaforo_efectivo || 'gris';
  const avance = nodo.avance_efectivo ?? (tipo === 'etapa' ? parseFloat(nodo.porcentaje_calculado || 0) : parseFloat(nodo.porcentaje_avance || 0));
  const etiqueta = etiquetaFila(nodo);
  // Misma fuente que usa el servidor para aceptar o rechazar la escritura
  // (ver cabecera de este archivo) — nunca un cálculo propio de la fila.
  const puedeEscribir = permisos ? permisos.puedeEditarNodo(tipo, nodo.id) : true;
  const esConsulta = !puedeEscribir;

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

        <span
          className={`flex-1 min-w-0 truncate text-[13px] ${
            esConsulta ? CLASE_ATENUADA : esSeleccionado ? 'font-semibold text-guinda-700' : 'text-gray-700'
          }`}
          title={nodo.nombre}
        >
          {nodo.nombre}
        </span>

        {etiqueta && (
          <span className={`flex-shrink-0 text-[10px] font-medium bg-gray-100 px-1.5 py-0.5 rounded leading-none ${esConsulta ? CLASE_ATENUADA : 'text-gray-500'}`}>
            {etiqueta}
          </span>
        )}

        {esConsulta && (
          <Lock
            size={11}
            className={`flex-shrink-0 ${CLASE_ATENUADA}`}
            aria-label="Sin permiso de edición en este elemento"
            role="img"
          />
        )}

        <span className={`flex-shrink-0 font-mono text-[11px] tabular-nums w-9 text-right ${esConsulta ? CLASE_ATENUADA : 'text-gray-500'}`}>
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
          permisos={permisos}
        />
      ))}
    </div>
  );
}
