/**
 * ARCHIVO: etiquetas.js
 * PROPÓSITO: API de autocompletado de etiquetas — sugiere etiquetas ya
 *            usadas en algún proyecto mientras se escribe, para reducir
 *            duplicados por variación de palabras ("Vivienda"/"vivienda").
 */
import client from './client';

export async function buscarEtiquetas(q, limite) {
  const { data } = await client.get('/catalogos/etiquetas', { params: { q, limite } });
  return data;
}
