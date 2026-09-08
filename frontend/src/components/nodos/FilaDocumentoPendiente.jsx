/**
 * ARCHIVO: FilaDocumentoPendiente.jsx
 * PROPÓSITO: Fila de un documento (archivo o liga) todavía sin guardar,
 *            con título/nota/categoría editables antes de subir. Un solo
 *            componente para las dos rutas que permiten adjuntar varios a
 *            la vez — el modal "Registrar avance" y el botón independiente
 *            "Adjuntar documento" (SeccionArchivosNodo) — así el
 *            comportamiento y la apariencia de la fila no se duplican ni
 *            pueden divergir entre las dos.
 */
import { Link2, Paperclip, X } from 'lucide-react';
import CATEGORIAS_EVIDENCIA from '../seguimiento/categoriasEvidencia';

// item: { id, modo: 'archivo'|'liga', archivo, url, categoria, notas, titulo }
export default function FilaDocumentoPendiente({ item, onCambiar, onQuitar }) {
  return (
    <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2 py-1.5">
      {item.modo === 'liga' ? <Link2 size={13} className="text-blue-500 flex-shrink-0" /> : <Paperclip size={13} className="text-gray-400 flex-shrink-0" />}
      <div className="flex-1 min-w-0">
        <input
          type="text" value={item.titulo} onChange={e => onCambiar('titulo', e.target.value)}
          placeholder="Título del documento"
          className="text-xs font-medium text-gray-700 w-full border-0 p-0 outline-none focus:ring-0 bg-transparent"
        />
        {item.modo === 'archivo' ? (
          <p className="text-[10px] text-gray-400 truncate" title={item.archivo.name}>{item.archivo.name}</p>
        ) : (
          <input
            type="url" value={item.url} onChange={e => onCambiar('url', e.target.value)}
            placeholder="https://..." autoFocus
            className="text-[11px] text-gray-500 w-full border-0 p-0 outline-none focus:ring-0 bg-transparent"
          />
        )}
        <input
          type="text" value={item.notas} onChange={e => onCambiar('notas', e.target.value)}
          placeholder="Nota (opcional)"
          className="text-[11px] text-gray-400 w-full border-0 p-0 outline-none focus:ring-0 bg-transparent mt-0.5"
        />
      </div>
      <select
        value={item.categoria} onChange={e => onCambiar('categoria', e.target.value)}
        className="text-[10px] border border-gray-200 rounded px-1 py-1 flex-shrink-0 bg-white max-w-[6.5rem]"
      >
        {CATEGORIAS_EVIDENCIA.map(c => <option key={c.value} value={c.value}>{c.icon} {c.value}</option>)}
      </select>
      <button onClick={onQuitar} className="text-gray-300 hover:text-red-500 flex-shrink-0">
        <X size={14} />
      </button>
    </div>
  );
}
