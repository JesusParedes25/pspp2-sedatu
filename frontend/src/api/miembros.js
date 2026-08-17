import client from './client';

export async function listarMiembros(proyectoId) {
  const { data } = await client.get(`/proyectos/${proyectoId}/miembros`);
  return data.datos;
}

export async function agregarMiembro(proyectoId, idUsuario, rol) {
  const { data } = await client.post(`/proyectos/${proyectoId}/miembros`, { id_usuario: idUsuario, rol });
  return data;
}

export async function eliminarMiembro(proyectoId, userId) {
  const { data } = await client.delete(`/proyectos/${proyectoId}/miembros/${userId}`);
  return data;
}

export async function listarInvitaciones(proyectoId) {
  const { data } = await client.get(`/proyectos/${proyectoId}/invitaciones`);
  return data.datos;
}

export async function crearInvitacion(proyectoId, id_usuario, rol = 'colaborador') {
  const { data } = await client.post(`/proyectos/${proyectoId}/invitaciones`, { id_usuario, rol });
  return data;
}

export async function aceptarInvitacion(token) {
  const { data } = await client.post(`/invitaciones/${token}/aceptar`);
  return data;
}

export async function cancelarInvitacion(invitacionId) {
  const { data } = await client.delete(`/invitaciones/${invitacionId}`);
  return data;
}

export async function obtenerPanorama(proyectoId) {
  const { data } = await client.get(`/proyectos/${proyectoId}/panorama`);
  return data.datos;
}

// ─── Invitaciones internas ────────────────────────────────────────
// Invitar propone; la persona acepta o rechaza. Estas funciones son las
// del lado del invitado.

export async function misInvitaciones() {
  const { data } = await client.get('/mis-invitaciones');
  return data.datos;
}

// Responde una invitación a todo un proyecto.
export async function responderInvitacionProyecto(proyectoId, respuesta, motivo) {
  const { data } = await client.post(`/proyectos/${proyectoId}/miembros/responder`, { respuesta, motivo });
  return data.datos;
}

// Responde una invitación a una etapa, acción o tarea concreta.
const RUTA_POR_TIPO = { etapa: 'etapas', accion: 'acciones', tarea: 'tareas' };

export async function responderInvitacionNodo(tipo, idNodo, respuesta, motivo) {
  const ruta = RUTA_POR_TIPO[tipo];
  if (!ruta) throw new Error(`Tipo de nodo inválido: ${tipo}`);
  const { data } = await client.post(`/${ruta}/${idNodo}/miembros-nodo/responder`, { respuesta, motivo });
  return data.datos;
}
