import client from './client';

const base = (tipo, idNodo) =>
  tipo === 'etapa'  ? `/etapas/${idNodo}/miembros-nodo`  :
  tipo === 'tarea'  ? `/tareas/${idNodo}/miembros-nodo`  :
                      `/acciones/${idNodo}/miembros-nodo`;

export async function listarMiembrosNodo(tipo, idNodo) {
  const { data } = await client.get(base(tipo, idNodo));
  return data.datos;
}

export async function agregarMiembroNodo(tipo, idNodo, idUsuario, rol) {
  const { data } = await client.post(base(tipo, idNodo), { id_usuario: idUsuario, rol });
  return data;
}

export async function actualizarRolNodo(tipo, idNodo, idUsuario, rol) {
  const { data } = await client.put(`${base(tipo, idNodo)}/${idUsuario}`, { rol });
  return data;
}

export async function eliminarMiembroNodo(tipo, idNodo, idUsuario) {
  const { data } = await client.delete(`${base(tipo, idNodo)}/${idUsuario}`);
  return data;
}
