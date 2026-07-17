/**
 * Calcula el color semáforo de un porcentaje basado en el avance real vs tiempo transcurrido.
 *
 * @param {number} porcentaje - Porcentaje de avance real (0-100)
 * @param {string|Date|null} fechaInicio - Fecha de inicio
 * @param {string|Date|null} fechaFin - Fecha de fin / entrega
 * @returns {{ color: string, tooltip: string|null }}
 */
export function calcularColorSemaforo(porcentaje, fechaInicio, fechaFin) {
  const VERDE   = '#16a34a';
  const AMARILLO = '#d97706';
  const ROJO     = '#dc2626';
  const GRIS     = '#94a3b8';
  const TOOLTIP_SIN_FECHA = 'Semáforo no disponible: esta etapa no tiene fecha de entrega definida';

  const pct = parseFloat(porcentaje) || 0;

  if (!fechaInicio || !fechaFin) {
    return { color: GRIS, tooltip: TOOLTIP_SIN_FECHA };
  }

  const inicio = new Date(fechaInicio).getTime();
  const fin    = new Date(fechaFin).getTime();
  const hoy    = Date.now();

  const duracion = fin - inicio;
  if (!duracion || !isFinite(duracion) || duracion <= 0) {
    return { color: GRIS, tooltip: TOOLTIP_SIN_FECHA };
  }

  const tiempoTranscurrido = ((hoy - inicio) / duracion) * 100;

  if (!isFinite(tiempoTranscurrido) || isNaN(tiempoTranscurrido)) {
    return { color: GRIS, tooltip: TOOLTIP_SIN_FECHA };
  }

  if (pct >= tiempoTranscurrido) return { color: VERDE, tooltip: null };
  if (pct >= tiempoTranscurrido - 20) return { color: AMARILLO, tooltip: null };
  return { color: ROJO, tooltip: null };
}
