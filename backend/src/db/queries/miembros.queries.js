/**
 * ARCHIVO: miembros.queries.js
 * PROPÓSITO: Queries para proyecto_usuarios y proyecto_invitaciones.
 */
const pool = require('../pool');
const crypto = require('crypto');

// ─── Miembros ─────────────────────────────────────────────────

async function listarMiembros(proyectoId) {
  const { rows } = await pool.query(`
    SELECT pu.id_proyecto, pu.id_usuario, pu.rol, pu.invitado_en, pu.aceptado_en,
      pu.estado, pu.motivo_rechazo, pu.respondido_en,
      u.nombre_completo, u.correo, u.cargo, u.rol AS rol_sistema,
      dg.siglas AS dg_siglas, dg.nombre AS dg_nombre
    FROM proyecto_usuarios pu
    JOIN usuarios u ON u.id = pu.id_usuario
    LEFT JOIN direcciones_generales dg ON dg.id = u.id_dg
    WHERE pu.id_proyecto = $1
    ORDER BY pu.rol DESC, u.nombre_completo
  `, [proyectoId]);
  return rows;
}

// Registra la participación. Por omisión queda PENDIENTE: invitar propone,
// no impone — la persona acepta o rechaza. `yaAceptada` es para los casos
// en que no hay a quién preguntarle: el creador de un proyecto, o la copia
// de participantes al duplicar uno.
async function agregarMiembro(proyectoId, usuarioId, rol, invitadoPor, { yaAceptada = false } = {}) {
  const estado = yaAceptada ? 'aceptada' : 'pendiente';
  const { rows } = await pool.query(`
    INSERT INTO proyecto_usuarios (id_proyecto, id_usuario, rol, invitado_por, estado, aceptado_en)
    VALUES ($1, $2, $3, $4, $5::varchar, CASE WHEN $5::varchar = 'aceptada' THEN NOW() END)
    ON CONFLICT (id_proyecto, id_usuario) DO UPDATE
      SET rol = $3,
          -- Reinvitar a quien había rechazado vuelve a dejarlo pendiente;
          -- a quien ya aceptó solo se le cambia la función.
          estado = CASE WHEN proyecto_usuarios.estado = 'rechazada' THEN $5::varchar ELSE proyecto_usuarios.estado END,
          motivo_rechazo = CASE WHEN proyecto_usuarios.estado = 'rechazada' THEN NULL ELSE proyecto_usuarios.motivo_rechazo END
    RETURNING *
  `, [proyectoId, usuarioId, rol, invitadoPor, estado]);
  return rows[0];
}

// Respuesta del invitado. Devuelve la fila actualizada o null si no había
// invitación pendiente (ya respondida, o nunca existió).
async function responderInvitacion(proyectoId, usuarioId, aceptar, motivo) {
  const { rows } = await pool.query(`
    UPDATE proyecto_usuarios
    SET estado = $3::varchar,
        motivo_rechazo = $4,
        respondido_en = NOW(),
        aceptado_en = CASE WHEN $3::varchar = 'aceptada' THEN NOW() ELSE NULL END
    WHERE id_proyecto = $1 AND id_usuario = $2 AND estado = 'pendiente'
    RETURNING *
  `, [proyectoId, usuarioId, aceptar ? 'aceptada' : 'rechazada', aceptar ? null : (motivo || null)]);
  return rows[0] || null;
}

// Invitaciones que este usuario tiene sin responder, de proyecto y de nodo,
// en una sola lista ordenada de la más reciente a la más vieja.
async function invitacionesPendientes(usuarioId) {
  const { rows } = await pool.query(`
    SELECT 'proyecto' AS tipo, p.id AS id_nodo, p.nombre AS nombre_nodo,
           p.id AS id_proyecto, p.nombre AS nombre_proyecto,
           pu.rol AS funcion, pu.invitado_en, u.nombre_completo AS invitado_por_nombre
    FROM proyecto_usuarios pu
    JOIN proyectos p ON p.id = pu.id_proyecto AND p.deleted_at IS NULL
    LEFT JOIN usuarios u ON u.id = pu.invitado_por
    WHERE pu.id_usuario = $1 AND pu.estado = 'pendiente'

    UNION ALL

    SELECT nm.tipo_nodo AS tipo, nm.id_nodo, n.nombre AS nombre_nodo,
           n.id_proyecto, p.nombre AS nombre_proyecto,
           nm.rol AS funcion, nm.created_at AS invitado_en, u.nombre_completo AS invitado_por_nombre
    FROM nodo_miembros nm
    JOIN (
      SELECT e.id, e.nombre, e.id_proyecto, 'etapa' AS t FROM etapas e
      UNION ALL
      SELECT a.id, a.nombre, COALESCE(a.id_proyecto, e2.id_proyecto), 'accion' FROM acciones a
        LEFT JOIN etapas e2 ON e2.id = a.id_etapa
      UNION ALL
      SELECT t.id, t.nombre, COALESCE(a2.id_proyecto, e3.id_proyecto), 'tarea' FROM tareas t
        JOIN acciones a2 ON a2.id = t.id_accion
        LEFT JOIN etapas e3 ON e3.id = a2.id_etapa
    ) n ON n.id = nm.id_nodo AND n.t = nm.tipo_nodo
    JOIN proyectos p ON p.id = n.id_proyecto AND p.deleted_at IS NULL
    LEFT JOIN usuarios u ON u.id = nm.id_invitado_por
    WHERE nm.id_usuario = $1 AND nm.estado = 'pendiente'

    ORDER BY invitado_en DESC
  `, [usuarioId]);
  return rows;
}

