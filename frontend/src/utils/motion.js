/**
 * ARCHIVO: motion.js
 * PROPÓSITO: Bandera única de prefers-reduced-motion — evita animaciones
 *            espaciales (pan/zoom/scroll-into-view) para quien lo pide en
 *            su sistema operativo. Los cambios simples de color/opacidad
 *            son de menor riesgo y no se gatean con esto.
 */
export const prefersReducedMotion = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
