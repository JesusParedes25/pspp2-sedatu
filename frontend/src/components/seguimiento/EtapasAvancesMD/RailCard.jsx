/**
 * ARCHIVO: RailCard.jsx
 * PROPÓSITO: Tarjeta colapsable del rail derecho de "Propiedades".
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export default function RailCard({ title, children, defaultOpen = true }) {
  const [abierto, setAbierto] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-100">
      <button
        onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <span>{title}</span>
        {abierto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {abierto && <div className="px-4 pb-3 pt-0.5">{children}</div>}
    </div>
  );
}
