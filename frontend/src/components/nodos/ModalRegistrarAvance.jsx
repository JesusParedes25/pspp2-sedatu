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
 *
 * Se renderiza con createPortal en document.body (mismo patrón que el
 * tooltip de AccionFicha.jsx) porque el rail de Detalle y el drawer de
 * Diagrama posicionan su panel con translate-x — eso vuelve al `<aside>`
 * el "containing block" de cualquier hijo con position:fixed, y el modal
 * terminaba encajonado dentro del rail en vez de cubrir toda la pantalla.
 */
import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Paperclip, Link2, ChevronDown, ChevronRight, Lock, CheckCircle2, Plus } from 'lucide-react';
import * as etapasApi from '../../api/etapas';
import * as accionesApi from '../../api/acciones';
import * as tareasApi from '../../api/tareas';
import * as evidenciasApi from '../../api/evidencias';
import * as actividadApi from '../../api/actividad';
import { crearComentario } from '../../api/comentarios';
import { NIVELES } from '../../config/niveles';
import CATEGORIAS_EVIDENCIA from '../seguimiento/categoriasEvidencia';

// comentarios/evidencias del modelo viejo NUNCA soportaron 'Tarea' — para
// tarea todo cae al stream unificado `actividad` (mismo criterio que ya usa
// NodoCard y SeccionArchivosNodo).
const ENTIDAD_TIPO = { etapa: 'Etapa', accion: 'Accion' };

// Bloqueada/Cancelada son los únicos estados donde el avance de verdad no
// se puede tocar (Bloqueada lo rechaza el propio backend). Completada NO
// entra aquí a propósito: "concluido" no es definitivo — quien lo marcó
// puede necesitar corregirlo después (bajarlo a 90%, por ejemplo), así que
// se deja editable, con la casilla "Marcar como concluida" pre-marcada
// para que reabrirlo sea una decisión explícita, no un accidente.
const ESTADOS_CONGELADOS = { Bloqueada: 'Bloqueada: avance congelado', Cancelada: 'Cancelada' };

async function patchNodo(tipo, id, datos) {
  if (tipo === 'etapa') return etapasApi.patchEtapa(id, datos);
  if (tipo === 'accion') return accionesApi.patchAccion(id, datos);
  return tareasApi.patchTarea(id, datos);
}

async function comentarEn(tipo, id, contenido) {
  if (ENTIDAD_TIPO[tipo]) return crearComentario({ entidad_tipo: ENTIDAD_TIPO[tipo], entidad_id: id, contenido });
  return actividadApi.comentar(tipo, id, contenido);
}

async function adjuntarEvidencia(tipo, id, { archivo, url, categoria, notas }) {
  const metadatos = { categoria: categoria || 'Otro', notas: notas?.trim() || null };
  if (url) {
    if (tipo === 'tarea') return actividadApi.registrarLinkActividad(tipo, id, url, metadatos);
    if (tipo === 'etapa') return evidenciasApi.registrarLinkEtapa(id, url, metadatos);
    return evidenciasApi.registrarLinkAccion(id, url, metadatos);
  }
  if (tipo === 'tarea') return actividadApi.subirArchivoActividad(tipo, id, archivo, metadatos);
  if (tipo === 'etapa') return evidenciasApi.subirEvidenciaEtapa(id, archivo, metadatos);
  return evidenciasApi.subirEvidenciaAccion(id, archivo, metadatos);
}

let contadorEvidencia = 0;
const idEvidencia = () => `ev${++contadorEvidencia}`;

