/**
 * ARCHIVO: SemaforoDot.jsx
 * PROPÓSITO: Punto de color de semáforo efectivo — única fuente de verdad
 *            visual para que "Detalle" y "Vista lista" (y
 *            cualquier otra vista futura) pinten exactamente el mismo
 *            color para el mismo nodo, sin duplicar la paleta ni la
 *            leyenda en cada componente.
 */
import { CheckCircle2 } from 'lucide-react';
import { diasRestantes, fechaFinEfectiva } from '../../utils/fecha';

// "Cierre del modelo de urgencia" — el ámbar pasó de #d97706 (una
// mezcla amarillo-naranja, 3.19:1 contra blanco) a un amarillo más
// saturado para el PUNTO/barra (uso gráfico, necesita 3:1 contra su
// fondo — WCAG 1.4.11) y a un tono más oscuro para TEXTO sobre su propio
// CHIP_BG (necesita 4.5:1 — WCAG 1.4.3), medidos con la fórmula de
// luminancia relativa de WCAG. Números exactos (ver reporte para la
// tabla completa):
//   #b08700 (punto/barra) vs blanco       = 3.23:1  (>= 3:1  OK)
//   #a16207 (texto)       vs CHIP_BG.ambar = 4.64:1  (>= 4.5:1 OK)
// Esta app NO tiene tema oscuro (confirmado: sin `darkMode` en
// tailwind.config.cjs, cero clases `dark:` en el código, y ya hay una
// decisión previa documentada de no tenerlo) — no hay un segundo fondo
// contra el cual medir, así que solo existe el valor de tema claro.
// La fila bloqueada (NodoArbol.jsx, `OPACIDAD_LEVE`) sigue exenta de
// esta calibración por la misma decisión previa de esa ronda: el punto
// ahí no es texto de lectura.
export const COLORES_SEMAFORO = { verde: '#16a34a', ambar: '#b08700', rojo: '#dc2626', gris: '#94a3b8' };

// Mismo tono que COLORES_SEMAFORO pero aclarado, para el fondo de un chip de
// estado — evita que el texto de color sobre blanco se pierda como chip.
// CHIP_BG.ambar se re-tiñó al mismo matiz que el nuevo COLORES_SEMAFORO
// .ambar (antes #fdeee0, un durazno sin relación de tono) — necesario
// para que TEXTO_AMBAR_SOBRE_CHIP alcance 4.5:1 contra él.
export const CHIP_BG = { verde: '#e7f3e8', ambar: '#fef8e7', rojo: '#fbe9e9', gris: '#eef0f2' };

// Único caso que necesita un SEGUNDO tono de ámbar: donde el color se usa
// como TEXTO (EmblemaNivel.jsx, el % del chip en GanttCronograma.jsx), no
// como relleno gráfico — COLORES_SEMAFORO.ambar (el punto, el más claro
// que aún cumple 3:1) no llega a 4.5:1 como texto. Verde/rojo/gris no
// tienen un tono de texto aparte: no se midieron ni se tocaron en esta
// ronda (fuera de alcance — el encargo fue solo sobre el amarillo).
export const TEXTO_AMBAR_SOBRE_CHIP = '#a16207';

// Texto corto, exacto según la regla real de cálculo (ver
// backend/src/utils/avance-semaforo.js::calcularSemaforo) — el riesgo
// reportado en un nodo NUNCA entra en este cálculo, así que "verde" no
// puede leerse como "sin riesgo": un nodo en tiempo con un riesgo abierto
// sigue siendo verde. El detalle completo de cada caso (cuántos días
// faltan, el margen por prioridad) vive en el `title` dinámico que arma
// SemaforoDot más abajo, no aquí — este texto es la etiqueta corta para
// leyendas (pie del árbol de Detalle, Diagrama, Cronograma, Agenda: los
// cuatro la importan de aquí en vez de redactarla cada uno por su cuenta).
// gris: desde "Cierre del modelo de urgencia" cubre dos causas (sin
// fecha capturada, o cancelada) — la leyenda las agrupa en una sola
// línea bajo "Sin urgencia"; el tooltip por instancia sí distingue cuál
// de las dos es.
export const LEYENDA_SEMAFORO = {
  verde: 'En tiempo',
  ambar: 'Por vencer',
  rojo: 'Vencida',
  gris: 'Sin fecha límite o cancelada',
};

// Vocabulario de urgencia, una palabra por color — para el selector de
// semáforo de la Ficha (CampoSemaforo) y cualquier otro lugar que
// necesite SOLO el nombre del color, no la explicación larga de arriba.
// Antes el selector decía "Verde"/"Ámbar"/"Rojo"/"Gris" (el nombre del
// color) mientras la leyenda decía "En tiempo"/"Por vencer"/"Vencida" (lo
// que el color significa) — misma pastilla de color, dos vocabularios en
// dos controles del mismo módulo.
export const URGENCIA_SEMAFORO = {
  verde: 'En tiempo',
  ambar: 'Por vencer',
  rojo: 'Vencida',
  gris: 'Sin urgencia',
};

