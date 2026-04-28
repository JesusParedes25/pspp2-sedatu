/**
 * ARCHIVO: HiloConsolidado.jsx
 * PROPÓSITO: Hilo único que mezcla comentarios de varias entidades
 *            (acción + sus subacciones) ordenados por fecha.
 *
 * MINI-CLASE: Discusión consolidada polimórfica
 * ─────────────────────────────────────────────────────────────────
 * Recibe un array de entidades: [{ tipo, id, etiqueta }]
 * La primera entidad es la "principal" — el campo de escritura
 * siempre publica a esa entidad.
 * Los comentarios de otras entidades se muestran con una etiqueta
 * discreta indicando su origen (ej: "📌 S.1 Arranque").
 * Todos los comentarios se mezclan y ordenan por fecha ascendente.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useRef } from 'react';
import { Send, Bookmark } from 'lucide-react';
import * as comentariosApi from '../../api/comentarios';
import ComentarioItem from './ComentarioItem';

// Fecha relativa (duplicada aquí para no importar de ComentarioItem)
function fechaMs(fecha) {
  return new Date(fecha).getTime();
}

export default function HiloConsolidado({ entidades = [], onStatsChange }) {
  const [grupos, setGrupos]       = useState({}); // { "Accion:12": [comentarios] }
  const [cargando, setCargando]   = useState(false);
  const [nuevoTexto, setNuevoTexto] = useState('');
  const [enviando, setEnviando]   = useState(false);
  const [respondiendo, setRespondiendo] = useState(null);
  const [textoRespuesta, setTextoRespuesta] = useState('');
  const inputRef = useRef(null);

  const entidadPrincipal = entidades[0];

  useEffect(() => {
    if (entidades.length === 0) return;
    cargarTodos();
  }, [entidades.map(e => `${e.tipo}:${e.id}`).join(',')]);

  async function cargarTodos() {
    setCargando(true);
    try {
      const resultados = await Promise.allSettled(
        entidades.map(e => comentariosApi.obtenerComentarios(e.tipo, e.id))
      );
      const nuevosGrupos = {};
      entidades.forEach((e, i) => {
        const clave = `${e.tipo}:${e.id}`;
        nuevosGrupos[clave] = resultados[i].status === 'fulfilled'
          ? (resultados[i].value.datos || []) : [];
      });
      setGrupos(nuevosGrupos);
    } catch { /* silenciar */ }
    finally { setCargando(false); }
  }

  // Aplanar todos los comentarios (raíz + respuestas) con su etiqueta de origen
  function construirHilo() {
    const items = [];
    entidades.forEach(e => {
      const clave = `${e.tipo}:${e.id}`;
      const comentarios = grupos[clave] || [];
      comentarios.forEach(c => {
        items.push({ ...c, _etiqueta: e.etiqueta, _esPrincipal: e === entidadPrincipal });
        (c.respuestas || []).forEach(r => {
          items.push({ ...r, _esRespuesta: true, _padreId: c.id, _etiqueta: e.etiqueta, _esPrincipal: e === entidadPrincipal });
        });
      });
    });
    items.sort((a, b) => fechaMs(a.created_at) - fechaMs(b.created_at));
    return items;
  }

  async function publicar(e) {
    e.preventDefault();
    if (!nuevoTexto.trim() || enviando || !entidadPrincipal) return;
    setEnviando(true);
    try {
      await comentariosApi.crearComentario({
        entidad_tipo: entidadPrincipal.tipo,
        entidad_id: entidadPrincipal.id,
        contenido: nuevoTexto,
      });
      setNuevoTexto('');
      await cargarTodos();
      onStatsChange && onStatsChange();
    } catch { /* silenciar */ }
    finally { setEnviando(false); }
  }

  async function publicarRespuesta(e, comentarioPadreId, entidadTipo, entidadId) {
    e.preventDefault();
    if (!textoRespuesta.trim() || enviando) return;
    setEnviando(true);
    try {
      await comentariosApi.crearComentario({
        entidad_tipo: entidadTipo,
        entidad_id: entidadId,
        contenido: textoRespuesta,
        id_padre: comentarioPadreId,
      });
      setTextoRespuesta('');
      setRespondiendo(null);
      await cargarTodos();
      onStatsChange && onStatsChange();
    } catch { /* silenciar */ }
    finally { setEnviando(false); }
  }

  const hilo = construirHilo();
  const total = hilo.length;

  return (
    <div className="flex flex-col h-full">
      {/* Lista de comentarios */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-3">
        {cargando && (
          <p className="text-xs text-gray-400 text-center py-6 animate-pulse">Cargando discusión…</p>
        )}

        {!cargando && total === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center mb-2">
              <Send size={16} className="text-gray-200" />
            </div>
            <p className="text-xs text-gray-300">Aún no hay comentarios</p>
            <p className="text-[10px] text-gray-200 mt-0.5">Sé el primero en comentar esta acción</p>
          </div>
        )}

        {!cargando && hilo.map((item, idx) => {
          // Buscar la entidad a la que pertenece para responder
          const entOrigen = entidades.find(e => {
            const clave = `${e.tipo}:${e.id}`;
            return (grupos[clave] || []).some(c =>
              c.id === item.id || (c.respuestas || []).some(r => r.id === item.id)
            );
          }) || entidadPrincipal;

          return (
            <div key={`${item.id}-${idx}`}>
              {/* Etiqueta de origen si no es la entidad principal */}
              {!item._esPrincipal && (
                <div className="flex items-center gap-1 mb-1 ml-11">
                  <Bookmark size={9} className="text-guinda-400 flex-shrink-0" />
                  <span className="text-[10px] text-guinda-500 font-semibold truncate">{item._etiqueta}</span>
                </div>
              )}

              <ComentarioItem comentario={item} esRespuesta={!!item._esRespuesta} />

              {/* Botón responder (solo en comentarios raíz) */}
              {!item._esRespuesta && (
                respondiendo !== item.id ? (
                  <button
                    onClick={() => { setRespondiendo(item.id); setTextoRespuesta(''); }}
                    className="ml-11 text-[11px] text-gray-400 hover:text-guinda-500 mt-1 transition-colors"
                  >
                    Responder
                  </button>
                ) : (
                  <form
                    onSubmit={e => publicarRespuesta(e, item.id, entOrigen.tipo, entOrigen.id)}
                    className="ml-11 mt-2 flex gap-2"
                  >
                    <input type="text" value={textoRespuesta}
                      onChange={e => setTextoRespuesta(e.target.value)}
                      placeholder="Escribe una respuesta…"
                      className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-full focus:ring-1 focus:ring-guinda-500 focus:border-guinda-500 outline-none"
                      autoFocus
                    />
                    <button type="submit" disabled={!textoRespuesta.trim() || enviando}
                      className="p-1.5 text-guinda-500 hover:bg-guinda-50 rounded-full disabled:opacity-30 transition-colors">
                      <Send size={13} />
                    </button>
                    <button type="button" onClick={() => setRespondiendo(null)}
                      className="text-[11px] text-gray-400 hover:text-gray-600">
                      Cancelar
                    </button>
                  </form>
                )
              )}
            </div>
          );
        })}
      </div>

      {/* Campo nuevo comentario (siempre a nivel acción) */}
      <div className="flex-shrink-0 pt-3 border-t border-gray-100">
        {entidades.length > 1 && (
          <p className="text-[10px] text-gray-400 mb-1.5">
            Comentar en <span className="font-semibold text-gray-500">{entidadPrincipal?.etiqueta || 'la acción'}</span>
          </p>
        )}
        <form onSubmit={publicar} className="flex gap-2">
          <input ref={inputRef} type="text" value={nuevoTexto}
            onChange={e => setNuevoTexto(e.target.value)}
            placeholder="Escribe un comentario…"
            className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-full focus:ring-1 focus:ring-guinda-500 focus:border-guinda-500 outline-none"
          />
          <button type="submit" disabled={!nuevoTexto.trim() || enviando}
            className="p-1.5 text-guinda-500 hover:bg-guinda-50 rounded-full disabled:opacity-30 transition-colors">
            <Send size={14} />
          </button>
        </form>
      </div>
    </div>
  );
}
