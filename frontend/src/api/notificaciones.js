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

// Cuenta combinada para la campanita: avisos sin leer + invitaciones
// pendientes + solicitudes por resolver. Un aviso se lee y se olvida,
// pero una invitación o una solicitud son pendientes de verdad — si la
// campanita solo contara avisos, alguien con una solicitud esperando la
// vería en cero y pensaría que no tiene nada por atender.
export async function obtenerResumen() {
  const { data } = await client.get('/notificaciones/resumen');
  return data.datos;
}

export async function marcarLeida(id) {
  const { data } = await client.put(`/notificaciones/${id}/leer`);
  return data;
}

export async function marcarTodasLeidas() {
  const { data } = await client.put('/notificaciones/leer-todas');
  return data;
}
