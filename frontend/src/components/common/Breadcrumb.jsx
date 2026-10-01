/**
 * ARCHIVO: Breadcrumb.jsx
 * PROPÓSITO: Migaja de pan genérica — "Inicio / Proyectos / Nombre /
 *            Sección". Cada paso excepto el último es un link; el
 *            último es el paso actual (texto plano, sin link).
 */
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

// pasos: [{ etiqueta, to? }] — el paso sin `to` (normalmente el último)
// se muestra como texto plano, no como link.
export default function Breadcrumb({ pasos }) {
  return (
    <nav aria-label="Ruta de navegación" className="flex items-center gap-1.5 text-xs text-gray-400 flex-wrap">
      {pasos.map((paso, i) => (
        <span key={i} className="flex items-center gap-1.5 min-w-0">
          {i > 0 && <ChevronRight size={12} className="flex-shrink-0 text-gray-300" aria-hidden="true" />}
          {paso.to ? (
            <Link to={paso.to} className="hover:text-guinda-600 transition-colors truncate max-w-[220px]">
              {paso.etiqueta}
            </Link>
          ) : (
            <span className="text-gray-600 font-medium truncate max-w-[220px]" aria-current="page">{paso.etiqueta}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
