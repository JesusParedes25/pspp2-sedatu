/**
 * ARCHIVO: useCierreConDatosSinGuardar.js
 * PROPÓSITO: Guardia para no perder datos capturados en un modal al
 *            cerrarlo sin querer — extraído de ModalRegistrarAvance.jsx,
 *            que fue el primero en tener este patrón. Un clic en el fondo
 *            (fácil de hacer sin querer, ej. al volver de otra pestaña y
 *            copiar/pegar) no hace nada mientras haya algo sin guardar;
 *            cerrar a propósito (X o Cancelar) sigue funcionando, solo
 *            pide confirmar cuando de verdad hay algo que se perdería.
 *
 * hayCambiosSinGuardar: boolean, recalculado en cada render por quien lo
 * usa (diff contra el estado inicial del formulario del modal).
 */
export function useCierreConDatosSinGuardar(hayCambiosSinGuardar, onCerrar) {
  function cerrarPorFondo() {
    if (hayCambiosSinGuardar) return;
    onCerrar?.();
  }

  function cerrarConConfirmacion() {
    if (hayCambiosSinGuardar && !window.confirm('Tienes cambios sin guardar. ¿Deseas cerrar sin guardar?')) return;
    onCerrar?.();
  }

  return { cerrarPorFondo, cerrarConConfirmacion };
}
