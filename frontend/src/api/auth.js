/**
 * ARCHIVO: auth.js
 * PROPÓSITO: Funciones de API para autenticación.
 *
 * MINI-CLASE: Capa de API como abstracción
 * ─────────────────────────────────────────────────────────────────
 * Cada archivo en api/ exporta funciones que encapsulan una petición
 * HTTP específica. Los componentes nunca llaman a axios directamente;
 * llaman a estas funciones. Esto centraliza la lógica de peticiones
 * y facilita cambiar la URL o el formato de la petición en un solo
 * lugar sin tocar ningún componente.
 * ─────────────────────────────────────────────────────────────────
 */
import client from './client';

export async function login(correo, password) {
  const { data } = await client.post('/auth/login', { correo, password });
  return data;
}

export async function obtenerUsuarioActual() {
  const { data } = await client.get('/auth/me');
  return data;
}
