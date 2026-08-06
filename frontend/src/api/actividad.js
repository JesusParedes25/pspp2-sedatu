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

// Igual que subirEvidenciaEtapa/subirEvidenciaAccion (evidencias.js) pero
// contra el stream unificado — para tarea, que nunca tuvo su propia tabla
// de evidencias. categoria/notas viajan en metadata (columna JSONB en
// `actividad`), mismo criterio que ya usa reportarRiesgo con "nivel".
export async function subirArchivoActividad(tipo, id, archivo, metadatos = {}) {
  const formData = new FormData();
  formData.append('archivo', archivo);
  formData.append('tipo_nodo', tipo);
  formData.append('id_nodo', id);
  formData.append('tipo_evento', 'archivo');
  formData.append('metadata', JSON.stringify({
    categoria: metadatos.categoria || 'Otro',
    notas: metadatos.notas || null,
    tipo_medio: 'archivo',
  }));
  const { data } = await client.post('/actividad', formData);
  return data;
}

// Igual que registrarLinkEtapa/registrarLinkAccion pero contra el stream
// unificado, para tarea.
export async function registrarLinkActividad(tipo, id, url, metadatos = {}) {
  const { data } = await client.post('/actividad', {
    tipo_nodo: tipo, id_nodo: id, tipo_evento: 'archivo',
    metadata: {
      categoria: metadatos.categoria || 'Otro',
      notas: metadatos.notas || null,
      tipo_medio: 'link',
      url,
    },
  });
  return data;
}

export function obtenerUrlDescargaActividad(id) {
  const baseURL = client.defaults.baseURL;
  const token = localStorage.getItem('pspp_token');
  return `${baseURL}/actividad/${id}/descargar?token=${token}`;
}
