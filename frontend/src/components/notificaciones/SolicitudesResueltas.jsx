/**
 * ARCHIVO: SolicitudesResueltas.jsx
 * PROPÓSITO: Rastro de las solicitudes que YO ya resolví (aceptando o
 *            declinando), para después de que la tarjeta pendiente
 *            desaparece de la bandeja.
 *
 * MINI-CLASE: por qué hace falta esto además de SolicitudesPorResolver
 * ─────────────────────────────────────────────────────────────────
 * En cuanto se resuelve una solicitud, sale de la lista de pendientes —
 * es justo lo que se espera de una bandeja de "por resolver". Pero eso
 * mismo hace que la decisión se sienta como si se hubiera ido al vacío:
 * ¿de verdad quedó aceptada?, ¿a quién le dije que no la semana pasada?
 * Colapsado por default porque no es información que se consulte todo
 * el tiempo, solo cuando hace falta confirmar algo — no debe competir
 * por atención con lo que sí requiere una acción ahora mismo.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, ChevronDown, ChevronRight, Check, X } from 'lucide-react';

const ETIQUETA_NODO = { etapa: 'la etapa', accion: 'la acción', tarea: 'la tarea' };

function rutaDe(sol) {
  return sol.id_nodo
    ? `/proyectos/${sol.id_proyecto}?tab=seguimiento&nodo=${sol.id_nodo}`
    : `/proyectos/${sol.id_proyecto}`;
}

function formatearFecha(fecha) {
  return new Date(fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function SolicitudesResueltas({ solicitudes }) {
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(false);

  if (!solicitudes?.length) return null;

  return (
    <section className="space-y-2">
      <button
        onClick={() => setAbierto(a => !a)}
        className="w-full flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-800"
      >
        {abierto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <History size={14} />
        Solicitudes que resolviste
        <span className="text-[10px] font-medium bg-gray-100 text-gray-500 rounded-full px-1.5 py-0.5">
          {solicitudes.length}
        </span>
      </button>

      {abierto && (
        <div className="space-y-1.5 pl-1">
          {solicitudes.map(sol => {
            const aceptada = sol.estado === 'aceptada';
            return (
              <button
                key={sol.id}
                onClick={() => navigate(rutaDe(sol))}
                className="w-full text-left card p-3 flex items-start gap-3 hover:shadow-sm transition-shadow"
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  aceptada ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-500'
                }`}>
                  {aceptada ? <Check size={13} /> : <X size={13} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-700">
                    <span className="font-medium">{sol.nombre_completo}</span>
                    {aceptada ? ' — aceptada como ' : ' — declinada '}
                    {aceptada && <span className="font-medium">{sol.funcion}</span>}
                    {' en '}
                    {sol.id_nodo
                      ? <>{ETIQUETA_NODO[sol.tipo_nodo] || 'el elemento'} de «{sol.nombre_proyecto}»</>
                      : <>«{sol.nombre_proyecto}»</>}
                  </p>
                  {sol.motivo_respuesta && (
                    <p className="text-[11px] text-gray-500 mt-0.5 italic">{sol.motivo_respuesta}</p>
                  )}
                </div>
                <span className="text-[10px] text-gray-400 flex-shrink-0">{formatearFecha(sol.respondida_en)}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
