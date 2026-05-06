/**
 * ARCHIVO: importar.js
 * PROPÓSITO: Funciones de API para el importador universal.
 */
import client from './client';

export async function uploadArchivo(file) {
  const formData = new FormData();
  formData.append('archivo', file);
  const { data } = await client.post('/importar/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  });
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
  });
  return data;
}

export async function confirmar({ fileId, config, proyectoId, skipDuplicados, sheetIndex }) {
  const { data } = await client.post('/importar/confirmar', {
    fileId, config, proyectoId, skipDuplicados, sheetIndex,
  });
  return data;
}

export async function sugerirPlantilla(headers) {
  const { data } = await client.post('/importar/sugerir', { headers });
  return data;
}
