/**
 * ARCHIVO: actividad.js
 * PROPÓSITO: API del stream de actividad unificado (comentarios, archivos,
 *            riesgos reportados, cambios de estatus/avance) por nodo.
 */
import client from './client';
import { subirArchivo } from './transferencias';

export async function obtenerActividadNodo(tipo, id) {
  const { data } = await client.get(`/actividad/${tipo}/${id}`);
  return data;
}

export async function comentar(tipo, id, contenido) {
  const { data } = await client.post('/actividad', { tipo_nodo: tipo, id_nodo: id, tipo_evento: 'comentario', contenido });
  return data;
}

export async function adjuntarArchivo(tipo, id, archivo, opciones = {}) {
  const formData = new FormData();
  formData.append('archivo', archivo);
  formData.append('tipo_nodo', tipo);
  formData.append('id_nodo', id);
  formData.append('tipo_evento', 'archivo');
  return subirArchivo('/actividad', formData, archivo, opciones);
}

// Igual que subirEvidenciaEtapa/subirEvidenciaAccion (evidencias.js) pero
// contra el stream unificado — para tarea, que nunca tuvo su propia tabla
// de evidencias. categoria/notas viajan en metadata (columna JSONB en
// `actividad`), mismo criterio que ya usa reportarRiesgo con "nivel".
export async function subirArchivoActividad(tipo, id, archivo, metadatos = {}, opciones = {}) {
  const formData = new FormData();
  formData.append('archivo', archivo);
  formData.append('tipo_nodo', tipo);
  formData.append('id_nodo', id);
  formData.append('tipo_evento', 'archivo');
  formData.append('metadata', JSON.stringify({
    categoria: metadatos.categoria || 'Otro',
    notas: metadatos.notas || null,
    titulo: metadatos.titulo || null,
    tipo_medio: 'archivo',
  }));
  return subirArchivo('/actividad', formData, archivo, opciones);
}

// Igual que registrarLinkEtapa/registrarLinkAccion pero contra el stream
// unificado, para tarea.
export async function registrarLinkActividad(tipo, id, url, metadatos = {}) {
  const { data } = await client.post('/actividad', {
    tipo_nodo: tipo, id_nodo: id, tipo_evento: 'archivo',
    metadata: {
      categoria: metadatos.categoria || 'Otro',
      notas: metadatos.notas || null,
      titulo: metadatos.titulo || null,
      tipo_medio: 'link',
      url,
    },
  });
  return data;
}

// La vista previa y la descarga de archivos viven en api/archivos.js
// (cabecera para la vista previa, boleto efímero para la descarga):
// el token de sesión ya no viaja en ninguna URL.
