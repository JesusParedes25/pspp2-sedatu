/**
 * ARCHIVO: siembra.js
 * PROPÓSITO: Saber si un catálogo ya recibió su siembra inicial, para
 *            que el arranque del backend no vuelva a insertar lo que el
 *            superadministrador ya decidió quitar desde el panel.
 *
 * MINI-CLASE: sembrar una vez, no en cada arranque
 * ─────────────────────────────────────────────────────────────────
 * Un catálogo institucional tiene que existir desde el primer arranque
 * —si no, una instalación nueva nace vacía y no se puede ni dar de alta
 * un usuario—, pero solo el primero. Repetir la siembra en cada
 * reinicio convierte al arranque en la autoridad sobre el catálogo, y
 * entonces el panel de administración deja de serlo: lo que ahí se
 * elimina reaparece al siguiente `docker compose up`.
 *
 * La marca vive en la tabla `siembra_inicial` (migración 055) y no
 * caduca. Mientras la clave esté, la lista del código es solo el punto
 * de partida histórico; la verdad vigente es lo que haya en la base.
 * ─────────────────────────────────────────────────────────────────
 */

async function yaSembrado(client, clave) {
  const { rows } = await client.query(
    'SELECT 1 FROM siembra_inicial WHERE clave = $1', [clave]);
  return rows.length > 0;
}

async function marcarSembrado(client, clave, detalle) {
  await client.query(`
    INSERT INTO siembra_inicial (clave, detalle)
    VALUES ($1, $2)
    ON CONFLICT (clave) DO NOTHING
  `, [clave, detalle || null]);
}

module.exports = { yaSembrado, marcarSembrado };
