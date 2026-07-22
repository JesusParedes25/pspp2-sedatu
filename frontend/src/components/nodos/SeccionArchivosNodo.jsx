/**
 * ARCHIVO: SeccionArchivosNodo.jsx
 * PROPÓSITO: Gestor de evidencias de una etapa o acción — lista con
 *            iconos por tipo, detalle con notas/metadatos, vista previa
 *            (PDF/imagen/capas geográficas vía FilePreviewModal) y wizard
 *            de subida (categoría → archivo o enlace → notas).
 *            Extraído de la antigua pestaña "Archivos" de Seguimiento
 *            (EtapasAvancesMD.jsx) para reutilizarse dentro de NodoCard.
 */
import { useState } from 'react';
import { FileText, Link2, Plus, Upload, Trash2, AlertTriangle, Loader2, ChevronRight } from 'lucide-react';
import * as evidenciasApi from '../../api/evidencias';
import FilePreviewModal from '../evidencias/FilePreviewModal';

const CATEGORIAS_EVIDENCIA = [
  { value: 'Documento', icon: '📄' },
  { value: 'Fotografía', icon: '📷' },
  { value: 'Capa geográfica', icon: '🗺️' },
  { value: 'Paquete de capas geográficas', icon: '📦' },
  { value: 'Video', icon: '🎬' },
  { value: 'Repositorio', icon: '💻' },
  { value: 'Audio', icon: '🎵' },
  { value: 'Otro', icon: '📎' },
];

