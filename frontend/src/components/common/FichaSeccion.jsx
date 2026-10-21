/**
 * ARCHIVO: FichaSeccion.jsx
 * PROPÓSITO: La tarjeta de acceso "ícono + título + descripción + dato
 *            real" — extraída de PortadaProyecto.jsx ("¿Qué quieres
 *            hacer en este proyecto?") para reusarla tal cual en la
 *            pantalla de Inicio, en vez de inventar un lenguaje visual
 *            nuevo.
 *
 * `color` tiñe el contenedor del ícono con un tono tenue de la paleta
 * institucional (fondo) + el mismo color saturado (ícono) — bloque 2.1 de
 * "PSPP v2.0 · Inicio, color y la guía de uso": "institucional no quiere
 * decir apagado". Solo guinda/dorado: verde/amarillo/rojo quedan
 * reservados al semáforo y a la urgencia (bloque 2.3), nunca a la
 * navegación. `destacada` (el uso previo, todavía vivo en
 * PortadaProyecto.jsx) sigue controlando el borde izquierdo y, si no se
 * pasa `color` explícito, el tinte por omisión — así ninguna de las dos
 * pantallas que ya usan este componente cambia de aspecto sin pedirlo.
 */
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const TINTES_ICONO = {
  guinda: 'bg-guinda-50 text-guinda-600',
  dorado: 'bg-dorado/10 text-dorado',
};

export default function FichaSeccion({ to, icono: Icono, titulo, descripcion, contadores, atajos, destacada, color, cargandoContadores }) {
  const tinteIcono = TINTES_ICONO[color] || (destacada ? TINTES_ICONO.guinda : 'bg-gray-50 text-gray-500');
  return (
    <div className={`relative bg-white border rounded-xl p-4 flex flex-col gap-2.5 min-w-0 transition-shadow hover:shadow-md ${
      destacada ? 'border-guinda-200 border-l-4 border-l-guinda-500' : 'border-gray-200'
    }`}>
      <Link to={to} className="absolute inset-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-guinda-400" aria-label={titulo} />
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${tinteIcono}`}>
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
