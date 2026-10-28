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

// Un solo indicador por su id, con proyecto/DG dueño y sus metas/periodos
// — usado por la pantalla de detalle del módulo de Indicadores.
export async function obtenerIndicador(indicadorId) {
  const { data } = await client.get(`/indicadores/${indicadorId}`);
  return data.datos;
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

// Nodos (etapa/acción/tarea) que aportan a este indicador — usado por la
// pantalla de detalle para listar/editar/quitar cada vínculo.
export async function obtenerAportacionesIndicador(indicadorId) {
  const { data } = await client.get(`/indicadores/${indicadorId}/aportaciones`);
  return data.datos || [];
}

// Aportaciones
const RUTA_NODO = { etapa: 'etapas', accion: 'acciones', tarea: 'tareas' };

export async function obtenerAportacionesNodo(tipo, nodoId, incluirHijos = false) {
  const { data } = await client.get(`/${RUTA_NODO[tipo] || 'acciones'}/${nodoId}/aportaciones`, { params: { incluirHijos } });
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

// Todos los indicadores de los proyectos donde participa el usuario
// (superadmin/ejecutivo ven todos) — módulo de Indicadores, "Mis indicadores".
export async function listarMios({ proyectoIds, carteraId } = {}) {
  const params = new URLSearchParams();
  if (carteraId) params.set('cartera_id', carteraId);
  else if (proyectoIds?.length) params.set('proyecto_ids', proyectoIds.join(','));
  const { data } = await client.get(`/indicadores/mios?${params}`);
  return data.datos || [];
}

// Historial de movimientos (migración 084) — reemplaza al viejo
// PATCH /indicadores/:id/valor, que pisaba valor_actual sin dejar
// rastro. Cada captura, automática o a mano, queda como un renglón.
export async function listarMovimientosIndicador(indicadorId) {
  const { data } = await client.get(`/indicadores/${indicadorId}/movimientos`);
  return data.datos || [];
}

// Captura a mano. `cantidad` es la diferencia a sumar (puede ser
// negativa), no el total — quien llama con un valor absoluto en mente
// calcula la diferencia contra `valor_actual` antes de llamar esto (ver
// usarCapturaValorIndicador). `idNodoOrigen` es opcional: desde la
// pestaña Indicadores de un nodo en Seguimiento se manda el nodo, para
// que el historial diga de dónde vino; desde la ficha del indicador se
// omite.
export async function crearMovimientoIndicador(indicadorId, { cantidad, fecha, nota, idNodoOrigen } = {}) {
  const { data } = await client.post(`/indicadores/${indicadorId}/movimientos`, {
    cantidad, fecha, nota, id_nodo_origen: idNodoOrigen,
  });
  return data;
}

export async function anularMovimientoIndicador(movimientoId, motivo) {
  const { data } = await client.patch(`/movimientos/${movimientoId}/anular`, { motivo });
  return data;
}
