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

// Crea un nuevo riesgo
async function crearRiesgo(datos) {
  const resultado = await pool.query(`
    INSERT INTO riesgos (
      titulo, descripcion, causa, impacto, nivel, tipo,
      medida_mitigacion, entidad_tipo, entidad_id,
      id_responsable, id_reportador, fecha_limite_resolucion
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING *
  `, [
    datos.titulo, datos.descripcion, datos.causa, datos.impacto,
    datos.nivel, datos.tipo,
    datos.medida_mitigacion, datos.entidad_tipo, datos.entidad_id,
    datos.id_responsable, datos.id_reportador, datos.fecha_limite_resolucion
  ]);

  return resultado.rows[0];
}

// Actualiza un riesgo
async function actualizarRiesgo(riesgoId, datos) {
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

// Elimina un riesgo
async function eliminarRiesgo(riesgoId) {
  const resultado = await pool.query(
    'DELETE FROM riesgos WHERE id = $1 RETURNING id',
    [riesgoId]
  );
  return resultado.rows[0] || null;
}

module.exports = {
  obtenerRiesgosPorProyecto,
  obtenerRiesgosPorEtapa,
  obtenerRiesgoPorId,
  crearRiesgo,
  actualizarRiesgo,
  eliminarRiesgo
};
