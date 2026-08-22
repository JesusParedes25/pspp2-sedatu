/**
 * ARCHIVO: ModalRegistrarAvance.jsx
 * PROPÓSITO: Modal único para reportar el estado de una etapa/acción/tarea —
 *            sustituye los controles sueltos que antes vivían repartidos por
 *            su lado (barra de solo porcentaje, "Marcar concluido",
 *            "Comentar" y "Adjuntar archivo"). Un solo botón "Guardar
 *            avance" dispara los cambios de Estatus/Avance (misma
 *            transacción del backend) más, si se llenaron, Detalle y
 *            Evidencia — quedan uno justo después del otro en el stream de
 *            actividad del nodo, con el mismo autor y casi el mismo
 *            timestamp, así que se leen como un solo reporte aunque cada
 *            uno siga viviendo en su propia fila (ver ActividadStream, que
 *            los agrupa visualmente por eso).
 *
 * Es el MISMO componente para cualquier contexto que registre avance: el
 * panel de Seguimiento > Detalle, el drawer de Diagrama y Mis actividades
 * — no sabe ni le importa desde cuál de los tres se abrió.
 */
import { useState } from 'react';
import { X, Loader2, Paperclip, Link2, ChevronDown, ChevronRight, Lock, CheckCircle2 } from 'lucide-react';
import * as etapasApi from '../../api/etapas';
import * as accionesApi from '../../api/acciones';
import * as tareasApi from '../../api/tareas';
import * as evidenciasApi from '../../api/evidencias';
import * as actividadApi from '../../api/actividad';
import { crearComentario } from '../../api/comentarios';
import { NIVELES } from '../../config/niveles';

// comentarios/evidencias del modelo viejo NUNCA soportaron 'Tarea' — para
// tarea todo cae al stream unificado `actividad` (mismo criterio que ya usa
// NodoCard y SeccionArchivosNodo).
const ENTIDAD_TIPO = { etapa: 'Etapa', accion: 'Accion' };

// Mismos tres estados "congelados" que ya reconocía BloqueEditable: el
// avance no se captura a mano en ninguno de ellos.
const ESTADOS_CONGELADOS = { Completada: 'Completada: 100%', Bloqueada: 'Bloqueada: avance congelado', Cancelada: 'Cancelada' };

async function patchNodo(tipo, id, datos) {
  if (tipo === 'etapa') return etapasApi.patchEtapa(id, datos);
  if (tipo === 'accion') return accionesApi.patchAccion(id, datos);
  return tareasApi.patchTarea(id, datos);
}

async function comentarEn(tipo, id, contenido) {
  if (ENTIDAD_TIPO[tipo]) return crearComentario({ entidad_tipo: ENTIDAD_TIPO[tipo], entidad_id: id, contenido });
  return actividadApi.comentar(tipo, id, contenido);
}

async function adjuntarEvidencia(tipo, id, { archivo, url }) {
  const metadatos = { categoria: 'Otro' };
  if (url) {
    if (tipo === 'tarea') return actividadApi.registrarLinkActividad(tipo, id, url, metadatos);
    if (tipo === 'etapa') return evidenciasApi.registrarLinkEtapa(id, url, metadatos);
    return evidenciasApi.registrarLinkAccion(id, url, metadatos);
  }
  if (tipo === 'tarea') return actividadApi.subirArchivoActividad(tipo, id, archivo, metadatos);
  if (tipo === 'etapa') return evidenciasApi.subirEvidenciaEtapa(id, archivo, metadatos);
  return evidenciasApi.subirEvidenciaAccion(id, archivo, metadatos);
}

