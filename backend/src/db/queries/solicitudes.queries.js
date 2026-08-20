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

// Crea la solicitud, de proyecto (sin tipoNodo) o de un nodo concreto.
// Devuelve { yaParticipa } / { duplicada } / ... en vez de lanzar, para que
// el controller responda con un mensaje entendible.
async function crear({ idProyecto, idUsuario, funcion, motivo, tipoNodo, idNodo }, db) {
  const conn = db || pool;
  const esDeNodo = !!(tipoNodo && idNodo);

  // Participar en TODO el proyecto vuelve innecesaria cualquier solicitud,
  // también la de una etapa suelta: quien ya está adentro ya puede
  // trabajar ahí. Se avisa en vez de crear una solicitud que nadie
  // necesita resolver.
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

  if (esDeNodo) {
    const { rows: enNodo } = await conn.query(
      `SELECT rol, estado FROM nodo_miembros
       WHERE tipo_nodo = $1 AND id_nodo = $2 AND id_usuario = $3
         AND estado IN ('aceptada', 'pendiente')`,
      [tipoNodo, idNodo, idUsuario]
    );
    if (enNodo[0]) {
      return enNodo[0].estado === 'aceptada'
        ? { yaParticipaEnNodo: true, funcion: enNodo[0].rol }
        : { invitacionPendiente: true, funcion: enNodo[0].rol };
    }
  }

  const { rows: abierta } = await conn.query(`
    SELECT id FROM solicitudes_participacion
    WHERE id_usuario = $1 AND estado = 'pendiente'
      AND ($2::uuid IS NULL AND id_nodo IS NULL AND id_proyecto = $3
           OR $2::uuid IS NOT NULL AND id_nodo = $2::uuid)
  `, [idUsuario, esDeNodo ? idNodo : null, idProyecto]);
  if (abierta[0]) return { duplicada: true };

  const { rows } = await conn.query(`
    INSERT INTO solicitudes_participacion
      (id_proyecto, id_usuario, funcion, motivo, tipo_nodo, id_nodo)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `, [
    idProyecto, idUsuario, funcion || 'colaborador', (motivo || '').trim() || null,
    esDeNodo ? tipoNodo : null, esDeNodo ? idNodo : null,
  ]);
  return { solicitud: rows[0] };
}

