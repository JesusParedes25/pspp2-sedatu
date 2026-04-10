/**
 * ARCHIVO: ComentarioItem.jsx
 * PROPÓSITO: Renderiza un comentario individual con avatar, autor y fecha.
 *
 * MINI-CLASE: Comentarios inmutables con hilos
 * ─────────────────────────────────────────────────────────────────
 * Cada comentario muestra: avatar con iniciales de la DG del autor,
 * nombre completo, cargo, DG, fecha en formato relativo, y el
 * contenido del comentario. Los comentarios son inmutables (sin
 * botones de editar/eliminar). Las respuestas se muestran indentadas
 * debajo del comentario padre con un borde izquierdo.
 * ─────────────────────────────────────────────────────────────────
 */

// Formatear fecha relativa ("hace 2 días", "hace 1 mes")
function fechaRelativa(fecha) {
  const ahora = new Date();
  const diff = ahora - new Date(fecha);
  const minutos = Math.floor(diff / 60000);
  const horas = Math.floor(diff / 3600000);
  const dias = Math.floor(diff / 86400000);

  if (minutos < 1) return 'Justo ahora';
  if (minutos < 60) return `Hace ${minutos}min`;
  if (horas < 24) return `Hace ${horas}h`;
  if (dias < 30) return `Hace ${dias}d`;
  return new Date(fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ComentarioItem({ comentario, esRespuesta = false }) {
  const iniciales = (comentario.autor_dg_siglas || '??').slice(0, 2);

  return (
    <div className={`flex gap-3 ${esRespuesta ? 'ml-10 pl-4 border-l-2 border-gray-200' : ''}`}>
      {/* Avatar */}
      <div className="w-8 h-8 bg-guinda-100 text-guinda-600 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">
        {iniciales}
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-900">{comentario.autor_nombre}</span>
          {comentario.autor_dg_siglas && (
            <span className="text-xs text-guinda-500 font-medium">{comentario.autor_dg_siglas}</span>
          )}
          <span className="text-xs text-gray-400">{fechaRelativa(comentario.created_at)}</span>
        </div>
        {comentario.autor_cargo && (
          <p className="text-xs text-gray-400">{comentario.autor_cargo}</p>
        )}
        <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{comentario.contenido}</p>
      </div>
    </div>
  );
}
