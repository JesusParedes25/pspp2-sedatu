/**
 * ARCHIVO: tareas.js
 * PROPÓSITO: Funciones de API para tareas (hijas de acciones).
 */
import client from './client';

export async function obtenerTareasPorAccion(accionId) {
  const { data } = await client.get(`/acciones/${accionId}/tareas`);
  return data;
}

export async function crearTarea(accionId, datos) {
  const { data } = await client.post(`/acciones/${accionId}/tareas`, datos);
  return data;
}

export async function actualizarTarea(id, datos) {
  const { data } = await client.put(`/tareas/${id}`, datos);
  return data;
}

export async function patchTarea(id, datos) {
  const { data } = await client.patch(`/tareas/${id}`, datos);
  return data;
}

export async function eliminarTarea(id) {
  const { data } = await client.delete(`/tareas/${id}`);
  return data;
}
