/**
 * ARCHIVO: SemaforoDot.jsx
 * PROPÓSITO: Punto de color de semáforo efectivo — única fuente de verdad
 *            visual para que "Detalle" y "Vista lista" (y
 *            cualquier otra vista futura) pinten exactamente el mismo
 *            color para el mismo nodo, sin duplicar la paleta ni la
 *            leyenda en cada componente.
 */
import { CheckCircle2 } from 'lucide-react';

export const COLORES_SEMAFORO = { verde: '#16a34a', ambar: '#d97706', rojo: '#dc2626', gris: '#94a3b8' };

// Mismo tono que COLORES_SEMAFORO pero aclarado, para el fondo de un chip de
// estado — evita que el texto de color sobre blanco se pierda como chip.
export const CHIP_BG = { verde: '#e7f3e8', ambar: '#fdeee0', rojo: '#fbe9e9', gris: '#eef0f2' };

// Texto corto, exacto según la regla real de cálculo (ver
// backend/src/utils/avance-semaforo.js::calcularSemaforo) — el riesgo
// reportado en un nodo NUNCA entra en este cálculo, así que "verde" no
// puede leerse como "sin riesgo": un nodo en tiempo con un riesgo abierto
// sigue siendo verde. El detalle completo de cada regla (p. ej. que
// ámbar también cubre "bloqueada con margen" y Muy Alta por vencer en
// <14 días) vive en el `title` que arma SemaforoDot más abajo, no aquí
// — este texto es la etiqueta corta para leyendas (pie del árbol de
// Detalle, Diagrama, Cronograma, Agenda: los cuatro la importan de aquí
// en vez de redactarla cada uno por su cuenta).
export const LEYENDA_SEMAFORO = {
  verde: 'En proceso, en tiempo',
  ambar: 'Por vencer',
  rojo: 'Vencida',
  gris: 'Sin iniciar / cancelada',
};

// estado='Completada' se muestra con un ícono de check en vez del punto
// verde plano — si no, "completado" y "en proceso sano" se ven idénticos.
//
// `avance` es opcional: el color rojo ("Vencida") depende SOLO de la
// fecha límite, nunca del avance — un nodo con 95% y fecha vencida sale
// rojo igual que uno con 5%, lo cual es correcto pero nada obvio a
// simple vista. Cuando el llamador pasa `avance` y el color es rojo con
// avance > 0, el tooltip lo explica en vez de solo decir "Vencida".
export default function SemaforoDot({ semaforo, estado, avance, size = 8, className = '' }) {
  if (estado === 'Completada') {
    return <CheckCircle2 size={size + 3} className={`text-emerald-600 flex-shrink-0 ${className}`} aria-label="Completada" />;
  }
  const sem = semaforo && COLORES_SEMAFORO[semaforo] ? semaforo : 'gris';
  const avanceNum = typeof avance === 'number' ? avance : parseFloat(avance);
  const titulo = sem === 'rojo' && avanceNum > 0
    ? `Vencida: la fecha límite pasó. El avance (${Math.round(avanceNum)}%) no determina este color.`
    : LEYENDA_SEMAFORO[sem];
  return (
    <span
      className={`rounded-full flex-shrink-0 inline-block ${className}`}
      style={{ width: size, height: size, backgroundColor: COLORES_SEMAFORO[sem] }}
      title={titulo}
    />
  );
}
