/**
 * ARCHIVO: ActividadStream.jsx
 * PROPÓSITO: "Evolución en el tiempo" de un nodo Y TODOS sus descendientes
 *            — gráfico de línea del tiempo (GraficaTiempo.jsx, Fase 5 del
 *            rediseño de Detalle: avance + documentos/riesgos/comentarios
 *            en un carril aparte, con interacción bidireccional hacia la
 *            bitácora) y, debajo, la línea de tiempo unificada: avances
 *            registrados, riesgos, comentarios y archivos, más recientes
 *            primero, con chips de filtro (Todo/Avance/Documentos/
 *            Riesgos/Comentarios).
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
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MessageSquare, Paperclip, AlertTriangle, ArrowRightCircle, Send, Loader2, ExternalLink, X, FileText, Upload, Link2, Sparkles, TrendingUp } from 'lucide-react';
import * as actividadApi from '../../api/actividad';
import * as evidenciasApi from '../../api/evidencias';
import * as riesgosApi from '../../api/riesgos';
import FilePreviewModal from '../evidencias/FilePreviewModal';
import ModalRiesgo from '../riesgos/ModalRiesgo';
import GraficaTiempo from './GraficaTiempo';
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

const FILTROS = [
  { id: 'todo', label: 'Todo' },
  { id: 'avance', label: 'Avance' },
  { id: 'documento', label: 'Documentos' },
  { id: 'riesgo', label: 'Riesgos' },
  { id: 'comentario', label: 'Comentarios' },
];

// Qué chip corresponde a cada tipo_evento crudo. 'comentario' tiene su
// propio chip (Fase 5) — antes vivía agrupado bajo 'avance' porque el
// Detalle de "Registrar avance" también se guarda como tipo_evento
// 'comentario'; separarlo significa que filtrar a "solo Avance" ya no
// trae el texto de Detalle de cada reporte (se sigue viendo con el
// filtro "Todo", que es el que usa casi todo el mundo).
const CHIP_DE_TIPO = {
  cambio_avance: 'avance', cambio_estatus: 'avance', estatus_cualitativo: 'avance',
  comentario: 'comentario', riesgo: 'riesgo', archivo: 'documento',
};

const TIPOS_AGRUPABLES = new Set(['cambio_avance', 'cambio_estatus', 'estatus_cualitativo', 'comentario']);
const VENTANA_AGRUPACION_MS = 15000;

// Mismo criterio que GraficaTiempo.jsx para decidir si hay algo que
// graficar — un nodo cuya única actividad es `estatus_cualitativo` (sin
// avance numérico ni eventos de carril) no tiene nada que trazar.
const TIPOS_GRAFICABLES = new Set(['cambio_avance', 'cambio_estatus', 'archivo', 'riesgo', 'comentario']);

// Junta filas del mismo autor, de tipos agrupables, separadas por menos de
// VENTANA_AGRUPACION_MS, en una sola tarjeta — ver mini-clase arriba.
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
export default function ActividadStream({ tipo, id, titulo, soloLectura = false, onCambiado, riesgoIdInicial, onRiesgoConsumido }) {
  const { mostrarToast } = useUI();
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState('todo');
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
  // Id del evento crudo resaltado — fijado al pasar el cursor sobre una
  // fila de la bitácora O sobre un marcador del gráfico, el otro lado se
  // resalta solo (interacción bidireccional, lo que más le interesaba al
  // usuario de esta fase). Las filas de la bitácora chequean si CUALQUIERA
  // de sus eventos agrupados coincide (grupo.eventos.some(...)), porque la
  // agrupación de la bitácora (por autor+15s) no es la misma que la del
  // gráfico (por día calendario) — un id puede vivir en ambos agrupamientos
  // sin ser el mismo "principal".
  const [hoveredId, setHoveredId] = useState(null);
  const filasRef = useRef({});

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

  const hayAlgoGraficable = items.some(i => TIPOS_GRAFICABLES.has(i.tipo_evento));

  const filtrados = filtro === 'todo' ? items : items.filter(i => CHIP_DE_TIPO[i.tipo_evento] === filtro);
  const grupos = useMemo(() => agruparParaLinea(filtrados), [filtrados]);

  // Clic en un marcador del gráfico: abre el detalle del evento cuando
  // existe uno (archivo → su modal de detalle; riesgo con fila propia →
  // ModalRiesgo); para avance/comentario/riesgo-sin-fila (no hay modal
  // dedicado), resalta y desplaza hasta su fila en la bitácora.
  function alHacerClicEnMarcador(item) {
    if (item.tipo_evento === 'archivo') { setDetalleItem(item); return; }
    if (item.tipo_evento === 'riesgo' && item.metadata?.riesgo_id && !soloLectura) {
      abrirRiesgo(item.metadata.riesgo_id);
      return;
    }
    const grupo = grupos.find(g => g.eventos.some(e => e.id === item.id));
    const idPrincipal = grupo ? grupo.eventos[0].id : item.id;
    setHoveredId(item.id);
    filasRef.current[idPrincipal]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

      {/* Gráfico de línea del tiempo (Fase 5) — se grafica lo mismo que
          queda tras el filtro de abajo, para que gráfico y bitácora
          siempre muestren el mismo subconjunto. Solo si hay algo que
          trazar; un nodo contenedor sin registros propios (ni de sus
          descendientes) no debería mostrar un lienzo vacío. */}
      {hayAlgoGraficable ? (
        <GraficaTiempo
          items={filtrados}
          hoveredId={hoveredId}
          onHoverMarker={setHoveredId}
          onClickMarker={alHacerClicEnMarcador}
        />
      ) : items.length > 0 && (
        <p className="text-[11px] text-gray-400 italic mb-3 -mt-1">
          Aún no hay suficientes registros para mostrar la evolución.
        </p>
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
            const resaltado = grupo.eventos.some(e => e.id === hoveredId);

            return (
              <div
                key={principal.id}
                ref={el => { if (el) filasRef.current[principal.id] = el; }}
                onMouseEnter={() => setHoveredId(principal.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`flex items-start gap-2.5 rounded-lg -mx-1.5 px-1.5 py-0.5 transition-colors ${resaltado ? 'bg-guinda-50' : ''}`}
              >
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

                  {/* Solo para grupos de VARIOS eventos (p. ej. "Registrar
                      avance" con más de un documento adjunto) — un grupo de
                      un solo evento que resulta ser 'archivo' ya lo muestra
                      el bloque de abajo (soloUnEvento); sin este guard,
                      `archivos` también incluía a `principal` en ese caso
                      (es su propio filtro) y el mismo archivo se pintaba
                      dos veces seguidas. */}
                  {!soloUnEvento && archivos.map(a => (
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
                      {principal.metadata?.riesgo_id && !soloLectura ? (
                        <button
                          onClick={() => abrirRiesgo(principal.metadata.riesgo_id)}
                          disabled={cargandoRiesgo}
                          className="inline-block text-[10px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 px-1.5 py-0.5 rounded mt-0.5 disabled:opacity-50"
                          title="Ver/editar este riesgo"
                        >
                          Nivel: {principal.metadata.nivel}{principal.metadata.estado ? ` · ${principal.metadata.estado}` : ''} · Ver detalle
                        </button>
                      ) : (
                        <span className="inline-block text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded mt-0.5">
                          Nivel: {principal.metadata.nivel}{principal.metadata.estado ? ` · ${principal.metadata.estado}` : ''}
                        </span>
                      )}
                      {/* Un riesgo reportado desde una tarea vive en la tabla nueva
                          `actividad` (sin riesgo_id ni estado propio) en vez de la
                          tabla `riesgos` que sí leen Inicio y Panorama del proyecto
                          — sin esta etiqueta, parece que "desaparece" del resumen.
                          Tampoco es clickeable (botón de arriba): no hay nada que
                          abrir, no tiene fila propia en `riesgos`. */}
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
