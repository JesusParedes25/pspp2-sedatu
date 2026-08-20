/**
 * ARCHIVO: proyectos.js
 * PROPÓSITO: Funciones de API para proyectos y proyecto_dgs.
 *
 * MINI-CLASE: Parámetros de query en GET requests
 * ─────────────────────────────────────────────────────────────────
 * axios convierte el objeto { params } en query string automáticamente:
 * { estado: 'En_proceso', pagina: 1 } → ?estado=En_proceso&pagina=1
 * Los parámetros undefined se omiten automáticamente, lo que permite
 * pasar filtros opcionales sin lógica condicional adicional.
 * ─────────────────────────────────────────────────────────────────
 */
import client from './client';
import { nombreDeContentDisposition } from '../utils/nombreDescarga';

export async function listarProyectos(filtros = {}) {
  const { data } = await client.get('/proyectos', { params: filtros });
  return data;
}

// Qué puede hacer el usuario actual en este proyecto, según el servidor:
// editar la ficha, capturar, eliminar, designar participantes, y en qué
// nodos concretos puede capturar si su acceso es parcial.
export async function obtenerMisPermisos(id) {
  const { data } = await client.get(`/proyectos/${id}/mis-permisos`);
  return data.datos;
}

export async function obtenerProyecto(id) {
  const { data } = await client.get(`/proyectos/${id}`);
  return data;
}

// Descarga la estructura completa del proyecto (Etapa → Acción →
// Subacción → Tarea) como archivo .xlsx o .csv. El nombre del archivo lo
// arma el propio servidor y llega en el header Content-Disposition — se
// extrae de ahí en vez de reconstruirlo aquí, para que quede idéntico al
// que ya sanitizó el backend (sin repetir esa lógica en el frontend).
export async function exportarProyecto(id, formato = 'xlsx') {
  const response = await client.get(`/proyectos/${id}/exportar`, {
    params: { formato },
    responseType: 'blob',
  });

  const nombreArchivo = nombreDeContentDisposition(
    response.headers['content-disposition'], `proyecto.${formato}`);

  const url = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}

export async function crearProyecto(datos) {
  const { data } = await client.post('/proyectos', datos);
  return data;
}

export async function actualizarProyecto(id, datos) {
  const { data } = await client.put(`/proyectos/${id}`, datos);
  return data;
}

export async function eliminarProyecto(id) {
  const { data } = await client.delete(`/proyectos/${id}`);
  return data;
}

export async function listarProyectosEliminados() {
  const { data } = await client.get('/proyectos/eliminados');
  return data;
}

export async function restaurarProyecto(id) {
  const { data } = await client.patch(`/proyectos/${id}/restaurar`);
  return data;
}

export async function purgarProyecto(id) {
  const { data } = await client.delete(`/proyectos/${id}/purgar`);
  return data;
}

export async function obtenerDGsProyecto(id) {
  const { data } = await client.get(`/proyectos/${id}/dgs`);
  return data;
}

export async function agregarDGProyecto(id, datos) {
  const { data } = await client.post(`/proyectos/${id}/dgs`, datos);
  return data;
}

export async function eliminarDGProyecto(proyectoId, dgId) {
  const { data } = await client.delete(`/proyectos/${proyectoId}/dgs/${dgId}`);
  return data;
}

export async function obtenerEtiquetasProyecto(id) {
  const { data } = await client.get(`/proyectos/${id}/etiquetas`);
  return data;
}

export async function subirImagenProyecto(id, archivo) {
  const formData = new FormData();
  formData.append('imagen', archivo);
  const { data } = await client.post(`/proyectos/${id}/imagen`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

// Crea un proyecto nuevo copiando la estructura de `id`.
// `incluir` es { fechas, territorio, indicadores, participantes, archivos }.
export async function duplicarProyecto(id, { nombre, incluir }) {
  const { data } = await client.post(`/proyectos/${id}/duplicar`, { nombre, incluir });
  return data;
}
