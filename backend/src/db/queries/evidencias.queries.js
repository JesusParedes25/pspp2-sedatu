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

// Obtiene evidencias de una etapa
async function obtenerEvidenciasPorEtapa(etapaId) {
  const resultado = await pool.query(`
    SELECT
      ev.*,
      u.nombre_completo AS autor_nombre
    FROM evidencias ev
    LEFT JOIN usuarios u ON u.id = ev.id_autor
    WHERE ev.id_etapa = $1
    ORDER BY ev.created_at DESC
  `, [etapaId]);
  return resultado.rows;
}

// Obtiene todas las evidencias de un proyecto (a través de sus acciones)
async function obtenerEvidenciasPorProyecto(proyectoId) {
  const resultado = await pool.query(`
    SELECT
      ev.*,
      u.nombre_completo AS autor_nombre,
      COALESCE(a.nombre, sa.nombre) AS accion_nombre,
      COALESCE(e1.nombre, e2.nombre) AS etapa_nombre
    FROM evidencias ev
    LEFT JOIN usuarios u ON u.id = ev.id_autor
    LEFT JOIN acciones a  ON a.id  = ev.id_accion
    LEFT JOIN etapas   e1 ON e1.id = a.id_etapa
    LEFT JOIN acciones sa ON sa.id = ev.id_subaccion
    LEFT JOIN acciones sa_padre ON sa_padre.id = sa.id_accion_padre
    LEFT JOIN etapas   e2 ON e2.id = sa_padre.id_etapa
    WHERE
      (a.id_proyecto = $1)
      OR (sa.id_proyecto = $1)
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

// Crea un registro de evidencia (archivo MinIO o link externo)
async function crearEvidencia(datos) {
  const resultado = await pool.query(`
    INSERT INTO evidencias (
      nombre_archivo, nombre_original, ruta_minio, tipo_archivo,
      categoria, tamano_bytes, notas, fecha_generacion,
      id_accion, id_riesgo, id_subaccion, id_autor, id_etapa,
      url, tipo_medio
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    RETURNING *
  `, [
    datos.nombre_archivo || null, datos.nombre_original || null, datos.ruta_minio || null,
    datos.tipo_archivo || null, datos.categoria || 'Otro', datos.tamano_bytes || null,
    datos.notas || null, datos.fecha_generacion || null,
    datos.id_accion || null, datos.id_riesgo || null,
    datos.id_subaccion || null, datos.id_autor, datos.id_etapa || null,
    datos.url || null, datos.tipo_medio || 'archivo'
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
/**
 * Lista evidencias de TODOS los proyectos (módulo global).
 * A diferencia de las consultas por accion/etapa, aquí la evidencia puede
 * colgar de exactamente uno de: id_etapa, id_accion, id_subaccion, id_riesgo
 * (constraint chk_evidencia_pertenencia) — hay que resolver el proyecto,
 * etapa y acción "padre" según cuál de esos 4 esté presente.
 *
 * @param {object} filtros - proyecto_id, categoria, programa_id, id_dg, responsable_id
 * @param {string[]|null} proyectoIds - restricción de acceso: null = sin restricción
 *   (superadmin/ejecutivo), array = solo esos proyectos (colaborador o dirección).
 */
async function obtenerTodasEvidencias(filtros = {}, proyectoIds = null) {
  const condiciones = [];
  const params = [];
  let idx = 1;

  if (proyectoIds !== null) {
    condiciones.push(`p.id = ANY($${idx++})`);
    params.push(proyectoIds);
  }
  if (filtros.proyecto_id) {
    condiciones.push(`p.id = $${idx++}`);
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
      COALESCE(acc.nombre, subacc.nombre) AS accion_nombre,
      COALESCE(et_directa.nombre, et_de_accion.nombre, et_de_subaccion.nombre, et_de_riesgo.nombre) AS etapa_nombre,
      r.titulo AS riesgo_titulo,
      p.nombre AS proyecto_nombre,
      p.id AS proyecto_id,
      dg.siglas AS dg_siglas,
      prog.clave AS programa_clave
    FROM evidencias ev
    LEFT JOIN usuarios u ON u.id = ev.id_autor
    LEFT JOIN etapas et_directa ON et_directa.id = ev.id_etapa
    LEFT JOIN acciones acc ON acc.id = ev.id_accion
    LEFT JOIN acciones subacc ON subacc.id = ev.id_subaccion
    LEFT JOIN etapas et_de_accion ON et_de_accion.id = acc.id_etapa
    LEFT JOIN etapas et_de_subaccion ON et_de_subaccion.id = subacc.id_etapa
    LEFT JOIN riesgos r ON r.id = ev.id_riesgo
    LEFT JOIN etapas et_de_riesgo ON r.entidad_tipo = 'Etapa' AND et_de_riesgo.id = r.entidad_id
    LEFT JOIN acciones ac_de_riesgo ON r.entidad_tipo IN ('Accion','Subaccion') AND ac_de_riesgo.id = r.entidad_id
    LEFT JOIN proyectos p ON p.id = COALESCE(
      et_directa.id_proyecto,
      acc.id_proyecto,
      subacc.id_proyecto,
      ac_de_riesgo.id_proyecto,
      CASE WHEN r.entidad_tipo = 'Proyecto' THEN r.entidad_id END
    )
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
  obtenerEvidenciasPorEtapa,
  obtenerEvidenciasPorRiesgo,
  obtenerEvidenciasPorSubaccion,
  obtenerEvidenciasPorProyecto,
  obtenerEvidenciaPorId,
  crearEvidencia,
  eliminarEvidencia,
  obtenerTodasEvidencias
};
