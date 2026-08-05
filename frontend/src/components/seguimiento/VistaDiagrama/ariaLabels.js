/**
 * ARCHIVO: ariaLabels.js
 * PROPÓSITO: Textos de accesibilidad de React Flow en español — los
 *            valores por defecto vienen en inglés y esta es una
 *            plataforma de gobierno.
 */
export const ariaLabelConfigEs = {
  'node.a11yDescription.default': 'Presiona enter o espacio para seleccionar el elemento, luego usa las flechas para explorar sus conexiones.',
  'node.a11yDescription.keyboardDisabled': 'Activa la navegación por teclado con Ctrl+Enter para poder mover elementos con el teclado.',
  'node.a11yDescription.ariaLiveMessage': ({ direction, x, y }) => `El elemento se movió ${direction} a la posición ${x}, ${y}.`,
  'edge.a11yDescription.default': 'Presiona enter o espacio para seleccionar la conexión.',
  'controls.ariaLabel': 'Controles del diagrama',
  'controls.zoomIn.ariaLabel': 'Acercar',
  'controls.zoomOut.ariaLabel': 'Alejar',
  'controls.fitView.ariaLabel': 'Centrar diagrama',
  'controls.interactive.ariaLabel': 'Alternar interactividad',
  'minimap.ariaLabel': 'Minimapa del diagrama',
  'handle.a11yDescription.default': 'Punto de conexión.',
};
