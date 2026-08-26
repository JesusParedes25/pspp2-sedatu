/**
 * ARCHIVO: AsignacionesRiesgoPendientes.jsx
 * PROPÓSITO: Riesgos donde te proponen como responsable, con lo necesario
 *            para aceptar o declinar sin salir de aquí.
 *
 * MINI-CLASE: la misma forma que una solicitud de participación
 * ─────────────────────────────────────────────────────────────────
 * Aceptar/declinar una asignación de riesgo es, en la forma, la misma
 * decisión que aceptar/declinar una solicitud de participación: alguien te
 * propone algo, tú respondes, y la respuesta le llega de vuelta. Por eso
 * esta tarjeta copia deliberadamente la de SolicitudesPorResolver — mismo
 * layout, mismos dos botones, mismo "opcional decir por qué" al declinar —
 * en vez de inventar un patrón visual nuevo para un caso que ya resolvimos
 * bien una vez.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X, Shield, Loader2, AlertTriangle } from 'lucide-react';
import { responderAsignacionRiesgo } from '../../api/riesgos';

const NIVEL_COLORES = {
  Bajo:    'bg-green-100 text-green-700',
  Medio:   'bg-yellow-100 text-yellow-700',
  Alto:    'bg-orange-100 text-orange-700',
  Critico: 'bg-red-100 text-red-700',
};

function rutaDe(r) {
  if (!r.id_proyecto) return null;
  if (r.entidad_tipo === 'Proyecto') return `/proyectos/${r.id_proyecto}`;
  return `/proyectos/${r.id_proyecto}?tab=seguimiento&nodo=${r.entidad_id}`;
}

export default function AsignacionesRiesgoPendientes({ asignaciones, onRespondida, ocultarEncabezado = false }) {
  const navigate = useNavigate();
  const [declinando, setDeclinando] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  if (!asignaciones?.length) return null;

  async function responder(riesgo, respuesta, textoMotivo) {
    setEnviando(true); setError('');
    try {
      await responderAsignacionRiesgo(riesgo.id, respuesta, textoMotivo);
      setDeclinando(null); setMotivo('');
      onRespondida?.(riesgo, respuesta);
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
          <Shield size={15} className="text-orange-600" />
          Asignaciones de riesgo
          <span className="text-[10px] font-medium bg-orange-100 text-orange-700 rounded-full px-1.5 py-0.5">
            {asignaciones.length}
          </span>
        </h2>
      )}

      {asignaciones.map(r => {
        const enDeclive = declinando === r.id;
        return (
          <div key={r.id} className="card p-4 border-orange-200 bg-orange-50/40">
            <p className="text-sm text-gray-800">
              <span className="font-medium">{r.asignado_por_nombre}</span>
              {' te propuso como responsable del '}
              <span className="font-medium">{r.tipo === 'Problema' ? 'problema' : 'riesgo'}</span>
              {' '}
              <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full ${NIVEL_COLORES[r.nivel] || 'bg-gray-100 text-gray-600'}`}>
                {r.nivel}
              </span>
            </p>

            <p className="text-sm font-medium text-gray-900 mt-1.5 flex items-start gap-1.5">
              <AlertTriangle size={14} className="text-orange-500 flex-shrink-0 mt-0.5" />
              {r.titulo}
            </p>

            <p className="text-xs text-gray-500 mt-1">
              En <span className="font-medium">«{r.nombre_entidad || 'sin nombre'}»</span>
            </p>

            {r.descripcion && (
              <p className="text-xs text-gray-600 mt-1.5 border-l-2 border-orange-200 pl-2 italic">
                {r.descripcion}
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
                  placeholder="Ej. Ya tengo demasiados riesgos asignados este mes."
                  className="input-base text-sm w-full"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => responder(r, 'declinar', motivo.trim())}
                    disabled={enviando}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {enviando ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                    Declinar asignación
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
                  onClick={() => responder(r, 'aceptar')}
                  disabled={enviando}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-guinda-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5"
                >
                  {enviando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Aceptar
                </button>
                <button
                  onClick={() => { setDeclinando(r.id); setMotivo(''); setError(''); }}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"
                >
                  <X size={13} />
                  Declinar
                </button>
                <button
                  onClick={() => { const ruta = rutaDe(r); if (ruta) navigate(ruta); }}
                  className="px-3 py-1.5 text-xs text-guinda-700 hover:bg-guinda-100 rounded-lg"
                >
                  Ver de qué se trata
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
