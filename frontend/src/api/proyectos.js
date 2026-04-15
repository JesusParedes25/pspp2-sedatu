/**
 * ARCHIVO: proyectos.js
 * PROPÓSITO: Funciones de API para proyectos y proyecto_dgs.
 *
 * MINI-CLASE: Parámetros de query en GET requests
 * ─────────────────────────────────────────────────────────────────
 * axios convierte el objeto { params } en query string automáticamente:
 * { estado: 'En_proceso', pagina: 1 } → ?estado=En_proceso&pagina=1
 * Los parámetros undefined se omiten automáticamente, lo que permite
 * pasar filtros opcionales sin lógica condicional adicional.
 * ─────────────────────────────────────────────────────────────────
 */
import client from './client';

export async function listarProyectos(filtros = {}) {
  const { data } = await client.get('/proyectos', { params: filtros });
  return data;
}

export async function obtenerProyecto(id) {
  const { data } = await client.get(`/proyectos/${id}`);
  return data;
}

export async function crearProyecto(datos) {
  const { data } = await client.post('/proyectos', datos);
  return data;
}

export async function actualizarProyecto(id, datos) {
  const { data } = await client.put(`/proyectos/${id}`, datos);
  return data;
}

export async function eliminarProyecto(id) {
  const { data } = await client.delete(`/proyectos/${id}`);
  return data;
}

export async function obtenerDGsProyecto(id) {
  const { data } = await client.get(`/proyectos/${id}/dgs`);
  return data;
}

export async function agregarDGProyecto(id, datos) {
  const { data } = await client.post(`/proyectos/${id}/dgs`, datos);
  return data;
}

export async function eliminarDGProyecto(proyectoId, dgId) {
  const { data } = await client.delete(`/proyectos/${proyectoId}/dgs/${dgId}`);
  return data;
}

export async function obtenerEtiquetasProyecto(id) {
  const { data } = await client.get(`/proyectos/${id}/etiquetas`);
  return data;
}

export async function subirImagenProyecto(id, archivo) {
  const formData = new FormData();
  formData.append('imagen', archivo);
  const { data } = await client.post(`/proyectos/${id}/imagen`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
