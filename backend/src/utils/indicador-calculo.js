/**
 * ARCHIVO: indicador-calculo.js
 * PROPÓSITO: Fuente única de verdad para "¿qué porcentaje de la meta
 *            lleva este indicador?" — se recalculaba por separado en al
 *            menos 8 sitios del backend, cada uno con su propio redondeo,
 *            y 3 de esos 8 topaban el resultado en 100% mientras los otros
 *            no — el mismo indicador, en el mismo momento, mostraba un
 *            número distinto según la pantalla.
 *
 * Política (decidida explícitamente, no supuesta): el porcentaje que se
 * calcula y se muestra en texto es el REAL, sin tope — un indicador
 * sobre-cumplido dice "142% de la meta", información útil (puede ser una
 * señal de éxito real o de un error de captura). Topar la barra visual en
 * 100% es responsabilidad del frontend al momento de dibujarla, no de
 * este cálculo.
 */

// Un decimal — mismo criterio que ya usaban la mayoría de los sitios
// (panorama.controller.js, geografia.queries.js) antes de esta unificación.
function calcularAvancePorcentaje(valorActual, metaGlobal) {
  const valor = parseFloat(valorActual) || 0;
  const meta = parseFloat(metaGlobal) || 0;
  if (meta <= 0) return null;
  return Math.round((valor / meta) * 1000) / 10;
}

module.exports = { calcularAvancePorcentaje };
