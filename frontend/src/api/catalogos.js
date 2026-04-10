/**
 * ARCHIVO: catalogos.js
 * PROPÓSITO: Funciones de API para catálogos del sistema.
 *
 * MINI-CLASE: Catálogos como datos de referencia cacheables
 * ─────────────────────────────────────────────────────────────────
 * Los catálogos son datos que rara vez cambian (DGs, programas,
 * usuarios). El frontend los carga una vez al iniciar la app y
 * los cachea en memoria. Si algún componente necesita la lista de
 * DGs, usa el hook useProyectos o llama directamente a estas
 * funciones sin preocuparse por peticiones duplicadas.
 * ─────────────────────────────────────────────────────────────────
 */
import client from './client';

export async function obtenerDGs() {
  const { data } = await client.get('/catalogos/dgs');
  return data;
}

export async function obtenerUsuarios(idDg) {
  const params = idDg ? { id_dg: idDg } : {};
  const { data } = await client.get('/catalogos/usuarios', { params });
  return data;
}

export async function obtenerProgramas() {
  const { data } = await client.get('/catalogos/programas');
  return data;
}

export async function obtenerDireccionesArea(idDg) {
  const params = idDg ? { id_dg: idDg } : {};
  const { data } = await client.get('/catalogos/direcciones-area', { params });
  return data;
}
