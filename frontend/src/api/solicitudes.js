/**
 * ARCHIVO: solicitudes.js
 * PROPÓSITO: Solicitudes de participación — el camino inverso a la
 *            invitación: pedir entrar a un proyecto, y resolver las que
 *            te llegan.
 */
import client from './client';

// Pedir participar en TODO el proyecto. El motivo es opcional.
export async function solicitarParticipacion(proyectoId, { funcion = 'colaborador', motivo } = {}) {
  const { data } = await client.post(`/proyectos/${proyectoId}/solicitudes`, { funcion, motivo });
  return data.datos;
}

// Pedir participar solo en una etapa, acción o tarea. Es lo que necesita
// quien aporta a una parte concreta: pedir el proyecto entero sería pedir
// de más, y quien decide lo nota.
const RUTA_NODO = { etapa: 'etapas', accion: 'acciones', tarea: 'tareas' };

export async function solicitarParticipacionNodo(tipo, idNodo, { funcion = 'colaborador', motivo } = {}) {
  const ruta = RUTA_NODO[tipo];
  if (!ruta) throw new Error(`Tipo de nodo inválido: ${tipo}`);
  const { data } = await client.post(`/${ruta}/${idNodo}/solicitudes`, { funcion, motivo });
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
