/**
 * ARCHIVO: evidencias.js
 * PROPÓSITO: Funciones de API para evidencias (subida, listado, descarga).
 *
 * NOTA TÉCNICA: Subida de archivos con FormData
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

export async function obtenerEvidenciasEtapa(etapaId) {
  const { data } = await client.get(`/etapas/${etapaId}/evidencias`);
  return data;
}

export async function subirEvidenciaEtapa(etapaId, archivo, metadatos = {}) {
  const formData = new FormData();
  formData.append('archivo', archivo);
  if (metadatos.categoria) formData.append('categoria', metadatos.categoria);
  if (metadatos.notas) formData.append('notas', metadatos.notas);
  if (metadatos.titulo) formData.append('titulo', metadatos.titulo);
  const { data } = await client.post(`/etapas/${etapaId}/evidencias`, formData);
  return data;
}

export async function registrarLinkEtapa(etapaId, url, metadatos = {}) {
  const { data } = await client.post(`/etapas/${etapaId}/evidencias`, {
    url,
    categoria: metadatos.categoria || 'Otro',
    notas: metadatos.notas || null,
    titulo: metadatos.titulo || null,
  });
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
  if (metadatos.titulo) formData.append('titulo', metadatos.titulo);
  const { data } = await client.post(`/acciones/${accionId}/evidencias`, formData);
  return data;
}

export async function registrarLinkAccion(accionId, url, metadatos = {}) {
  const { data } = await client.post(`/acciones/${accionId}/evidencias`, {
    url,
    categoria: metadatos.categoria || 'Otro',
    notas: metadatos.notas || null,
    titulo: metadatos.titulo || null,
  });
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

// Pestaña "Documentos" de Detalle (Fase 4) — agrega documentos del nodo y,
// por omisión, de sus descendientes. tipo: 'etapa'|'accion'|'tarea'.
export async function obtenerDocumentosAgregados(tipo, nodoId, incluirHijos = true) {
  const ruta = tipo === 'etapa' ? 'etapas' : tipo === 'tarea' ? 'tareas' : 'acciones';
  const { data } = await client.get(`/${ruta}/${nodoId}/documentos`, { params: { incluirHijos } });
  return data;
}

// Los archivos SIEMPRE se piden a la API: el backend valida el permiso y
// transmite el objeto desde el almacén, que no se publica (requisito de la
// DGTIC: sin URLs firmadas, el navegador nunca habla con el almacén).
// El token va en la query porque <a href>, <iframe> e <img> no mandan el
// header Authorization.
//   /ver       → Content-Disposition: inline     (vista previa)
//   /descargar → Content-Disposition: attachment (botón "Descargar")
function urlArchivoEvidencia(evidenciaId, accion) {
  const baseURL = client.defaults.baseURL;
  const token = localStorage.getItem('pspp_token');
  return `${baseURL}/evidencias/${evidenciaId}/${accion}?token=${encodeURIComponent(token || '')}`;
}

export function obtenerUrlDescarga(evidenciaId) {
  return urlArchivoEvidencia(evidenciaId, 'descargar');
}

export function obtenerUrlVista(evidenciaId) {
  return urlArchivoEvidencia(evidenciaId, 'ver');
}

export async function eliminarEvidencia(id) {
  const { data } = await client.delete(`/evidencias/${id}`);
  return data;
}

export async function listarEvidencias(filtros = {}) {
  const { data } = await client.get('/evidencias', { params: filtros });
  return data;
}
