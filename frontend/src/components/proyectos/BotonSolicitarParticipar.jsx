/**
 * ARCHIVO: BotonSolicitarParticipar.jsx
 * PROPÓSITO: Dejar que quien ve un proyecto y no participa en él pida
 *            entrar, sin tener que averiguar por fuera a quién pedírselo.
 *
 * MINI-CLASE: por qué hace falta el camino de vuelta
 * ─────────────────────────────────────────────────────────────────
 * Todos ven todos los proyectos, pero solo captura quien está escrito en
 * ellos. Eso deja un caso muy común sin resolver: alguien abre un
 * proyecto de otra área, ve que su trabajo aporta a una etapa, y no
 * tiene forma de decirlo dentro de la plataforma — termina en un
 * WhatsApp, y la constancia de quién pidió qué se pierde.
 *
 * Este botón solo aparece cuando tiene sentido: si ya participas, o ya
 * mandaste una solicitud, no hay nada que pedir. El motivo es opcional
 * a propósito: obligar a justificarse agrega fricción sin agregar
 * información, porque quien decide ya ve el área y el cargo de quien
 * pide.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect } from 'react';
import { UserPlus, Loader2, Clock, X } from 'lucide-react';
import { solicitarParticipacion, misSolicitudes } from '../../api/solicitudes';

export default function BotonSolicitarParticipar({ proyecto, permisos }) {
  const [pendiente, setPendiente] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const [funcion, setFuncion] = useState('colaborador');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  // Participar aquí incluye tener acceso aunque sea a una parte: a quien
  // ya lo invitaron a una etapa no le sirve pedir entrar otra vez.
  const yaParticipa = !permisos?.esSoloLectura || permisos?.capturaParcial || permisos?.puedeInvitar;
  const idProyecto = proyecto?.id;

  useEffect(() => {
    if (!idProyecto || yaParticipa) return undefined;
    let vigente = true;
    misSolicitudes()
      .then(lista => {
        if (!vigente) return;
        setPendiente(lista.find(s => s.id_proyecto === idProyecto && s.estado === 'pendiente') || null);
      })
      .catch(() => {});
    return () => { vigente = false; };
  }, [idProyecto, yaParticipa]);

  if (!idProyecto || yaParticipa) return null;

  if (pendiente) {
    return (
      <span
        title="Quien coordina este proyecto ya la recibió. Te avisaremos aquí cuando responda."
        className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200"
      >
        <Clock size={10} />
        Solicitud enviada
      </span>
    );
  }

  async function enviar() {
    setEnviando(true); setError('');
    try {
      const solicitud = await solicitarParticipacion(idProyecto, { funcion, motivo: motivo.trim() });
      setPendiente(solicitud);
      setAbierto(false);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo enviar la solicitud');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button
        onClick={() => { setAbierto(true); setError(''); }}
        className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-white text-guinda-700 border-guinda-200 hover:bg-guinda-50"
      >
        <UserPlus size={10} />
        Solicitar participar
      </button>

      {abierto && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="text-base font-semibold text-gray-900">Solicitar participar</h3>
              <button onClick={() => setAbierto(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-gray-500 leading-snug">
                Tu solicitud le llegará a quien coordina «{proyecto.nombre}». Podrá aceptarla o declinarla,
                y te avisaremos aquí en cualquier caso.
              </p>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">¿Con qué función?</label>
                <select
                  value={funcion}
                  onChange={e => setFuncion(e.target.value)}
                  className="input-base text-sm w-full"
                >
                  <option value="colaborador">Colaborador — capturar avances y evidencias</option>
                  <option value="responsable">Responsable — además, coordinar el proyecto</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Motivo <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <textarea
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  rows={3}
                  placeholder="Ej. Mi área aporta los insumos cartográficos de la etapa 2."
                  className="input-base text-sm w-full"
                />
              </div>

              {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2">{error}</p>}
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t">
              <button onClick={() => setAbierto(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                Cancelar
              </button>
              <button
                onClick={enviar}
                disabled={enviando}
                className="px-4 py-2 text-sm font-medium text-white bg-guinda-700 rounded-lg disabled:opacity-50 flex items-center gap-2"
              >
                {enviando && <Loader2 size={14} className="animate-spin" />}
                Enviar solicitud
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
