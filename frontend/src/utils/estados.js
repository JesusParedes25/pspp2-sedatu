/**
 * ARCHIVO: estados.js
 * PROPÓSITO: Única fuente de la etiqueta visible de `estado` — el catálogo
 *            de 5 valores compartido por Proyecto/Etapa/Accion/Subaccion/
 *            Tarea (backend/src/utils/validaciones-estado.js::ESTADOS_VALIDOS).
 *            Antes había tres traductores independientes (EstadoChip literal,
 *            NodoArbol con "Concluida"/"Sin iniciar", CarteraDetalle con
 *            "Concluido") que usaban palabras distintas para el mismo valor.
 *            Todo lo que muestre un `estado` de esta jerarquía debe importar
 *            de aquí en vez de traducirlo por su cuenta.
 */

export const ETIQUETAS_ESTADO = Object.freeze({
  Pendiente: 'Sin iniciar',
  En_proceso: 'En proceso',
  Bloqueada: 'Bloqueada',
  Completada: 'Completada',
  Cancelada: 'Cancelada',
});

// Para un valor del catálogo, la etiqueta fija de arriba. Para cualquier
// otro string (otros módulos reusan el mismo componente de chip para sus
// propios catálogos — riesgos, niveles, permisos), el mismo fallback de
// siempre: quitar guiones bajos, sin inventar una palabra nueva.
export function formatearEstado(valor) {
  if (!valor) return valor;
  return ETIQUETAS_ESTADO[valor] || valor.replace(/_/g, ' ');
}
