/**
 * ARCHIVO: notificaciones.js
 * PROPÓSITO: Funciones de API para notificaciones del usuario.
 *
 * MINI-CLASE: Polling de notificaciones
 * ─────────────────────────────────────────────────────────────────
 * El frontend llama a obtenerNotificaciones() cada 30 segundos
 * para actualizar el badge y la lista. marcarLeida() se llama al
 * hacer click en una notificación. marcarTodasLeidas() limpia
 * todas de un golpe desde el botón del header.
 * ─────────────────────────────────────────────────────────────────
 */
import client from './client';

export async function obtenerNotificaciones() {
  const { data } = await client.get('/notificaciones');
  return data;
}

export async function marcarLeida(id) {
  const { data } = await client.put(`/notificaciones/${id}/leer`);
  return data;
}

export async function marcarTodasLeidas() {
  const { data } = await client.put('/notificaciones/leer-todas');
  return data;
}