export default function ModalRegistrarAvance({ tipo, nodo, esContenedor = false, onGuardado, onCerrar }) {
  const nivel = NIVELES[tipo];
  const avanceActual = Math.round(nodo.avance_actual ?? nodo.avance_efectivo ?? 0);
  const estadoActual = nodo.estado || 'Pendiente';
  const congelado = ESTADOS_CONGELADOS[estadoActual];

  const [estatus, setEstatus] = useState(nodo.estatus_cualitativo || '');
  const [avance, setAvance] = useState(Math.min(avanceActual, 99));
  const [concluir, setConcluir] = useState(false);
  const [detalleAbierto, setDetalleAbierto] = useState(false);
  const [detalle, setDetalle] = useState('');
  const [modoEvidencia, setModoEvidencia] = useState(null); // null | 'archivo' | 'liga'
  const [archivo, setArchivo] = useState(null);
  const [urlLiga, setUrlLiga] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const puedeCapturarAvance = !esContenedor && !congelado;
  const puedeGuardar = estatus.trim().length > 0 && !guardando
    && (modoEvidencia !== 'liga' || urlLiga.trim().length > 0);

  async function guardar() {
    if (!puedeGuardar) return;
    setGuardando(true); setError('');
    try {
      const datos = { estatus_cualitativo: estatus.trim() };
      if (puedeCapturarAvance) {
        if (concluir) {
          datos.estado = 'Completada';
        } else if (avance !== avanceActual || estadoActual === 'Pendiente') {
          datos.avance_actual = avance;
          if (estadoActual !== 'En_proceso') datos.estado = 'En_proceso';
        }
      }
      await patchNodo(tipo, nodo.id, datos);

      if (detalle.trim()) await comentarEn(tipo, nodo.id, detalle.trim());

      if (modoEvidencia === 'archivo' && archivo) await adjuntarEvidencia(tipo, nodo.id, { archivo });
      else if (modoEvidencia === 'liga' && urlLiga.trim()) await adjuntarEvidencia(tipo, nodo.id, { url: urlLiga.trim() });

      await onGuardado?.();
      onCerrar?.();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo guardar el avance');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Registrar avance</h3>
            <p className="text-xs text-gray-400 mt-0.5">{nivel.label} · {nodo.nombre}</p>
          </div>
          <button onClick={onCerrar} className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 flex-shrink-0"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {/* Estatus */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Estatus <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={estatus}
              onChange={e => setEstatus(e.target.value)}
              placeholder="¿en una frase, cómo va esto?"
              maxLength={200}
              autoFocus
              className="input-base text-sm w-full"
            />
          </div>

          {/* Avance */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Avance</label>
            {!puedeCapturarAvance ? (
              <div className="flex items-start gap-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                <Lock size={13} className="flex-shrink-0 mt-0.5" />
                <span>
                  <strong className="text-gray-700">{esContenedor ? avanceActual : Math.round(nodo.avance_actual ?? 0)}%</strong>
                  {' — '}
                  {esContenedor
                    ? 'se calcula automáticamente a partir de sus partes.'
                    : (congelado || '')}
                </span>
              </div>
            ) : (
              <>
                <label className="flex items-center gap-2 text-xs text-gray-600 mb-2">
                  <input type="checkbox" checked={concluir} onChange={e => setConcluir(e.target.checked)} className="accent-guinda-600" />
                  Marcar como concluida
                </label>
                {!concluir ? (
                  <div className="flex items-center gap-2">
                    <input type="range" min={0} max={99} value={avance} onChange={e => setAvance(Number(e.target.value))} className="flex-1 accent-guinda-600" />
                    <span className="text-sm font-bold tabular-nums w-10 text-right">{avance}%</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <CheckCircle2 size={13} /> Se guardará como 100% concluida.
                  </div>
                )}
              </>
            )}
          </div>

          {/* Detalle (opcional, colapsado) */}
          <div>
            {!detalleAbierto ? (
              <button onClick={() => setDetalleAbierto(true)} className="flex items-center gap-1 text-xs font-medium text-guinda-700 hover:text-guinda-800">
                <ChevronRight size={13} /> Agregar detalle
              </button>
            ) : (
              <>
                <button onClick={() => setDetalleAbierto(false)} className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 mb-1">
                  <ChevronDown size={13} /> Detalle <span className="text-gray-400 font-normal">(opcional)</span>
                </button>
                <textarea
                  value={detalle}
                  onChange={e => setDetalle(e.target.value)}
                  rows={3}
                  autoFocus
                  placeholder="Cuenta con más contexto qué pasó..."
                  className="input-base text-sm w-full resize-none"
                />
              </>
            )}
          </div>

          {/* Evidencia (opcional) */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Evidencia <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            {modoEvidencia === null ? (
              <div className="flex items-center gap-1.5">
                <button onClick={() => setModoEvidencia('archivo')}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
                  <Paperclip size={13} /> Archivo
                </button>
                <button onClick={() => setModoEvidencia('liga')}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
                  <Link2 size={13} /> Pegar liga
                </button>
              </div>
            ) : modoEvidencia === 'archivo' ? (
              <div className="flex items-center gap-2">
                <input type="file" onChange={e => setArchivo(e.target.files?.[0] || null)} className="text-xs flex-1" />
                <button onClick={() => { setModoEvidencia(null); setArchivo(null); }} className="text-gray-400 hover:text-gray-600 flex-shrink-0"><X size={14} /></button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input type="url" value={urlLiga} onChange={e => setUrlLiga(e.target.value)} placeholder="https://..."
                  className="input-base text-sm flex-1" />
                <button onClick={() => { setModoEvidencia(null); setUrlLiga(''); }} className="text-gray-400 hover:text-gray-600 flex-shrink-0"><X size={14} /></button>
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2 leading-snug">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-gray-100 flex-shrink-0">
          <button onClick={onCerrar} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button
            onClick={guardar}
            disabled={!puedeGuardar}
            className="px-4 py-2 text-sm font-medium text-white bg-guinda-700 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            {guardando && <Loader2 size={14} className="animate-spin" />}
            Guardar avance
          </button>
        </div>
      </div>
    </div>
  );
}
