/**
 * ARCHIVO: ActividadStream.jsx
 * PROPÓSITO: "Evolución en el tiempo" de un nodo Y TODOS sus descendientes
 *            — solo la lista cronológica (BitacoraCronologica.jsx,
 *            compartida con el módulo Bitácora del proyecto), sin el
 *            gráfico: aquí se lee como una línea del tiempo de toda la
 *            vida, el gráfico por mes/trimestre queda exclusivo de
 *            Bitácora (decisión explícita — ver PR de seguimiento al
 *            rediseño de la línea del tiempo). Seguida del cuadro para
 *            comentar o adjuntar. Alcance: avance + documentos + riesgos
 *            + comentarios + equipo — sin indicadores, que solo tienen
 *            sentido agregados a nivel proyecto, en Bitácora.
 *
 * MINI-CLASE: por qué se agrupan varias filas en una sola entrada de
 * historial en otros lugares (ModalRegistrarAvance.jsx)
 * ─────────────────────────────────────────────────────────────────
 * "Registrar avance" (ver ModalRegistrarAvance) guarda Estatus + Avance
 * + Detalle + Evidencia como 2 a 4 filas independientes en `actividad`
 * (o en `comentarios`/`evidencias` para etapa/acción, modelo viejo) —
 * sin una migración que las ligue con un id de lote compartido.
 * `agruparParaLinea` (exportada de aquí) agrupa filas del mismo autor, de
 * un tipo asociado a un reporte de avance, separadas por menos de 15
 * segundos, para leerlas como un solo reporte en el historial de ese
 * modal — es una utilidad aparte del gráfico/lista de esta pantalla, que
 * ya no agrupan así (cada evento normalizado es su propia fila/marcador).
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Paperclip, Send, Loader2, X, FileText, Upload, Link2 } from 'lucide-react';
import * as actividadApi from '../../api/actividad';
import * as evidenciasApi from '../../api/evidencias';
import * as riesgosApi from '../../api/riesgos';
import FilePreviewModal from '../evidencias/FilePreviewModal';
import ModalRiesgo from '../riesgos/ModalRiesgo';
import BitacoraCronologica from '../common/BitacoraCronologica';
import { normalizarEventoNodo } from '../../utils/eventosLineaTiempo';
import { useCandado } from '../../hooks/useEnvioUnico';
import { useUI } from '../../context/UIContext';

// El stream mezcla 3 orígenes de archivo: la tabla nueva `actividad`, una
// evidencia del modelo viejo (trae metadata.evidencia_id), o un link externo
// (metadata.tipo_medio === 'link') — cada uno resuelve su URL de descarga
// distinto, y solo el primero (evidencia vieja) trae categoría de verdad.
function urlArchivo(item) {
  if (item.metadata?.tipo_medio === 'link') return item.archivo_url;
  if (item.metadata?.evidencia_id) return evidenciasApi.obtenerUrlDescarga(item.metadata.evidencia_id);
  return actividadApi.obtenerUrlDescargaActividad(item.id);
}

const TIPOS_AGRUPABLES = new Set(['cambio_avance', 'cambio_estatus', 'estatus_cualitativo', 'comentario']);
const VENTANA_AGRUPACION_MS = 15000;

// Junta filas del mismo autor, de tipos agrupables, separadas por menos de
// VENTANA_AGRUPACION_MS, en una sola tarjeta — usada hoy por el historial
// de ModalRegistrarAvance.jsx (ver mini-clase arriba), no por esta pantalla.
export function agruparParaLinea(items) {
  const grupos = [];
  for (const item of items) {
    const ultimo = grupos[grupos.length - 1];
    const puedeUnirse = ultimo
      && TIPOS_AGRUPABLES.has(item.tipo_evento)
      && TIPOS_AGRUPABLES.has(ultimo.eventos[0].tipo_evento)
      && !ultimo.tipos.has(item.tipo_evento)
      && item.autor_nombre === ultimo.eventos[0].autor_nombre
      && Math.abs(new Date(ultimo.eventos[0].created_at) - new Date(item.created_at)) < VENTANA_AGRUPACION_MS;
    if (puedeUnirse) {
      ultimo.eventos.push(item);
      ultimo.tipos.add(item.tipo_evento);
    } else {
      grupos.push({ eventos: [item], tipos: new Set([item.tipo_evento]) });
    }
  }
  return grupos;
}

// `titulo`: opcional — cuando el feed vive en un lugar donde ya no es obvio
// de quién es la actividad que se muestra (la columna central de Detalle,
// donde el feed sigue a la selección y no al encabezado de la rama
// enfocada), se pasa el nombre del elemento seleccionado para no dejarlo
// ambiguo al cambiar de selección. En el drawer de Diagrama no hace falta
// (la pestaña ya tiene el título del nodo arriba), así que se omite ahí.
// soloLectura: comentar y adjuntar son formas de participar, no de mirar.
// Quien no fue invitado lee el stream pero no escribe en él; el servidor
// aplica la misma regla en POST /comentarios y en las evidencias, así que
// sin esto el compositor existía y la petición fallaba con 403.
export default function ActividadStream({ tipo, id, titulo, soloLectura = false, onCambiado, riesgoIdInicial, onRiesgoConsumido }) {
  const { mostrarToast } = useUI();
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState('');
  // Un solo candado para enviar/adjuntar: comparten `enviando` en la UI
  // y no deben poder correr a la vez.
  const [ejecutar, enviando] = useCandado();
  const [detalleItem, setDetalleItem] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);
  // Riesgo abierto para ver/editar desde el stream — separado de
  // `detalleItem` (que es solo para archivos/enlaces): un riesgo necesita
  // el objeto completo (ModalRiesgo), no solo lo que ya trae el item del
  // feed (aquí solo viaja nivel/estado/riesgo_id, no el resto del formulario).
  const [riesgoAbierto, setRiesgoAbierto] = useState(null);
  const [cargandoRiesgo, setCargandoRiesgo] = useState(false);
  // Id del evento normalizado resaltado al pasar el cursor por una fila
  // de la lista — sin gráfico en esta pantalla, solo sirve para el
  // highlight visual de esa misma fila.
  const [hoveredId, setHoveredId] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await actividadApi.obtenerActividadNodo(tipo, id);
      setItems(res.datos || []);
    } catch { setItems([]); }
    finally { setCargando(false); }
  }, [tipo, id]);

  useEffect(() => { cargar(); }, [cargar]);

  // Deep-link "abre este riesgo ya" (desde Panorama del proyecto, vía
  // ?riesgo=<id> — ver DetalleProyecto.jsx::irANodo y EtapasAvancesMD):
  // se abre una sola vez y de inmediato se avisa al padre que lo limpie
  // de la URL, para que un re-render posterior (o volver a este mismo
  // nodo más tarde sin venir de un riesgo) no lo vuelva a abrir solo.
  useEffect(() => {
    if (!riesgoIdInicial) return;
    if (!soloLectura) abrirRiesgo(riesgoIdInicial);
    onRiesgoConsumido?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riesgoIdInicial]);

  // `normalizarEventoNodo` solo produce carriles de Detalle (nunca
  // 'indicador', exclusivo de Bitácora) — sin filtro adicional, más
  // reciente primero tal cual llega `items` del backend.
  const eventos = useMemo(() => items.map(normalizarEventoNodo), [items]);

  // Clic en una fila de la lista: abre el detalle del evento cuando existe
  // uno (archivo → su modal de detalle; riesgo con fila propia →
  // ModalRiesgo); para avance/comentario/equipo/riesgo-sin-fila (no hay
  // modal dedicado), solo resalta la fila.
  function alHacerClicEnEvento(evento) {
    const raw = evento.raw;
    if (raw.tipo_evento === 'archivo') { setDetalleItem(raw); return; }
    if (raw.tipo_evento === 'riesgo' && raw.metadata?.riesgo_id && !soloLectura) {
      abrirRiesgo(raw.metadata.riesgo_id);
      return;
    }
    setHoveredId(evento.id);
    document.getElementById(`evento-fila-${evento.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function enviar() {
    if (!texto.trim()) return;
    ejecutar(async () => {
      await actividadApi.comentar(tipo, id, texto.trim());
      setTexto('');
      cargar();
    });
  }

  function adjuntar(e) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    ejecutar(async () => {
      await actividadApi.adjuntarArchivo(tipo, id, archivo);
      cargar();
    }).finally(() => { e.target.value = ''; });
  }

  // Un riesgo reportado desde una tarea (sin riesgo_id) vive solo en
  // `actividad`, sin fila propia en `riesgos` — no hay nada que abrir.
  async function abrirRiesgo(riesgoId) {
    setCargandoRiesgo(true);
    try {
      const res = await riesgosApi.obtenerRiesgo(riesgoId);
      setRiesgoAbierto(res.datos);
    } catch (err) {
      mostrarToast(err.response?.data?.mensaje || 'No se pudo abrir el riesgo', 'error');
    } finally {
      setCargandoRiesgo(false);
    }
  }

  async function guardarRiesgo(datos) {
    await riesgosApi.actualizarRiesgo(riesgoAbierto.id, datos);
    setRiesgoAbierto(null);
    cargar();
    onCambiado?.();
    mostrarToast('Riesgo actualizado', 'exito');
  }

  return (
    <div className="border-t border-gray-100 pt-4 mt-2">
      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
        Evolución en el tiempo{titulo && <span className="font-normal normal-case text-gray-400"> · {titulo}</span>}
      </h3>

      {cargando ? (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-4"><Loader2 size={13} className="animate-spin" /> Cargando actividad…</div>
      ) : (
        <BitacoraCronologica
          eventos={eventos}
          hoveredId={hoveredId}
          onHoverEvento={setHoveredId}
          onClickEvento={alHacerClicEnEvento}
        />
      )}

      {/* Composer */}
      {soloLectura ? (
        <p className="text-[11px] text-gray-400 italic mt-3 pt-3 border-t border-gray-100">
          Solo consulta. Para comentar o adjuntar aquí necesitas participar en este proyecto.
        </p>
      ) : (
      <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-100">
        <label className="p-1.5 text-gray-400 hover:text-guinda-600 cursor-pointer flex-shrink-0">
          <Paperclip size={15} />
          <input type="file" className="hidden" onChange={adjuntar} />
        </label>
        <input value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviar()}
          placeholder="Escribe un comentario..."
          className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:border-guinda-400 outline-none" />
        <button onClick={enviar} disabled={enviando || !texto.trim()}
          className="flex items-center gap-1 text-xs font-medium bg-guinda-600 text-white px-3 py-2 rounded-lg hover:bg-guinda-700 disabled:opacity-40 flex-shrink-0">
          <Send size={13} /> Enviar
        </button>
      </div>
      )}

      {/* Detalle de un archivo/enlace — antes clic abría/descargaba de una
          vez; ahora muestra sus propiedades (categoría, tipo, subido por,
          fecha) y deja elegir Vista previa/Descargar (o Abrir enlace),
          igual que ya funciona en la sección de Archivos de etapa/acción. */}
      {detalleItem && (() => {
        const esLink = detalleItem.metadata?.tipo_medio === 'link';
        const categoria = detalleItem.metadata?.categoria;
        const notas = detalleItem.metadata?.notas;
        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40" onClick={() => setDetalleItem(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-[90vw] max-w-md" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-800">Detalle del archivo</span>
                <button onClick={() => setDetalleItem(null)} className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100"><X size={16} /></button>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-start gap-2">
                  {esLink ? <Link2 size={14} className="text-blue-500 flex-shrink-0 mt-0.5" /> : <FileText size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />}
                  {esLink ? (
                    <a href={detalleItem.archivo_url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline break-all">{detalleItem.archivo_url}</a>
                  ) : (
                    <p className="text-sm font-medium text-gray-800 break-all">{detalleItem.archivo_nombre}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div><span className="text-gray-400">Categoría:</span> <span className="text-gray-700 font-medium">{categoria || 'Sin categoría'}</span></div>
                  <div><span className="text-gray-400">Tipo:</span> <span className="text-gray-700 font-medium">{esLink ? 'Enlace externo' : 'Archivo'}</span></div>
                  <div><span className="text-gray-400">Subido por:</span> <span className="text-gray-700 font-medium">{detalleItem.autor_nombre || 'Sin autor'}</span></div>
                  <div><span className="text-gray-400">Fecha:</span> <span className="text-gray-700 font-medium">
                    {detalleItem.created_at ? new Date(detalleItem.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Sin fecha'}
                  </span></div>
                </div>
                {notas && (
                  <div className="border-t border-gray-100 pt-2">
                    <span className="text-[10px] text-gray-400 uppercase">Notas:</span>
                    <p className="text-xs text-gray-600 mt-0.5">{notas}</p>
                  </div>
                )}
                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  {esLink ? (
                    <>
                      <button onClick={() => setPreviewItem(detalleItem)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-guinda-600 text-white text-xs rounded-lg hover:bg-guinda-700">
                        <FileText size={12} /> Vista previa
                      </button>
                      <a href={detalleItem.archivo_url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 text-gray-700 text-xs rounded-lg hover:bg-gray-50">
                        <Link2 size={12} /> Abrir enlace
                      </a>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setPreviewItem(detalleItem)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-guinda-600 text-white text-xs rounded-lg hover:bg-guinda-700">
                        <FileText size={12} /> Vista previa
                      </button>
                      <a href={urlArchivo(detalleItem)} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 text-gray-700 text-xs rounded-lg hover:bg-gray-50">
                        <Upload size={12} className="rotate-180" /> Descargar
                      </a>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {previewItem && (
        <FilePreviewModal
          evidencia={{
            nombre_original: previewItem.archivo_nombre,
            titulo: previewItem.metadata?.titulo || null,
            tipo_medio: previewItem.metadata?.tipo_medio,
            url: previewItem.metadata?.tipo_medio === 'link' ? previewItem.archivo_url : undefined,
          }}
          urlOverride={previewItem.metadata?.tipo_medio === 'link' ? undefined : urlArchivo(previewItem)}
          onClose={() => setPreviewItem(null)}
        />
      )}

      {/* Detalle/edición de un riesgo desde el stream. entidadTipo/entidadId
          del propio riesgo (no necesariamente el nodo de este feed, que
          puede estar mostrando un descendiente) — actualizarRiesgo() nunca
          los usa en una edición, solo importan si se creara uno nuevo. */}
      {riesgoAbierto && (
        <ModalRiesgo
          riesgo={riesgoAbierto}
          entidadTipo={riesgoAbierto.entidad_tipo}
          entidadId={riesgoAbierto.entidad_id}
          onGuardar={guardarRiesgo}
          onCerrar={() => setRiesgoAbierto(null)}
        />
      )}
    </div>
  );
}
