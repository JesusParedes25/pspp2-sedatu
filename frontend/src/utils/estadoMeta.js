/**
 * ARCHIVO: estadoMeta.js
 * PROPÓSITO: Un solo criterio para marcar cuando un valor excede su
 *            meta — reusado en los 4 sitios donde el módulo de
 *            indicadores compara un valor contra una meta (definición
 *            de categorías, subtotal por categoría, hint al capturar,
 *            total general). Por debajo de la meta se queda neutro
 *            (es el estado normal mientras se sigue capturando) —
 *            solo excederla amerita una marca visual, decisión tomada
 *            con el usuario tras reportar el caso de una categoría que
 *            recibió $90,000 contra una meta de $80,000.
 */
const EPSILON = 0.01;

export function excedeMeta(valor, meta) {
  const v = Number(valor) || 0;
  const m = Number(meta) || 0;
  return m > 0 && v > m + EPSILON;
}
