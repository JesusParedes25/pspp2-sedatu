/**
 * ARCHIVO: SeccionArchivosNodo.jsx
 * PROPÓSITO: Gestor de evidencias de una etapa o acción — lista con
 *            iconos por tipo, detalle con notas/metadatos, vista previa
 *            (PDF/imagen/liga/capas geográficas vía FilePreviewModal) y
 *            alta de uno o varios documentos (archivo o liga) a la vez,
 *            cada uno con su propio título/categoría/nota antes de
 *            guardar — mismo patrón rápido que ya usa "Registrar avance"
 *            (ver FilaDocumentoPendiente, compartido entre los dos).
 *            Extraído de la antigua pestaña "Archivos" de Seguimiento
 *            (EtapasAvancesMD.jsx) para reutilizarse dentro de NodoCard.
 */
import { useState } from 'react';
import { FileText, Link2, Plus, Upload, Trash2, AlertTriangle, Loader2, ChevronRight } from 'lucide-react';
import * as evidenciasApi from '../../api/evidencias';
import * as actividadApi from '../../api/actividad';
import FilePreviewModal from '../evidencias/FilePreviewModal';
import FilaDocumentoPendiente from './FilaDocumentoPendiente';
import { permisosDeNodo } from '../../hooks/usePermisos';
import { useEnvioUnico } from '../../hooks/useEnvioUnico';

let contadorPendiente = 0;
const idPendiente = () => `p${++contadorPendiente}`;

