/**
 * ARCHIVO: InvitacionesPendientes.jsx
 * PROPÓSITO: Mostrar las invitaciones que el usuario tiene sin responder
 *            y dejarlo aceptarlas o rechazarlas.
 *
 * MINI-CLASE: por qué no basta con la notificación
 * ─────────────────────────────────────────────────────────────────
 * Antes, invitar metía a la persona en el proyecto y le mandaba un aviso
 * informándola. Ahora invitar propone: hasta que no responda, no tiene
 * permisos. Una notificación es un renglón que se lee y se olvida, así
 * que las invitaciones pendientes viven aparte, arriba de todo y
 * destacadas, hasta que se responden — no se pueden "marcar como
 * leídas" para hacerlas desaparecer.
 *
 * Rechazar pide motivo porque quien invitó necesita saber por qué para
 * reasignar el trabajo. El campo es obligatorio en el servidor; aquí se
 * valida antes para no gastar un viaje.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X, UserPlus, Loader2, CornerDownRight } from 'lucide-react';
import { responderInvitacionProyecto, responderInvitacionNodo } from '../../api/miembros';
import { olvidarPermisos } from '../../hooks/usePermisos';

const ETIQUETA_TIPO = {
  proyecto: 'todo el proyecto',
  etapa: 'la etapa',
  accion: 'la acción',
  tarea: 'la tarea',
};

// A dónde lleva "ver de qué se trata". Una invitación a un nodo abre el
// proyecto con ese nodo enfocado; el deep-link ya existía.
function rutaDe(inv) {
  if (inv.tipo === 'proyecto') return `/proyectos/${inv.id_proyecto}`;
  return `/proyectos/${inv.id_proyecto}?tab=seguimiento&nodo=${inv.id_nodo}`;
}

export default function InvitacionesPendientes({ invitaciones, onRespondida, ocultarEncabezado = false }) {
  const navigate = useNavigate();
  const [rechazando, setRechazando] = useState(null);   // la invitación en curso
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  if (!invitaciones?.length) return null;

  const clave = inv => `${inv.tipo}:${inv.id_nodo}`;

  async function responder(inv, respuesta, textoMotivo) {
    setEnviando(true); setError('');
    try {
      if (inv.tipo === 'proyecto') {
        await responderInvitacionProyecto(inv.id_proyecto, respuesta, textoMotivo);
      } else {
        await responderInvitacionNodo(inv.tipo, inv.id_nodo, respuesta, textoMotivo);
      }
      // Los permisos del proyecto cambiaron: que se vuelvan a pedir.
      olvidarPermisos(inv.id_proyecto);
      setRechazando(null); setMotivo('');
      onRespondida?.(inv, respuesta);
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
          <UserPlus size={15} className="text-guinda-600" />
          Invitaciones por responder
          <span className="text-[10px] font-medium bg-guinda-100 text-guinda-700 rounded-full px-1.5 py-0.5">
            {invitaciones.length}
          </span>
        </h2>
      )}

      {invitaciones.map(inv => {
        const enRechazo = rechazando === clave(inv);
        return (
          <div key={clave(inv)} className="card p-4 border-guinda-200 bg-guinda-50/40">
            <p className="text-sm text-gray-800">
              <span className="font-medium">{inv.invitado_por_nombre || 'Alguien'}</span>
              {' te invitó a participar en '}
              <span className="font-medium">{ETIQUETA_TIPO[inv.tipo] || inv.tipo}</span>
              {inv.tipo !== 'proyecto' && <> «{inv.nombre_nodo}»</>}
              {' como '}
              <span className="font-medium">{inv.funcion}</span>.
            </p>

            {inv.tipo !== 'proyecto' && (
              <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                <CornerDownRight size={12} />
                Proyecto: {inv.nombre_proyecto}
              </p>
            )}

            {enRechazo ? (
              <div className="mt-3 space-y-2">
                <label className="block text-xs font-medium text-gray-600">
                  ¿Por qué la rechazas? Quien te invitó necesita saberlo para reasignar el trabajo.
                </label>
                <textarea
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  rows={2}
                  autoFocus
                  placeholder="Ej. Ya estoy asignado a otra etapa este trimestre."
                  className="input-base text-sm w-full"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => responder(inv, 'rechazar', motivo.trim())}
                    disabled={enviando || !motivo.trim()}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {enviando ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                    Rechazar invitación
                  </button>
                  <button
                    onClick={() => { setRechazando(null); setMotivo(''); setError(''); }}
                    className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <button
                  onClick={() => responder(inv, 'aceptar')}
                  disabled={enviando}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-guinda-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5"
                >
                  {enviando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Aceptar
                </button>
                <button
                  onClick={() => { setRechazando(clave(inv)); setMotivo(''); setError(''); }}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"
                >
                  <X size={13} />
                  Rechazar
                </button>
                <button
                  onClick={() => navigate(rutaDe(inv))}
                  className="px-3 py-1.5 text-xs text-guinda-700 hover:bg-guinda-100 rounded-lg"
                >
                  Ver de qué se trata
                </button>
              </div>
            )}

            {error && enRechazo && <p className="text-xs text-red-600 mt-2">{error}</p>}
          </div>
        );
      })}
      {error && !rechazando && <p className="text-xs text-red-600">{error}</p>}
    </section>
  );
}
