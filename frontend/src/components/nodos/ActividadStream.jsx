/**
 * ARCHIVO: ActividadStream.jsx
 * PROPÓSITO: Stream cronológico de actividad (comentarios, archivos,
 *            riesgos, cambios de estatus/avance) de un nodo Y TODOS sus
 *            descendientes — se muestra debajo de la lista de tarjetas.
 */
import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Paperclip, AlertTriangle, ArrowRightCircle, Send, Loader2, ExternalLink, X, FileText, Upload, Link2, Sparkles } from 'lucide-react';
import * as actividadApi from '../../api/actividad';
import * as evidenciasApi from '../../api/evidencias';
import FilePreviewModal from '../evidencias/FilePreviewModal';

// El stream mezcla 3 orígenes de archivo: la tabla nueva `actividad`, una
// evidencia del modelo viejo (trae metadata.evidencia_id), o un link externo
// (metadata.tipo_medio === 'link') — cada uno resuelve su URL de descarga
// distinto, y solo el primero (evidencia vieja) trae categoría de verdad.
function urlArchivo(item) {
  if (item.metadata?.tipo_medio === 'link') return item.archivo_url;
  if (item.metadata?.evidencia_id) return evidenciasApi.obtenerUrlDescarga(item.metadata.evidencia_id);
  return actividadApi.obtenerUrlDescargaActividad(item.id);
}

const FILTROS = [
  { id: 'todo', label: 'Todo' },
  { id: 'comentario', label: 'Comentarios' },
  { id: 'archivo', label: 'Archivos' },
  { id: 'riesgo', label: 'Riesgos' },
];

function iconoEvento(tipo) {
  if (tipo === 'comentario') return { I: MessageSquare, cls: 'bg-guinda-100 text-guinda-700' };
  if (tipo === 'archivo') return { I: Paperclip, cls: 'bg-blue-100 text-blue-700' };
  if (tipo === 'riesgo') return { I: AlertTriangle, cls: 'bg-amber-100 text-amber-700' };
  if (tipo === 'estatus_cualitativo') return { I: Sparkles, cls: 'bg-emerald-100 text-emerald-700' };
  return { I: ArrowRightCircle, cls: 'bg-gray-100 text-gray-500' };
}

function rel(fecha) {
  const diff = Date.now() - new Date(fecha).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
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
export default function ActividadStream({ tipo, id, titulo, soloLectura = false }) {
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState('todo');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [detalleItem, setDetalleItem] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await actividadApi.obtenerActividadNodo(tipo, id);
      setItems(res.datos || []);
    } catch { setItems([]); }
    finally { setCargando(false); }
  }, [tipo, id]);

  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = filtro === 'todo' ? items : items.filter(i => i.tipo_evento === filtro);

  async function enviar() {
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      await actividadApi.comentar(tipo, id, texto.trim());
      setTexto('');
      cargar();
    } finally { setEnviando(false); }
  }

  async function adjuntar(e) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setEnviando(true);
    try { await actividadApi.adjuntarArchivo(tipo, id, archivo); cargar(); }
    finally { setEnviando(false); e.target.value = ''; }
  }

  return (
    <div className="border-t border-gray-100 pt-4 mt-2">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-y-1.5">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Actividad{titulo && <span className="font-normal normal-case text-gray-400"> · {titulo}</span>}
        </h3>
        <div className="flex gap-1">
          {FILTROS.map(f => (
            <button key={f.id} onClick={() => setFiltro(f.id)}
              className={`text-[10px] font-medium px-2 py-1 rounded-full transition-colors ${filtro === f.id ? 'bg-guinda-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {cargando ? (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-4"><Loader2 size={13} className="animate-spin" /> Cargando actividad…</div>
      ) : filtrados.length === 0 ? (
        <p className="text-xs text-gray-400 italic py-2">Sin actividad registrada.</p>
      ) : (
        <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
          {filtrados.map(item => {
            const { I, cls } = iconoEvento(item.tipo_evento);
            return (
              <div key={item.id} className="flex items-start gap-2.5">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${cls}`}><I size={12} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-800">
                    {item.autor_nombre && <span className="font-medium">{item.autor_nombre}</span>}
                    {item.contenido && <span className="text-gray-600"> — {item.contenido}</span>}
                  </p>
                  {item.archivo_url && (
                    <button onClick={() => setDetalleItem(item)}
                      className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline mt-0.5 text-left">
                      {item.metadata?.tipo_medio === 'link' ? <ExternalLink size={10} /> : <Paperclip size={10} />} {item.archivo_nombre}
                    </button>
                  )}
                  {item.tipo_evento === 'riesgo' && item.metadata?.nivel && (
                    <span className="inline-flex items-center gap-1 flex-wrap">
                      <span className="inline-block text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded mt-0.5">
                        Nivel: {item.metadata.nivel}{item.metadata.estado ? ` · ${item.metadata.estado}` : ''}
                      </span>
                      {/* Un riesgo reportado desde una tarea vive en la tabla nueva
                          `actividad` (sin riesgo_id ni estado propio) en vez de la
                          tabla `riesgos` que sí leen Inicio y Panorama del proyecto
                          — sin esta etiqueta, parece que "desaparece" del resumen. */}
                      {!item.metadata?.riesgo_id && (
                        <span className="inline-block text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded mt-0.5" title="Los riesgos reportados desde una tarea no se incluyen en los resúmenes de riesgos de Inicio ni Panorama del proyecto, solo aquí.">
                          No visible en Panorama
                        </span>
                      )}
                    </span>
                  )}
                  <p className="text-[10px] text-gray-400 mt-0.5">{rel(item.created_at)}</p>
                </div>
              </div>
            );
          })}
        </div>
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
                  <div><span className="text-gray-400">Categoría:</span> <span className="text-gray-700 font-medium">{categoria || '—'}</span></div>
                  <div><span className="text-gray-400">Tipo:</span> <span className="text-gray-700 font-medium">{esLink ? 'Enlace externo' : 'Archivo'}</span></div>
                  <div><span className="text-gray-400">Subido por:</span> <span className="text-gray-700 font-medium">{detalleItem.autor_nombre || '—'}</span></div>
                  <div><span className="text-gray-400">Fecha:</span> <span className="text-gray-700 font-medium">
                    {detalleItem.created_at ? new Date(detalleItem.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
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
                    <a href={detalleItem.archivo_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 px-3 py-1.5 bg-guinda-600 text-white text-xs rounded-lg hover:bg-guinda-700">
                      <Link2 size={12} /> Abrir enlace
                    </a>
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
          evidencia={{ nombre_original: previewItem.archivo_nombre }}
          urlOverride={urlArchivo(previewItem)}
          onClose={() => setPreviewItem(null)}
        />
      )}
    </div>
  );
}
