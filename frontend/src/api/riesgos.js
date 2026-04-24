/**
 * ARCHIVO: riesgos.js
 * PROPÓSITO: Funciones de API para riesgos y problemas.
 *
 * MINI-CLASE: CRUD estándar para riesgos
 * ─────────────────────────────────────────────────────────────────
 * Los riesgos se listan por proyecto (GET /proyectos/:id/riesgos)
 * pero se crean, leen, actualizan y eliminan de forma independiente
 * porque el body del POST incluye entidad_tipo + entidad_id que
 * indica a qué nivel pertenece el riesgo.
 * ─────────────────────────────────────────────────────────────────
 */
import client from './client';

export async function obtenerRiesgosProyecto(proyectoId) {
  const { data } = await client.get(`/proyectos/${proyectoId}/riesgos`);
  return data;
}

export async function obtenerRiesgosEtapa(etapaId) {
  const { data } = await client.get(`/etapas/${etapaId}/riesgos`);
  return data;
}

export async function obtenerRiesgo(id) {
  const { data } = await client.get(`/riesgos/${id}`);
  return data;
}

export async function crearRiesgo(datos) {
  const { data } = await client.post('/riesgos', datos);
  return data;
}

export async function actualizarRiesgo(id, datos) {
  const { data } = await client.put(`/riesgos/${id}`, datos);
  return data;
}

export async function obtenerRiesgosAccion(accionId) {
  const { data } = await client.get(`/acciones/${accionId}/riesgos`);
  return data;
}

export async function obtenerRiesgosSubaccion(subaccionId) {
  const { data } = await client.get(`/subacciones/${subaccionId}/riesgos`);
  return data;
}

export async function eliminarRiesgo(id) {
  const { data } = await client.delete(`/riesgos/${id}`);
  return data;
}
