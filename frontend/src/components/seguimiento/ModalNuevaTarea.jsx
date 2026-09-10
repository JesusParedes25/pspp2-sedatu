/**
 * ARCHIVO: ModalNuevaTarea.jsx
 * PROPÓSITO: Modal para crear una nueva tarea dentro de una acción —
 *            territorio y documentos quedan listos desde que la tarea
 *            nace. Hermano de ModalNuevaAccion, con el set de campos más
 *            chico que sí tiene una tarea (ver crearTarea en
 *            tareas.queries.js: nombre, prioridad, fechas, responsable,
 *            observaciones — sin descripción, DG, dirección de área ni
 *            tipo/hito, que son campos exclusivos de acción).
 *
 * Vincular indicador queda fuera a propósito: para tarea usa un modelo de
 * aportación distinto al de acción (ver TabIndicadores.jsx — proporcional/
 * al concluir, contra todos los indicadores del proyecto, no el cascada
 * manual/equitativo de aquí) y ya se puede hacer después, una vez creada,
 * con el botón "Vincular indicador" del panel derecho.
 *
 * Documentos van al stream `actividad` (tarea nunca tuvo tabla de
 * evidencias propia) — mismo criterio que SeccionArchivosNodo/
 * ModalRegistrarAvance para tipo==='tarea'.
 */
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, MapPin, Paperclip, Plus, Loader2 } from 'lucide-react';
import * as catalogosApi from '../../api/catalogos';
import * as tareasApi from '../../api/tareas';
import * as actividadApi from '../../api/actividad';
import { useEnvioUnico } from '../../hooks/useEnvioUnico';
import CatalogSelector from '../common/CatalogSelector';
import TerritorioSelector from '../nodos/TerritorioSelector';
import FilaDocumentoPendiente from '../nodos/FilaDocumentoPendiente';
import { useAuth } from '../../context/AuthContext';

let contadorDocumento = 0;
const idDocumento = () => `doc${++contadorDocumento}`;

