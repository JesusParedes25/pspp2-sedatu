/**
 * ARCHIVO: catalogo-indicadores.js
 * PROPÓSITO: Cliente del catálogo único de indicadores.
 */
import client from './client';

export async function listarCatalogoIndicadores({ busqueda, incluirInactivos, instrumento, producto, objetivo, estrategia } = {}) {
  const { data } = await client.get('/catalogo-indicadores', {
    params: {
      busqueda: busqueda || undefined,
      incluir_inactivos: incluirInactivos ? 'true' : undefined,
      instrumento: instrumento || undefined,
      producto: producto || undefined,
      objetivo: objetivo || undefined,
      estrategia: estrategia || undefined,
    },
  });
  return data;
}

// Sugerencias en vivo para el combobox de "Producto" (Informe de
// Gobierno/Labores) — acotadas por instrumento.
export async function listarProductosCatalogo(busqueda, instrumento) {
  const { data } = await client.get('/catalogo-indicadores/productos', {
    params: { busqueda: busqueda || undefined, instrumento: instrumento || undefined },
  });
  return data.datos || [];
}

// Códigos de línea de acción del PSEDATU realmente presentes en el
// catálogo — el frontend deriva el filtro de 2 niveles (objetivo →
// estrategia) de esta lista.
export async function listarLineasAccionCatalogo() {
  const { data } = await client.get('/catalogo-indicadores/lineas-accion');
  return data.datos || [];
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

// Pares de entradas activas que se parecen entre sí (self-join pg_trgm
// sobre el catálogo completo) — alimenta la sugerencia automática de
// "Fusionar duplicados", antes de que el usuario tenga que adivinar
// cuáles son duplicados y seleccionarlos a mano uno por uno.
export async function buscarDuplicadosSugeridos(umbral) {
  const { data } = await client.get('/catalogo-indicadores/duplicados-sugeridos', {
    params: { umbral: umbral || undefined },
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
