/**
 * ARCHIVO: FichaSeccion.jsx
 * PROPÓSITO: La tarjeta de acceso "ícono + título + descripción + dato
 *            real" — extraída de PortadaProyecto.jsx ("¿Qué quieres
 *            hacer en este proyecto?") para reusarla tal cual en la
 *            pantalla de Inicio (bloque 3 de "PSPP v2.0 · Pantalla de
 *            Inicio"), en vez de inventar un lenguaje visual nuevo.
 */
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function FichaSeccion({ to, icono: Icono, titulo, descripcion, contadores, atajos, destacada, cargandoContadores }) {
  return (
    <div className={`relative bg-white border rounded-xl p-4 flex flex-col gap-2.5 min-w-0 transition-shadow hover:shadow-md ${
      destacada ? 'border-guinda-200 border-l-4 border-l-guinda-500' : 'border-gray-200'
    }`}>
      <Link to={to} className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-guinda-400" aria-label={titulo} />
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${destacada ? 'bg-guinda-50 text-guinda-600' : 'bg-gray-50 text-gray-500'}`}>
          <Icono size={18} />
        </div>
        <h3 className="text-sm font-semibold text-gray-900 min-w-0">{titulo}</h3>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">{descripcion}</p>
      <div className="text-xs text-gray-400 min-h-[16px]">
        {cargandoContadores ? (
          <span className="inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Cargando…</span>
        ) : contadores}
      </div>
      {atajos && atajos.length > 0 && (
        <div className="relative z-10 flex flex-wrap gap-x-3 gap-y-1 mt-auto pt-1">
          {atajos.map((a, i) => (
            <Link key={i} to={a.to} className="text-xs font-medium text-guinda-600 hover:text-guinda-800 hover:underline">
              {a.etiqueta}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
