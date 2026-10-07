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
 *
 * Escape se trata igual que la X/Cancelar (cerrarConConfirmacion): mismo
 * candado contra perder datos, sin una tercera forma de cerrar con su
 * propia regla. Queda centralizado aquí para que cualquier modal que ya
 * use este hook lo reciba sin tener que cablear su propio listener.
 */
import { useEffect } from 'react';

export function useCierreConDatosSinGuardar(hayCambiosSinGuardar, onCerrar) {
  function cerrarPorFondo() {
    if (hayCambiosSinGuardar) return;
    onCerrar?.();
  }

  function cerrarConConfirmacion() {
    if (hayCambiosSinGuardar && !window.confirm('Tienes cambios sin guardar. ¿Deseas cerrar sin guardar?')) return;
    onCerrar?.();
  }

  useEffect(() => {
    function alPresionarEscape(e) {
      if (e.key === 'Escape') cerrarConConfirmacion();
    }
    document.addEventListener('keydown', alPresionarEscape);
    return () => document.removeEventListener('keydown', alPresionarEscape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hayCambiosSinGuardar]);

  return { cerrarPorFondo, cerrarConConfirmacion };
}