// Las que están sin resolver en un proyecto, con quién las mandó.
async function listarDeProyecto(idProyecto, estado, db) {
  const conn = db || pool;
  const filtro = estado ? 'AND s.estado = $2' : '';
  const params = estado ? [idProyecto, estado] : [idProyecto];
  const { rows } = await conn.query(`
    SELECT s.*, u.nombre_completo, u.correo, u.cargo, u.rol AS perfil,
           dg.siglas AS dg_siglas,
           CASE s.tipo_nodo
             WHEN 'etapa'  THEN (SELECT e.nombre FROM etapas e   WHERE e.id = s.id_nodo)
             WHEN 'accion' THEN (SELECT a.nombre FROM acciones a WHERE a.id = s.id_nodo)
             WHEN 'tarea'  THEN (SELECT t.nombre FROM tareas t   WHERE t.id = s.id_nodo)
           END AS nombre_nodo
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
    SELECT s.*, p.nombre AS nombre_proyecto,
           CASE s.tipo_nodo
             WHEN 'etapa'  THEN (SELECT e.nombre FROM etapas e   WHERE e.id = s.id_nodo)
             WHEN 'accion' THEN (SELECT a.nombre FROM acciones a WHERE a.id = s.id_nodo)
             WHEN 'tarea'  THEN (SELECT t.nombre FROM tareas t   WHERE t.id = s.id_nodo)
           END AS nombre_nodo
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

    if (acepta && solicitud.id_nodo) {
      // Solicitud de una etapa, acción o tarea: la participación se crea
      // en ese nodo, no en el proyecto entero. Es justo lo que se pidió.
      await client.query(`
        INSERT INTO nodo_miembros (tipo_nodo, id_nodo, id_usuario, rol, id_invitado_por, estado)
        VALUES ($1, $2, $3, $4, $5, 'aceptada')
        ON CONFLICT (tipo_nodo, id_nodo, id_usuario) DO UPDATE
          SET rol = EXCLUDED.rol, estado = 'aceptada', motivo_rechazo = NULL
      `, [solicitud.tipo_nodo, solicitud.id_nodo, solicitud.id_usuario, solicitud.funcion, idQuienResuelve]);
    } else if (acepta) {
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

// A quién avisar cuando llega una solicitud.
//
// A los RESPONSABLES del proyecto, que son quienes deciden quién entra.
// Y al DIRECTOR de la Dirección de Área a la que pertenecen esos
// responsables — porque esa solicitud es trabajo de su área y le
// corresponde enterarse.
//
// A quién NO se le avisa, aunque pueda resolverla: al ejecutivo y al
// superadmin, que tienen esa facultad sobre toda la Secretaría, y a los
// directores de áreas ajenas. Notificarlos significaría un aviso por cada
// solicitud de cada proyecto: se les vuelve ruido y dejan de leer los
// suyos. Pueden verlas igual en la bandeja de Notificaciones, que sí usa
// la regla completa (pendientesQuePuedeResolver).
//
// El creador entra solo como red de seguridad: si el proyecto se quedó sin
// ningún responsable, la solicitud no iría a nadie y quedaría muerta.
async function destinatariosDe(idProyecto, db) {
  const conn = db || pool;
  const { rows } = await conn.query(`
    WITH responsables AS (
      SELECT pu.id_usuario
      FROM proyecto_usuarios pu
      WHERE pu.id_proyecto = $1 AND pu.rol = 'responsable' AND pu.estado = 'aceptada'
    ),
    areas AS (
      SELECT DISTINCT u.id_direccion_area
      FROM responsables r
      JOIN usuarios u ON u.id = r.id_usuario
      WHERE u.id_direccion_area IS NOT NULL
    )
    SELECT id_usuario FROM responsables
    UNION
    SELECT d.id
    FROM usuarios d
    JOIN areas a ON a.id_direccion_area = d.id_direccion_area
    WHERE d.rol = 'direccion' AND d.activo = true
    UNION
    SELECT p.id_creador
    FROM proyectos p
    WHERE p.id = $1 AND p.id_creador IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM responsables)
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
           p.nombre AS nombre_proyecto,
           CASE s.tipo_nodo
             WHEN 'etapa'  THEN (SELECT e.nombre FROM etapas e   WHERE e.id = s.id_nodo)
             WHEN 'accion' THEN (SELECT a.nombre FROM acciones a WHERE a.id = s.id_nodo)
             WHEN 'tarea'  THEN (SELECT t.nombre FROM tareas t   WHERE t.id = s.id_nodo)
           END AS nombre_nodo
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

// Las que ESTE usuario ya resolvió (aceptó o declinó), más recientes
// primero. Sin esto, en cuanto se resuelve una solicitud desaparece de
// pendientesQuePuedeResolver y no queda ningún rastro de qué se decidió
// ni cuándo — quien resolvió no tiene forma de confirmarlo después.
async function resueltasPorUsuario(usuarioId, limite = 20) {
  const { rows } = await pool.query(`
    SELECT s.*, u.nombre_completo, u.correo, u.cargo,
           p.nombre AS nombre_proyecto,
           CASE s.tipo_nodo
             WHEN 'etapa'  THEN (SELECT e.nombre FROM etapas e   WHERE e.id = s.id_nodo)
             WHEN 'accion' THEN (SELECT a.nombre FROM acciones a WHERE a.id = s.id_nodo)
             WHEN 'tarea'  THEN (SELECT t.nombre FROM tareas t   WHERE t.id = s.id_nodo)
           END AS nombre_nodo
    FROM solicitudes_participacion s
    JOIN proyectos p ON p.id = s.id_proyecto AND p.deleted_at IS NULL
    JOIN usuarios u ON u.id = s.id_usuario
    WHERE s.id_resuelta_por = $1 AND s.estado != 'pendiente'
    ORDER BY s.respondida_en DESC
    LIMIT $2
  `, [usuarioId, limite]);
  return rows;
}

module.exports = {
  crear, listarDeProyecto, listarDeUsuario, obtener, responder,
  destinatariosDe, pendientesQuePuedeResolver, resueltasPorUsuario,
};
