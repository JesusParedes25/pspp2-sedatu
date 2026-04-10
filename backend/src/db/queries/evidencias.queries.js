/**
 * ARCHIVO: evidencias.queries.js
 * PROPÓSITO: Queries SQL para la tabla evidencias y la integración con MinIO.
 *
 * MINI-CLASE: MinIO y almacenamiento de archivos
 * ─────────────────────────────────────────────────────────────────
 * MinIO es un servidor de almacenamiento compatible con Amazon S3.
 * Los archivos se guardan en "buckets" (como carpetas raíz). La BD
 * solo guarda la RUTA al archivo en MinIO (ruta_minio), no el archivo
 * en sí. Cuando el usuario descarga, el backend pide el archivo a
 * MinIO y lo transmite como stream al navegador. Esto desacopla el
 * almacenamiento de la BD y permite escalar independientemente.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');

// Obtiene evidencias de una acción
async function obtenerEvidenciasPorAccion(accionId) {
  const resultado = await pool.query(`
    SELECT
      ev.*,
      u.nombre_completo AS autor_nombre
    FROM evidencias ev
    LEFT JOIN usuarios u ON u.id = ev.id_autor
    WHERE ev.id_accion = $1
    ORDER BY ev.created_at DESC
  `, [accionId]);

  return resultado.rows;
}

// Obtiene evidencias de un riesgo
async function obtenerEvidenciasPorRiesgo(riesgoId) {
  const resultado = await pool.query(`
    SELECT
      ev.*,
      u.nombre_completo AS autor_nombre
    FROM evidencias ev
    LEFT JOIN usuarios u ON u.id = ev.id_autor
    WHERE ev.id_riesgo = $1
    ORDER BY ev.created_at DESC
  `, [riesgoId]);

  return resultado.rows;
}

// Obtiene evidencias de una subacción
async function obtenerEvidenciasPorSubaccion(subaccionId) {
  const resultado = await pool.query(`
    SELECT
      ev.*,
      u.nombre_completo AS autor_nombre
    FROM evidencias ev
    LEFT JOIN usuarios u ON u.id = ev.id_autor
    WHERE ev.id_subaccion = $1
    ORDER BY ev.created_at DESC
  `, [subaccionId]);

  return resultado.rows;
}

// Obtiene todas las evidencias de un proyecto (a través de sus acciones)
async function obtenerEvidenciasPorProyecto(proyectoId) {
  const resultado = await pool.query(`
    SELECT
      ev.*,
      u.nombre_completo AS autor_nombre,
      a.nombre AS accion_nombre,
      e.nombre AS etapa_nombre
    FROM evidencias ev
    LEFT JOIN usuarios u ON u.id = ev.id_autor
    LEFT JOIN acciones a ON a.id = ev.id_accion
    LEFT JOIN etapas e ON e.id = a.id_etapa
    WHERE a.id_proyecto = $1
    ORDER BY ev.created_at DESC
  `, [proyectoId]);

  return resultado.rows;
}

// Obtiene una evidencia por ID
async function obtenerEvidenciaPorId(evidenciaId) {
  const resultado = await pool.query(
    'SELECT * FROM evidencias WHERE id = $1',
    [evidenciaId]
  );
  return resultado.rows[0] || null;
}

// Crea un registro de evidencia (después de subir el archivo a MinIO)
async function crearEvidencia(datos) {
  const resultado = await pool.query(`
    INSERT INTO evidencias (
      nombre_archivo, nombre_original, ruta_minio, tipo_archivo,
      categoria, tamano_bytes, notas, fecha_generacion,
      id_accion, id_riesgo, id_subaccion, id_autor
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING *
  `, [
    datos.nombre_archivo, datos.nombre_original, datos.ruta_minio,
    datos.tipo_archivo, datos.categoria || 'Otro', datos.tamano_bytes,
    datos.notas, datos.fecha_generacion,
    datos.id_accion || null, datos.id_riesgo || null,
    datos.id_subaccion || null, datos.id_autor
  ]);

  return resultado.rows[0];
}

// Elimina una evidencia (el archivo en MinIO se elimina en el controller)
async function eliminarEvidencia(evidenciaId) {
  const resultado = await pool.query(
    'DELETE FROM evidencias WHERE id = $1 RETURNING *',
    [evidenciaId]
  );
  return resultado.rows[0] || null;
}

// Obtiene todas las evidencias del sistema con datos de proyecto, etapa y autor
async function obtenerTodasEvidencias(filtros = {}) {
  const condiciones = [];
  const params = [];
  let idx = 1;

  if (filtros.proyecto_id) {
    condiciones.push(`a.id_proyecto = $${idx++}`);
    params.push(filtros.proyecto_id);
  }
  if (filtros.categoria) {
    condiciones.push(`ev.categoria = $${idx++}`);
    params.push(filtros.categoria);
  }
  if (filtros.programa_id) {
    condiciones.push(`p.id_programa = $${idx++}`);
    params.push(filtros.programa_id);
  }
  if (filtros.id_dg) {
    condiciones.push(`p.id_dg_lider = $${idx++}`);
    params.push(filtros.id_dg);
  }
  if (filtros.responsable_id) {
    condiciones.push(`ev.id_autor = $${idx++}`);
    params.push(filtros.responsable_id);
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

  const resultado = await pool.query(`
    SELECT
      ev.*,
      u.nombre_completo AS autor_nombre,
      a.nombre AS accion_nombre,
      et.nombre AS etapa_nombre,
      p.nombre AS proyecto_nombre,
      p.id AS proyecto_id,
      dg.siglas AS dg_siglas,
      prog.clave AS programa_clave
    FROM evidencias ev
    LEFT JOIN usuarios u ON u.id = ev.id_autor
    LEFT JOIN acciones a ON a.id = ev.id_accion
    LEFT JOIN etapas et ON et.id = a.id_etapa
    LEFT JOIN proyectos p ON p.id = a.id_proyecto
    LEFT JOIN direcciones_generales dg ON dg.id = p.id_dg_lider
    LEFT JOIN programas prog ON prog.id = p.id_programa
    ${where}
    ORDER BY ev.created_at DESC
    LIMIT 200
  `, params);

  return resultado.rows;
}

module.exports = {
  obtenerEvidenciasPorAccion,
  obtenerEvidenciasPorRiesgo,
  obtenerEvidenciasPorSubaccion,
  obtenerEvidenciasPorProyecto,
  obtenerEvidenciaPorId,
  crearEvidencia,
  eliminarEvidencia,
  obtenerTodasEvidencias
};
