/**
 * ARCHIVO: carteras.js
 * PROPÓSITO: Funciones de API para carteras de proyectos.
 */
import client from './client';

export async function listarCarteras(filtros = {}) {
  const { data } = await client.get('/carteras', { params: filtros });
  return data;
}

export async function obtenerCartera(id) {
  const { data } = await client.get(`/carteras/${id}`);
  return data;
}

export async function crearCartera(datos) {
  const { data } = await client.post('/carteras', datos);
  return data;
}

export async function actualizarCartera(id, datos) {
  const { data } = await client.put(`/carteras/${id}`, datos);
  return data;
}

export async function eliminarCartera(id) {
  const { data } = await client.delete(`/carteras/${id}`);
  return data;
}

export async function confirmarEliminarCartera(id) {
  const { data } = await client.get(`/carteras/${id}/confirmar-eliminar`);
  return data;
}

export async function listarProyectosDeCartera(id) {
  const { data } = await client.get(`/carteras/${id}/proyectos`);
  return data;
}

export async function obtenerResumenCartera(id) {
  const { data } = await client.get(`/carteras/${id}/resumen`);
  return data;
}

export async function agregarProyectosACartera(id, proyectoIds, esPrincipal = false) {
  const { data } = await client.post(`/carteras/${id}/proyectos`, { proyecto_ids: proyectoIds, es_principal: esPrincipal });
  return data;
}

export async function quitarProyectoDeCartera(id, proyectoId) {
  const { data } = await client.delete(`/carteras/${id}/proyectos/${proyectoId}`);
  return data;
}
