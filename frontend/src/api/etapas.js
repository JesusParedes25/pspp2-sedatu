/**
 * ARCHIVO: etapas.js
 * PROPÓSITO: Funciones de API para etapas de proyectos.
 *
 * MINI-CLASE: Rutas anidadas en la API
 * ─────────────────────────────────────────────────────────────────
 * Las etapas se listan y crean bajo /proyectos/:id/etapas (anidadas),
 * pero se leen, actualizan y eliminan bajo /etapas/:id (independientes).
 * Este patrón refleja la relación: "una etapa pertenece a un proyecto"
 * para crear/listar, pero "una etapa tiene identidad propia" para
 * operar sobre ella directamente.
 * ─────────────────────────────────────────────────────────────────
 */
import client from './client';

export async function obtenerEtapasProyecto(proyectoId, idDg) {
  const params = idDg ? { id_dg: idDg } : {};
  const { data } = await client.get(`/proyectos/${proyectoId}/etapas`, { params });
  return data;
}

export async function obtenerEtapa(id) {
  const { data } = await client.get(`/etapas/${id}`);
  return data;
}

export async function crearEtapa(proyectoId, datos) {
  const { data } = await client.post(`/proyectos/${proyectoId}/etapas`, datos);
  return data;
}

export async function actualizarEtapa(id, datos) {
  const { data } = await client.put(`/etapas/${id}`, datos);
  return data;
}

export async function eliminarEtapa(id) {
  const { data } = await client.delete(`/etapas/${id}`);
  return data;
}

export async function obtenerIndicadoresEtapa(etapaId) {
  const { data } = await client.get(`/etapas/${etapaId}/indicadores`);
  return data;
}

export async function obtenerTodosIndicadoresProyecto(proyectoId) {
  const { data } = await client.get(`/proyectos/${proyectoId}/indicadores/todos`);
  return data;
}
