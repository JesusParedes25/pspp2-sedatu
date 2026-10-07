/**
 * ARCHIVO: ModalAccionNodo.jsx
 * PROPÓSITO: Cascarón de modal genérico (encabezado + X + cuerpo con
 *            scroll) para las acciones de "Más acciones" que no tienen
 *            su propio modal dedicado — Adjuntar documento, Vincular
 *            indicador, Vincular territorio, Invitar participante. Envuelve
 *            los componentes ya existentes (SeccionArchivosNodo,
 *            TabIndicadores, TerritorioSelector, SeccionMiembrosNodo) tal
 *            cual, sin tocar su lógica — antes vivían como un panel
 *            inline dentro de NodoCard; aquí se presentan en un modal,
 *            como pide el punto 4.2 del rediseño de Detalle ("cada
 *            acción abre un modal, nunca un panel de solo lectura que se
 *            queda a medias en la página").
 *
 * Cierra con clic fuera (ya lo tenía) y con Escape — sin guardia de
 * "datos sin guardar": lo que vive adentro (SeccionArchivosNodo,
 * TabIndicadores, TerritorioSelector, SeccionMiembrosNodo) guarda cada
 * acción por su cuenta, no hay un formulario con un solo envío final
 * que se pueda perder al cerrar.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function ModalAccionNodo({ titulo, onCerrar, children }) {
  useEffect(() => {
    function alPresionarEscape(e) {
      if (e.key === 'Escape') onCerrar?.();
    }
    document.addEventListener('keydown', alPresionarEscape);
    return () => document.removeEventListener('keydown', alPresionarEscape);
  }, [onCerrar]);

  return createPortal((
    <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="text-base font-semibold text-gray-900">{titulo}</h3>
          <button onClick={onCerrar} className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  ), document.body);
}