// Ventana de aviso de "Por vencer", por prioridad — espejo exacto de
// VENTANA_POR_VENCER en avance-semaforo.js (backend). Sin forma de
// compartir el módulo entre procesos: si la escala cambia ahí, hay que
// replicar el cambio aquí a mano. La interfaz la lee para escribir sus
// propios textos de ayuda (tooltip de ámbar, ayuda junto a Prioridad en
// Editar ficha) sin repetir los números sueltos.
export const VENTANA_POR_VENCER = Object.freeze({
  'Crítica': 21,
  'Muy Alta': 14,
  'Alta': 7,
  'Media': 7,
  'Baja': 7,
});
export const VENTANA_POR_DEFECTO = 7; // prioridad sin definir

export function ventanaAvisoPorVencer(prioridad) {
  return VENTANA_POR_VENCER[prioridad] ?? VENTANA_POR_DEFECTO;
}

// Umbral plano que sigue usando Mis actividades para su propia categoría
// "Por vencer" (lista de tareas por fecha, sin desglosar por prioridad
// nodo por nodo) — es VENTANA_POR_DEFECTO, no la escala completa. No se
// escaló por prioridad en esta ronda: esa pantalla no entró en el
// alcance de "Cierre del modelo de urgencia" (ver reporte, suposición
// marcada).
export const DIAS_POR_VENCER = VENTANA_POR_DEFECTO;

// Tooltip exacto por caso ("Cierre del modelo de urgencia", Bloque 4) —
// antes era un texto fijo por color (LEYENDA_SEMAFORO); ahora cada caso
// lee los días reales y, en ámbar, la prioridad real. `fechaLimite`/
// `fechaFin`/`prioridad` son opcionales — un llamador que no los pasa
// todavía (código viejo) sigue obteniendo un tooltip genérico, nunca un
// error. El cálculo de "días restantes" reusa diasRestantes()/
// fechaFinEfectiva() de utils/fecha.js (el mismo que ya usa el resto de
// la plataforma para evitar el desfase de zona horaria de una fecha sin
// hora) — no se escribió una comparación de fechas nueva.
function construirTitulo(sem, estado, avanceNum, fechaLimite, fechaFin, prioridad) {
  // Rojo: EXACTAMENTE el texto que ya existía — instrucción explícita de
  // no tocarlo ("es la mejor pieza didáctica de la interfaz").
  if (sem === 'rojo') {
    return avanceNum > 0
      ? `Vencida: la fecha límite pasó. El avance (${Math.round(avanceNum)}%) no determina este color.`
      : LEYENDA_SEMAFORO.rojo;
  }
  if (sem === 'gris') {
    return estado === 'Cancelada'
      ? 'Cancelada: no se mide contra ninguna fecha.'
      : 'Sin fecha límite: captura una fecha para que la plataforma pueda medir la urgencia.';
  }

  const dias = diasRestantes(fechaFinEfectiva({ fecha_limite: fechaLimite, fecha_fin: fechaFin }));

  if (sem === 'ambar') {
    const ventana = ventanaAvisoPorVencer(prioridad);
    const margen = prioridad
      ? `El margen de aviso es de ${ventana} días por su prioridad ${prioridad}.`
      : `El margen de aviso es de ${ventana} días.`;
    return dias !== null
      ? `Por vencer: falta${dias === 1 ? '' : 'n'} ${dias} día${dias === 1 ? '' : 's'}. ${margen}`
      : `Por vencer. ${margen}`;
  }

  // verde (urgencia, no Completada — esa tiene su propio ícono abajo)
  return dias !== null
    ? `En tiempo: falta${dias === 1 ? '' : 'n'} ${dias} día${dias === 1 ? '' : 's'} para la fecha límite.`
    : LEYENDA_SEMAFORO.verde;
}

// estado='Completada' se muestra con un ícono de check en vez del punto
// verde plano — si no, "completado" y "en proceso sano" se ven idénticos.
//
// `avance` es opcional: el color rojo ("Vencida") depende SOLO de la
// fecha límite, nunca del avance — un nodo con 95% y fecha vencida sale
// rojo igual que uno con 5%, lo cual es correcto pero nada obvio a
// simple vista. Cuando el llamador pasa `avance` y el color es rojo con
// avance > 0, el tooltip lo explica en vez de solo decir "Vencida".
export default function SemaforoDot({ semaforo, estado, avance, fechaLimite, fechaFin, prioridad, size = 8, className = '' }) {
  if (estado === 'Completada') {
    return <CheckCircle2 size={size + 3} className={`text-emerald-600 flex-shrink-0 ${className}`} aria-label="Completada" title="Completada." />;
  }
  const sem = semaforo && COLORES_SEMAFORO[semaforo] ? semaforo : 'gris';
  const avanceNum = typeof avance === 'number' ? avance : parseFloat(avance);
  const titulo = construirTitulo(sem, estado, avanceNum, fechaLimite, fechaFin, prioridad);
  return (
    <span
      className={`rounded-full flex-shrink-0 inline-block ${className}`}
      style={{ width: size, height: size, backgroundColor: COLORES_SEMAFORO[sem] }}
      title={titulo}
    />
  );
}
