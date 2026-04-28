/**
 * ARCHIVO: HiloComentarios.jsx
 * PROPÓSITO: Hilo de comentarios estilo Facebook embebible en cualquier entidad
 *            (etapa, acción, proyecto). Permite crear hilos de debate inline.
 *
 * MINI-CLASE: Comentarios polimórficos inline
 * ─────────────────────────────────────────────────────────────────
 * Este componente recibe entidad_tipo ("Etapa", "Accion", "Proyecto")
 * y entidad_id, y carga/muestra los comentarios de esa entidad.
 * Funciona como un mini-Facebook: se muestra un input compacto,
 * al escribir y enviar se agrega el comentario al hilo. Cada
 * comentario puede tener respuestas (hilos anidados de un nivel).
 * El componente es completamente autónomo y reutilizable.
 * ─────────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, ChevronDown, ChevronUp } from 'lucide-react';
import * as comentariosApi from '../../api/comentarios';
import ComentarioItem from './ComentarioItem';

export default function HiloComentarios({ entidadTipo, entidadId, compacto = true, onStatsChange }) {
  const [comentarios, setComentarios] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [abierto, setAbierto] = useState(!compacto);
  const [nuevoTexto, setNuevoTexto] = useState('');
  const [respondiendo, setRespondiendo] = useState(null); // id del comentario al que se responde
  const [textoRespuesta, setTextoRespuesta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef(null);

  // Cargar comentarios cuando se abre el hilo
  useEffect(() => {
    if (!abierto || !entidadId) return;

    async function cargar() {
      setCargando(true);
      try {
        const res = await comentariosApi.obtenerComentarios(entidadTipo, entidadId);
        setComentarios(res.datos || []);
      } catch (err) {
        console.error('Error cargando comentarios:', err);
      } finally {
        setCargando(false);
      }
    }
    cargar();
  }, [abierto, entidadTipo, entidadId]);

  // Conteo total de comentarios (incluyendo respuestas)
  const totalComentarios = comentarios.reduce(
    (sum, c) => sum + 1 + (c.respuestas?.length || 0), 0
  );

  // Publicar comentario nuevo
  async function publicar(e) {
    e.preventDefault();
    if (!nuevoTexto.trim() || enviando) return;

    setEnviando(true);
    try {
      await comentariosApi.crearComentario({
        entidad_tipo: entidadTipo,
        entidad_id: entidadId,
        contenido: nuevoTexto,
      });
      setNuevoTexto('');
      // Recargar
      const res = await comentariosApi.obtenerComentarios(entidadTipo, entidadId);
      setComentarios(res.datos || []);
      onStatsChange && onStatsChange();
    } catch (err) {
      console.error('Error publicando comentario:', err);
    } finally {
      setEnviando(false);
    }
  }

  // Publicar respuesta a un comentario
  async function publicarRespuesta(e, comentarioPadreId) {
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
      // Recargar
      const res = await comentariosApi.obtenerComentarios(entidadTipo, entidadId);
      setComentarios(res.datos || []);
      onStatsChange && onStatsChange();
    } catch (err) {
      console.error('Error publicando respuesta:', err);
    } finally {
      setEnviando(false);
    }
  }

  // Vista compacta: solo botón para abrir/cerrar
  if (compacto && !abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-guinda-500 transition-colors py-1"
      >
        <MessageSquare size={13} />
        {totalComentarios > 0 ? `${totalComentarios} comentario(s)` : 'Comentar'}
      </button>
    );
  }

  return (
    <div className="mt-2">
      {/* Header del hilo — botón para colapsar si es compacto */}
      {compacto && (
        <button
          onClick={() => setAbierto(false)}
          className="flex items-center gap-1.5 text-xs text-guinda-500 font-medium mb-2 hover:text-guinda-700 transition-colors"
        >
          <ChevronUp size={13} />
          Ocultar comentarios
        </button>
      )}

      {/* Lista de comentarios */}
      {cargando ? (
        <p className="text-xs text-gray-400 py-2">Cargando...</p>
      ) : comentarios.length > 0 ? (
        <div className="space-y-3 mb-3">
          {comentarios.map(c => (
            <div key={c.id}>
              {/* Comentario principal */}
              <ComentarioItem comentario={c} />

              {/* Respuestas */}
              {c.respuestas && c.respuestas.length > 0 && (
                <div className="ml-8 mt-2 space-y-2">
                  {c.respuestas.map(r => (
                    <ComentarioItem key={r.id} comentario={r} esRespuesta />
                  ))}
                </div>
              )}

              {/* Botón responder */}
              {respondiendo !== c.id ? (
                <button
                  onClick={() => { setRespondiendo(c.id); setTextoRespuesta(''); }}
                  className="ml-11 text-xs text-gray-400 hover:text-guinda-500 mt-1 transition-colors"
                >
                  Responder
                </button>
              ) : (
                <form onSubmit={(e) => publicarRespuesta(e, c.id)} className="ml-11 mt-2 flex gap-2">
                  <input
                    type="text"
                    value={textoRespuesta}
                    onChange={e => setTextoRespuesta(e.target.value)}
                    placeholder="Escribe una respuesta..."
                    className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-full focus:ring-1 focus:ring-guinda-500 focus:border-guinda-500 outline-none"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={!textoRespuesta.trim() || enviando}
                    className="p-1.5 text-guinda-500 hover:bg-guinda-50 rounded-full disabled:opacity-30 transition-colors"
                  >
                    <Send size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRespondiendo(null)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Cancelar
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {/* Input para nuevo comentario */}
      <form onSubmit={publicar} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={nuevoTexto}
          onChange={e => setNuevoTexto(e.target.value)}
          placeholder="Escribe un comentario..."
          className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-full focus:ring-1 focus:ring-guinda-500 focus:border-guinda-500 outline-none"
        />
        <button
          type="submit"
          disabled={!nuevoTexto.trim() || enviando}
          className="p-1.5 text-guinda-500 hover:bg-guinda-50 rounded-full disabled:opacity-30 transition-colors"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