export default function ModalNuevaTarea({ accionId, onCreado, onCerrar }) {
  const { usuario } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [error, setError] = useState('');

  const [datos, setDatos] = useState({
    nombre: '',
    prioridad: 'Media',
    fecha_inicio: '',
    fecha_limite: '',
    id_responsable: usuario?.id || '',
    observaciones: '',
    cve_ent: null,
    municipios: [],
  });

  const [documentos, setDocumentos] = useState([]);

  useEffect(() => {
    catalogosApi.obtenerUsuarios().then(res => setUsuarios(res.datos || [])).catch(() => setUsuarios([]));
  }, []);

  function actualizar(campo, valor) {
    setDatos(prev => ({ ...prev, [campo]: valor }));
  }

  function agregarArchivos(fileList) {
    const nuevos = Array.from(fileList).map(archivo => ({
      id: idDocumento(), modo: 'archivo', archivo, url: '', categoria: 'Otro', notas: '', titulo: archivo.name,
    }));
    setDocumentos(prev => [...prev, ...nuevos]);
  }
  function agregarLiga() {
    setDocumentos(prev => [...prev, { id: idDocumento(), modo: 'liga', archivo: null, url: '', categoria: 'Otro', notas: '', titulo: '' }]);
  }
  function actualizarDocumento(id, campo, valor) {
    setDocumentos(prev => prev.map(d => (d.id === id ? { ...d, [campo]: valor } : d)));
  }
  function quitarDocumento(id) {
    setDocumentos(prev => prev.filter(d => d.id !== id));
  }

  const [guardar, enviando] = useEnvioUnico(async () => {
    if (!datos.nombre.trim()) return;
    setError('');
    try {
      const payload = {
        ...datos,
        id_responsable: datos.id_responsable || null,
        fecha_inicio: datos.fecha_inicio || null,
        fecha_limite: datos.fecha_limite || null,
        cve_ent: datos.cve_ent || null,
      };
      const res = await tareasApi.crearTarea(accionId, payload);
      const tarea = res.datos;

      for (const doc of documentos) {
        const metadatos = { categoria: doc.categoria, notas: doc.notas, titulo: doc.titulo?.trim() || null };
        if (doc.modo === 'archivo') await actividadApi.subirArchivoActividad('tarea', tarea.id, doc.archivo, metadatos);
        else if (doc.url.trim()) await actividadApi.registrarLinkActividad('tarea', tarea.id, doc.url.trim(), metadatos);
      }

      onCreado?.(tarea);
      onCerrar?.();
    } catch (err) {
      setError(err.response?.data?.mensaje || 'No se pudo crear la tarea');
    }
  });

  function manejarSubmit(e) {
    e.preventDefault();
    guardar();
  }

  const puedeGuardar = enviando || !datos.nombre.trim() || documentos.some(d => d.modo === 'liga' && !d.url.trim());

  // createPortal a document.body — mismo motivo que ModalNuevaAccion: el
  // panel derecho vive dentro de un rail con translate-x, que vuelve fixed
  // relativo a él en vez de a la pantalla completa sin esto.
  return createPortal((
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Nueva tarea</h2>
          <button onClick={onCerrar} className="p-1 rounded hover:bg-gray-100">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        <form onSubmit={manejarSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la tarea *</label>
            <input type="text" value={datos.nombre} onChange={e => actualizar('nombre', e.target.value)}
              className="input-base" placeholder="Ej: Revisar capa de restricción con DGPV" required autoFocus />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <CatalogSelector tipo="prioridad" value={datos.prioridad} onChange={v => actualizar('prioridad', v)} label="Prioridad" />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha inicio</label>
              <input type="date" value={datos.fecha_inicio} onChange={e => actualizar('fecha_inicio', e.target.value)}
                className="input-base text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha límite</label>
              <input type="date" value={datos.fecha_limite} onChange={e => actualizar('fecha_limite', e.target.value)}
                className="input-base text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Responsable</label>
            <select value={datos.id_responsable} onChange={e => actualizar('id_responsable', e.target.value)} className="input-base text-sm">
              <option value="">Sin asignar</option>
              {usuarios.map(u => (
                <option key={u.id} value={u.id}>{u.nombre_completo} — {u.cargo}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Observaciones</label>
            <textarea value={datos.observaciones} onChange={e => actualizar('observaciones', e.target.value)}
              rows={2} className="input-base text-sm resize-none" placeholder="Observaciones de esta tarea…" />
          </div>

          {/* ─── Territorio ─── */}
          <div className="border-t border-gray-100 pt-4">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              <MapPin size={12} /> Territorio <span className="normal-case font-normal text-gray-400">(opcional — si no se elige, hereda el de la acción)</span>
            </label>
            <TerritorioSelector
              data={{ cve_ent: datos.cve_ent, municipios: datos.municipios }}
              onGuardar={(campo, valor) => actualizar(campo, valor)}
              soportarZM={false}
            />
          </div>

          {/* ─── Adjuntar documentos ─── */}
          <div className="border-t border-gray-100 pt-4">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              <Paperclip size={12} /> Documentos <span className="normal-case font-normal text-gray-400">(opcional)</span>
            </label>

            {documentos.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {documentos.map(doc => (
                  <FilaDocumentoPendiente
                    key={doc.id}
                    item={doc}
                    onCambiar={(campo, valor) => actualizarDocumento(doc.id, campo, valor)}
                    onQuitar={() => quitarDocumento(doc.id)}
                  />
                ))}
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                <Plus size={13} /> Archivo
                <input type="file" multiple className="hidden" onChange={e => { agregarArchivos(e.target.files); e.target.value = ''; }} />
              </label>
              <button type="button" onClick={agregarLiga}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
                <Plus size={13} /> Liga
              </button>
            </div>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2 leading-snug">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onCerrar} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={puedeGuardar} className="btn-primary flex items-center gap-1.5">
              {enviando && <Loader2 size={14} className="animate-spin" />}
              {enviando ? 'Creando...' : 'Crear tarea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  ), document.body);
}
