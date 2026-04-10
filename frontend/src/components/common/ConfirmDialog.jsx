/**
 * ARCHIVO: ConfirmDialog.jsx
 * PROPÓSITO: Diálogo modal de confirmación reutilizable.
 *
 * MINI-CLASE: Modales con portales y backdrop
 * ─────────────────────────────────────────────────────────────────
 * Un modal se compone de: (1) backdrop oscuro que cubre toda la
 * pantalla, (2) contenedor blanco centrado con el contenido, y
 * (3) botones de acción. Click en el backdrop cierra el modal.
 * El atributo "role=dialog" y aria-modal mejoran la accesibilidad.
 * Se usa para confirmar acciones destructivas como eliminar.
 * ─────────────────────────────────────────────────────────────────
 */

export default function ConfirmDialog({ abierto, titulo, mensaje, textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar', onConfirmar, onCancelar, variante = 'danger' }) {
  if (!abierto) return null;

  const estiloBoton = variante === 'danger'
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-guinda-500 hover:bg-guinda-600 text-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onCancelar} />

      {/* Contenido del diálogo */}
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{titulo}</h3>
        <p className="text-sm text-gray-600 mb-6">{mensaje}</p>

        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancelar}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {textoCancelar}
          </button>
          <button
            onClick={onConfirmar}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${estiloBoton}`}
          >
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
