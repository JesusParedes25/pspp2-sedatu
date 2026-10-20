/**
 * ARCHIVO: TarjetaCartera.jsx
 * PROPÓSITO: Card resumen de una cartera para la vista "Agrupado" del
 *            listado de proyectos. Deliberadamente NO muestra un
 *            porcentaje de avance único (una cartera agrupa proyectos
 *            heterogéneos, promediarlos no dice nada útil) — solo
 *            conteos: total de proyectos y cuántos requieren atención.
 *
 * Antes un solo "proyectos_en_riesgo" (carteras.queries.js::listarCarteras)
 * mezclaba dos señales distintas en un número — vencido por fecha, O con
 * un riesgo de verdad (tabla `riesgos`) abierto — y la tarjeta lo llamaba
 * "N requiere(n) atención": honesto sobre la unión, pero no decía CUÁL
 * de los dos modelos estaba detrás del número. "Riesgo" es palabra
 * reservada al módulo de Riesgos, así que ahora son dos cifras propias,
 * cada una con su nombre exacto — y se oculta la que esté en cero, para
 * no llenar de ruido una cartera sana.
 */
import { Link } from 'react-router-dom';
import { Briefcase, AlertTriangle, ShieldAlert, Building2 } from 'lucide-react';

export default function TarjetaCartera({ cartera }) {
  const conVencidas = parseInt(cartera.proyectos_con_vencidas) || 0;
  const conRiesgos = parseInt(cartera.proyectos_con_riesgos) || 0;
  const total = parseInt(cartera.total_proyectos) || 0;

  return (
    <Link
      to={`/carteras/${cartera.id}`}
      className="card overflow-hidden hover:shadow-md transition-shadow block border-l-4 border-l-guinda-400"
    >
      <div className="p-4">
        <div className="flex items-start gap-2 mb-2">
          <Briefcase size={16} className="text-guinda-400 flex-shrink-0 mt-0.5" />
          <h3 className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">
            {cartera.nombre}
          </h3>
        </div>

        {cartera.descripcion && (
          <p className="text-xs text-gray-500 line-clamp-2 mb-3">{cartera.descripcion}</p>
        )}

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {cartera.dg_lider_siglas && (
            <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
              <Building2 size={10} />
              {cartera.dg_lider_siglas}
            </span>
          )}
          {cartera.responsable_nombre && (
            <span className="text-[10px] text-gray-400">{cartera.responsable_nombre}</span>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-100 gap-2 flex-wrap">
          <span>{total} proyecto{total !== 1 ? 's' : ''}</span>
          <span className="flex items-center gap-2.5">
            {conVencidas > 0 && (
              <span className="flex items-center text-red-500">
                <AlertTriangle size={12} className="mr-1" />
                {conVencidas} con vencida{conVencidas !== 1 ? 's' : ''}
              </span>
            )}
            {conRiesgos > 0 && (
              <span className="flex items-center text-orange-500">
                <ShieldAlert size={12} className="mr-1" />
                {conRiesgos} con riesgo{conRiesgos !== 1 ? 's' : ''}
              </span>
            )}
          </span>
        </div>
      </div>
    </Link>
  );
}
