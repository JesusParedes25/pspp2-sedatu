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

// Entradas parecidas por similitud de texto (pg_trgm) — para sugerirlas
// ANTES de crear una nueva, en vez de dejar que el usuario cree un
// duplicado con otra redacción (acentos, espacios, singular/plural).
export async function buscarSimilares(nombre, excluirId) {
  const { data } = await client.get('/catalogo-indicadores/similares', {
    params: { q: nombre, excluir_id: excluirId || undefined },
  });
  return data.datos || [];
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
