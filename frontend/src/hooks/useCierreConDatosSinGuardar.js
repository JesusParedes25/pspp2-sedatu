/**
 * ARCHIVO: useCierreConDatosSinGuardar.js
 * PROPÓSITO: Guardia para no perder datos capturados en un modal al
 *            cerrarlo sin querer — extraído de ModalRegistrarAvance.jsx,
 *            que fue el primero en tener este patrón.
 *
 * Cerrar a propósito (la X, Cancelar, o Escape) pide confirmar solo
 * cuando de verdad hay algo que se perdería (`hayCambiosSinGuardar`).
 * Un clic en el fondo NO cierra el modal — ningún modal de la
 * plataforma cierra por clic afuera, a propósito: es demasiado fácil
 * de hacer sin querer (ej. al volver de otra pestaña y copiar/pegar) y
 * la única forma de cerrar es un control explícito. Por eso este hook
 * ya no expone un `cerrarPorFondo` — el backdrop de cada modal no lleva
 * ningún `onClick`.
 *
 * hayCambiosSinGuardar: boolean, recalculado en cada render por quien lo
 * usa (diff contra el estado inicial del formulario del modal).
 *
 * Escape se trata igual que la X/Cancelar (cerrarConConfirmacion): mismo
 * candado contra perder datos, sin una tercera forma de cerrar con su
 * propia regla.
 */
import { useEffect } from 'react';

export function useCierreConDatosSinGuardar(hayCambiosSinGuardar, onCerrar) {
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

  return { cerrarConConfirmacion };
}