export default function ModalRegistrarAvance({ tipo, nodo, esContenedor = false, onGuardado, onCerrar }) {
  const nivel = NIVELES[tipo];
  const avanceActual = Math.round(nodo.avance_actual ?? nodo.avance_efectivo ?? 0);
  const estadoActual = nodo.estado || 'Pendiente';
  const congelado = ESTADOS_CONGELADOS[estadoActual];

  const [estatus, setEstatus] = useState(nodo.estatus_cualitativo || '');
  const [avance, setAvance] = useState(Math.min(avanceActual, 99));
  const [concluir, setConcluir] = useState(estadoActual === 'Completada');
  const [detalleAbierto, setDetalleAbierto] = useState(false);
  const [detalle, setDetalle] = useState('');
  // Cada evidencia: { id, modo: 'archivo'|'liga', archivo, url, categoria, notas }.
  // Un archivo elegido con el picker en modo múltiple, o una liga agregada a
  // mano, cada una con su propia categoría y nota opcionales — así el
  // usuario no tiene que abrir el modal de nuevo para dejar una segunda
  // evidencia del mismo reporte.
  const [evidencias, setEvidencias] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  // Candado síncrono aparte de `guardando`: dos clics casi simultáneos
  // (doble clic, o Enter + clic) pueden disparar guardar() dos veces antes
  // de que React re-renderice con el botón ya deshabilitado — `guardando`
  // es estado, así que ambas llamadas lo leen en false todavía. Un ref se
  // actualiza al instante, sin esperar un render, así que sí corta la
  // segunda llamada. Sin esto, un reporte con estatus/avance + evidencia
  // podía quedar duplicado por completo en el stream de actividad.
  const guardandoRef = useRef(false);

  const puedeCapturarAvance = !esContenedor && !congelado;
  const puedeGuardar = estatus.trim().length > 0 && !guardando
    && evidencias.every(ev => ev.modo === 'archivo' || ev.url.trim().length > 0);

  function agregarArchivos(fileList) {
    const nuevos = Array.from(fileList).map(archivo => ({
      id: idEvidencia(), modo: 'archivo', archivo, url: '', categoria: 'Otro', notas: '',
    }));
    setEvidencias(prev => [...prev, ...nuevos]);
  }
  function agregarLiga() {
    setEvidencias(prev => [...prev, { id: idEvidencia(), modo: 'liga', archivo: null, url: '', categoria: 'Otro', notas: '' }]);
  }
  function actualizarEvidencia(id, campo, valor) {
    setEvidencias(prev => prev.map(ev => (ev.id === id ? { ...ev, [campo]: valor } : ev)));
  }
  function quitarEvidencia(id) {
    setEvidencias(prev => prev.filter(ev => ev.id !== id));
  }

  async function guardar() {
    if (!puedeGuardar || guardandoRef.current) return;
    guardandoRef.current = true;
    setGuardando(true); setError('');
    try {
      const datos = { estatus_cualitativo: estatus.trim() };
      if (puedeCapturarAvance) {
        if (concluir) {
          // Ya estaba Completada y se dejó la casilla tal cual: no hay
          // transición real, no hace falta reenviar el estado (evita un
          // "Estatus cambiado a Completada" fantasma en la actividad).
          if (estadoActual !== 'Completada') datos.estado = 'Completada';
        } else if (avance !== avanceActual || estadoActual === 'Pendiente') {
          datos.avance_actual = avance;
          if (estadoActual !== 'En_proceso') datos.estado = 'En_proceso';
        }
      }
      await patchNodo(tipo, nodo.id, datos);

      if (detalle.trim()) await comentarEn(tipo, nodo.id, detalle.trim());

      // Secuencial, no Promise.all: son peticiones multipart contra el
      // mismo nodo — más simple de seguir en el log del servidor y evita
      // sorpresas de orden si una evidencia depende de otra en el futuro.
      for (const ev of evidencias) {
        if (ev.modo === 'archivo') await adjuntarEvidencia(tipo, nodo.id, { archivo: ev.archivo, categoria: ev.categoria, notas: ev.notas });
        else if (ev.url.trim()) await adjuntarEvidencia(tipo, nodo.id, { url: ev.url.trim(), categoria: ev.categoria, notas: ev.notas });
      }

      await onGuardado?.();
      onCerrar?.();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo guardar el avance');
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  }

  return createPortal((
    <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4" onClick={onCerrar}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Registrar avance</h3>
            <p className="text-xs text-gray-400 mt-0.5">{nivel.label} · {nodo.nombre}</p>
          </div>
          <button onClick={onCerrar} className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 flex-shrink-0"><X size={18} /></button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {/* Estatus cualitativo — mismo nombre que usa el resto de la app
              (Tablero, Panorama del proyecto, Carteras: ver
              TituloEstatusCualitativo) para esta nota corta. A secas
              "Estatus" se prestaba a confundirse con el estatus real
              (Pendiente/En_proceso/Bloqueada/Completada/Cancelada), que
              vive en su propio control en Ficha, no aquí. */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Estatus cualitativo <span className="text-red-500">*</span>
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
                <label className="flex items-center gap-2 text-xs text-gray-600 mb-1">
                  <input type="checkbox" checked={concluir} onChange={e => setConcluir(e.target.checked)} className="accent-guinda-600" />
                  Marcar como concluida
                </label>
                {estadoActual === 'Completada' && concluir && (
                  <p className="text-[10px] text-gray-400 mb-2 ml-5">Ya estaba marcada como concluida. Desmarca la casilla si necesitas corregir el avance.</p>
                )}
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

          {/* Evidencia (opcional) — una o varias, cada una con su propia
              categoría y nota opcionales. Filas compactas tipo tabla en
              vez de un formulario por evidencia, para que agregar 3 o 4
              (el caso típico al cerrar un lote de trabajo) no signifique
              abrir el modal varias veces. */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Evidencia <span className="text-gray-400 font-normal">(opcional)</span>
            </label>

            {evidencias.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {evidencias.map(ev => (
                  <div key={ev.id} className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2 py-1.5">
                    {ev.modo === 'liga' ? <Link2 size={13} className="text-blue-500 flex-shrink-0" /> : <Paperclip size={13} className="text-gray-400 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      {ev.modo === 'archivo' ? (
                        <p className="text-xs text-gray-700 truncate" title={ev.archivo.name}>{ev.archivo.name}</p>
                      ) : (
                        <input
                          type="url" value={ev.url} onChange={e => actualizarEvidencia(ev.id, 'url', e.target.value)}
                          placeholder="https://..." autoFocus
                          className="text-xs w-full border-0 p-0 outline-none focus:ring-0 bg-transparent"
                        />
                      )}
                      <input
                        type="text" value={ev.notas} onChange={e => actualizarEvidencia(ev.id, 'notas', e.target.value)}
                        placeholder="Nota (opcional)"
                        className="text-[11px] text-gray-400 w-full border-0 p-0 outline-none focus:ring-0 bg-transparent mt-0.5"
                      />
                    </div>
                    <select
                      value={ev.categoria} onChange={e => actualizarEvidencia(ev.id, 'categoria', e.target.value)}
                      className="text-[10px] border border-gray-200 rounded px-1 py-1 flex-shrink-0 bg-white max-w-[6.5rem]"
                    >
                      {CATEGORIAS_EVIDENCIA.map(c => <option key={c.value} value={c.value}>{c.icon} {c.value}</option>)}
                    </select>
                    <button onClick={() => quitarEvidencia(ev.id)} className="text-gray-300 hover:text-red-500 flex-shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                <Plus size={13} /> Archivo
                <input type="file" multiple className="hidden" onChange={e => { agregarArchivos(e.target.files); e.target.value = ''; }} />
              </label>
              <button onClick={agregarLiga}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
                <Plus size={13} /> Liga
              </button>
            </div>
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
  ), document.body);
}
