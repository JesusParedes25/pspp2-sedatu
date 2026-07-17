import client from './client';

export async function obtenerResumenEstados(filtros = {}) {
  const params = new URLSearchParams();
  if (filtros.id_dg) params.set('id_dg', filtros.id_dg);
  const { data } = await client.get(`/mapa/resumen-estados?${params}`);
  return data.datos;
}

export async function obtenerResumenTerritorial(idEstado, filtros = {}) {
  const params = new URLSearchParams();
  if (filtros.id_dg) params.set('id_dg', filtros.id_dg);
  const { data } = await client.get(`/mapa/estado/${idEstado}?${params}`);
  return data.datos;
}
