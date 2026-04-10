/**
 * ARCHIVO: evidencias.js
 * PROPÓSITO: Funciones de API para evidencias (subida, listado, descarga).
 *
 * MINI-CLASE: Subida de archivos con FormData
 * ─────────────────────────────────────────────────────────────────
 * Para subir archivos, el navegador usa multipart/form-data en lugar
 * de JSON. FormData es la API nativa del navegador para construir
 * este tipo de petición. axios detecta automáticamente FormData y
 * configura el Content-Type correcto. El archivo se envía como
 * campo "archivo" y los metadatos como campos adicionales del form.
 * ─────────────────────────────────────────────────────────────────
 */
import client from './client';

export async function obtenerEvidenciasAccion(accionId) {
  const { data } = await client.get(`/acciones/${accionId}/evidencias`);
  return data;
}

export async function obtenerEvidenciasRiesgo(riesgoId) {
  const { data } = await client.get(`/riesgos/${riesgoId}/evidencias`);
  return data;
}

export async function obtenerEvidenciasProyecto(proyectoId) {
  const { data } = await client.get(`/proyectos/${proyectoId}/evidencias`);
  return data;
}

export async function subirEvidenciaAccion(accionId, archivo, metadatos = {}) {
  const formData = new FormData();
  formData.append('archivo', archivo);
  if (metadatos.categoria) formData.append('categoria', metadatos.categoria);
  if (metadatos.notas) formData.append('notas', metadatos.notas);
  if (metadatos.fecha_generacion) formData.append('fecha_generacion', metadatos.fecha_generacion);

  const { data } = await client.post(`/acciones/${accionId}/evidencias`, formData);
  return data;
}

export async function subirEvidenciaRiesgo(riesgoId, archivo, metadatos = {}) {
  const formData = new FormData();
  formData.append('archivo', archivo);
  if (metadatos.categoria) formData.append('categoria', metadatos.categoria);
  if (metadatos.notas) formData.append('notas', metadatos.notas);

  const { data } = await client.post(`/riesgos/${riesgoId}/evidencias`, formData);
  return data;
}

export async function obtenerEvidenciasSubaccion(subaccionId) {
  const { data } = await client.get(`/subacciones/${subaccionId}/evidencias`);
  return data;
}

export async function subirEvidenciaSubaccion(subaccionId, archivo, metadatos = {}) {
  const formData = new FormData();
  formData.append('archivo', archivo);
  if (metadatos.categoria) formData.append('categoria', metadatos.categoria);
  if (metadatos.notas) formData.append('notas', metadatos.notas);

  const { data } = await client.post(`/subacciones/${subaccionId}/evidencias`, formData);
  return data;
}

export function obtenerUrlDescarga(evidenciaId) {
  const baseURL = client.defaults.baseURL;
  const token = localStorage.getItem('pspp_token');
  return `${baseURL}/evidencias/${evidenciaId}/descargar?token=${token}`;
}

export async function eliminarEvidencia(id) {
  const { data } = await client.delete(`/evidencias/${id}`);
  return data;
}

export async function listarEvidencias(filtros = {}) {
  const { data } = await client.get('/evidencias', { params: filtros });
  return data;
}
