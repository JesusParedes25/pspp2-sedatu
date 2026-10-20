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
 * de este componente) lleva un candado y queda "bloqueada"; uno donde sí
 * puede, lleva un lápiz y queda "asignada". El apagado vive SIEMPRE en el
 * FONDO del renglón (bg-gray-150 bloqueada / bg-white asignada), nunca en
 * el texto — dos rondas anteriores probaron que atenuar+oscurecer el
 * texto se cancelan entre sí (ronda 1→2) y que bg-gray-50 era
 * imperceptible (ronda 2→3, verificado en producción). Con el porcentaje
 * ya en su color primario (no el tenue de antes) para una fila bloqueada,
 * no hace falta calibrar ningún texto contra 4.5:1 en este archivo — ver
 * valores medidos abajo, por elemento.
 *
 * Tres señales distinguen una fila "asignada": fondo blanco, nombre en
 * semi-negrita, y el lápiz (en vez del candado) — nunca la barra de
 * acento de la izquierda, que es exclusiva de "este es el nodo
 * seleccionado" (navegación), un significado distinto y preexistente.
 *
 * Fondo = permiso, barra de acento = selección — nunca se cruzan (ronda
 * 5). Antes, seleccionar una fila bloqueada hacía que el lavado rosado de
 * la selección reemplazara el gris, pintando la fila como si el usuario
 * tuviera permiso justo al lado del candado que dice lo contrario. Ahora
 * `fondoFila` decide el color SOLO por `esConsulta`; `esSeleccionado`
 * únicamente agrega la barra de acento — nunca cambia qué color de fondo
 * corresponde. El único matiz es que una fila bloqueada seleccionada no
 * puede quedarse con exactamente el mismo gris que una no seleccionada
 * (perdería la marca de "aquí estás parado" si alguna vez la barra no
 * fuera suficiente por sí sola): usa `bg-gray-200`, el valor de la ronda
 * anterior — un escalón más oscuro que el `bg-gray-150` nuevo de esta
 * ronda, nunca el rosado. `colorNombre` sigue la misma prioridad: una
 * fila bloqueada se queda en `text-gray-700` sin importar si está
 * seleccionada (antes se volvía `text-guinda-700 font-semibold`, la
 * misma marca visual que "esto es mío" — justo lo que esta ronda corrige
 * también en el texto, no solo en el fondo).
 *
 * Sin tema oscuro: la plataforma no lo tiene y no está planeado, no
 * agregar clases `dark:` aquí (se agregaron y se retiraron en una ronda
 * anterior; confirmado por `git grep` contra el commit previo a Fase 3
 * que no existían en ningún otro archivo, así que no hay nada que
 * reconciliar).
 *
 * Ronda 6 (navegación del árbol): la barra de acento sola resultó
 * "demasiado sutil" para leer "aquí estoy". `esSeleccionado` ahora
 * también cambia el fondo (antes se quedaba en blanco/gray-150 igual
 * que sin seleccionar) y agrega un `ring-1 ring-inset`, pero sigue sin
 * cruzarse con `esConsulta`: una fila bloqueada seleccionada sube a un
 * fondo/anillo GRIS más marcado, nunca al guinda que lleva una
 * asignada seleccionada. Ver el comentario junto a `fondoFila` para los
 * valores exactos y los ratios medidos.
 */
import { ChevronRight, ChevronDown, Lock, Pencil } from 'lucide-react';
import SemaforoDot from '../../common/SemaforoDot';
import { hijosDe } from './utils';
import { formatearEstado } from '../../../utils/estados';

// El candado es el único elemento de esta fila para el que la opacidad
// debe pasar el mínimo de contraste de TEXTO (4.5:1, es un ícono que se
// lee igual que una palabra) — parte del tono más fuerte disponible,
// `gray-900`, mezclado al 65% mide 5.19:1 contra `bg-gray-150` (el fondo
// real sobre el que se dibuja; 5.06:1 contra `bg-gray-200`, el fondo de
// una fila bloqueada seleccionada) — ambos con margen sobre el mínimo.
const CLASE_CANDADO = 'text-gray-900 opacity-[0.65]';

