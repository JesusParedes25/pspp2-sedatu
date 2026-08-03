/**
 * ARCHIVO: fecha.js
 * PROPÓSITO: Utilidades para formatear/comparar campos tipo DATE (sin hora)
 *            que vienen del backend — fecha_inicio, fecha_fin, fecha_limite.
 *
 * MINI-CLASE: por qué "new Date('2026-07-20')" desfasa un día
 * ─────────────────────────────────────────────────────────────────
 * Una fecha sin hora ("2026-07-20") o un ISO con hora en punto que
 * llega serializado como "2026-07-20T00:00:00.000Z" se interpreta
 * como medianoche en UTC. Al formatearla con toLocaleDateString sin
 * fijar zona horaria, el navegador la convierte a su hora local — y
 * como México está detrás de UTC, esa medianoche cae la tarde/noche
 * del día ANTERIOR en hora local. Resultado: se ve un día antes.
 *
 * La forma segura es tomar solo los componentes año/mes/día del
 * string y construir un Date con el constructor (y, m, d), que
 * SIEMPRE es hora local — nunca se reinterpreta según zona horaria.
 * ─────────────────────────────────────────────────────────────────
 */

// Convierte "YYYY-MM-DD" (o un ISO completo, se usan los primeros 10
// caracteres) a un Date en medianoche LOCAL. Nunca UTC.
export function parseFechaLocal(valor) {
  if (!valor) return null;
  const str = String(valor).slice(0, 10);
  const [y, m, d] = str.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// Formatea una fecha tipo DATE sin desfase de zona horaria.
export function formatFecha(valor, opciones = { day: '2-digit', month: 'short', year: 'numeric' }) {
  const d = parseFechaLocal(valor);
  return d ? d.toLocaleDateString('es-MX', opciones) : null;
}

// Días entre hoy y la fecha (positivo = futuro, negativo = ya pasó, 0 = hoy).
export function diasRestantes(valor) {
  const d = parseFechaLocal(valor);
  if (!d) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.ceil((d - hoy) / 86400000);
}

// true si la fecha ya pasó respecto a hoy (comparación de solo fecha, sin hora).
export function estaVencida(valor) {
  const d = diasRestantes(valor);
  return d !== null && d < 0;
}

// "Fecha fin" efectiva de una etapa/acción: fecha_limite (el campo "Vence"
// que se edita desde la tarjeta de nodo) si existe, si no fecha_fin (columna
// legacy, la que llenaba el importador). Mismo criterio que ya usa el resto
// de la plataforma (semáforo, Agenda) — evita que una acción se vea "sin
// vencer" solo porque su fecha se capturó únicamente en "Vence".
export function fechaFinEfectiva(nodo) {
  return nodo?.fecha_limite || nodo?.fecha_fin || null;
}
