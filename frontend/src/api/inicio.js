import client from './client';

export async function obtenerInicio() {
  const { data } = await client.get('/inicio');
  return data.datos;
}
