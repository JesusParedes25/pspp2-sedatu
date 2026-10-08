/**
 * ARCHIVO: PestanaDocumentos.jsx
 * PROPÓSITO: Pestaña "Documentos" del panel de Detalle (Fase 4) — tabla de
 *            consulta con alta propia (abre el mismo modal "Adjuntar
 *            documento" que antes vivía en "Más acciones"), agregando por
 *            omisión los documentos de los descendientes del nodo con una
 *            columna "Origen" y el control "Solo este elemento / Incluir
 *            elementos hijos".
 */
import { useEffect, useState, useCallback } from 'react';
import { Plus, Link2, Paperclip, Loader2, Eye } from 'lucide-react';
import * as evidenciasApi from '../../../api/evidencias';
import * as actividadApi from '../../../api/actividad';
import ModalAccionNodo from './ModalAccionNodo';
import SeccionArchivosNodo from '../../nodos/SeccionArchivosNodo';
import FilePreviewModal from '../../evidencias/FilePreviewModal';
import CATEGORIAS_EVIDENCIA from '../categoriasEvidencia';
import { formatFecha } from '../../../utils/fecha';

const NIVEL_LABEL = { etapa: 'Etapa', accion: 'Acción', tarea: 'Tarea' };

function iconoCategoria(categoria) {
  return CATEGORIAS_EVIDENCIA.find(c => c.value === categoria)?.icon || '📎';
}

// `doc.fuente` distingue de qué tabla viene la fila (ver evidencias.queries.js
// ::obtenerDocumentosAgregados) — un documento adjuntado desde una Tarea vive
// en `actividad`, no en `evidencias`, y usa un endpoint de descarga distinto.
// Sin esto, el link/vista previa de un documento agregado desde una tarea
// apuntaba al endpoint equivocado (mismo `id`, tabla distinta).
function urlDoc(doc) {
  if (doc.tipo_medio === 'link') return doc.url;
  if (doc.fuente === 'tarea') return actividadApi.obtenerUrlDescargaActividad(doc.id);
  return evidenciasApi.obtenerUrlDescarga(doc.id);
}

