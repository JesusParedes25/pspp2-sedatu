/**
 * ARCHIVO: indicadores.js
 * PROPÓSITO: Funciones de API para indicadores de proyecto.
 *
 * MINI-CLASE: CRUD de indicadores
 * ─────────────────────────────────────────────────────────────────
 * Los indicadores pueden ser de nivel proyecto (id_etapa IS NULL)
 * o de nivel etapa (id_etapa = uuid). Se crean bajo el proyecto,
 * pero se actualizan y eliminan directamente por su propio id.
 * ─────────────────────────────────────────────────────────────────
 */
import client from './client';

export async function crearIndicador(proyectoId, datos) {
  const { data } = await client.post(`/proyectos/${proyectoId}/indicadores`, datos);
  return data;
}

export async function actualizarIndicador(indicadorId, datos) {
  const { data } = await client.put(`/indicadores/${indicadorId}`, datos);
  return data;
}

export async function eliminarIndicador(indicadorId) {
  const { data } = await client.delete(`/indicadores/${indicadorId}`);
  return data;
}

export async function obtenerIndicadoresProyecto(proyectoId) {
  const { data } = await client.get(`/proyectos/${proyectoId}/indicadores`);
  return data;
}

export async function obtenerResumenAportaciones(indicadorId) {
  const { data } = await client.get(`/indicadores/${indicadorId}/resumen-aportaciones`);
  return data;
}
