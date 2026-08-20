/**
 * ARCHIVO: BotonSolicitarParticipar.jsx
 * PROPÓSITO: Dejar que quien ve algo y no participa en ello pida entrar,
 *            sin tener que averiguar por fuera a quién pedírselo.
 *
 * MINI-CLASE: pedir exactamente lo que se necesita
 * ─────────────────────────────────────────────────────────────────
 * Todos ven todos los proyectos, pero solo captura quien está escrito en
 * ellos. Eso deja un caso muy común sin resolver: alguien abre un
 * proyecto de otra área, ve que su trabajo aporta a una etapa, y no
 * tiene forma de decirlo dentro de la plataforma — termina en un
 * WhatsApp, y la constancia de quién pidió qué se pierde.
 *
 * El mismo botón sirve para dos alcances y por eso vive junto a la lista
 * de participantes correspondiente: en "Participantes del proyecto" pide
 * el proyecto entero; en los participantes de una etapa, acción o tarea
 * pide solo esa parte. Quien aporta a una etapa no debería tener que
 * pedir el proyecto completo: es pedir de más, y quien decide lo nota.
 *
 * Solo aparece cuando tiene sentido: si ya puedes capturar ahí, o ya
 * mandaste una solicitud, no hay nada que pedir. El motivo es opcional a
 * propósito — obligar a justificarse agrega fricción sin agregar
 * información, porque quien decide ya ve el área y el cargo de quien pide.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect } from 'react';
import { UserPlus, Loader2, Clock, X } from 'lucide-react';
import {
  solicitarParticipacion, solicitarParticipacionNodo, misSolicitudes,
} from '../../api/solicitudes';

const ETIQUETA_NODO = { etapa: 'esta etapa', accion: 'esta acción', tarea: 'esta tarea' };

export default function BotonSolicitarParticipar({ proyecto, permisos, nodo = null, className = '' }) {
  const [pendiente, setPendiente] = useState(null);
  const [abierto, setAbierto] = useState(false);
  const [funcion, setFuncion] = useState('colaborador');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const idProyecto = proyecto?.id;
  // El nombre solo se usa para redactar el aviso; en el árbol de nodos no
  // siempre está a mano y no vale la pena pedirlo solo para esto.
  const nombreProyecto = proyecto?.nombre || 'este proyecto';
  const esDeNodo = !!(nodo?.tipo && nodo?.id);

  // Ya poder trabajar ahí vuelve la solicitud innecesaria. Para un nodo se
  // pregunta por ese nodo en concreto (quien fue invitado a la etapa 1 sí
  // puede pedir la etapa 2); para el proyecto, por el proyecto.
  const yaPuede = esDeNodo
    ? (permisos?.puedeEditarNodo?.(nodo.tipo, nodo.id) ?? false) || !!permisos?.puedeInvitar
    : !permisos?.esSoloLectura || !!permisos?.capturaParcial || !!permisos?.puedeInvitar;

  useEffect(() => {
    if (!idProyecto || yaPuede) return undefined;
    let vigente = true;
    misSolicitudes()
      .then(lista => {
        if (!vigente) return;
        setPendiente(lista.find(s => s.estado === 'pendiente' && (
          esDeNodo ? s.id_nodo === nodo.id : (!s.id_nodo && s.id_proyecto === idProyecto)
        )) || null);
      })
      .catch(() => {});
    return () => { vigente = false; };
  }, [idProyecto, yaPuede, esDeNodo, nodo?.id]);

  if (!idProyecto || yaPuede) return null;

  if (pendiente) {
    return (
      <span
        title="Quien coordina este proyecto ya la recibió. Te avisaremos aquí cuando responda."
        className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200 ${className}`}
      >
        <Clock size={10} />
        Solicitud enviada
      </span>
    );
  }

  async function enviar() {
    setEnviando(true); setError('');
    try {
      const datos = { funcion, motivo: motivo.trim() };
      const solicitud = esDeNodo
        ? await solicitarParticipacionNodo(nodo.tipo, nodo.id, datos)
        : await solicitarParticipacion(idProyecto, datos);
      setPendiente(solicitud);
      setAbierto(false);
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo enviar la solicitud');
    } finally {
      setEnviando(false);
    }
  }

  const queSePide = esDeNodo ? ETIQUETA_NODO[nodo.tipo] : 'el proyecto';

  return (
    <>
      <button
        onClick={() => { setAbierto(true); setError(''); }}
        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-lg border bg-white text-guinda-700 border-guinda-200 hover:bg-guinda-50 ${className}`}
      >
        <UserPlus size={12} />
        Solicitar participar
      </button>

      {abierto && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[9999] p-4" onClick={() => setAbierto(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h3 className="text-base font-semibold text-gray-900">
                {esDeNodo ? `Solicitar participar en ${queSePide}` : 'Solicitar participar'}
              </h3>
              <button onClick={() => setAbierto(false)} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-gray-500 leading-snug">
                {esDeNodo ? (
                  <>Pedirás acceso solo a <strong>«{nodo.nombre}»</strong> y a los elementos que dependen de ella, no a todo el proyecto.
                  {' '}Tu solicitud le llegará a quien coordina {nombreProyecto === 'este proyecto' ? nombreProyecto : `«${nombreProyecto}»`}.</>
                ) : (
                  <>Tu solicitud le llegará a quien coordina {nombreProyecto === 'este proyecto' ? nombreProyecto : `«${nombreProyecto}»`}.</>
                )}
                {' '}Podrá aceptarla o declinarla, y te avisaremos aquí en cualquier caso.
              </p>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">¿Con qué función?</label>
                <select
                  value={funcion}
                  onChange={e => setFuncion(e.target.value)}
                  className="input-base text-sm w-full"
                >
                  <option value="colaborador">Colaborador — capturar avances y evidencias</option>
                  <option value="responsable">
                    {esDeNodo
                      ? 'Responsable — además, coordinar esta parte'
                      : 'Responsable — además, coordinar el proyecto'}
                  </option>
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
                  placeholder={esDeNodo
                    ? 'Ej. Mi área genera los insumos cartográficos de esta etapa.'
                    : 'Ej. Mi área aporta los insumos cartográficos de la etapa 2.'}
                  className="input-base text-sm w-full"
                />
              </div>

              {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2 leading-snug">{error}</p>}
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
