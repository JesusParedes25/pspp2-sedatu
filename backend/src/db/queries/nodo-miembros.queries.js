/**
 * ARCHIVO: nodo-miembros.queries.js
 * PROPÓSITO: Queries SQL para miembros asignados a etapas y acciones específicas.
 */
const pool = require('../pool');

async function listarMiembros(tipo, idNodo, db) {
  if (!['etapa', 'accion', 'tarea'].includes(tipo)) throw new Error(`Tipo de nodo inválido: ${tipo}`);
  const conn = db || pool;
  const tabla = tipo === 'etapa' ? 'etapas' : tipo === 'tarea' ? 'tareas' : 'acciones';

  const { rows } = await conn.query(`
    SELECT
      u.id        AS id_usuario,
      u.nombre_completo,
      u.correo,
      dg.siglas   AS dg_siglas,
      src.rol,
      src.es_responsable_principal,
      src.id_invitado_por,
      inv.nombre_completo AS invitado_por_nombre,
      src.created_at
    FROM (
      -- Responsable principal (columna id_responsable en la tabla padre)
      SELECT
        t.id_responsable            AS id_usuario,
        'responsable'               AS rol,
        true                        AS es_responsable_principal,
        NULL::uuid                  AS id_invitado_por,
        t.created_at
      FROM ${tabla} t
      WHERE t.id = $2 AND t.id_responsable IS NOT NULL

      UNION ALL

      -- Miembros adicionales del equipo (excluyendo al responsable principal)
      SELECT
        nm.id_usuario,
        nm.rol,
        false                       AS es_responsable_principal,
        nm.id_invitado_por,
        nm.created_at
      FROM nodo_miembros nm
      WHERE nm.tipo_nodo = $1 AND nm.id_nodo = $2
        AND nm.id_usuario NOT IN (
          SELECT t2.id_responsable
          FROM ${tabla} t2
          WHERE t2.id = $2 AND t2.id_responsable IS NOT NULL
        )
    ) src
    JOIN usuarios u ON u.id = src.id_usuario
    LEFT JOIN direcciones_generales dg ON dg.id = u.id_dg
    LEFT JOIN usuarios inv ON inv.id = src.id_invitado_por
    ORDER BY
      src.es_responsable_principal DESC,
      CASE src.rol WHEN 'responsable' THEN 1 WHEN 'colaborador' THEN 2 ELSE 3 END,
      u.nombre_completo
  `, [tipo, idNodo]);
  return rows;
}

async function agregarMiembro(tipo, idNodo, idUsuario, rol, idInvitadoPor, db) {
  if (!['etapa', 'accion', 'tarea'].includes(tipo)) throw new Error(`Tipo de nodo inválido: ${tipo}`);
  const conn = db || pool;
  const { rows } = await conn.query(`
    INSERT INTO nodo_miembros (tipo_nodo, id_nodo, id_usuario, rol, id_invitado_por)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (tipo_nodo, id_nodo, id_usuario) DO UPDATE SET rol = EXCLUDED.rol
    RETURNING *
  `, [tipo, idNodo, idUsuario, rol || 'colaborador', idInvitadoPor || null]);
  return rows[0];
}

async function actualizarRol(tipo, idNodo, idUsuario, rol, db) {
  const conn = db || pool;
  const { rows } = await conn.query(`
    UPDATE nodo_miembros SET rol = $4
    WHERE tipo_nodo = $1 AND id_nodo = $2 AND id_usuario = $3
    RETURNING *
  `, [tipo, idNodo, idUsuario, rol]);
  return rows[0] || null;
}

async function eliminarMiembro(tipo, idNodo, idUsuario, db) {
  const conn = db || pool;
  const { rows } = await conn.query(`
    DELETE FROM nodo_miembros
    WHERE tipo_nodo = $1 AND id_nodo = $2 AND id_usuario = $3
    RETURNING id
  `, [tipo, idNodo, idUsuario]);
  return rows[0] || null;
}

module.exports = { listarMiembros, agregarMiembro, actualizarRol, eliminarMiembro };
