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
 * Las subidas van por subirArchivo (api/transferencias.js): sin el límite
 * de 30 s de las peticiones normales, con avance (opciones.onProgreso) y
 * detección de "dejó de avanzar".
 * ─────────────────────────────────────────────────────────────────
 */
import client from './client';
import { subirArchivo } from './transferencias';

export async function obtenerEvidenciasAccion(accionId) {
  const { data } = await client.get(`/acciones/${accionId}/evidencias`);
  return data;
}

export async function obtenerEvidenciasEtapa(etapaId) {
  const { data } = await client.get(`/etapas/${etapaId}/evidencias`);
  return data;
}

export async function subirEvidenciaEtapa(etapaId, archivo, metadatos = {}, opciones = {}) {
  const formData = new FormData();
  formData.append('archivo', archivo);
  if (metadatos.categoria) formData.append('categoria', metadatos.categoria);
  if (metadatos.notas) formData.append('notas', metadatos.notas);
  if (metadatos.titulo) formData.append('titulo', metadatos.titulo);
  return subirArchivo(`/etapas/${etapaId}/evidencias`, formData, archivo, opciones);
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

export async function subirEvidenciaAccion(accionId, archivo, metadatos = {}, opciones = {}) {
  const formData = new FormData();
  formData.append('archivo', archivo);
  if (metadatos.categoria) formData.append('categoria', metadatos.categoria);
  if (metadatos.notas) formData.append('notas', metadatos.notas);
  if (metadatos.fecha_generacion) formData.append('fecha_generacion', metadatos.fecha_generacion);
  if (metadatos.titulo) formData.append('titulo', metadatos.titulo);
  return subirArchivo(`/acciones/${accionId}/evidencias`, formData, archivo, opciones);
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

export async function subirEvidenciaRiesgo(riesgoId, archivo, metadatos = {}, opciones = {}) {
  const formData = new FormData();
  formData.append('archivo', archivo);
  if (metadatos.categoria) formData.append('categoria', metadatos.categoria);
  if (metadatos.notas) formData.append('notas', metadatos.notas);

  return subirArchivo(`/riesgos/${riesgoId}/evidencias`, formData, archivo, opciones);
}

export async function obtenerEvidenciasSubaccion(subaccionId) {
  const { data } = await client.get(`/subacciones/${subaccionId}/evidencias`);
  return data;
}

export async function subirEvidenciaSubaccion(subaccionId, archivo, metadatos = {}, opciones = {}) {
  const formData = new FormData();
  formData.append('archivo', archivo);
  if (metadatos.categoria) formData.append('categoria', metadatos.categoria);
  if (metadatos.notas) formData.append('notas', metadatos.notas);

  return subirArchivo(`/subacciones/${subaccionId}/evidencias`, formData, archivo, opciones);
}

// Pestaña "Documentos" de Detalle (Fase 4) — agrega documentos del nodo y,
// por omisión, de sus descendientes. tipo: 'etapa'|'accion'|'tarea'.
export async function obtenerDocumentosAgregados(tipo, nodoId, incluirHijos = true) {
  const ruta = tipo === 'etapa' ? 'etapas' : tipo === 'tarea' ? 'tareas' : 'acciones';
  const { data } = await client.get(`/${ruta}/${nodoId}/documentos`, { params: { incluirHijos } });
  return data;
}

// La vista previa y la descarga de archivos viven en api/archivos.js
// (cabecera para la vista previa, boleto efímero para la descarga):
// el token de sesión ya no viaja en ninguna URL.

export async function eliminarEvidencia(id) {
  const { data } = await client.delete(`/evidencias/${id}`);
  return data;
}

export async function listarEvidencias(filtros = {}) {
  const { data } = await client.get('/evidencias', { params: filtros });
  return data;
}
