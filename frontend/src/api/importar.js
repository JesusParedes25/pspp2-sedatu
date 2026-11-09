/**
 * ARCHIVO: importar.js
 * PROPÓSITO: Funciones de API para el importador universal.
 */
import client from './client';
import { transferir, conTiempoDeProceso } from './transferencias';

// La subida va por transferir() (avance y "dejó de avanzar"); preview y
// confirmar recorren o insertan todas las filas en el servidor antes de
// contestar, así que llevan el límite de proceso (5 min), no el de 30 s.

export async function uploadArchivo(file, { onProgreso } = {}) {
  const formData = new FormData();
  formData.append('archivo', file);
  // El importador tiene su propio máximo de 10 MB (backend/src/routes/
  // importar.routes.js), así que no se valida aquí contra el general.
  const { data } = await transferir({ method: 'post', url: '/importar/upload', data: formData }, { direccion: 'subida', onProgreso });
  return data;
}

export async function extraerHeaders({ fileId, headerRow, superHeaderRow, dataStartRow, sheetIndex }) {
  const { data } = await client.post('/importar/extraer-headers', {
    fileId, headerRow, superHeaderRow, dataStartRow, sheetIndex,
  });
  return data;
}

export async function preview({ fileId, config, proyectoId, sheetIndex }) {
  const { data } = await client.post('/importar/preview', {
    fileId, config, proyectoId, sheetIndex,
  }, conTiempoDeProceso());
  return data;
}

export async function confirmar({ fileId, config, proyectoId, skipDuplicados, sheetIndex }) {
  const { data } = await client.post('/importar/confirmar', {
    fileId, config, proyectoId, skipDuplicados, sheetIndex,
  }, conTiempoDeProceso());
  return data;
}

export async function sugerirPlantilla(headers, superHeaders) {
  const { data } = await client.post('/importar/sugerir', { headers, superHeaders });
  return data;
}

export async function previewMultiHoja({ fileId, configMultiHoja, proyectoId }) {
  const { data } = await client.post('/importar/preview-multihoja', {
    fileId, configMultiHoja, proyectoId,
  }, conTiempoDeProceso());
  return data;
}

export async function confirmarMultiHoja({ fileId, configMultiHoja, proyectoId }) {
  const { data } = await client.post('/importar/confirmar-multihoja', {
    fileId, configMultiHoja, proyectoId,
  }, conTiempoDeProceso());
  return data;
}

export async function listarLotes(proyectoId) {
  const { data } = await client.get('/importar/lotes', { params: { proyectoId } });
  return data;
}

export async function eliminarLote(loteId, proyectoId) {
  const { data } = await client.post(`/importar/lotes/${loteId}/eliminar`, { proyectoId });
  return data;
}
