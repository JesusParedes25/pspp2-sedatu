/**
 * ARCHIVO: catalogo-indicadores.js
 * PROPÓSITO: Cliente del catálogo único de indicadores.
 */
import client from './client';

export async function listarCatalogoIndicadores({ busqueda, incluirInactivos, instrumento, producto, objetivo, estrategia, area, pagina, limite } = {}) {
  const { data } = await client.get('/catalogo-indicadores', {
    params: {
      busqueda: busqueda || undefined,
      incluir_inactivos: incluirInactivos ? 'true' : undefined,
      instrumento: instrumento || undefined,
      producto: producto || undefined,
      objetivo: objetivo || undefined,
      estrategia: estrategia || undefined,
      area: area || undefined,
      pagina: pagina || undefined,
      limite: limite || undefined,
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

// Áreas responsables (UR) individuales presentes en el catálogo — filtro
// secundario opcional "Área responsable" (útil para quien ya sabe desde
// qué área trabaja, sin necesitar saber objetivo/estrategia numérico).
export async function listarAreasCatalogo() {
  const { data } = await client.get('/catalogo-indicadores/areas');
  return data.datos || [];
}

// Títulos oficiales de objetivos/estrategias del PSEDATU 2025-2030, si ya
// se cargaron (tablas nuevas, vacías hasta que alguien las llene desde el
// documento oficial) — la migaja de pan de cada tarjeta los usa cuando
// existen y muestra solo el número cuando no.
export async function obtenerTitulosPsedatu() {
  const { data } = await client.get('/catalogo-indicadores/psedatu/titulos');
  return data.datos || { objetivos: {}, estrategias: {} };
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

// Para quien no puede dar de alta (rol 'externo'): en vez de un 403, le
// manda a los administradores un aviso con lo que necesita.
export async function solicitarIndicadorCatalogo({ nombre, motivo }) {
  const { data } = await client.post('/catalogo-indicadores/solicitar', { nombre, motivo });
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

// Una sola entrada del catálogo, completa — alimenta la página de
// detalle (DetalleCatalogo.jsx).
export async function obtenerIndicadorCatalogo(id) {
  const { data } = await client.get(`/catalogo-indicadores/${id}`);
  return data.datos;
}

// En qué proyectos se usa — lectura abierta a cualquier usuario, igual
// que el resto del catálogo (no es una operación que afecte el proyecto
// de nadie, a diferencia de editar/dar de baja/eliminar).
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

// Borrado real, distinto de cambiarActivoIndicadorCatalogo (dar de
// baja): solo tiene éxito si ningún proyecto usa esta entrada todavía
// — el backend lo valida y responde 409 si no. Irreversible; la
// pantalla debe pedir confirmación con el nombre antes de llamar esto.
export async function eliminarIndicadorCatalogo(id) {
  const { data } = await client.delete(`/catalogo-indicadores/${id}`);
  return data;
}