// El lápiz de una fila asignada no necesita atenuarse (el fondo ya está
// a su máxima fuerza, blanco) — guinda-600, el acento institucional ya
// usado para estados activos/hover en el resto de la plataforma.
const CLASE_LAPIZ = 'text-guinda-600';

// Atenuación leve del punto del semáforo y la etiqueta de estado en una
// fila bloqueada — no es texto de lectura, así que no se calibra contra
// 4.5:1 (instrucción explícita): acompaña al fondo apagado sin perder
// el matiz de su color real.
const OPACIDAD_LEVE = 'opacity-[0.72]';

const INDENT_PX = { etapa: 0, accion: 36, tarea: 58 };

export default function NodoArbol({ nodo, tipo, expandidos, seleccionadoId, onToggle, onSelect, permisos }) {
  const esExpandido = expandidos.has(nodo.id);
  const esSeleccionado = seleccionadoId === nodo.id;
  const hijos = hijosDe(tipo, nodo);
  const tieneHijos = hijos.length > 0;
  const sem = nodo.semaforo_efectivo || 'gris';
  const avance = nodo.avance_efectivo ?? (tipo === 'etapa' ? parseFloat(nodo.porcentaje_calculado || 0) : parseFloat(nodo.porcentaje_avance || 0));
  // Solo estado — la urgencia (vencida/por vencer) ya la dice el punto de
  // semáforo a la izquierda; mezclar las dos en esta misma etiqueta es lo
  // que hacía que "estado" y "semáforo" se leyeran como una sola cosa.
  const etiqueta = formatearEstado(nodo.estado);
  // Misma fuente que usa el servidor para aceptar o rechazar la escritura
  // (ver cabecera de este archivo) — nunca un cálculo propio de la fila.
  const puedeEscribir = permisos ? permisos.puedeEditarNodo(tipo, nodo.id) : true;
  const esConsulta = !puedeEscribir;

  function activar() { onSelect(tipo, nodo.id, nodo); }

  // Fondo = permiso, barra de acento = selección: dos señales, dos
  // significados, sin cruce (ronda 5, ver cabecera del archivo). El
  // color decide primero por `esConsulta` (nunca por `esSeleccionado`);
  // la selección agrega `border-l-guinda-600` más un `ring-1 ring-inset`
  // que cierra el renglón como celda (ronda 6, "selección demasiado
  // sutil": la barra sola no bastaba para leer "aquí estoy").
  //
  // El tono del anillo es la misma señal que el fondo: guinda cuando SÍ
  // se puede editar, gris cuando NO; nunca guinda en una fila bloqueada,
  // que repetiría el error exacto de Fase 3 (una fila bloqueada
  // seleccionada pintada como si fuera editable). `bg-guinda-50/40`
  // (la ronda anterior) medía 1.035:1 contra blanco, prácticamente
  // invisible, así que el fondo de una fila asignada seleccionada sube a
  // `bg-guinda-100` sólido (1.375:1 contra blanco, más perceptible que el
  // propio `bg-gray-150` de una fila bloqueada) y una bloqueada
  // seleccionada se queda en `bg-gray-200`, sin cambios, un escalón más
  // oscuro que el `bg-gray-150` de una bloqueada normal.
  //
  // Los 4 ratios de contraste del texto/ícono contra su fondo de
  // selección (medidos, no a ojo):
  //   1) Nombre (text-guinda-700) sobre bg-guinda-100: 10.79:1
  //   2) Lápiz  (text-guinda-600) sobre bg-guinda-100:  9.31:1
  //   3) Nombre (text-gray-700)   sobre bg-gray-200:     8.33:1 (sin cambio)
  //   4) Candado (gray-900 @65%)  sobre bg-gray-200:     5.06:1 (sin cambio)
  // Los anillos en sí (borde no-textual, WCAG 1.4.11, mínimo 3:1) contra
  // su propio fondo: ring-guinda-500/bg-guinda-100 = 7.35:1,
  // ring-gray-600/bg-gray-200 = 6.1:1; un guinda-200 o un gray-400 más
  // tenues NO alcanzaban el mínimo (1.44:1 y 2.05:1), por eso el salto a
  // guinda-500/gray-600.
  const fondoFila = esConsulta
    ? esSeleccionado
      ? 'bg-gray-200 border-l-[3px] border-l-guinda-600 ring-1 ring-inset ring-gray-600'
      : 'bg-gray-150 border-l-[3px] border-l-transparent hover:bg-gray-200/60'
    : esSeleccionado
      ? 'bg-guinda-100 border-l-[3px] border-l-guinda-600 ring-1 ring-inset ring-guinda-500'
      : 'bg-white border-l-[3px] border-l-transparent hover:bg-gray-50';

  // Misma prioridad que el fondo: una fila bloqueada se queda en
  // `text-gray-700` sin importar la selección — el texto tampoco debe
  // tomar prestado el color de "esto es mío" (`text-guinda-700`) solo
  // porque está seleccionada.
  const colorNombre = esConsulta
    ? 'text-gray-700'
    : esSeleccionado
      ? 'font-semibold text-guinda-700'
      : 'font-semibold text-gray-700'; // "es mío" — un escalón de peso por encima de lo normal

  // Porcentaje: color primario (gray-700, el mismo del nombre) en vez
  // del tenue (gray-500) cuando la fila está bloqueada — medido contra
  // bg-gray-150 (el fondo por defecto de una fila bloqueada): gray-700
  // da 8.84:1; contra bg-gray-200 (bloqueada seleccionada) sigue en
  // 8.33:1. gray-500 (el de antes) caía a 3.90:1 contra gray-200, bajo
  // el mínimo de 4.5:1 — y aclarar el fondo solo lo habría hundido más.
  // En una fila asignada se queda en gray-500, su tono de siempre (no
  // forma parte de la marca "es mío", que ya la dan el nombre en
  // negrita y el lápiz).
  const colorPorcentaje = esConsulta ? 'text-gray-700' : 'text-gray-500';

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
        className={`flex items-center gap-1.5 pr-3 py-[7px] border-b border-gray-100 cursor-pointer outline-none transition-colors ${fondoFila}`}
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

        <SemaforoDot semaforo={sem} estado={nodo.estado} avance={avance} fechaLimite={nodo.fecha_limite} fechaFin={nodo.fecha_fin} prioridad={nodo.prioridad} size={7} className={esConsulta ? OPACIDAD_LEVE : ''} />

        <span className={`flex-1 min-w-0 truncate text-[13px] ${colorNombre}`} title={nodo.nombre}>
          {nodo.nombre}
        </span>

        {etiqueta && (
          <span className={`flex-shrink-0 text-[10px] font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded leading-none ${esConsulta ? OPACIDAD_LEVE : ''}`}>
            {etiqueta}
          </span>
        )}

        {/* Misma columna, dos estados legibles de un vistazo: candado
            (bloqueada) o lápiz (asignada) — nunca los dos, nunca ninguno. */}
        {esConsulta ? (
          <Lock
            size={11}
            className={`flex-shrink-0 ${CLASE_CANDADO}`}
            aria-label="Sin permiso de edición en este elemento"
            role="img"
          />
        ) : (
          <Pencil
            size={11}
            className={`flex-shrink-0 ${CLASE_LAPIZ}`}
            aria-label="Puedes capturar en este elemento"
            role="img"
          />
        )}

        <span className={`flex-shrink-0 font-mono text-[11px] tabular-nums w-9 text-right ${colorPorcentaje}`}>
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
