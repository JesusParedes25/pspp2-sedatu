/**
 * ARCHIVO: bloqueos.js
 * PROPÓSITO: Funciones de API para bloqueos.
 *
 * MINI-CLASE: Bloqueos polimórficos
 * ─────────────────────────────────────────────────────────────────
 * Los bloqueos viven en una tabla independiente con entidad_tipo +
 * entidad_id. Cada entidad puede tener máximo un bloqueo activo.
 * La creación ocurre automáticamente al cambiar estado a Bloqueada,
 * pero se pueden consultar y resolver desde aquí.
 * ─────────────────────────────────────────────────────────────────
 */
import client from './client';

export async function obtenerBloqueoActivo(entidadTipo, entidadId) {
  const { data } = await client.get('/bloqueos/activo', {
    params: { entidad_tipo: entidadTipo, entidad_id: entidadId }
  });
  return data;
}

export async function listarHistorialBloqueos(entidadTipo, entidadId) {
  const { data } = await client.get('/bloqueos', {
    params: { entidad_tipo: entidadTipo, entidad_id: entidadId }
  });
  return data;
}

export async function resolverBloqueo(bloqueoId, notaResolucion) {
  const { data } = await client.put(`/bloqueos/${bloqueoId}/resolver`, {
    nota_resolucion: notaResolucion
  });
  return data;
}
