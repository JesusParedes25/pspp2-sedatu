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

export async function listarTodosPorProyecto(proyectoId) {
  const { data } = await client.get(`/proyectos/${proyectoId}/indicadores/todos`);
  return data.datos || [];
}

export async function obtenerResumenAportaciones(indicadorId) {
  const { data } = await client.get(`/indicadores/${indicadorId}/resumen-aportaciones`);
  return data;
}

export async function listarPublicables(filtros = {}) {
  const params = new URLSearchParams();
  if (filtros.id_dg) params.set('id_dg', filtros.id_dg);
  const { data } = await client.get(`/indicadores/publicos?${params}`);
  return data.datos;
}

export async function togglePublicable(indicadorId, esPublicable) {
  const { data } = await client.patch(`/indicadores/${indicadorId}/publicar`, { es_publicable: esPublicable });
  return data;
}

// Aportaciones
export async function obtenerAportacionesNodo(tipo, nodoId) {
  const { data } = await client.get(`/${tipo === 'etapa' ? 'etapas' : 'acciones'}/${nodoId}/aportaciones`);
  return data;
}

export async function crearAportacion(indicadorId, datos) {
  const { data } = await client.post(`/indicadores/${indicadorId}/aportaciones`, datos);
  return data;
}

export async function actualizarAportacion(id, datos) {
  const { data } = await client.patch(`/aportaciones/${id}`, datos);
  return data;
}

export async function eliminarAportacion(id) {
  const { data } = await client.delete(`/aportaciones/${id}`);
  return data;
}

export async function eliminarIndicadorConConfirm(indicadorId, confirmar = false) {
  const { data } = await client.delete(`/indicadores/${indicadorId}${confirmar ? '?confirmar=true' : ''}`);
  return data;
}

// Resumen con valores realizados
export async function obtenerResumenIndicadores(proyectoId) {
  const { data } = await client.get(`/proyectos/${proyectoId}/indicadores/resumen`);
  return data;
}
