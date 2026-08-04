/**
 * ARCHIVO: tareas.queries.js
 * PROPÓSITO: Queries SQL para la tabla tareas (hijas de acciones).
 */
const pool = require('../pool');
const municipiosNodoQueries = require('./municipios-nodo.queries');

async function obtenerTareasPorAccion(accionId) {
  const resultado = await pool.query(`
    SELECT t.*, u.nombre_completo AS responsable_nombre,
      (SELECT COALESCE(json_agg(json_build_object('cve_mun', tm.cve_mun, 'nombre', gm.nombre) ORDER BY gm.nombre), '[]'::json)
         FROM tarea_municipios tm JOIN geo_municipios gm ON gm.cvegeo = tm.cve_mun
         WHERE tm.tarea_id = t.id) AS municipios
    FROM tareas t
    LEFT JOIN usuarios u ON u.id = t.id_responsable
    WHERE t.id_accion = $1
    ORDER BY t.orden, t.created_at
  `, [accionId]);
  return resultado.rows;
}

async function obtenerTareaPorId(id) {
  const resultado = await pool.query(`
    SELECT t.*,
      (SELECT COALESCE(json_agg(json_build_object('cve_mun', tm.cve_mun, 'nombre', gm.nombre) ORDER BY gm.nombre), '[]'::json)
         FROM tarea_municipios tm JOIN geo_municipios gm ON gm.cvegeo = tm.cve_mun
         WHERE tm.tarea_id = t.id) AS municipios
    FROM tareas t WHERE t.id = $1
  `, [id]);
  return resultado.rows[0] || null;
}

// Crea una tarea heredando el territorio (cve_ent + municipios) de su
// acción padre, salvo que la tarea especifique el suyo propio.
async function crearTarea(datos) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: accionRows } = await client.query('SELECT cve_ent FROM acciones WHERE id = $1', [datos.id_accion]);
    const cveEnt = datos.cve_ent !== undefined ? (datos.cve_ent || null) : (accionRows[0]?.cve_ent || null);

    const resultado = await client.query(`
      INSERT INTO tareas (nombre, id_accion, estado, prioridad, fecha_inicio, fecha_limite, id_responsable, observaciones, orden, cve_ent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, (SELECT COALESCE(MAX(orden),0)+1 FROM tareas WHERE id_accion=$2)), $10)
      RETURNING *
    `, [
      datos.nombre,
      datos.id_accion,
      datos.estado || 'Pendiente',
      datos.prioridad || 'Media',
      datos.fecha_inicio || null,
      datos.fecha_limite || null,
      datos.id_responsable || null,
      datos.observaciones || null,
      datos.orden || null,
      cveEnt
    ]);

    const tarea = resultado.rows[0];

    let municipios = [];
    if (cveEnt) {
      if (Array.isArray(datos.municipios)) {
        municipios = [...new Set(datos.municipios.filter(Boolean))];
      } else {
        const heredados = await municipiosNodoQueries.obtenerMunicipiosAccion(datos.id_accion, client);
        municipios = heredados.map(m => m.cve_mun);
      }
      if (municipios.length > 0) {
        await municipiosNodoQueries.reemplazarMunicipiosTarea(client, tarea.id, municipios);
      }
    }

    await client.query('COMMIT');

    tarea.municipios = municipios.length > 0
      ? await municipiosNodoQueries.obtenerMunicipiosTarea(tarea.id)
      : [];
    return tarea;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function actualizarTarea(id, datos) {
  const resultado = await pool.query(`
    UPDATE tareas SET
      nombre = COALESCE($2, nombre),
      estado = COALESCE($3, estado),
      prioridad = COALESCE($4, prioridad),
      fecha_inicio = $5,
      fecha_limite = $6,
      id_responsable = $7,
      observaciones = $8,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [
    id,
    datos.nombre,
    datos.estado,
    datos.prioridad,
    datos.fecha_inicio !== undefined ? datos.fecha_inicio : null,
    datos.fecha_limite !== undefined ? datos.fecha_limite : null,
    datos.id_responsable !== undefined ? datos.id_responsable : null,
    datos.observaciones !== undefined ? datos.observaciones : null
  ]);
  return resultado.rows[0] || null;
}

async function eliminarTarea(id) {
  const resultado = await pool.query('DELETE FROM tareas WHERE id = $1 RETURNING *', [id]);
  return resultado.rows[0] || null;
}

module.exports = {
  obtenerTareasPorAccion,
  obtenerTareaPorId,
  crearTarea,
  actualizarTarea,
  eliminarTarea
};