export default function SeccionArchivosNodo({ evidencias, tipo, id, onRecargar, permisos: permisosProyecto }) {
  const permisos = permisosDeNodo(permisosProyecto, tipo, id);
  // Una tarea no tiene tabla de evidencias propia (nunca la tuvo) — sus
  // adjuntos viven en el stream unificado `actividad` (tipo_evento='archivo'),
  // mismo modelo categoría/notas/título, solo que el guardado y la URL de
  // descarga van por otro endpoint. Eliminar queda deshabilitado para
  // tarea: /actividad no tiene un DELETE todavía.
  const esActividad = tipo === 'tarea';

  // Documentos elegidos pero todavía sin guardar — {id, modo, archivo, url,
  // categoria, notas, titulo}[], igual que en ModalRegistrarAvance. Permite
  // elegir varios archivos de una vez (input multiple) y/o agregar varias
  // ligas antes de guardar todo junto con un solo clic.
  const [pendientes, setPendientes] = useState([]);
  const [detalleEv, setDetalleEv] = useState(null);
  const [previewEv, setPreviewEv] = useState(null);

  function agregarArchivos(fileList) {
    const nuevos = Array.from(fileList).map(archivo => ({
      id: idPendiente(), modo: 'archivo', archivo, url: '', categoria: 'Otro', notas: '', titulo: archivo.name,
    }));
    setPendientes(prev => [...prev, ...nuevos]);
  }
  function agregarLiga() {
    setPendientes(prev => [...prev, { id: idPendiente(), modo: 'liga', archivo: null, url: '', categoria: 'Otro', notas: '', titulo: '' }]);
  }
  function actualizarPendiente(pid, campo, valor) {
    setPendientes(prev => prev.map(p => (p.id === pid ? { ...p, [campo]: valor } : p)));
  }
  function quitarPendiente(pid) {
    setPendientes(prev => prev.filter(p => p.id !== pid));
  }

  // Sin candado síncrono, un doble clic duplicaba el archivo en MinIO (no
  // solo la fila en la base de datos). Secuencial, no Promise.all: son
  // peticiones multipart contra el mismo nodo — más simple de seguir en el
  // log del servidor, mismo criterio que ModalRegistrarAvance.
  const [guardarPendientes, guardando] = useEnvioUnico(async () => {
    try {
      for (const p of pendientes) {
        const metadatos = { categoria: p.categoria, notas: p.notas, titulo: p.titulo?.trim() || null };
        if (p.modo === 'archivo') {
          if (esActividad) await actividadApi.subirArchivoActividad(tipo, id, p.archivo, metadatos);
          else if (tipo === 'etapa') await evidenciasApi.subirEvidenciaEtapa(id, p.archivo, metadatos);
          else await evidenciasApi.subirEvidenciaAccion(id, p.archivo, metadatos);
        } else if (p.url.trim()) {
          if (esActividad) await actividadApi.registrarLinkActividad(tipo, id, p.url.trim(), metadatos);
          else if (tipo === 'etapa') await evidenciasApi.registrarLinkEtapa(id, p.url.trim(), metadatos);
          else await evidenciasApi.registrarLinkAccion(id, p.url.trim(), metadatos);
        }
      }
      setPendientes([]);
      onRecargar?.();
    } catch (err) {
      console.error('Error subiendo documentos:', err);
    }
  });

  const puedeGuardar = pendientes.length > 0 && !guardando
    && pendientes.every(p => p.modo === 'archivo' || p.url.trim().length > 0);

  function iconoParaTipo(ev) {
    if (ev.tipo_medio === 'link') return <Link2 size={13} className="text-blue-500 flex-shrink-0" />;
    const cat = ev.categoria || '';
    if (cat.includes('Foto')) return <span className="text-xs">📷</span>;
    if (cat.includes('Video')) return <span className="text-xs">🎬</span>;
    if (cat.includes('Audio')) return <span className="text-xs">🎵</span>;
    if (cat.includes('Capa') || cat.includes('geográfica')) return <span className="text-xs">🗺️</span>;
    if (cat.includes('Repositorio')) return <span className="text-xs">💻</span>;
    return <FileText size={13} className="text-gray-400 flex-shrink-0" />;
  }

  // ─── Detalle de una evidencia ───
  if (detalleEv) {
    const esLink = detalleEv.tipo_medio === 'link';
    return (
      <div className="p-3 space-y-3">
        <button onClick={() => setDetalleEv(null)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
          <ChevronRight size={12} className="rotate-180" /> Volver a la lista
        </button>
        <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-2">
          <div className="flex items-start gap-2">
            {iconoParaTipo(detalleEv)}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate" title={detalleEv.titulo || detalleEv.nombre_original || detalleEv.nombre_archivo || detalleEv.url}>
                {detalleEv.titulo || detalleEv.nombre_original || detalleEv.nombre_archivo || detalleEv.url}
              </p>
              {esLink ? (
                <a href={detalleEv.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline break-all">
                  {detalleEv.url}
                </a>
              ) : detalleEv.titulo && (detalleEv.nombre_original || detalleEv.nombre_archivo) && detalleEv.titulo !== (detalleEv.nombre_original || detalleEv.nombre_archivo) ? (
                <p className="text-xs text-gray-400 truncate" title={detalleEv.nombre_original || detalleEv.nombre_archivo}>
                  {detalleEv.nombre_original || detalleEv.nombre_archivo}
                </p>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mt-2">
            <div><span className="text-gray-400">Categoría:</span> <span className="text-gray-700 font-medium">{detalleEv.categoria}</span></div>
            <div><span className="text-gray-400">Tipo:</span> <span className="text-gray-700 font-medium">{esLink ? 'Enlace externo' : 'Archivo'}</span></div>
            <div><span className="text-gray-400">Subido por:</span> <span className="text-gray-700 font-medium">{detalleEv.autor_nombre || '—'}</span></div>
            <div><span className="text-gray-400">Fecha:</span> <span className="text-gray-700 font-medium">
              {detalleEv.created_at ? new Date(detalleEv.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
            </span></div>
            <div><span className="text-gray-400">Hora:</span> <span className="text-gray-700 font-medium">
              {detalleEv.created_at ? new Date(detalleEv.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—'}
            </span></div>
            {!esLink && detalleEv.tamano_bytes && (
              <div><span className="text-gray-400">Tamaño:</span> <span className="text-gray-700 font-medium">
                {detalleEv.tamano_bytes > 1048576
                  ? `${(detalleEv.tamano_bytes / 1048576).toFixed(1)} MB`
                  : `${(detalleEv.tamano_bytes / 1024).toFixed(0)} KB`}
              </span></div>
            )}
          </div>
          {detalleEv.notas && (
            <div className="mt-1 border-t border-gray-100 pt-1.5">
              <span className="text-[10px] text-gray-400 uppercase">Notas:</span>
              <p className="text-xs text-gray-600 mt-0.5">{detalleEv.notas}</p>
            </div>
          )}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            {esLink ? (
              <>
                <button onClick={() => setPreviewEv(detalleEv)}
                  className="flex items-center gap-1 px-3 py-1 bg-[#7B1C3E] text-white text-xs rounded hover:bg-[#5a1430]">
                  <FileText size={12} /> Vista previa
                </button>
                <a href={detalleEv.url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 px-3 py-1 border border-gray-300 text-gray-700 text-xs rounded hover:bg-gray-100">
                  <Link2 size={12} /> Abrir enlace
                </a>
              </>
            ) : (
              <>
                <button onClick={() => setPreviewEv(detalleEv)}
                  className="flex items-center gap-1 px-3 py-1 bg-[#7B1C3E] text-white text-xs rounded hover:bg-[#5a1430]">
                  <FileText size={12} /> Vista previa
                </button>
                <a href={esActividad ? actividadApi.obtenerUrlDescargaActividad(detalleEv.id) : evidenciasApi.obtenerUrlDescarga(detalleEv.id)} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 px-3 py-1 border border-gray-300 text-gray-700 text-xs rounded hover:bg-gray-100">
                  <Upload size={12} className="rotate-180" /> Descargar
                </a>
              </>
            )}
            {/* Eliminar solo para evidencias del modelo viejo (etapa/acción)
                — /actividad todavía no tiene un DELETE de entradas. */}
            {!permisos?.esSoloLectura && !esActividad && (
              <button onClick={async () => {
                try { await evidenciasApi.eliminarEvidencia(detalleEv.id); setDetalleEv(null); onRecargar?.(); } catch {}
              }} className="flex items-center gap-1 px-3 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded">
                <Trash2 size={12} /> Eliminar
              </button>
            )}
          </div>
          {previewEv && (
            <FilePreviewModal
              evidencia={previewEv}
              urlOverride={esActividad && previewEv.tipo_medio !== 'link' ? actividadApi.obtenerUrlDescargaActividad(previewEv.id) : undefined}
              onClose={() => setPreviewEv(null)}
            />
          )}
        </div>
      </div>
    );
  }

  // ─── Lista de evidencias + alta de una o varias ───
  return (
    <div className="p-3">
      {evidencias.length > 0 && (
        <div className="space-y-0.5 mb-3">
          {evidencias.map(ev => {
            const esLink = ev.tipo_medio === 'link';
            return (
              <div
                key={ev.id}
                onClick={() => setDetalleEv(ev)}
                className="flex items-center gap-2 py-2 px-2.5 rounded-lg hover:bg-gray-50 cursor-pointer group transition-colors"
              >
                {iconoParaTipo(ev)}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-800 truncate group-hover:text-[#7B1C3E]" title={ev.titulo || (esLink ? ev.url : (ev.nombre_original || ev.nombre_archivo))}>
                    {ev.titulo || (esLink ? ev.url : (ev.nombre_original || ev.nombre_archivo))}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] text-gray-400">{ev.autor_nombre || ''}</span>
                    {ev.created_at && (
                      <span className="text-[9px] text-gray-400">
                        {new Date(ev.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">{ev.categoria}</span>
                {!esLink && ev.tamano_bytes && (
                  <span className="text-[9px] text-gray-400">
                    {ev.tamano_bytes > 1048576 ? `${(ev.tamano_bytes / 1048576).toFixed(1)} MB` : `${(ev.tamano_bytes / 1024).toFixed(0)} KB`}
                  </span>
                )}
                {esLink && <Link2 size={10} className="text-blue-400" />}
              </div>
            );
          })}
        </div>
      )}
      {evidencias.length === 0 && pendientes.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-4 italic">Sin documentos adjuntos</p>
      )}

      {!permisos?.esSoloLectura && (
        <>
          {pendientes.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {pendientes.map(p => (
                <FilaDocumentoPendiente
                  key={p.id}
                  item={p}
                  onCambiar={(campo, valor) => actualizarPendiente(p.id, campo, valor)}
                  onQuitar={() => quitarPendiente(p.id)}
                />
              ))}
            </div>
          )}

          {pendientes.some(p => p.modo === 'liga') && (
            <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mb-2">
              <AlertTriangle size={12} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-700 leading-relaxed">
                Asegúrese de que el enlace sea <strong>público</strong> o accesible para cualquiera que tenga el link, para que otros usuarios del sistema puedan abrirlo.
              </p>
            </div>
          )}

          <div className="flex items-center gap-1.5 flex-wrap">
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
              <Plus size={13} /> Archivo
              <input type="file" multiple className="hidden" onChange={e => { agregarArchivos(e.target.files); e.target.value = ''; }} />
            </label>
            <button onClick={agregarLiga}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
              <Plus size={13} /> Liga
            </button>
            {pendientes.length > 0 && (
              <button
                onClick={guardarPendientes}
                disabled={!puedeGuardar}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-[#7B1C3E] text-white text-xs rounded-lg hover:bg-[#5a1430] disabled:opacity-50 transition-colors"
              >
                {guardando && <Loader2 size={12} className="animate-spin" />}
                Guardar{pendientes.length > 1 ? ` (${pendientes.length})` : ''}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
