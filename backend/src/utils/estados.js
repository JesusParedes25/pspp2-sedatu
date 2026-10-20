/**
 * ARCHIVO: estados.js
 * PROPÓSITO: Única fuente de la etiqueta visible de `estado` del lado del
 *            backend — espejo de frontend/src/utils/estados.js (no se
 *            puede compartir el módulo entre los dos procesos). Para
 *            cualquier salida generada en el servidor (exportaciones
 *            Excel/CSV, PDF generado en servidor, etc.) que muestre un
 *            `estado` de Proyecto/Etapa/Accion/Subaccion/Tarea, usar
 *            formatearEstado() de aquí en vez de traducirlo por su cuenta
 *            — si los dos módulos alguna vez se desalinean, hay que
 *            actualizar ambos a mano.
 */

const ETIQUETAS_ESTADO = Object.freeze({
  Pendiente: 'Sin iniciar',
  En_proceso: 'En proceso',
  Bloqueada: 'Bloqueada',
  Completada: 'Completada',
  Cancelada: 'Cancelada',
});

function formatearEstado(valor) {
  if (!valor) return valor;
  return ETIQUETAS_ESTADO[valor] || valor.replace(/_/g, ' ');
}

module.exports = { ETIQUETAS_ESTADO, formatearEstado };
