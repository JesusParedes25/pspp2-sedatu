/**
 * ARCHIVO: catalogo-indicadores.js
 * PROPÓSITO: Cliente del catálogo único de indicadores.
 */
import client from './client';

export async function listarCatalogoIndicadores({ busqueda, incluirInactivos } = {}) {
  const { data } = await client.get('/catalogo-indicadores', {
    params: {
      busqueda: busqueda || undefined,
      incluir_inactivos: incluirInactivos ? 'true' : undefined,
    },
  });
  return data;
}

export async function crearIndicadorCatalogo(datos) {
  const { data } = await client.post('/catalogo-indicadores', datos);
  return data;
}

export async function actualizarIndicadorCatalogo(id, datos) {
  const { data } = await client.put(`/catalogo-indicadores/${id}`, datos);
  return data;
}

export async function cambiarActivoIndicadorCatalogo(id, activo) {
  const { data } = await client.patch(`/catalogo-indicadores/${id}/activo`, { activo });
  return data;
}

// En qué proyectos se usa (solo superadmin) — la vista previa de lo que
// tendrá que exponer la API externa.
export async function obtenerUsoIndicadorCatalogo(id) {
  const { data } = await client.get(`/catalogo-indicadores/${id}/uso`);
  return data;
}
