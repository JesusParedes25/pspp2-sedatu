/**
 * ARCHIVO: estado.js
 * PROPÓSITO: Funciones de API para el endpoint genérico de cambio de estado
 *            y conteo de descendientes.
 *
 * MINI-CLASE: Endpoint genérico vs endpoints por recurso
 * ─────────────────────────────────────────────────────────────────
 * PUT /estado permite cambiar el estado de cualquier entidad
 * (Proyecto, Etapa, Accion, Subaccion) desde un solo punto.
 * GET /conteo-descendientes retorna cuántos hijos se verían
 * afectados por una cancelación en cascada, para que el frontend
 * muestre un diálogo de confirmación informativo.
 * ─────────────────────────────────────────────────────────────────
 */
import client from './client';

export async function cambiarEstado(entidadTipo, entidadId, estado, opciones = {}) {
  const { data } = await client.put('/estado', {
    entidad_tipo: entidadTipo,
    entidad_id: entidadId,
    estado,
    motivo_bloqueo: opciones.motivoBloqueo || undefined,
    nota_resolucion: opciones.notaResolucion || undefined
  });
  return data;
}

export async function contarDescendientes(entidadTipo, entidadId) {
  const { data } = await client.get('/conteo-descendientes', {
    params: { entidad_tipo: entidadTipo, entidad_id: entidadId }
  });
  return data;
}
