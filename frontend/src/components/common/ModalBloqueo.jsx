/**
 * ARCHIVO: ModalBloqueo.jsx
 * PROPÓSITO: Modal reutilizable para capturar el motivo de un bloqueo.
 *
 * MINI-CLASE: Modales como barrera de validación
 * ─────────────────────────────────────────────────────────────────
 * En vez de usar prompt() nativo (que es feo y no se puede estilizar),
 * usamos un modal propio que valida que el motivo no esté vacío antes
 * de llamar onConfirmar. Esto es un patrón "gate": el usuario no
 * puede avanzar hasta cumplir la condición (motivo no vacío).
 * ─────────────────────────────────────────────────────────────────
 */
import { useState } from 'react';

/**
 * @param {function} onConfirmar - Recibe el motivo (string) al confirmar
 * @param {function} onCancelar  - Se llama al cerrar sin confirmar
 */
export default function ModalBloqueo({ onConfirmar, onCancelar }) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');

  function handleConfirmar() {
    const texto = motivo.trim();
    if (!texto) {
      setError('El motivo de bloqueo es obligatorio');
      return;
    }
    if (texto.length < 10) {
      setError('El motivo debe tener al menos 10 caracteres');
      return;
    }
    onConfirmar(texto);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-red-700 mb-1">
          Bloquear entidad
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Describe el motivo del bloqueo. Este registro quedará en el historial.
        </p>

        <textarea
          value={motivo}
          onChange={(e) => { setMotivo(e.target.value); setError(''); }}
          placeholder="Ej: Esperando aprobación de presupuesto por parte de la DGPV..."
          rows={3}
          className={`w-full border rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2
            ${error ? 'border-red-400 focus:ring-red-300' : 'border-gray-300 focus:ring-blue-300'}`}
          autoFocus
        />

        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}

        <div className="flex gap-3 justify-end mt-4">
          <button
            type="button"
            onClick={onCancelar}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmar}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Bloquear
          </button>
        </div>
      </div>
    </div>
  );
}