export default function SeccionArchivosNodo({ evidencias, tipo, id, onRecargar, permisos }) {
  // Wizard: 'lista' | 'paso1_categoria' | 'paso2_medio'
  const [paso, setPaso] = useState('lista');
  const [categoria, setCategoria] = useState('');
  const [tipoMedio, setTipoMedio] = useState(null); // 'archivo' | 'link'
  const [archivo, setArchivo] = useState(null);
  const [urlLink, setUrlLink] = useState('');
  const [notas, setNotas] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [detalleEv, setDetalleEv] = useState(null);
  const [previewEv, setPreviewEv] = useState(null);

  function resetForm() {
    setPaso('lista'); setCategoria(''); setTipoMedio(null);
    setArchivo(null); setUrlLink(''); setNotas('');
  }

  async function enviar() {
    if (subiendo) return;
    setSubiendo(true);
    try {
      if (tipoMedio === 'link') {
        if (!urlLink.trim()) return;
        if (tipo === 'etapa') {
          await evidenciasApi.registrarLinkEtapa(id, urlLink.trim(), { categoria, notas });
        } else {
          await evidenciasApi.registrarLinkAccion(id, urlLink.trim(), { categoria, notas });
        }
      } else {
        if (!archivo) return;
        if (tipo === 'etapa') {
          await evidenciasApi.subirEvidenciaEtapa(id, archivo, { categoria, notas });
        } else {
          await evidenciasApi.subirEvidenciaAccion(id, archivo, { categoria, notas });
        }
      }
      resetForm();
      onRecargar?.();
    } catch (err) {
      console.error('Error subiendo evidencia:', err);
    } finally {
      setSubiendo(false);
    }
  }

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
              {esLink ? (
                <a href={detalleEv.url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline break-all">
                  {detalleEv.url}
                </a>
              ) : (
                <p className="text-sm font-medium text-gray-800 truncate">{detalleEv.nombre_original || detalleEv.nombre_archivo}</p>
              )}
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
              <a href={detalleEv.url} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 px-3 py-1 bg-[#7B1C3E] text-white text-xs rounded hover:bg-[#5a1430]">
                <Link2 size={12} /> Abrir enlace
              </a>
            ) : (
              <>
                <button onClick={() => setPreviewEv(detalleEv)}
                  className="flex items-center gap-1 px-3 py-1 bg-[#7B1C3E] text-white text-xs rounded hover:bg-[#5a1430]">
                  <FileText size={12} /> Vista previa
                </button>
                <a href={evidenciasApi.obtenerUrlDescarga(detalleEv.id)} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 px-3 py-1 border border-gray-300 text-gray-700 text-xs rounded hover:bg-gray-100">
                  <Upload size={12} className="rotate-180" /> Descargar
                </a>
              </>
            )}
            {!permisos?.esSoloLectura && (
              <button onClick={async () => {
                try { await evidenciasApi.eliminarEvidencia(detalleEv.id); setDetalleEv(null); onRecargar?.(); } catch {}
              }} className="flex items-center gap-1 px-3 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded">
                <Trash2 size={12} /> Eliminar
              </button>
            )}
          </div>
          {previewEv && <FilePreviewModal evidencia={previewEv} onClose={() => setPreviewEv(null)} />}
        </div>
      </div>
    );
  }

  // ─── Paso 1: Elegir categoría ───
  if (paso === 'paso1_categoria') {
    return (
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-gray-700">Paso 1: Tipo de evidencia</span>
          <button onClick={resetForm} className="text-[10px] text-gray-400 hover:text-gray-600">Cancelar</button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {CATEGORIAS_EVIDENCIA.map(cat => (
            <button
              key={cat.value}
              onClick={() => { setCategoria(cat.value); setPaso('paso2_medio'); }}
              className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 rounded-lg hover:border-[#7B1C3E] hover:bg-[#7B1C3E]/5 text-left transition-colors group"
            >
              <span className="text-base">{cat.icon}</span>
              <span className="text-xs text-gray-700 group-hover:text-[#7B1C3E] font-medium">{cat.value}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─── Paso 2: Archivo o Link ───
  if (paso === 'paso2_medio') {
    return (
      <div className="p-3 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <button onClick={() => setPaso('paso1_categoria')} className="text-gray-400 hover:text-gray-600">
              <ChevronRight size={14} className="rotate-180" />
            </button>
            <span className="text-xs font-semibold text-gray-700">Paso 2: Subir evidencia</span>
          </div>
          <button onClick={resetForm} className="text-[10px] text-gray-400 hover:text-gray-600">Cancelar</button>
        </div>
        <div className="text-[10px] text-gray-500 bg-gray-50 rounded px-2 py-1">
          Categoría seleccionada: <strong className="text-gray-700">{categoria}</strong>
        </div>

        {/* Tipo: archivo o link */}
        {!tipoMedio && (
          <div className="flex gap-2">
            <button
              onClick={() => setTipoMedio('archivo')}
              className="flex-1 flex items-center justify-center gap-2 py-3 border border-gray-200 rounded-lg hover:border-[#7B1C3E] hover:bg-[#7B1C3E]/5 transition-colors"
            >
              <Upload size={16} className="text-gray-500" />
              <span className="text-xs font-medium text-gray-700">Subir archivo</span>
            </button>
            <button
              onClick={() => setTipoMedio('link')}
              className="flex-1 flex items-center justify-center gap-2 py-3 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
            >
              <Link2 size={16} className="text-gray-500" />
              <span className="text-xs font-medium text-gray-700">Pegar enlace</span>
            </button>
          </div>
        )}

        {/* Link input */}
        {tipoMedio === 'link' && (
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-gray-500 uppercase block mb-0.5">URL del enlace</label>
              <input
                value={urlLink}
                onChange={e => setUrlLink(e.target.value)}
                placeholder="https://..."
                className="text-xs border border-gray-200 rounded px-2 py-1.5 w-full focus:border-blue-400 outline-none"
                autoFocus
              />
            </div>
            <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              <AlertTriangle size={12} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-700 leading-relaxed">
                Asegúrese de que el enlace sea <strong>público</strong> o accesible para cualquiera que tenga el link, para que otros usuarios del sistema puedan abrirlo.
              </p>
            </div>
          </div>
        )}

        {/* File input */}
        {tipoMedio === 'archivo' && (
          <div>
            <label className="text-[10px] text-gray-500 uppercase block mb-0.5">Seleccionar archivo</label>
            <input
              type="file"
              onChange={e => setArchivo(e.target.files?.[0] || null)}
              className="text-xs w-full"
            />
            {archivo && (
              <p className="text-[10px] text-gray-500 mt-1">
                {archivo.name} — {archivo.size > 1048576 ? `${(archivo.size / 1048576).toFixed(1)} MB` : `${(archivo.size / 1024).toFixed(0)} KB`}
              </p>
            )}
          </div>
        )}

        {/* Notas */}
        {tipoMedio && (
          <>
            <div>
              <label className="text-[10px] text-gray-500 uppercase block mb-0.5">Notas o comentarios (opcional)</label>
              <textarea
                value={notas}
                onChange={e => setNotas(e.target.value)}
                placeholder="Descripción breve, contexto, observaciones..."
                rows={2}
                className="text-xs border border-gray-200 rounded px-2 py-1 w-full resize-none focus:border-[#7B1C3E] outline-none"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={enviar}
                disabled={subiendo || (tipoMedio === 'archivo' && !archivo) || (tipoMedio === 'link' && !urlLink.trim())}
                className="flex items-center gap-1 px-3 py-1.5 bg-[#7B1C3E] text-white text-xs rounded-lg hover:bg-[#5a1430] disabled:opacity-50 transition-colors"
              >
                {subiendo ? <Loader2 size={12} className="animate-spin" /> : (tipoMedio === 'link' ? <Link2 size={12} /> : <Upload size={12} />)}
                {subiendo ? 'Guardando...' : (tipoMedio === 'link' ? 'Registrar enlace' : 'Subir archivo')}
              </button>
              <button onClick={() => setTipoMedio(null)} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">
                Atrás
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ─── Lista de evidencias ───
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
                  <p className="text-xs text-gray-800 truncate group-hover:text-[#7B1C3E]">
                    {esLink ? ev.url : (ev.nombre_original || ev.nombre_archivo)}
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
      {evidencias.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-4 italic">Sin evidencias adjuntas</p>
      )}

      {!permisos?.esSoloLectura && (
        <button
          onClick={() => setPaso('paso1_categoria')}
          className="flex items-center gap-1.5 text-xs text-[#7B1C3E] hover:text-[#5a1430] font-medium py-1.5"
        >
          <Plus size={12} /> Agregar evidencia
        </button>
      )}
    </div>
  );
}
