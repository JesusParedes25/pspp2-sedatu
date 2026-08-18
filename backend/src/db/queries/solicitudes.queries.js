/**
 * ARCHIVO: solicitudes.queries.js
 * PROPÓSITO: Solicitudes de participación — el camino inverso a la
 *            invitación: alguien pide entrar a un proyecto y quien manda
 *            ahí la acepta o la declina.
 *
 * MINI-CLASE: dos direcciones, dos tablas
 * ─────────────────────────────────────────────────────────────────
 * Invitación y solicitud terminan en lo mismo (una fila en
 * proyecto_usuarios), pero no son lo mismo mientras están abiertas:
 *
 *   invitación → la propone quien manda, la responde el invitado
 *   solicitud  → la propone el interesado, la responde quien manda
 *
 * Meter las dos en proyecto_usuarios con un estado compartido haría
 * ambiguo quién le debe respuesta a quién, y quien solicita todavía no
 * es participante — no debe aparecer en la lista del proyecto ni contar
 * para los permisos. Por eso viven aparte y solo al aceptarse se crea la
 * participación.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');

// Crea la solicitud. Devuelve { yaParticipa } o { duplicada } en vez de
// lanzar, para que el controller responda con un mensaje entendible.
async function crear({ idProyecto, idUsuario, funcion, motivo }, db) {
  const conn = db || pool;

  const { rows: participa } = await conn.query(
    `SELECT rol, estado FROM proyecto_usuarios
     WHERE id_proyecto = $1 AND id_usuario = $2 AND estado IN ('aceptada', 'pendiente')`,
    [idProyecto, idUsuario]
  );
  if (participa[0]) {
    return participa[0].estado === 'aceptada'
      ? { yaParticipa: true, funcion: participa[0].rol }
      : { invitacionPendiente: true, funcion: participa[0].rol };
  }

  const { rows: abierta } = await conn.query(
    `SELECT id FROM solicitudes_participacion
     WHERE id_proyecto = $1 AND id_usuario = $2 AND estado = 'pendiente'`,
    [idProyecto, idUsuario]
  );
  if (abierta[0]) return { duplicada: true };

  const { rows } = await conn.query(`
    INSERT INTO solicitudes_participacion (id_proyecto, id_usuario, funcion, motivo)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [idProyecto, idUsuario, funcion || 'colaborador', (motivo || '').trim() || null]);
  return { solicitud: rows[0] };
}

// Las que están sin resolver en un proyecto, con quién las mandó.
async function listarDeProyecto(idProyecto, estado, db) {
  const conn = db || pool;
  const filtro = estado ? 'AND s.estado = $2' : '';
  const params = estado ? [idProyecto, estado] : [idProyecto];
  const { rows } = await conn.query(`
    SELECT s.*, u.nombre_completo, u.correo, u.cargo, u.rol AS perfil,
           dg.siglas AS dg_siglas
    FROM solicitudes_participacion s
    JOIN usuarios u ON u.id = s.id_usuario
    LEFT JOIN direcciones_generales dg ON dg.id = u.id_dg
    WHERE s.id_proyecto = $1 ${filtro}
    ORDER BY s.created_at DESC
  `, params);
  return rows;
}

// Las que mandó una persona (para no dejarla sin saber en qué quedaron).
async function listarDeUsuario(idUsuario, db) {
  const conn = db || pool;
  const { rows } = await conn.query(`
    SELECT s.*, p.nombre AS nombre_proyecto
    FROM solicitudes_participacion s
    JOIN proyectos p ON p.id = s.id_proyecto AND p.deleted_at IS NULL
    WHERE s.id_usuario = $1
    ORDER BY s.created_at DESC
    LIMIT 50
  `, [idUsuario]);
  return rows;
}

async function obtener(idSolicitud, db) {
  const conn = db || pool;
  const { rows } = await conn.query(
    `SELECT s.*, u.nombre_completo
     FROM solicitudes_participacion s
     JOIN usuarios u ON u.id = s.id_usuario
     WHERE s.id = $1`,
    [idSolicitud]
  );
  return rows[0] || null;
}

// Resuelve la solicitud y, si se acepta, crea la participación ya
// aceptada: quien pidió entrar no necesita que le pregunten si quiere.
// Las dos escrituras van en una transacción — aceptar y no dar acceso, o
// dar acceso y no dejar constancia, son dos formas de romperlo.
async function responder({ idSolicitud, idQuienResuelve, acepta, motivoRespuesta }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(`
      UPDATE solicitudes_participacion
      SET estado = $2::varchar,
          id_resuelta_por = $3,
          motivo_respuesta = $4,
          respondida_en = NOW()
      WHERE id = $1 AND estado = 'pendiente'
      RETURNING *
    `, [idSolicitud, acepta ? 'aceptada' : 'rechazada', idQuienResuelve, (motivoRespuesta || '').trim() || null]);

    const solicitud = rows[0];
    if (!solicitud) { await client.query('ROLLBACK'); return null; }

    if (acepta) {
      await client.query(`
        INSERT INTO proyecto_usuarios (id_proyecto, id_usuario, rol, invitado_por, estado, aceptado_en)
        VALUES ($1, $2, $3, $4, 'aceptada', NOW())
        ON CONFLICT (id_proyecto, id_usuario) DO UPDATE
          SET rol = EXCLUDED.rol, estado = 'aceptada', aceptado_en = NOW(), motivo_rechazo = NULL
      `, [solicitud.id_proyecto, solicitud.id_usuario, solicitud.funcion, idQuienResuelve]);
    }

    await client.query('COMMIT');
    return solicitud;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// A quién avisar: los responsables aceptados del proyecto, más su creador
// (que puede no estar en proyecto_usuarios si la fila se borró a mano).
async function destinatariosDe(idProyecto, db) {
  const conn = db || pool;
  const { rows } = await conn.query(`
    SELECT DISTINCT id_usuario FROM (
      SELECT pu.id_usuario
      FROM proyecto_usuarios pu
      WHERE pu.id_proyecto = $1 AND pu.rol = 'responsable' AND pu.estado = 'aceptada'
      UNION
      SELECT p.id_creador AS id_usuario FROM proyectos p WHERE p.id = $1 AND p.id_creador IS NOT NULL
    ) t
  `, [idProyecto]);
  return rows.map(r => r.id_usuario).filter(Boolean);
}

// Todas las solicitudes pendientes que ESTE usuario puede resolver, de
// todos sus proyectos. Es lo que alimenta la bandeja de Notificaciones:
// sin esto habría que entrar proyecto por proyecto a ver si hay algo.
//
// La condición replica en SQL la regla de puedeGestionarParticipantes
// (utils/autorizacion.js). Se duplica a propósito: llamar a la función
// una vez por proyecto sería una consulta por fila. Si aquella regla
// cambia, esta consulta tiene que cambiar con ella.
async function pendientesQuePuedeResolver(usuario, db) {
  const conn = db || pool;
  const { rows } = await conn.query(`
    SELECT s.*, u.nombre_completo, u.correo, u.cargo, u.rol AS perfil,
           dg.siglas AS dg_siglas,
           p.nombre AS nombre_proyecto
    FROM solicitudes_participacion s
    JOIN proyectos p ON p.id = s.id_proyecto AND p.deleted_at IS NULL
    JOIN usuarios u ON u.id = s.id_usuario
    LEFT JOIN direcciones_generales dg ON dg.id = u.id_dg
    WHERE s.estado = 'pendiente'
      AND s.id_usuario <> $1
      AND (
        $2 IN ('superadmin', 'ejecutivo')
        OR p.id_creador = $1
        OR ($2 = 'direccion' AND $3::uuid IS NOT NULL AND p.id_dg_lider = $3::uuid)
        OR EXISTS (
          SELECT 1 FROM proyecto_usuarios pu
          WHERE pu.id_proyecto = p.id AND pu.id_usuario = $1
            AND pu.rol = 'responsable' AND pu.estado = 'aceptada'
        )
      )
    ORDER BY s.created_at DESC
  `, [usuario.id, usuario.rol, usuario.id_dg || null]);
  return rows;
}

module.exports = {
  crear, listarDeProyecto, listarDeUsuario, obtener, responder,
  destinatariosDe, pendientesQuePuedeResolver,
};
