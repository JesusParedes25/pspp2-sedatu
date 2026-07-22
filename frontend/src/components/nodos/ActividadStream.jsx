/**
 * ARCHIVO: ActividadStream.jsx
 * PROPÓSITO: Stream cronológico de actividad (comentarios, archivos,
 *            riesgos, cambios de estatus/avance) de un nodo Y TODOS sus
 *            descendientes — se muestra debajo de la lista de tarjetas.
 */
import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Paperclip, AlertTriangle, ArrowRightCircle, Send, Loader2, ExternalLink } from 'lucide-react';
import * as actividadApi from '../../api/actividad';
import * as evidenciasApi from '../../api/evidencias';

// El stream mezcla 3 orígenes de archivo: la tabla nueva `actividad`, una
// evidencia del modelo viejo (trae metadata.evidencia_id), o un link externo
// (metadata.tipo_medio === 'link') — cada uno resuelve su URL distinto.
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

export default function ActividadStream({ tipo, id }) {
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState('todo');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

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
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Actividad</h3>
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
                    <a href={urlArchivo(item)} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline mt-0.5">
                      {item.metadata?.tipo_medio === 'link' ? <ExternalLink size={10} /> : <Paperclip size={10} />} {item.archivo_nombre}
                    </a>
                  )}
                  {item.tipo_evento === 'riesgo' && item.metadata?.nivel && (
                    <span className="inline-block text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded mt-0.5">
                      Nivel: {item.metadata.nivel}{item.metadata.estado ? ` · ${item.metadata.estado}` : ''}
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
    </div>
  );
}