// ¿Esta persona es el ÚNICO responsable aceptado del proyecto?
//
// Un proyecto sin responsable se queda sin dueño: nadie a quien avisarle
// las solicitudes de participación, nadie que designe participantes.
// Se puede llegar ahí por tres caminos —quitarlo, que se quite él mismo,
// o degradarlo a colaborador— y ninguno estaba cerrado. Esta consulta es
// el freno común a los tres.
async function esUnicoResponsable(proyectoId, usuarioId, db) {
  const conn = db || pool;
  const { rows } = await conn.query(`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE id_usuario = $2)::int AS incluye_a_esta
    FROM proyecto_usuarios
    WHERE id_proyecto = $1 AND rol = 'responsable' AND estado = 'aceptada'
  `, [proyectoId, usuarioId]);
  return rows[0].total === 1 && rows[0].incluye_a_esta === 1;
}

async function eliminarMiembro(proyectoId, usuarioId) {
  const { rowCount } = await pool.query(
    'DELETE FROM proyecto_usuarios WHERE id_proyecto = $1 AND id_usuario = $2',
    [proyectoId, usuarioId]
  );
  return rowCount > 0;
}

// La función que esta persona ejerce en el proyecto. Solo cuenta si aceptó:
// una invitación pendiente o rechazada no da permisos. Es el embudo por el
// que pasan todas las verificaciones de autorización.
async function obtenerRolUsuario(proyectoId, usuarioId) {
  const { rows } = await pool.query(
    `SELECT rol FROM proyecto_usuarios
     WHERE id_proyecto = $1 AND id_usuario = $2 AND estado = 'aceptada'`,
    [proyectoId, usuarioId]
  );
  return rows[0]?.rol || null;
}

/**
 * Verifica si un usuario tiene acceso a un proyecto.
 * Acceso: es miembro del proyecto, es creador, o es superadmin/Ejecutivo.
 */
async function tieneAcceso(proyectoId, usuario) {
  if (!usuario) return false;
  if (usuario.rol === 'superadmin' || usuario.rol === 'ejecutivo') return true;

  const { rows } = await pool.query(`
    SELECT 1 FROM proyecto_usuarios WHERE id_proyecto = $1 AND id_usuario = $2 AND estado = 'aceptada'
    UNION
    SELECT 1 FROM proyectos WHERE id = $1 AND id_creador = $2
  `, [proyectoId, usuario.id]);
  return rows.length > 0;
}

// ─── Invitaciones ─────────────────────────────────────────────

