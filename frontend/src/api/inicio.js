import client from './client';

// filtro: { proyectoIds?: string[], carteraId?: string } — mutuamente
// excluyentes (si llegan los dos, el backend prioriza carteraId).
export async function obtenerInicio(filtro = {}) {
  const params = {};
  if (filtro.carteraId) params.cartera_id = filtro.carteraId;
  else if (filtro.proyectoIds?.length) params.proyecto_ids = filtro.proyectoIds.join(',');
  const { data } = await client.get('/inicio', { params });
  return data.datos;
}

export async function obtenerProyectosFiltroInicio() {
  const { data } = await client.get('/inicio/filtros/proyectos');
  return data.datos;
}

export async function obtenerCarterasFiltroInicio() {
  const { data } = await client.get('/inicio/filtros/carteras');
  return data.datos;
}

// Conteos para las tarjetas de acceso de la pantalla de Inicio (el
// concentrador, no el Tablero) — ver inicio.controller.js::obtenerResumenTarjetas.
export async function obtenerResumenTarjetasInicio() {
  const { data } = await client.get('/inicio/resumen-tarjetas');
  return data.datos;
}
