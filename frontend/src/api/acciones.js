/**
 * ARCHIVO: acciones.js
 * PROPÓSITO: Funciones de API para acciones.
 *
 * MINI-CLASE: Acciones como nivel atómico de seguimiento
 * ─────────────────────────────────────────────────────────────────
 * Las acciones son el único nivel donde el porcentaje se edita
 * manualmente. actualizarAccion() es la función más crítica porque
 * al llamar PUT /acciones/:id, el backend dispara el recálculo en
 * cascada de la etapa y luego del proyecto completo.
 * ─────────────────────────────────────────────────────────────────
 */
import client from './client';

export async function obtenerAccionesEtapa(etapaId) {
  const { data } = await client.get(`/etapas/${etapaId}/acciones`);
  return data;
}

export async function obtenerAccionesDirectas(proyectoId) {
  const { data } = await client.get(`/proyectos/${proyectoId}/acciones`);
  return data;
}

export async function obtenerAccion(id) {
  const { data } = await client.get(`/acciones/${id}`);
  return data;
}

export async function crearAccionEnEtapa(etapaId, datos) {
  const { data } = await client.post(`/etapas/${etapaId}/acciones`, datos);
  return data;
}

export async function crearAccionEnProyecto(proyectoId, datos) {
  const { data } = await client.post(`/proyectos/${proyectoId}/acciones`, datos);
  return data;
}

export async function actualizarAccion(id, datos) {
  const { data } = await client.put(`/acciones/${id}`, datos);
  return data;
}

export async function eliminarAccion(id) {
  const { data } = await client.delete(`/acciones/${id}`);
  return data;
}

export async function obtenerSubacciones(accionId) {
  const { data } = await client.get(`/acciones/${accionId}/subacciones`);
  return data;
}

export async function crearSubaccion(accionPadreId, datos) {
  const { data } = await client.post(`/acciones/${accionPadreId}/subacciones`, datos);
  return data;
}

export async function importarCSV(proyectoId, filas) {
  const { data } = await client.post(`/proyectos/${proyectoId}/importar-csv`, { filas });
  return data;
}

export async function toggleSubaccion(subaccionId) {
  const { data } = await client.put(`/subacciones/${subaccionId}/toggle`);
  return data;
}

export async function obtenerAgenda(params = {}) {
  const { data } = await client.get('/agenda', { params });
  return data;
}
