/**
 * ARCHIVO: niveles.js
 * PROPÓSITO: Fuente única de verdad para la "identidad visual" de cada
 *            nivel de la jerarquía (Etapa/Acción/Tarea) — ícono, color y
 *            los textos que se autonombran según el nivel ("+ Tarea",
 *            "Acciones de esta etapa", "Calculado desde sus tareas"...).
 *            Árbol, columna central, rail de Detalle y drawer de Diagrama
 *            consumen este mismo objeto en vez de tener cada uno su propio
 *            "si es etapa entonces..." disperso por el código.
 *
 * MINI-CLASE: dos codificaciones de color, dos lugares distintos
 * ─────────────────────────────────────────────────────────────────
 * El color de NIVEL (aquí) responde "¿qué tipo de cosa es esto?" y vive
 * solo en el ícono/chip de tipo. El color de ESTATUS (semáforo, ver
 * SemaforoDot.jsx) responde "¿cómo va?" y vive solo en el punto/badge de
 * estatus. Nunca se combinan en el mismo elemento — mezclarlos rompería
 * la regla que hace que ambas señales se puedan leer de un vistazo.
 * ─────────────────────────────────────────────────────────────────
 */
import { Layers, Target, CheckSquare } from 'lucide-react';

export const NIVELES = {
  etapa: {
    tipo: 'etapa',
    label: 'Etapa',
    labelMayus: 'ETAPA',
    icono: Layers,
    color: '#7B1C3E',       // guinda — ya es el primario de marca
    colorSuave: '#fbf3f6',
    hijoTipo: 'accion',
    hijoLabel: 'Acción',
    hijoLabelPlural: 'Acciones',
  },
  accion: {
    tipo: 'accion',
    label: 'Acción',
    labelMayus: 'ACCIÓN',
    icono: Target,
    color: '#4338ca',       // índigo
    colorSuave: '#eef2ff',
    hijoTipo: 'tarea',
    hijoLabel: 'Tarea',
    hijoLabelPlural: 'Tareas',
  },
  tarea: {
    tipo: 'tarea',
    label: 'Tarea',
    labelMayus: 'TAREA',
    icono: CheckSquare,
    color: '#92400e',       // bronce
    colorSuave: '#fdf2e9',
    hijoTipo: null,
    hijoLabel: null,
    hijoLabelPlural: null,
  },
};

// Orden fijo para la "escalera de tipos" (LadderJerarquia) — siempre
// Etapa › Acción › Tarea, sin importar en qué nivel está parado el usuario.
export const ORDEN_NIVELES = ['etapa', 'accion', 'tarea'];

// Frase de rol en lenguaje llano — la misma regla para cualquier nivel:
// si agrega hijos, resume; si no, aquí se hace el trabajo.
export function rolTexto(tipo, esContenedor) {
  const nivel = NIVELES[tipo];
  if (esContenedor) {
    return `Agrupa ${(nivel.hijoLabelPlural || 'elementos').toLowerCase()}; su avance resume lo que ocurre debajo.`;
  }
  return 'Unidad mínima de trabajo: aquí se registra el avance real.';
}
