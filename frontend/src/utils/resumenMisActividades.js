/**
 * ARCHIVO: resumenMisActividades.js
 * PROPÓSITO: Cálculo puro de "cuántas actividades a mi cargo y cuántas
 *            vencidas" — extraído de MisActividades.jsx (que seguía
 *            definiéndolo ahí mismo) para que la tarjeta "Mis
 *            actividades" de Inicio.jsx lo reuse tal cual, en vez de
 *            tener el backend recalculando "lo mismo" con un criterio
 *            distinto (sin ventana de periodo, excluyendo
 *            completadas/canceladas del total) — bloque 1 de "PSPP v2.0
 *            · Inicio, color y la guía de uso": así fue exactamente como
 *            la tarjeta (7 a cargo / 5 vencidas) y la pantalla (25 / 22)
 *            divergieron. Mismo arreglo de ítems (el que ya devuelve
 *            GET /agenda), misma función, los dos únicos lugares que la
 *            llaman.
 */
import { DIAS_POR_VENCER } from '../components/common/SemaforoDot';

export const PERIODOS = [
  { id: 'semana', label: 'Semana', dias: 7 },
  { id: 'mes', label: 'Mes', dias: 30 },
  { id: 'trimestre', label: 'Trimestre', dias: 90 },
  { id: 'anio', label: 'Año', dias: 365 },
];
// El mismo periodo con el que MisActividades.jsx abre siempre (su
// useState('mes')) — la tarjeta de Inicio usa este mismo valor por
// omisión para que su cifra sea la que la persona ve al entrar a la
// pantalla, sin tener que tocar ningún filtro.
export const PERIODO_POR_DEFECTO = 'mes';

export function diasRestantes(fecha) {
  if (!fecha) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const [y, m, d] = String(fecha).slice(0, 10).split('-').map(Number);
  if (!y) return null;
  return Math.ceil((new Date(y, m - 1, d) - hoy) / 86400000);
}

// Base recortada por periodo — "qué tan lejos en el FUTURO quiero ver"
// (Semana ⊆ Mes ⊆ Trimestre ⊆ Año). Un ítem ya vencido (d < 0) siempre
// se incluye, sin importar el periodo elegido: un periodo corto no es
// "ignora lo viejo", es "no me adelantes tanto lo que aún no llega".
export function disponiblesPorPeriodo(items, periodoId = PERIODO_POR_DEFECTO) {
  const dias = PERIODOS.find(p => p.id === periodoId)?.dias ?? 30;
  return items.filter(it => {
    const d = diasRestantes(it.fecha_fin);
    return d === null || d < 0 || d <= dias;
  });
}

// A qué categorías de ALERTA pertenece un ítem (puede ser varias a la
// vez, o ninguna) — eje de urgencia por fecha, nunca de estado.
export function categoriasAlerta(it) {
  const cats = new Set();
  const activo = it.estado !== 'Completada' && it.estado !== 'Cancelada';
  const d = diasRestantes(it.fecha_fin);
  if (activo && d !== null && d < 0) cats.add('vencidas');
  if (activo && d !== null && d >= 0 && d <= DIAS_POR_VENCER) cats.add('proximas');
  return cats;
}

// "total" es TODO lo que cae en la ventana del periodo (incluye
// completadas/canceladas, igual que el encabezado "N actividades a mi
// cargo" de MisActividades.jsx) — no es un conteo de "pendientes", es
// "cuánto hay en juego en este periodo". "vencidas" sí excluye
// completadas/canceladas (categoriasAlerta) y nunca se recorta por
// periodo.
export function calcularResumenMisActividades(items, periodoId = PERIODO_POR_DEFECTO) {
  const disponibles = disponiblesPorPeriodo(items, periodoId);
  let vencidas = 0, proximas = 0;
  for (const it of disponibles) {
    const cats = categoriasAlerta(it);
    if (cats.has('vencidas')) vencidas++;
    if (cats.has('proximas')) proximas++;
  }
  return { total: disponibles.length, vencidas, proximas };
}
