/**
 * ARCHIVO: SolicitudesPorResolver.jsx
 * PROPÓSITO: Las peticiones de gente que quiere entrar a tus proyectos,
 *            con lo necesario para decidir sin salir de aquí.
 *
 * MINI-CLASE: qué necesita ver quien decide
 * ─────────────────────────────────────────────────────────────────
 * La pregunta real no es "¿acepto o no?" sino "¿quién es esta persona y
 * por qué la quiero adentro?". Por eso la tarjeta muestra el área y el
 * cargo de quien solicita —que es lo que permite ubicarla sin ir a
 * buscarla— además de su motivo, si lo escribió.
 *
 * Y tiene que decir A QUÉ se pide entrar. Una solicitud de todo el
 * proyecto y una de una etapa suelta se conceden distinto y se deciden
 * distinto: sin el alcance a la vista, quien resuelve estaría aceptando a
 * ciegas. Va como línea propia, no escondido en el texto corrido.
 *
 * Declinar no obliga a dar motivo, al revés que rechazar una invitación:
 * quien rechaza una invitación deja un hueco de trabajo y el motivo sirve
 * para reasignarlo; declinar una solicitud no deja hueco, y exigir una
 * justificación para cada "no" ante alguien de otra área termina en que
 * nadie responde.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X, MailQuestion, Loader2, Layers, CornerDownRight } from 'lucide-react';
import { responderSolicitud } from '../../api/solicitudes';
import { olvidarPermisos } from '../../hooks/usePermisos';

const ETIQUETA_NODO = { etapa: 'la etapa', accion: 'la acción', tarea: 'la tarea' };

// A dónde lleva "Ver": al nodo concreto cuando la solicitud es de un nodo,
// usando el deep-link que ya existe. Quien decide cae exactamente en la
// etapa de la que le están hablando, no en la portada del proyecto.
function rutaDe(sol) {
  return sol.id_nodo
    ? `/proyectos/${sol.id_proyecto}?tab=seguimiento&nodo=${sol.id_nodo}`
    : `/proyectos/${sol.id_proyecto}`;
}

export default function SolicitudesPorResolver({ solicitudes, onRespondida, ocultarEncabezado = false }) {
  const navigate = useNavigate();
  const [declinando, setDeclinando] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  if (!solicitudes?.length) return null;

  async function responder(sol, respuesta, textoMotivo) {
    setEnviando(true); setError('');
    try {
      await responderSolicitud(sol.id, respuesta, textoMotivo);
      olvidarPermisos(sol.id_proyecto);
      setDeclinando(null); setMotivo('');
      onRespondida?.(sol, respuesta);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo registrar tu respuesta');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="space-y-2">
      {!ocultarEncabezado && (
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <MailQuestion size={15} className="text-blue-600" />
          Solicitudes de participación
          <span className="text-[10px] font-medium bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5">
            {solicitudes.length}
          </span>
        </h2>
      )}

      {solicitudes.map(sol => {
        const enDeclive = declinando === sol.id;
        const procedencia = [sol.dg_siglas, sol.cargo].filter(Boolean).join(' · ');
        return (
          <div key={sol.id} className="card p-4 border-blue-200 bg-blue-50/40">
            <p className="text-sm text-gray-800">
              <span className="font-medium">{sol.nombre_completo}</span>
              {' solicita participar '}
              {sol.id_nodo ? (
                <>en <span className="font-medium">{ETIQUETA_NODO[sol.tipo_nodo] || 'el elemento'} «{sol.nombre_nodo || 'sin nombre'}»</span></>
              ) : (
                <>en <span className="font-medium">todo el proyecto</span></>
              )}
              {' como '}
              <span className="font-medium">{sol.funcion}</span>.
            </p>

            {/* El alcance, explícito: aceptar una etapa no es lo mismo que
                aceptar el proyecto entero. */}
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              {sol.id_nodo ? <CornerDownRight size={12} /> : <Layers size={12} />}
              {sol.id_nodo
                ? <>Solo esa parte de <span className="font-medium">«{sol.nombre_proyecto}»</span> y los elementos que dependen de ella</>
                : <>Todo el proyecto <span className="font-medium">«{sol.nombre_proyecto}»</span></>}
            </p>

            {procedencia && <p className="text-xs text-gray-500 mt-0.5">{procedencia}</p>}
            {sol.motivo && (
              <p className="text-xs text-gray-600 mt-1.5 border-l-2 border-blue-200 pl-2 italic">
                {sol.motivo}
              </p>
            )}

            {enDeclive ? (
              <div className="mt-3 space-y-2">
                <label className="block text-xs font-medium text-gray-600">
                  ¿Quieres decirle por qué? (opcional)
                </label>
                <textarea
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  rows={2}
                  autoFocus
                  placeholder="Ej. La etapa ya tiene responsable asignado."
                  className="input-base text-sm w-full"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => responder(sol, 'declinar', motivo.trim())}
                    disabled={enviando}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {enviando ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                    Declinar solicitud
                  </button>
                  <button
                    onClick={() => { setDeclinando(null); setMotivo(''); setError(''); }}
                    className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <button
                  onClick={() => responder(sol, 'aceptar')}
                  disabled={enviando}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-guinda-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5"
                >
                  {enviando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Aceptar como {sol.funcion}{sol.id_nodo ? ' en esa parte' : ''}
                </button>
                <button
                  onClick={() => { setDeclinando(sol.id); setMotivo(''); setError(''); }}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"
                >
                  <X size={13} />
                  Declinar
                </button>
                <button
                  onClick={() => navigate(rutaDe(sol))}
                  className="px-3 py-1.5 text-xs text-guinda-700 hover:bg-guinda-100 rounded-lg"
                >
                  {sol.id_nodo ? 'Ver de qué se trata' : 'Ver el proyecto'}
                </button>
              </div>
            )}

            {error && (enDeclive || !declinando) && <p className="text-xs text-red-600 mt-2">{error}</p>}
          </div>
        );
      })}
    </section>
  );
}
