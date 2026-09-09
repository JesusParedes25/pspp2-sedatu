/**
 * ARCHIVO: EvidenciaDetallePanel.jsx
 * PROPÓSITO: Panel de detalle completo de una evidencia (metadatos, notas,
 *            vista previa / abrir enlace / descargar / eliminar) — extraído
 *            del módulo global de Documentos (pages/Evidencias.jsx) para
 *            reutilizarlo también en la pestaña "Documentos" de un
 *            proyecto (DetalleProyecto.jsx).
 *
 * El bloque de "ubicación" (proyecto / etapa / acción / riesgo) muestra
 * cada línea de forma independiente: `proyecto_nombre` solo viene en la
 * respuesta del módulo global (ahí sí tiene sentido enlazar al proyecto,
 * pues la lista mezcla varios); la pestaña de un proyecto ya está parada
 * en ese proyecto, así que su evidencia no trae `proyecto_nombre` y el
 * bloque simplemente omite esa línea sin quedar vacío.
 */
import { Link } from 'react-router-dom';
import {
  Download, FolderKanban, Link2, Trash2, Eye, Layers, User, Calendar, HardDrive,
} from 'lucide-react';
import * as evidenciasApi from '../../api/evidencias';

function formatearTamano(bytes) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// onEliminar: opcional — si no se pasa (solo-lectura), el botón "Eliminar" no se muestra.
export default function EvidenciaDetallePanel({ evidencia: ev, onPreview, onEliminar }) {
  const esLink = ev.tipo_medio === 'link';
  const tamano = formatearTamano(ev.tamano_bytes);
  const hayUbicacion = ev.proyecto_nombre || ev.etapa_nombre || ev.accion_nombre || ev.riesgo_titulo;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <div className="w-10 h-10 bg-guinda-50 rounded-lg flex items-center justify-center flex-shrink-0 text-lg">
          {esLink ? <Link2 size={18} className="text-blue-500" /> : '📄'}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 break-words leading-snug">{ev.titulo || ev.nombre_original || ev.url}</p>
          {esLink ? (
            <a href={ev.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline break-words">{ev.url}</a>
          ) : ev.titulo && ev.nombre_original && ev.titulo !== ev.nombre_original ? (
            <p className="text-xs text-gray-400 break-words">{ev.nombre_original}</p>
          ) : null}
          <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded inline-block mt-1">{ev.categoria}</span>
        </div>
      </div>

      {/* Ubicación: proyecto / etapa / acción / riesgo */}
      {hayUbicacion && (
        <div className="border border-gray-100 rounded-lg p-3 space-y-1.5">
          {ev.proyecto_nombre && (
            <div className="flex items-center gap-1.5 text-xs">
              <FolderKanban size={12} className="text-guinda-500 flex-shrink-0" />
              <Link to={`/proyectos/${ev.proyecto_id}`} className="text-guinda-600 hover:underline font-medium truncate">{ev.proyecto_nombre}</Link>
            </div>
          )}
          {ev.etapa_nombre && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 pl-[18px]">
              <Layers size={11} className="flex-shrink-0" /> <span className="truncate">{ev.etapa_nombre}</span>
            </div>
          )}
          {ev.accion_nombre && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 pl-[18px]">
              <ChevronDot /> <span className="truncate">{ev.accion_nombre}</span>
            </div>
          )}
          {ev.riesgo_titulo && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 pl-[18px]">
              <ChevronDot /> <span className="truncate">Riesgo: {ev.riesgo_titulo}</span>
            </div>
          )}
        </div>
      )}

      {/* Metadatos */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div className="flex items-center gap-1.5 text-gray-500"><User size={12} /> Subido por</div>
        <div className="text-gray-800 font-medium truncate">{ev.autor_nombre || '—'}</div>

        <div className="flex items-center gap-1.5 text-gray-500"><Calendar size={12} /> Fecha</div>
        <div className="text-gray-800 font-medium">
          {new Date(ev.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
          {' · '}{new Date(ev.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
        </div>

        {tamano && (
          <>
            <div className="flex items-center gap-1.5 text-gray-500"><HardDrive size={12} /> Tamaño</div>
            <div className="text-gray-800 font-medium">{tamano}</div>
          </>
        )}
        {ev.dg_siglas && (
          <>
            <div className="flex items-center gap-1.5 text-gray-500"><FolderKanban size={12} /> Dirección General</div>
            <div className="text-gray-800 font-medium">{ev.dg_siglas}</div>
          </>
        )}
      </div>

      {/* Notas */}
      {ev.notas && (
        <div className="border-t border-gray-100 pt-3">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Notas</p>
          <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap break-words">{ev.notas}</p>
        </div>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
        {esLink ? (
          <>
            <button onClick={onPreview} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#7B1C3E] text-white text-xs rounded-lg hover:bg-[#5a1430]">
              <Eye size={13} /> Vista previa
            </button>
            <a href={ev.url} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 text-xs rounded-lg hover:bg-gray-100">
              <Link2 size={13} /> Abrir enlace
            </a>
          </>
        ) : (
          <>
            <button onClick={onPreview} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#7B1C3E] text-white text-xs rounded-lg hover:bg-[#5a1430]">
              <Eye size={13} /> Vista previa
            </button>
            <a href={evidenciasApi.obtenerUrlDescarga(ev.id)} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 text-xs rounded-lg hover:bg-gray-100">
              <Download size={13} /> Descargar
            </a>
          </>
        )}
        {onEliminar && (
          <button onClick={onEliminar} className="flex items-center gap-1.5 px-3 py-1.5 text-red-500 text-xs rounded-lg hover:bg-red-50 ml-auto">
            <Trash2 size={13} /> Eliminar
          </button>
        )}
      </div>
    </div>
  );
}

function ChevronDot() {
  return <span className="w-1 h-1 rounded-full bg-gray-300 flex-shrink-0 ml-[1px]" />;
}
