/**
 * ARCHIVO: PestanaComentarios.jsx
 * PROPÓSITO: Pestaña "Comentarios" del panel de Detalle — los comentarios
 *            ya existían (viven en el stream unificado `actividad`, mismo
 *            endpoint que la pestaña Actividad, y se escriben desde el
 *            mismo cuadro de texto que ahí), pero mezclados con avance,
 *            documentos y riesgos; esta pestaña es solo el hilo de
 *            comentarios, filtrando por tipo_evento === 'comentario'
 *            sobre los MISMOS datos de GET /actividad/:tipo/:id — no es
 *            una fuente nueva, ni una tabla nueva (ver CLAUDE.md: "para
 *            cualquier feature nueva que necesite un historial con
 *            fecha+autor, reusar actividadQueries, no crear una tabla
 *            nueva"). Escribir un comentario aquí usa la misma
 *            actividadApi.comentar() que ya usa la pestaña Actividad —
 *            ambas pestañas leen y escriben la misma fuente, así que un
 *            comentario nuevo aparece en las dos.
 */
import { useState, useEffect, useCallback } from 'react';
import { Send, Loader2, MessageSquare } from 'lucide-react';
import * as actividadApi from '../../../api/actividad';
import { useCandado } from '../../../hooks/useEnvioUnico';

export default function PestanaComentarios({ tipo, id, permisos, onCambiado, onContador }) {
  const [comentarios, setComentarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState('');
  const [ejecutar, enviando] = useCandado();

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await actividadApi.obtenerActividadNodo(tipo, id);
      const propios = (res.datos || []).filter(it => it.tipo_evento === 'comentario');
      setComentarios(propios);
      onContador?.(propios.length);
    } catch {
      setComentarios([]);
      onContador?.(0);
    } finally {
      setCargando(false);
    }
  }, [tipo, id, onContador]);

  useEffect(() => { cargar(); }, [cargar]);

  function enviar() {
    if (!texto.trim()) return;
    ejecutar(async () => {
      await actividadApi.comentar(tipo, id, texto.trim());
      setTexto('');
      await cargar();
      onCambiado?.();
    });
  }

  function formatoFechaHora(fecha) {
    const d = new Date(fecha);
    const fechaTxt = d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    const horaTxt = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    return `${fechaTxt}, ${horaTxt}`;
  }

  return (
    <div>
      {cargando ? (
        <p className="text-xs text-gray-400 py-4 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Cargando comentarios...</p>
      ) : comentarios.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 flex items-center gap-1.5"><MessageSquare size={13} className="text-gray-300" /> Todavía no hay comentarios.</p>
      ) : (
        <ul className="space-y-3">
          {comentarios.map(c => (
            <li key={c.id} className="border border-gray-200 rounded-lg px-3 py-2.5 bg-white">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-semibold text-gray-800">{c.autor_nombre || 'Sin autor'}</span>
                <span className="text-[10px] text-gray-400 flex-shrink-0">{formatoFechaHora(c.created_at)}</span>
              </div>
              <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{c.contenido}</p>
            </li>
          ))}
        </ul>
      )}

      {permisos?.esSoloLectura ? (
        <p className="text-[11px] text-gray-400 italic mt-3 pt-3 border-t border-gray-100">
          Solo consulta. Para comentar aquí necesitas participar en este proyecto.
        </p>
      ) : (
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-100">
          <input
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && enviar()}
            placeholder="Escribe un comentario..."
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-2 focus:border-guinda-400 outline-none"
          />
          <button
            onClick={enviar}
            disabled={enviando || !texto.trim()}
            className="flex items-center gap-1 text-xs font-medium bg-guinda-600 text-white px-3 py-2 rounded-lg hover:bg-guinda-700 disabled:opacity-40 flex-shrink-0"
          >
            <Send size={13} /> Enviar
          </button>
        </div>
      )}
    </div>
  );
}
