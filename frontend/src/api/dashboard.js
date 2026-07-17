import client from './client';

export async function obtenerDashboard(filtros = {}) {
  const params = new URLSearchParams();
  if (filtros.id_dg) params.set('id_dg', filtros.id_dg);
  const { data } = await client.get(`/dashboard?${params}`);
  return data.datos;
}
