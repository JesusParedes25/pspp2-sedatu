/**
 * ARCHIVO: actividad.js
 * PROPÓSITO: API del stream de actividad unificado (comentarios, archivos,
 *            riesgos reportados, cambios de estatus/avance) por nodo.
 */
import client from './client';

export async function obtenerActividadNodo(tipo, id) {
  const { data } = await client.get(`/actividad/${tipo}/${id}`);
  return data;
}

export async function comentar(tipo, id, contenido) {
  const { data } = await client.post('/actividad', { tipo_nodo: tipo, id_nodo: id, tipo_evento: 'comentario', contenido });
  return data;
}

export async function reportarRiesgo(tipo, id, contenido, nivel) {
  const { data } = await client.post('/actividad', {
    tipo_nodo: tipo, id_nodo: id, tipo_evento: 'riesgo', contenido, metadata: { nivel },
  });
  return data;
}

export async function adjuntarArchivo(tipo, id, archivo) {
  const formData = new FormData();
  formData.append('archivo', archivo);
  formData.append('tipo_nodo', tipo);
  formData.append('id_nodo', id);
  formData.append('tipo_evento', 'archivo');
  const { data } = await client.post('/actividad', formData);
  return data;
}

export function obtenerUrlDescargaActividad(id) {
  const baseURL = client.defaults.baseURL;
  const token = localStorage.getItem('pspp_token');
  return `${baseURL}/actividad/${id}/descargar?token=${token}`;
}
