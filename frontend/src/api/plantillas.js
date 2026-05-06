/**
 * ARCHIVO: plantillas.js
 * PROPÓSITO: Funciones de API para plantillas de importación.
 */
import client from './client';

export async function listarPlantillas() {
  const { data } = await client.get('/plantillas-importacion');
  return data;
}

export async function obtenerPlantilla(id) {
  const { data } = await client.get(`/plantillas-importacion/${id}`);
  return data;
}

export async function crearPlantilla({ nombre, descripcion, config }) {
  const { data } = await client.post('/plantillas-importacion', { nombre, descripcion, config });
  return data;
}

export async function actualizarPlantilla(id, { nombre, descripcion, config }) {
  const { data } = await client.put(`/plantillas-importacion/${id}`, { nombre, descripcion, config });
  return data;
}

export async function eliminarPlantilla(id) {
  const { data } = await client.delete(`/plantillas-importacion/${id}`);
  return data;
}

export async function descargarTemplate(id) {
  const response = await client.get(`/plantillas-importacion/${id}/descargar`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `template-${id}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
