/**
 * ARCHIVO: RailCard.jsx
 * PROPÓSITO: Tarjeta colapsable del rail derecho de "Propiedades" — cada
 *            sección es una tarjeta propia (borde + esquinas redondeadas),
 *            no una franja separada por una línea gris, para que las
 *            secciones se lean como piezas diferenciadas, consistente con
 *            el trato visual de los botones de acciones rápidas.
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export default function RailCard({ title, icono: Icono, children, defaultOpen = true }) {
  const [abierto, setAbierto] = useState(defaultOpen);
  return (
    <div className="mb-2.5 bg-white border border-gray-200 rounded-lg overflow-hidden last:mb-0">
      <button
        onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
      >
        {Icono && <Icono size={15} className="text-guinda-500 flex-shrink-0" />}
        <span className="flex-1 text-left">{title}</span>
        {abierto ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
      </button>
      {abierto && <div className="px-3.5 pb-3.5 pt-0.5 border-t border-gray-100">{children}</div>}
    </div>
  );
}
