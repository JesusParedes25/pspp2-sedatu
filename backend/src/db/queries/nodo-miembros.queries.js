/**
 * ARCHIVO: nodo-miembros.queries.js
 * PROPÓSITO: Queries SQL para miembros asignados a etapas y acciones específicas.
 */
const pool = require('../pool');

async function listarMiembros(tipo, idNodo, idProyecto, db) {
  if (!['etapa', 'accion', 'tarea'].includes(tipo)) throw new Error(`Tipo de nodo inválido: ${tipo}`);
  const conn = db || pool;
  const tabla = tipo === 'etapa' ? 'etapas' : tipo === 'tarea' ? 'tareas' : 'acciones';

  const { rows } = await conn.query(`
    SELECT
      u.id        AS id_usuario,
      u.nombre_completo,
      u.correo,
      u.activo    AS usuario_activo,
      dg.siglas   AS dg_siglas,
      src.rol,
      src.es_responsable_principal,
      src.id_invitado_por,
      inv.nombre_completo AS invitado_por_nombre,
      src.created_at,
      'nodo'      AS alcance
    FROM (
      -- Responsable principal (columna id_responsable en la tabla padre)
      SELECT
        t.id_responsable            AS id_usuario,
        'responsable'               AS rol,
        true                        AS es_responsable_principal,
        NULL::uuid                  AS id_invitado_por,
        'aceptada'                  AS estado,
        NULL::text                  AS motivo_rechazo,
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
        nm.estado,
        nm.motivo_rechazo,
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

  if (!idProyecto) return rows;

  // Responsables/colaboradores de TODO el proyecto — ya tienen acceso a
  // este nodo sin necesitar una invitación puntual aquí (ver el 409
  // YA_PARTICIPA_EN_PROYECTO en nodo-miembros.controller.js::agregar, que
  // impide crear a propósito una fila redundante en nodo_miembros para
  // alguien que ya participa en el proyecto completo). Antes de esto, el
  // panel de Equipo de un nodo sin asignaciones propias se veía vacío
  // aunque el proyecto ya tuviera responsable/colaboradores — se agregan
  // aquí, marcados con `alcance: 'proyecto'` para diferenciarlos de
  // quienes se agregaron puntualmente a ESTE nodo (`alcance: 'nodo'`).
  const { rows: filasProyecto } = await conn.query(`
    SELECT
      u.id        AS id_usuario,
      u.nombre_completo,
      u.correo,
      u.activo    AS usuario_activo,
      dg.siglas   AS dg_siglas,
      pu.rol,
      false       AS es_responsable_principal,
      NULL::uuid  AS id_invitado_por,
      NULL::text  AS invitado_por_nombre,
      pu.aceptado_en AS created_at,
      'proyecto'  AS alcance
    FROM proyecto_usuarios pu
    JOIN usuarios u ON u.id = pu.id_usuario
    LEFT JOIN direcciones_generales dg ON dg.id = u.id_dg
    WHERE pu.id_proyecto = $1 AND pu.estado = 'aceptada'
  `, [idProyecto]);

  // Quien ya participa en todo el proyecto manda sobre cualquier fila
  // suya a nivel de nodo (no debería coexistir, por el 409 de arriba,
  // pero el id_responsable directo del nodo sí puede coincidir con
  // alguien que además es responsable/colaborador de todo el proyecto)
  // — se muestra una sola vez, con su alcance de proyecto.
  const idsProyecto = new Set(filasProyecto.map(r => r.id_usuario));
  const filasNodo = rows.filter(r => !idsProyecto.has(r.id_usuario));
  const peso = r => (r.rol === 'responsable' ? 1 : r.rol === 'colaborador' ? 2 : 3);

  return [...filasProyecto, ...filasNodo].sort((a, b) => {
    if (a.alcance !== b.alcance) return a.alcance === 'proyecto' ? -1 : 1;
    if (a.es_responsable_principal !== b.es_responsable_principal) return a.es_responsable_principal ? -1 : 1;
    if (peso(a) !== peso(b)) return peso(a) - peso(b);
    return (a.nombre_completo || '').localeCompare(b.nombre_completo || '');
  });
}

// Fila cruda de nodo_miembros (rol incluido) — se usa para resolver el rol
// de alguien ANTES de quitarlo, así el evento de bitácora de "quitar
// acceso" puede decir qué función tenía sin depender del RETURNING del
// propio DELETE.
async function obtenerMiembro(tipo, idNodo, idUsuario, db) {
  const conn = db || pool;
  const { rows } = await conn.query(
    'SELECT * FROM nodo_miembros WHERE tipo_nodo = $1 AND id_nodo = $2 AND id_usuario = $3',
    [tipo, idNodo, idUsuario]
  );
  return rows[0] || null;
}

async function agregarMiembro(tipo, idNodo, idUsuario, rol, idInvitadoPor, db) {
  if (!['etapa', 'accion', 'tarea'].includes(tipo)) throw new Error(`Tipo de nodo inválido: ${tipo}`);
  const conn = db || pool;
  const { rows } = await conn.query(`
    INSERT INTO nodo_miembros (tipo_nodo, id_nodo, id_usuario, rol, id_invitado_por, estado)
    VALUES ($1, $2, $3, $4, $5, 'pendiente')
    ON CONFLICT (tipo_nodo, id_nodo, id_usuario) DO UPDATE
      SET rol = EXCLUDED.rol,
          -- Reinvitar a quien rechazó vuelve a dejar la invitación pendiente.
          estado = CASE WHEN nodo_miembros.estado = 'rechazada' THEN 'pendiente' ELSE nodo_miembros.estado END,
          motivo_rechazo = CASE WHEN nodo_miembros.estado = 'rechazada' THEN NULL ELSE nodo_miembros.motivo_rechazo END
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

// Respuesta del invitado a un nodo. null si no había invitación pendiente.
async function responderInvitacion(tipo, idNodo, idUsuario, aceptar, motivo, db) {
  const conn = db || pool;
  const { rows } = await conn.query(`
    UPDATE nodo_miembros
    SET estado = $4, motivo_rechazo = $5, respondido_en = NOW()
    WHERE tipo_nodo = $1 AND id_nodo = $2 AND id_usuario = $3 AND estado = 'pendiente'
    RETURNING *
  `, [tipo, idNodo, idUsuario, aceptar ? 'aceptada' : 'rechazada', aceptar ? null : (motivo || null)]);
  return rows[0] || null;
}

module.exports = { listarMiembros, obtenerMiembro, agregarMiembro, actualizarRol, eliminarMiembro, responderInvitacion };
