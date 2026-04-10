/**
 * ARCHIVO: comentarios.js
 * PROPÓSITO: Funciones de API para comentarios (inmutables).
 *
 * MINI-CLASE: Comentarios polimórficos
 * ─────────────────────────────────────────────────────────────────
 * Los comentarios se vinculan a cualquier entidad del sistema
 * (Proyecto, Etapa, Acción, Riesgo) mediante entidad_tipo y
 * entidad_id. El endpoint GET usa query params para filtrar.
 * POST crea un comentario raíz; POST /:id/responder crea una
 * respuesta vinculada al padre.
 * ─────────────────────────────────────────────────────────────────
 */
import client from './client';

export async function obtenerComentarios(entidadTipo, entidadId) {
  const { data } = await client.get('/comentarios', {
    params: { entidad_tipo: entidadTipo, entidad_id: entidadId }
  });
  return data;
}

export async function crearComentario(datos) {
  const { data } = await client.post('/comentarios', datos);
  return data;
}

export async function responderComentario(comentarioId, contenido) {
  const { data } = await client.post(`/comentarios/${comentarioId}/responder`, { contenido });
  return data;
}