export default function PestanaDocumentos({ tipo, id, permisos, permisosProyecto, onCambiado, mostrarToast, onContador, onNavegarNodo, altaSolicitada, onAltaConsumida }) {
  const [incluirHijos, setIncluirHijos] = useState(true);
  const [documentos, setDocumentos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [evidenciasPropias, setEvidenciasPropias] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await evidenciasApi.obtenerDocumentosAgregados(tipo, id, incluirHijos);
      const datos = res.datos || [];
      setDocumentos(datos);
      if (incluirHijos) onContador?.(datos.length);
    } catch {
      setDocumentos([]);
      if (incluirHijos) onContador?.(0);
    } finally {
      setCargando(false);
    }
  }, [tipo, id, incluirHijos, onContador]);

  useEffect(() => { cargar(); }, [cargar]);

  // Para el modal "Adjuntar documento" (SeccionArchivosNodo, capturaPrimero)
  // hace falta lo YA adjunto a este nodo exacto (no lo agregado) — mismo
  // criterio que ya usaba FilaAcciones antes de la Fase 4: una tarea no
  // tiene tabla de evidencias propia, sus adjuntos se filtran del stream
  // unificado `actividad`.
  async function cargarPropias() {
    try {
      if (tipo === 'tarea') {
        const res = await actividadApi.obtenerActividadNodo(tipo, id);
        const archivos = (res.datos || [])
          .filter(a => a.tipo_evento === 'archivo')
          .map(a => ({
            id: a.id,
            nombre_original: a.archivo_nombre,
            titulo: a.metadata?.titulo || null,
            categoria: a.metadata?.categoria || 'Otro',
            tipo_medio: a.metadata?.tipo_medio || 'archivo',
            url: a.metadata?.tipo_medio === 'link' ? a.archivo_url : undefined,
            autor_nombre: a.autor_nombre,
            created_at: a.created_at,
            notas: a.metadata?.notas || null,
          }));
        setEvidenciasPropias(archivos);
        return;
      }
      const res = tipo === 'etapa'
        ? await evidenciasApi.obtenerEvidenciasEtapa(id)
        : await evidenciasApi.obtenerEvidenciasAccion(id);
      setEvidenciasPropias(res.datos || []);
    } catch { setEvidenciasPropias([]); }
  }

  function abrirAlta() {
    setMostrarAlta(true);
    if (evidenciasPropias === null) cargarPropias();
  }

  // Atajo "Adjuntar documento" de "Más acciones" (FilaAcciones.jsx vía
  // PestanasDetalle.jsx) — mismo modal que el botón "+ Adjuntar documento"
  // de aquí abajo, solo que disparado desde fuera de esta pestaña.
  useEffect(() => {
    if (altaSolicitada) { abrirAlta(); onAltaConsumida?.(); }
    // abrirAlta se omite a propósito: no es estable entre renders, y solo
    // altaSolicitada/onAltaConsumida (sí estables) deben disparar esto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [altaSolicitada, onAltaConsumida]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
          <button
            onClick={() => setIncluirHijos(false)}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${!incluirHijos ? 'bg-white text-guinda-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Solo este elemento
          </button>
          <button
            onClick={() => setIncluirHijos(true)}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${incluirHijos ? 'bg-white text-guinda-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Incluir elementos hijos
          </button>
        </div>
        {!permisos?.esSoloLectura && (
          <button
            onClick={abrirAlta}
            className="flex items-center gap-1 text-[12px] font-medium text-guinda-700 hover:text-guinda-800"
          >
            <Plus size={13} /> Adjuntar documento
          </button>
        )}
      </div>

      {cargando ? (
        <p className="text-xs text-gray-400 py-4 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Cargando documentos...</p>
      ) : (documentos || []).length === 0 ? (
        <p className="text-xs text-gray-400 py-4">Sin documentos adjuntos.</p>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left font-medium px-3 py-2">Documento</th>
                <th className="text-left font-medium px-3 py-2">Categoría</th>
                <th className="text-left font-medium px-3 py-2">Origen</th>
                <th className="text-left font-medium px-3 py-2">Autor</th>
                <th className="text-left font-medium px-3 py-2">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {documentos.map(doc => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <a
                        href={urlDoc(doc)}
                        target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 text-gray-700 hover:text-guinda-700 font-medium min-w-0"
                      >
                        {doc.tipo_medio === 'link' ? <Link2 size={12} className="text-blue-500 flex-shrink-0" /> : <Paperclip size={12} className="text-gray-400 flex-shrink-0" />}
                        <span className="truncate max-w-[220px]">{doc.titulo || doc.nombre_original || 'Sin título'}</span>
                      </a>
                      <button
                        onClick={() => setPreviewItem(doc)}
                        title="Vista previa"
                        className="p-0.5 text-gray-400 hover:text-guinda-700 flex-shrink-0"
                      >
                        <Eye size={13} />
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-500">{iconoCategoria(doc.categoria)} {doc.categoria}</td>
                  <td className="px-3 py-2">
                    {doc.origen ? (
                      <button
                        onClick={() => onNavegarNodo?.(doc.origen.tipo, doc.origen.id)}
                        className="text-[11px] text-gray-500 hover:text-guinda-700 hover:underline"
                      >
                        {NIVEL_LABEL[doc.origen.tipo] || doc.origen.tipo} · {doc.origen.nombre || 'Sin nombre'}
                      </button>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{doc.autor_nombre || 'Sin autor'}</td>
                  <td className="px-3 py-2 text-gray-500">{formatFecha(doc.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mostrarAlta && (
        <ModalAccionNodo titulo="Adjuntar documento" onCerrar={() => setMostrarAlta(false)}>
          <SeccionArchivosNodo
            evidencias={evidenciasPropias || []}
            tipo={tipo}
            id={id}
            permisos={permisosProyecto}
            onRecargar={async () => { await cargarPropias(); await cargar(); onCambiado?.(); }}
            capturaPrimero
          />
        </ModalAccionNodo>
      )}

      {previewItem && (
        <FilePreviewModal
          evidencia={previewItem}
          urlOverride={previewItem.tipo_medio === 'link' ? undefined : urlDoc(previewItem)}
          onClose={() => setPreviewItem(null)}
        />
      )}
    </div>
  );
}
