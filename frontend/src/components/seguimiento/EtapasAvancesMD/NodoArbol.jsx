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
 * de este componente) lleva un candado y queda "bloqueada".
 *
 * CORRECCIÓN (segunda ronda): la primera versión atenuaba el TEXTO
 * (opacidad + oscurecer el color base para que, ya mezclado, siguiera
 * pasando 4.5:1). Verificado en producción: el apagado quedó invisible
 * — oscurecer y luego atenuar se cancelan casi por completo entre sí.
 * El apagado se movió al FONDO del renglón, que es el que hace todo el
 * trabajo visual; el texto del nombre/porcentaje regresa a sus colores
 * normales sin ningún ajuste (nunca hay que calibrar nada contra 4.5:1
 * aquí: el texto nunca cambió de color, solo el fondo detrás de él). El
 * punto del semáforo y la etiqueta de estado sí llevan una atenuación
 * leve (0.72) sobre su propio color — no es texto de lectura continua,
 * y a ese nivel acompañan el fondo sin perder su matiz. El candado
 * conserva su tratamiento de la primera ronda (gray-900 + opacity-0.65,
 * el único de los cuatro elementos que de verdad necesita pasar 4.5:1
 * contra blanco) — salvo en tema oscuro, donde se invierte a un tono
 * claro por la misma razón: oscuro-sobre-oscuro también se volvería
 * invisible.
 *
 * Una fila "asignada" (el usuario SÍ puede capturar ahí) se distingue
 * por TRES señales — fondo blanco (sin el lavado gris), nombre en
 * semi-negrita, y la ausencia del candado — nunca por la barra de
 * acento de la izquierda: esa sigue siendo exclusiva de "este es el
 * nodo seleccionado" (navegación), un significado distinto que ya
 * existía antes de Fase 3. Mezclar ambos en la misma barra habría hecho
 * que "estoy viendo este nodo" y "este nodo es mío" compitieran por la
 * misma señal.
 */
import { ChevronRight, ChevronDown, Lock } from 'lucide-react';
import SemaforoDot from '../../common/SemaforoDot';
import { hijosDe } from './utils';

// El candado es el único elemento de esta fila para el que la opacidad
// debe pasar el mínimo de contraste de TEXTO (4.5:1, es un ícono que se
// lee igual que una palabra) — parte del tono más fuerte disponible en
// cada tema (gray-900 en claro, gray-100 en oscuro) para que, ya
// mezclado al 65% contra el fondo, siga claramente visible (5.52:1
// medido en claro). El resto de la fila (fondo, dot, etiqueta) no
// necesita este cálculo — ver cabecera del archivo.
const CLASE_CANDADO = 'text-gray-900 dark:text-gray-100 opacity-[0.65]';

// Atenuación leve del punto del semáforo y la etiqueta de estado en una
// fila bloqueada — no es texto de lectura, así que no se calibra contra
// 4.5:1 (instrucción explícita): acompaña al fondo apagado sin perder
// el matiz de su color real.
const OPACIDAD_LEVE = 'opacity-[0.72]';

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

  // El fondo decide tres estados mutuamente excluyentes, en este orden
  // de prioridad: seleccionado (navegación, sin importar el permiso) >
  // bloqueado (lavado gris) > asignado (blanco del panel, el caso por
  // defecto). La barra de acento de la izquierda queda SOLO en el caso
  // seleccionado — nunca marca "esto es mío", ver cabecera del archivo.
  // bg-gray-50, no bg-gray-100: medido — contra gray-100 el porcentaje
  // (gray-500) cae a 4.39:1, bajo el mínimo de 4.5:1 que sigue aplicando
  // porque el texto normal tiene que seguir pasando contra el fondo
  // nuevo (instrucción explícita). gray-50 da 4.63:1 (con margen) y
  // 1.045:1 de separación contra blanco — la misma separación que ya
  // usa hover:bg-gray-50 en una fila normal, así que es una diferencia
  // ya probada como perceptible en este mismo componente. El hover de
  // una fila bloqueada usa un paso más oscuro (gray-100) para no
  // confundirse con el hover de una fila asignada.
  const fondoFila = esSeleccionado
    ? 'bg-guinda-50/70 dark:bg-guinda-900/30 border-l-[3px] border-l-guinda-600 dark:border-l-guinda-500'
    : esConsulta
      ? 'bg-gray-50 dark:bg-gray-950 border-l-[3px] border-l-transparent hover:bg-gray-100 dark:hover:bg-gray-900'
      : 'bg-white dark:bg-gray-900 border-l-[3px] border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-800';

  const colorNombre = esSeleccionado
    ? 'font-semibold text-guinda-700 dark:text-guinda-300'
    : esConsulta
      ? 'text-gray-700 dark:text-gray-300'
      : 'font-semibold text-gray-700 dark:text-gray-100'; // "es mío" — un escalón de peso por encima de lo normal

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
        className={`flex items-center gap-1.5 pr-3 py-[7px] border-b border-gray-100 dark:border-gray-800 cursor-pointer outline-none transition-colors ${fondoFila}`}
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

        <SemaforoDot semaforo={sem} estado={nodo.estado} avance={avance} size={7} className={esConsulta ? OPACIDAD_LEVE : ''} />

        <span className={`flex-1 min-w-0 truncate text-[13px] ${colorNombre}`} title={nodo.nombre}>
          {nodo.nombre}
        </span>

        {etiqueta && (
          <span className={`flex-shrink-0 text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded leading-none ${esConsulta ? OPACIDAD_LEVE : ''}`}>
            {etiqueta}
          </span>
        )}

        {esConsulta && (
          <Lock
            size={11}
            className={`flex-shrink-0 ${CLASE_CANDADO}`}
            aria-label="Sin permiso de edición en este elemento"
            role="img"
          />
        )}

        <span className="flex-shrink-0 font-mono text-[11px] tabular-nums w-9 text-right text-gray-500 dark:text-gray-400">
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