async function crearInvitacion(proyectoId, correo, rol, invitadoPor) {
  const token = crypto.randomBytes(32).toString('hex');

  // Check if user with this email exists
  const { rows: usuarios } = await pool.query(
    'SELECT id FROM usuarios WHERE correo = $1 AND activo = true', [correo]
  );
  const idUsuario = usuarios[0]?.id || null;

  // Check if already invited (pending)
  const { rows: existentes } = await pool.query(
    `SELECT id FROM proyecto_invitaciones 
     WHERE id_proyecto = $1 AND correo = $2 AND estado = 'pendiente'`,
    [proyectoId, correo]
  );
  if (existentes.length > 0) {
    return { duplicada: true };
  }

  // Check if already a member
  if (idUsuario) {
    const { rows: miembro } = await pool.query(
      'SELECT 1 FROM proyecto_usuarios WHERE id_proyecto = $1 AND id_usuario = $2',
      [proyectoId, idUsuario]
    );
    if (miembro.length > 0) {
      return { yaMiembro: true };
    }
  }

  const { rows } = await pool.query(`
    INSERT INTO proyecto_invitaciones (id_proyecto, correo, rol, id_usuario, invitado_por, token)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [proyectoId, correo, rol, idUsuario, invitadoPor, token]);
  return rows[0];
}

async function listarInvitaciones(proyectoId) {
  const { rows } = await pool.query(`
    SELECT pi.*, u.nombre_completo AS invitador_nombre
    FROM proyecto_invitaciones pi
    LEFT JOIN usuarios u ON u.id = pi.invitado_por
    WHERE pi.id_proyecto = $1
    ORDER BY pi.created_at DESC
  `, [proyectoId]);
  return rows;
}

async function aceptarInvitacion(token, usuarioId) {
  const { rows } = await pool.query(`
    UPDATE proyecto_invitaciones
    SET estado = 'aceptada', id_usuario = $2, accepted_at = NOW()
    WHERE token = $1 AND estado = 'pendiente'
    RETURNING *
  `, [token, usuarioId]);

  if (!rows[0]) return null;

  const inv = rows[0];
  // Add user to project
  await pool.query(`
    INSERT INTO proyecto_usuarios (id_proyecto, id_usuario, rol, invitado_por, estado, aceptado_en)
    VALUES ($1, $2, $3, $4, 'aceptada', NOW())
    ON CONFLICT (id_proyecto, id_usuario) DO NOTHING
  `, [inv.id_proyecto, usuarioId, inv.rol, inv.invitado_por]);

  return inv;
}

async function cancelarInvitacion(invitacionId) {
  const { rows } = await pool.query(`
    UPDATE proyecto_invitaciones SET estado = 'cancelada'
    WHERE id = $1 AND estado = 'pendiente'
    RETURNING *
  `, [invitacionId]);
  return rows[0];
}

/**
 * Proyectos donde el usuario participa — para Tablero, Mapa Territorial y
 * "Mis evidencias". Hasta ahora solo miraba proyecto_usuarios (miembro de
 * TODO el proyecto) e ignoraba a quien solo participa en una etapa/acción/
 * tarea puntual: se le podía invitar y aceptar sin problema, pero el
 * proyecto nunca aparecía en su Tablero ni contaba en sus estadísticas —
 * la invitación quedaba aceptada pero invisible. Mismo criterio de
 * "asignación explícita" que ya usa permisos.queries.js › nodosEditablesUsuario
 * para decidir qué puede editar: nodo_miembros con estado='aceptada', o ser
 * directamente el id_responsable del nodo (se puede asignar responsable sin
 * pasar por la invitación de nodo_miembros).
 */
async function obtenerProyectosUsuario(usuarioId) {
  const { rows } = await pool.query(`
    SELECT DISTINCT p.id AS id_proyecto
    FROM proyectos p
    WHERE p.deleted_at IS NULL
      AND (
        EXISTS (SELECT 1 FROM proyecto_usuarios pu WHERE pu.id_proyecto = p.id AND pu.id_usuario = $1)
        OR EXISTS (
          SELECT 1 FROM etapas e WHERE e.id_proyecto = p.id AND (
            e.id_responsable = $1
            OR EXISTS (
              SELECT 1 FROM nodo_miembros nm
              WHERE nm.tipo_nodo = 'etapa' AND nm.id_nodo = e.id AND nm.id_usuario = $1 AND nm.estado = 'aceptada'
            )
          )
        )
        -- id_proyecto en acciones/tareas se resuelve con COALESCE contra la
        -- etapa: una acción bajo una etapa no siempre trae su propio
        -- id_proyecto poblado (ver duplicar.queries.js), solo id_etapa.
        OR EXISTS (
          SELECT 1 FROM acciones a LEFT JOIN etapas ea ON ea.id = a.id_etapa
          WHERE COALESCE(a.id_proyecto, ea.id_proyecto) = p.id AND (
            a.id_responsable = $1
            OR EXISTS (
              SELECT 1 FROM nodo_miembros nm
              WHERE nm.tipo_nodo = 'accion' AND nm.id_nodo = a.id AND nm.id_usuario = $1 AND nm.estado = 'aceptada'
            )
          )
        )
        OR EXISTS (
          SELECT 1 FROM tareas t
          JOIN acciones a2 ON a2.id = t.id_accion
          LEFT JOIN etapas ea2 ON ea2.id = a2.id_etapa
          WHERE COALESCE(a2.id_proyecto, ea2.id_proyecto) = p.id AND (
            t.id_responsable = $1
            OR EXISTS (
              SELECT 1 FROM nodo_miembros nm
              WHERE nm.tipo_nodo = 'tarea' AND nm.id_nodo = t.id AND nm.id_usuario = $1 AND nm.estado = 'aceptada'
            )
          )
        )
      )
  `, [usuarioId]);
  return rows.map(r => r.id_proyecto);
}

module.exports = {
  listarMiembros,
  agregarMiembro,
  eliminarMiembro,
  obtenerRolUsuario,
  esUnicoResponsable,
  responderInvitacion,
  invitacionesPendientes,
  tieneAcceso,
  crearInvitacion,
  listarInvitaciones,
  aceptarInvitacion,
  cancelarInvitacion,
  obtenerProyectosUsuario
};
