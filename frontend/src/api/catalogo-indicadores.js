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

// En qué proyectos se usa — lectura abierta a cualquier usuario, igual
// que el resto del catálogo (no es una operación que afecte el proyecto
// de nadie, a diferencia de editar/retirar/fusionar).
export async function obtenerUsoIndicadorCatalogo(id) {
  const { data } = await client.get(`/catalogo-indicadores/${id}/uso`);
  return data;
}

// Qué etapas/acciones/tareas, de cualquier proyecto, aportan a esta
// entrada del catálogo — sección "Nodos vinculados" de la ficha.
export async function obtenerNodosVinculadosCatalogo(id) {
  const { data } = await client.get(`/catalogo-indicadores/${id}/nodos`);
  return data.datos || [];
}

// Fusiona 2+ entradas duplicadas del catálogo: reapunta los indicadores
// de proyecto de las perdedoras hacia la sobreviviente y retira las
// perdedoras. Irreversible — la pantalla debe pedir confirmación con el
// efecto en números antes de llamar esto.
export async function fusionarIndicadoresCatalogo(idSobrevive, idsFusionar) {
  const { data } = await client.post('/catalogo-indicadores/fusionar', {
    id_sobrevive: idSobrevive,
    ids_fusionar: idsFusionar,
  });
  return data;
}
