/**
 * ARCHIVO: riesgos.queries.js
 * PROPÓSITO: Queries SQL para la tabla riesgos.
 *
 * MINI-CLASE: Riesgos polimórficos con entidad_tipo + entidad_id
 * ─────────────────────────────────────────────────────────────────
 * Un riesgo puede vivir en cualquier nivel de la jerarquía:
 * Proyecto, Subproyecto, Etapa o Acción. En lugar de tener 4
 * columnas FK (una por cada tabla), usamos dos campos genéricos:
 * entidad_tipo = 'Proyecto' y entidad_id = UUID del proyecto.
 * Esto se llama "polimorfismo a nivel de BD" y simplifica mucho
 * las consultas. El índice compuesto (entidad_tipo, entidad_id)
 * garantiza que las búsquedas sean rápidas.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');

// Obtiene todos los riesgos de un proyecto (en todos sus niveles)
async function obtenerRiesgosPorProyecto(proyectoId) {
  const resultado = await pool.query(`
    SELECT
      r.*,
      u_resp.nombre_completo AS responsable_nombre,
      u_rep.nombre_completo AS reportador_nombre
    FROM riesgos r
    LEFT JOIN usuarios u_resp ON u_resp.id = r.id_responsable
    LEFT JOIN usuarios u_rep ON u_rep.id = r.id_reportador
    WHERE (r.entidad_tipo = 'Proyecto' AND r.entidad_id = $1)
       OR (r.entidad_tipo = 'Etapa' AND r.entidad_id IN (
            SELECT id FROM etapas WHERE id_proyecto = $1
          ))
       OR (r.entidad_tipo = 'Accion' AND r.entidad_id IN (
            SELECT id FROM acciones WHERE id_proyecto = $1
          ))
       OR (r.entidad_tipo = 'Tarea' AND r.entidad_id IN (
            SELECT t.id FROM tareas t JOIN acciones a ON a.id = t.id_accion WHERE a.id_proyecto = $1
          ))
    ORDER BY
      CASE r.nivel WHEN 'Critico' THEN 1 WHEN 'Alto' THEN 2 WHEN 'Medio' THEN 3 ELSE 4 END,
      r.created_at DESC
  `, [proyectoId]);

  return resultado.rows;
}

// Obtiene riesgos de una etapa (tipo Etapa + sus acciones)
async function obtenerRiesgosPorEtapa(etapaId) {
  const resultado = await pool.query(`
    SELECT
      r.*,
      u_resp.nombre_completo AS responsable_nombre,
      u_rep.nombre_completo AS reportador_nombre
    FROM riesgos r
    LEFT JOIN usuarios u_resp ON u_resp.id = r.id_responsable
    LEFT JOIN usuarios u_rep ON u_rep.id = r.id_reportador
    WHERE (r.entidad_tipo = 'Etapa' AND r.entidad_id = $1)
       OR (r.entidad_tipo = 'Accion' AND r.entidad_id IN (
            SELECT id FROM acciones WHERE id_etapa = $1
          ))
       OR (r.entidad_tipo = 'Tarea' AND r.entidad_id IN (
            SELECT t.id FROM tareas t JOIN acciones a ON a.id = t.id_accion WHERE a.id_etapa = $1
          ))
    ORDER BY
      CASE r.nivel WHEN 'Critico' THEN 1 WHEN 'Alto' THEN 2 WHEN 'Medio' THEN 3 ELSE 4 END,
      r.created_at DESC
  `, [etapaId]);

  return resultado.rows;
}

// Obtiene un riesgo por ID
async function obtenerRiesgoPorId(riesgoId) {
  const resultado = await pool.query(`
    SELECT
      r.*,
      u_resp.nombre_completo AS responsable_nombre,
      u_rep.nombre_completo AS reportador_nombre
    FROM riesgos r
    LEFT JOIN usuarios u_resp ON u_resp.id = r.id_responsable
    LEFT JOIN usuarios u_rep ON u_rep.id = r.id_reportador
    WHERE r.id = $1
  `, [riesgoId]);

  return resultado.rows[0] || null;
}

// Crea un nuevo riesgo. Si trae id_responsable, queda pendiente de que esa
// persona la acepte — salvo que se la haya asignado a sí misma, caso en el
// que no tiene sentido pedirle que acepte su propia asignación.
async function crearRiesgo(datos) {
  const autoasignado = datos.id_responsable && datos.id_responsable === datos.id_reportador;
  const estadoResponsable = datos.id_responsable ? (autoasignado ? 'aceptada' : 'pendiente') : null;

  const resultado = await pool.query(`
    INSERT INTO riesgos (
      titulo, descripcion, causa, impacto, nivel, tipo,
      medida_mitigacion, entidad_tipo, entidad_id,
      id_responsable, id_reportador, fecha_limite_resolucion,
      id_asignado_por, estado_responsable
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    RETURNING *
  `, [
    datos.titulo, datos.descripcion, datos.causa, datos.impacto,
    datos.nivel, datos.tipo,
    datos.medida_mitigacion, datos.entidad_tipo, datos.entidad_id,
    datos.id_responsable, datos.id_reportador, datos.fecha_limite_resolucion,
    datos.id_responsable ? datos.id_reportador : null, estadoResponsable,
  ]);

  return resultado.rows[0];
}

// Actualiza un riesgo. id_responsable es aparte del resto de los campos
// (que se dejan tal cual con COALESCE si no vienen): asignar/reasignar/
// quitar responsable reinicia el aceptar/declinar, así que hay que
// comparar contra el valor YA guardado — no basta con que el campo venga
// en el body, porque el formulario de ModalRiesgo siempre lo manda
// (aunque el usuario no haya tocado el selector de Responsable). Sin esta
// comparación, guardar solo un cambio de descripción en un riesgo ya
// aceptado lo regresaba a "pendiente" de la nada.
async function actualizarRiesgo(riesgoId, datos, quienEdita) {
  let cambiaResponsable = false;
  if (Object.prototype.hasOwnProperty.call(datos, 'id_responsable')) {
    const { rows: [actual] } = await pool.query('SELECT id_responsable FROM riesgos WHERE id = $1', [riesgoId]);
    cambiaResponsable = (datos.id_responsable || null) !== (actual?.id_responsable || null);
  }

  if (!cambiaResponsable) {
    const resultado = await pool.query(`
      UPDATE riesgos SET
        titulo = COALESCE($1, titulo),
        descripcion = COALESCE($2, descripcion),
        causa = COALESCE($3, causa),
        impacto = COALESCE($4, impacto),
        nivel = COALESCE($5, nivel),
        tipo = COALESCE($6, tipo),
        estado = COALESCE($7, estado),
        medida_mitigacion = COALESCE($8, medida_mitigacion),
        fecha_limite_resolucion = COALESCE($9, fecha_limite_resolucion),
        updated_at = NOW()
      WHERE id = $10
      RETURNING *
    `, [
      datos.titulo, datos.descripcion, datos.causa, datos.impacto,
      datos.nivel, datos.tipo, datos.estado,
      datos.medida_mitigacion, datos.fecha_limite_resolucion,
      riesgoId
    ]);
    return resultado.rows[0] || null;
  }

  const autoasignado = datos.id_responsable && datos.id_responsable === quienEdita;
  const estadoResponsable = datos.id_responsable ? (autoasignado ? 'aceptada' : 'pendiente') : null;

  const resultado = await pool.query(`
    UPDATE riesgos SET
      titulo = COALESCE($1, titulo),
      descripcion = COALESCE($2, descripcion),
      causa = COALESCE($3, causa),
      impacto = COALESCE($4, impacto),
      nivel = COALESCE($5, nivel),
      tipo = COALESCE($6, tipo),
      estado = COALESCE($7, estado),
      medida_mitigacion = COALESCE($8, medida_mitigacion),
      fecha_limite_resolucion = COALESCE($9, fecha_limite_resolucion),
      id_responsable = $10,
      id_asignado_por = $11,
      estado_responsable = $12::varchar,
      motivo_rechazo = NULL,
      respondido_en = CASE WHEN $12::varchar = 'aceptada' THEN NOW() ELSE NULL END,
      updated_at = NOW()
    WHERE id = $13
    RETURNING *
  `, [
    datos.titulo, datos.descripcion, datos.causa, datos.impacto,
    datos.nivel, datos.tipo, datos.estado,
    datos.medida_mitigacion, datos.fecha_limite_resolucion,
    datos.id_responsable || null,
    datos.id_responsable ? quienEdita : null,
    estadoResponsable,
    riesgoId
  ]);

  return resultado.rows[0] || null;
}

// Responde (acepta o declina) una asignación de responsable pendiente.
// Solo el propio responsable propuesto puede resolverla — lo valida el
// controller comparando id_responsable contra el usuario autenticado.
async function responderAsignacion({ idRiesgo, acepta, motivoRechazo }) {
  const resultado = await pool.query(`
    UPDATE riesgos SET
      estado_responsable = $2,
      motivo_rechazo = $3,
      respondido_en = NOW()
    WHERE id = $1 AND estado_responsable = 'pendiente'
    RETURNING *
  `, [idRiesgo, acepta ? 'aceptada' : 'rechazada', (motivoRechazo || '').trim() || null]);

  return resultado.rows[0] || null;
}

// Riesgos donde a este usuario le proponen ser responsable y todavía no
// respondió — la bandeja de Notificaciones. Trae el nombre de la entidad
// (etapa/acción/proyecto) y del proyecto, mismo criterio que
// solicitudesQueries.pendientesQuePuedeResolver, para que la tarjeta diga
// de qué se trata sin que quien decide tenga que ir a buscarlo.
async function asignacionesPendientesDe(usuarioId) {
  const resultado = await pool.query(`
    WITH resuelto AS (
      SELECT
        r.*,
        u_asigna.nombre_completo AS asignado_por_nombre,
        CASE r.entidad_tipo
          WHEN 'Etapa'    THEN (SELECT e.nombre FROM etapas e WHERE e.id = r.entidad_id)
          WHEN 'Accion'   THEN (SELECT a.nombre FROM acciones a WHERE a.id = r.entidad_id)
          WHEN 'Subaccion' THEN (SELECT a.nombre FROM acciones a WHERE a.id = r.entidad_id)
          WHEN 'Tarea'    THEN (SELECT t.nombre FROM tareas t WHERE t.id = r.entidad_id)
          WHEN 'Proyecto' THEN (SELECT p.nombre FROM proyectos p WHERE p.id = r.entidad_id)
        END AS nombre_entidad,
        CASE r.entidad_tipo
          WHEN 'Etapa'     THEN (SELECT e.id_proyecto FROM etapas e WHERE e.id = r.entidad_id)
          WHEN 'Accion'    THEN (SELECT COALESCE(a.id_proyecto, e2.id_proyecto) FROM acciones a LEFT JOIN etapas e2 ON e2.id = a.id_etapa WHERE a.id = r.entidad_id)
          WHEN 'Subaccion' THEN (SELECT COALESCE(a.id_proyecto, e2.id_proyecto) FROM acciones a LEFT JOIN etapas e2 ON e2.id = a.id_etapa WHERE a.id = r.entidad_id)
          WHEN 'Tarea'     THEN (
            SELECT COALESCE(a.id_proyecto, e2.id_proyecto)
            FROM tareas t
            JOIN acciones a ON a.id = t.id_accion
            LEFT JOIN etapas e2 ON e2.id = a.id_etapa
            WHERE t.id = r.entidad_id
          )
          WHEN 'Proyecto'  THEN r.entidad_id
        END AS id_proyecto
      FROM riesgos r
      LEFT JOIN usuarios u_asigna ON u_asigna.id = r.id_asignado_por
      WHERE r.id_responsable = $1 AND r.estado_responsable = 'pendiente'
    )
    SELECT resuelto.*, p.nombre AS nombre_proyecto
    FROM resuelto
    LEFT JOIN proyectos p ON p.id = resuelto.id_proyecto
    ORDER BY resuelto.created_at DESC
  `, [usuarioId]);
  return resultado.rows;
}

// Elimina un riesgo
async function eliminarRiesgo(riesgoId) {
  const resultado = await pool.query(
    'DELETE FROM riesgos WHERE id = $1 RETURNING id',
    [riesgoId]
  );
  return resultado.rows[0] || null;
}

// Obtiene riesgos de una acción (tipo Accion + sus subacciones + las
// tareas que cuelgan de ella)
async function obtenerRiesgosPorAccion(accionId) {
  const resultado = await pool.query(`
    SELECT
      r.*,
      u_resp.nombre_completo AS responsable_nombre,
      u_rep.nombre_completo AS reportador_nombre
    FROM riesgos r
    LEFT JOIN usuarios u_resp ON u_resp.id = r.id_responsable
    LEFT JOIN usuarios u_rep ON u_rep.id = r.id_reportador
    WHERE (r.entidad_tipo = 'Accion' AND r.entidad_id = $1)
       OR (r.entidad_tipo = 'Accion' AND r.entidad_id IN (
            SELECT id FROM acciones WHERE id_accion_padre = $1
          ))
       OR (r.entidad_tipo = 'Tarea' AND r.entidad_id IN (
            SELECT id FROM tareas WHERE id_accion = $1
          ))
    ORDER BY
      CASE r.nivel WHEN 'Critico' THEN 1 WHEN 'Alto' THEN 2 WHEN 'Medio' THEN 3 ELSE 4 END,
      r.created_at DESC
  `, [accionId]);

  return resultado.rows;
}

// Obtiene riesgos de una tarea específica — nivel hoja, sin hijos que
// enrollar (a diferencia de etapa/acción).
async function obtenerRiesgosPorTarea(tareaId) {
  const resultado = await pool.query(`
    SELECT
      r.*,
      u_resp.nombre_completo AS responsable_nombre,
      u_rep.nombre_completo AS reportador_nombre
    FROM riesgos r
    LEFT JOIN usuarios u_resp ON u_resp.id = r.id_responsable
    LEFT JOIN usuarios u_rep ON u_rep.id = r.id_reportador
    WHERE r.entidad_tipo = 'Tarea' AND r.entidad_id = $1
    ORDER BY
      CASE r.nivel WHEN 'Critico' THEN 1 WHEN 'Alto' THEN 2 WHEN 'Medio' THEN 3 ELSE 4 END,
      r.created_at DESC
  `, [tareaId]);

  return resultado.rows;
}

// Obtiene riesgos de una subacción específica
async function obtenerRiesgosPorSubaccion(subaccionId) {
  const resultado = await pool.query(`
    SELECT
      r.*,
      u_resp.nombre_completo AS responsable_nombre,
      u_rep.nombre_completo AS reportador_nombre
    FROM riesgos r
    LEFT JOIN usuarios u_resp ON u_resp.id = r.id_responsable
    LEFT JOIN usuarios u_rep ON u_rep.id = r.id_reportador
    WHERE r.entidad_tipo = 'Subaccion' AND r.entidad_id = $1
    ORDER BY
      CASE r.nivel WHEN 'Critico' THEN 1 WHEN 'Alto' THEN 2 WHEN 'Medio' THEN 3 ELSE 4 END,
      r.created_at DESC
  `, [subaccionId]);

  return resultado.rows;
}

module.exports = {
  obtenerRiesgosPorProyecto,
  obtenerRiesgosPorEtapa,
  obtenerRiesgosPorAccion,
  obtenerRiesgosPorSubaccion,
  obtenerRiesgosPorTarea,
  obtenerRiesgoPorId,
  crearRiesgo,
  actualizarRiesgo,
  eliminarRiesgo,
  responderAsignacion,
  asignacionesPendientesDe,
};
