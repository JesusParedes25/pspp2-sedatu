/**
 * ARCHIVO: solicitudes.js
 * PROPÓSITO: Solicitudes de participación — el camino inverso a la
 *            invitación: pedir entrar a un proyecto, y resolver las que
 *            te llegan.
 */
import client from './client';

// Pedir participar. El motivo es opcional.
export async function solicitarParticipacion(proyectoId, { funcion = 'colaborador', motivo } = {}) {
  const { data } = await client.post(`/proyectos/${proyectoId}/solicitudes`, { funcion, motivo });
  return data.datos;
}

// Las que yo mandé, con en qué quedaron.
export async function misSolicitudes() {
  const { data } = await client.get('/mis-solicitudes');
  return data.datos;
}

// Las que me toca resolver, de todos mis proyectos.
export async function solicitudesPorResolver() {
  const { data } = await client.get('/solicitudes-por-resolver');
  return data.datos;
}

// respuesta: 'aceptar' | 'declinar'. El motivo es opcional en ambas.
export async function responderSolicitud(idSolicitud, respuesta, motivo) {
  const { data } = await client.post(`/solicitudes/${idSolicitud}/responder`, { respuesta, motivo });
  return data.datos;
}
