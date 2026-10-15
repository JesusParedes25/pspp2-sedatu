/**
 * ARCHIVO: validar-funcion-lectura.js
 * PROPÓSITO: una sola función, reutilizada desde los tres caminos que
 *            pueden terminar en `nodo_miembros.rol = 'lectura'` o
 *            `proyecto_usuarios.rol = 'lectura'` — invitar/reasignar a
 *            nivel nodo, invitar/reasignar a nivel proyecto, y crear una
 *            solicitud de participación. "Lectura" (mostrada como
 *            "Invitado" en la interfaz) es la única forma de dar acceso
 *            a alguien ajeno a la Secretaría sin que capture nada — para
 *            personal de SEDATU la visibilidad ya es total
 *            (docs/modelo-permisos.md), así que "invitarlo solo para
 *            ver" no le agregaría nada.
 *
 * Antes de la Fase 4/parte A esta regla solo vivía dentro de
 * nodo-miembros.controller.js — se podía rodear por los otros dos
 * caminos (`POST /proyectos/:id/miembros`/`/invitaciones` con
 * `rol:'lectura'`, y una solicitud de participación con
 * `funcion:'lectura'`) sin que nada la rechazara, porque el CHECK de
 * `proyecto_usuarios.rol` (migración 079) y el de
 * `solicitudes_participacion.funcion` sí admiten ese valor.
 */
const pool = require('../db/pool');

async function rechazoLecturaParaInterno(idUsuario, funcion, db) {
  if (funcion !== 'lectura') return null;
  const conn = db || pool;
  const { rows } = await conn.query('SELECT rol FROM usuarios WHERE id = $1', [idUsuario]);
  if (rows[0]?.rol === 'externo') return null;
  return 'La función "invitado" es solo para usuarios externos a la Secretaría. '
    + 'Para personal de SEDATU usa responsable o colaborador.';
}

module.exports = { rechazoLecturaParaInterno };
