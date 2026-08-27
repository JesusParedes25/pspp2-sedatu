/**
 * ARCHIVO: ActividadStream.jsx
 * PROPÓSITO: "Evolución en el tiempo" de un nodo Y TODOS sus descendientes
 *            — mini-gráfica de avance a través del tiempo (con los mismos
 *            registros de avance que ya se guardan, sin datos nuevos) y,
 *            debajo, la línea de tiempo unificada: avances registrados,
 *            riesgos, comentarios y archivos, más recientes primero, con
 *            chips de filtro (Todo/Avance/Riesgos/Archivos).
 *
 * MINI-CLASE: por qué se agrupan varias filas en una sola tarjeta
 * ─────────────────────────────────────────────────────────────────
 * "Registrar avance" (ver ModalRegistrarAvance) guarda Estatus + Avance
 * + Detalle + Evidencia como 2 a 4 filas independientes en `actividad`
 * (o en `comentarios`/`evidencias` para etapa/acción, modelo viejo) —
 * sin una migración que las ligue con un id de lote compartido. Se
 * agrupan aquí, visualmente: filas del mismo autor, de un tipo asociado
 * a un reporte de avance (cambio_avance/cambio_estatus/estatus_cualitativo/
 * comentario) y separadas por menos de 15 segundos, se leen como un solo
 * reporte — que es como se guardaron, aunque cada una siga viviendo en
 * su propia fila.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { MessageSquare, Paperclip, AlertTriangle, ArrowRightCircle, Send, Loader2, ExternalLink, X, FileText, Upload, Link2, Sparkles, TrendingUp } from 'lucide-react';
import * as actividadApi from '../../api/actividad';
import * as evidenciasApi from '../../api/evidencias';
import FilePreviewModal from '../evidencias/FilePreviewModal';
import { useCandado } from '../../hooks/useEnvioUnico';

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
  { id: 'avance', label: 'Avance' },
  { id: 'riesgo', label: 'Riesgos' },
  { id: 'archivo', label: 'Archivos' },
];

// Qué chip corresponde a cada tipo_evento crudo — 'avance' agrupa todo lo
// que puede venir de "Registrar avance" (incluido el comentario de Detalle).
const CHIP_DE_TIPO = {
  cambio_avance: 'avance', cambio_estatus: 'avance', estatus_cualitativo: 'avance', comentario: 'avance',
  riesgo: 'riesgo', archivo: 'archivo',
};

const TIPOS_AGRUPABLES = new Set(['cambio_avance', 'cambio_estatus', 'estatus_cualitativo', 'comentario']);
const VENTANA_AGRUPACION_MS = 15000;

// Junta filas del mismo autor, de tipos agrupables, separadas por menos de
// VENTANA_AGRUPACION_MS, en una sola tarjeta — ver mini-clase arriba.
function agruparParaLinea(items) {
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

// Serie para la mini-gráfica: un punto por cada cambio de avance real
// (cambio_avance, o cambio_estatus a Completada/Pendiente, que fijan 100/0).
// Ninguno de los dos requiere un dato nuevo — ya se guardan hoy.
function serieAvance(items) {
  const puntos = [];
  for (const item of [...items].reverse()) { // ascendente en el tiempo
    if (item.tipo_evento === 'cambio_avance' && item.metadata?.avance_actual != null) {
      puntos.push({ fecha: item.created_at, avance: Math.round(parseFloat(item.metadata.avance_actual)) });
    } else if (item.tipo_evento === 'cambio_estatus') {
      if (item.metadata?.estado === 'Completada') puntos.push({ fecha: item.created_at, avance: 100 });
      else if (item.metadata?.estado === 'Pendiente') puntos.push({ fecha: item.created_at, avance: 0 });
    }
  }
  return puntos.map(p => ({ ...p, fechaLabel: new Date(p.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) }));
}

function iconoEvento(tipo) {
  if (tipo === 'comentario') return { I: MessageSquare, cls: 'bg-guinda-100 text-guinda-700' };
  if (tipo === 'archivo') return { I: Paperclip, cls: 'bg-blue-100 text-blue-700' };
  if (tipo === 'riesgo') return { I: AlertTriangle, cls: 'bg-amber-100 text-amber-700' };
  if (tipo === 'estatus_cualitativo') return { I: Sparkles, cls: 'bg-emerald-100 text-emerald-700' };
  if (tipo === 'cambio_avance') return { I: TrendingUp, cls: 'bg-guinda-100 text-guinda-700' };
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
  // Un solo candado para enviar/adjuntar: comparten `enviando` en la UI
  // y no deben poder correr a la vez.
  const [ejecutar, enviando] = useCandado();
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

  const puntosAvance = useMemo(() => serieAvance(items), [items]);

  const filtrados = filtro === 'todo' ? items : items.filter(i => CHIP_DE_TIPO[i.tipo_evento] === filtro);
  const grupos = useMemo(() => agruparParaLinea(filtrados), [filtrados]);

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

  return (
    <div className="border-t border-gray-100 pt-4 mt-2">
      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
        Evolución en el tiempo{titulo && <span className="font-normal normal-case text-gray-400"> · {titulo}</span>}
      </h3>

      {/* Mini-gráfica de avance — solo si hay al menos 2 puntos; un nodo
          contenedor (avance calculado, no capturado) no tiene sus propios
          registros y no debería mostrar una gráfica vacía o engañosa. */}
      {puntosAvance.length >= 2 && (
        <div className="h-24 mb-3 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={puntosAvance} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="avanceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7B1C3E" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#7B1C3E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="fechaLabel" tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={26} />
              <Tooltip
                formatter={v => [`${v}%`, 'Avance']}
                labelFormatter={l => l}
                contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e5e7eb' }}
              />
              <Area type="monotone" dataKey="avance" stroke="#7B1C3E" strokeWidth={1.5} fill="url(#avanceGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex items-center justify-end mb-3">
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
      ) : grupos.length === 0 ? (
        <p className="text-xs text-gray-400 italic py-2">Sin actividad registrada.</p>
      ) : (
        <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
          {grupos.map(grupo => {
            const principal = grupo.eventos[0];
            const { I, cls } = iconoEvento(principal.tipo_evento);
            const estatus = grupo.eventos.find(e => e.tipo_evento === 'estatus_cualitativo');
            const avanceEv = grupo.eventos.find(e => e.tipo_evento === 'cambio_avance');
            const estatusCambio = grupo.eventos.find(e => e.tipo_evento === 'cambio_estatus');
            const detalle = grupo.eventos.find(e => e.tipo_evento === 'comentario');
            const archivos = grupo.eventos.filter(e => e.tipo_evento === 'archivo');
            const soloUnEvento = grupo.eventos.length === 1;

            return (
              <div key={principal.id} className="flex items-start gap-2.5">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${cls}`}><I size={12} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-gray-800">
                    {principal.autor_nombre && <span className="font-medium">{principal.autor_nombre}</span>}
                    {soloUnEvento && principal.contenido && <span className="text-gray-600"> — {principal.contenido}</span>}
                    {!soloUnEvento && estatus && <span className="text-gray-600"> — {estatus.contenido}</span>}
                  </p>

                  {!soloUnEvento && (avanceEv || estatusCambio) && (
                    <span className="inline-block text-[10px] font-medium text-guinda-700 bg-guinda-50 px-1.5 py-0.5 rounded mt-1 mr-1">
                      {estatusCambio?.metadata?.estado === 'Completada' ? 'Completada — 100%' : `Avance: ${avanceEv?.metadata?.avance_actual ?? '—'}%`}
                    </span>
                  )}

                  {!soloUnEvento && detalle && (
                    <p className="text-xs text-gray-600 mt-1">{detalle.contenido}</p>
                  )}

                  {archivos.map(a => (
                    <button key={a.id} onClick={() => setDetalleItem(a)}
                      className="flex items-center gap-1 text-[11px] text-blue-600 hover:underline mt-0.5 text-left">
                      {a.metadata?.tipo_medio === 'link' ? <ExternalLink size={10} /> : <Paperclip size={10} />} {a.archivo_nombre}
                    </button>
                  ))}

                  {soloUnEvento && principal.archivo_url && (
                    <button onClick={() => setDetalleItem(principal)}
                      className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline mt-0.5 text-left">
                      {principal.metadata?.tipo_medio === 'link' ? <ExternalLink size={10} /> : <Paperclip size={10} />} {principal.archivo_nombre}
                    </button>
                  )}

                  {soloUnEvento && principal.tipo_evento === 'riesgo' && principal.metadata?.nivel && (
                    <span className="inline-flex items-center gap-1 flex-wrap">
                      <span className="inline-block text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded mt-0.5">
                        Nivel: {principal.metadata.nivel}{principal.metadata.estado ? ` · ${principal.metadata.estado}` : ''}
                      </span>
                      {/* Un riesgo reportado desde una tarea vive en la tabla nueva
                          `actividad` (sin riesgo_id ni estado propio) en vez de la
                          tabla `riesgos` que sí leen Inicio y Panorama del proyecto
                          — sin esta etiqueta, parece que "desaparece" del resumen. */}
                      {!principal.metadata?.riesgo_id && (
                        <span className="inline-block text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded mt-0.5" title="Los riesgos reportados desde una tarea no se incluyen en los resúmenes de riesgos de Inicio ni Panorama del proyecto, solo aquí.">
                          No visible en Panorama
                        </span>
                      )}
                    </span>
                  )}

                  <p className="text-[10px] text-gray-400 mt-0.5">{rel(principal.created_at)}</p>
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
