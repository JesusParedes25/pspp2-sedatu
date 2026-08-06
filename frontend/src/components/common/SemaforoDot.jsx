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

export const LEYENDA_SEMAFORO = {
  verde: 'En proceso, sin riesgo',
  ambar: 'Por vencer',
  rojo: 'Vencida',
  gris: 'Sin iniciar / cancelada',
};

// estado='Completada' se muestra con un ícono de check en vez del punto
// verde plano — si no, "completado" y "en proceso sano" se ven idénticos.
export default function SemaforoDot({ semaforo, estado, size = 8, className = '' }) {
  if (estado === 'Completada') {
    return <CheckCircle2 size={size + 3} className={`text-emerald-600 flex-shrink-0 ${className}`} aria-label="Completada" />;
  }
  const sem = semaforo && COLORES_SEMAFORO[semaforo] ? semaforo : 'gris';
  return (
    <span
      className={`rounded-full flex-shrink-0 inline-block ${className}`}
      style={{ width: size, height: size, backgroundColor: COLORES_SEMAFORO[sem] }}
      title={LEYENDA_SEMAFORO[sem]}
    />
  );
}
