/**
 * ARCHIVO: tareas.queries.js
 * PROPÓSITO: Queries SQL para la tabla tareas (hijas de acciones).
 */
const pool = require('../pool');
const municipiosNodoQueries = require('./municipios-nodo.queries');
const { sincronizarCobertura } = require('./cobertura-sync.queries');

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
    // Espejo en cobertura_geografica (dashboard/Panorama/Vista Lista),
    // igual que hace crearAccionEnEtapa — si no, una tarea territorializada
    // desde su creación nunca aparece en esas pantallas hasta que alguien
    // vuelva a guardar su territorio manualmente.
    await sincronizarCobertura(client, 'tarea', tarea.id, cveEnt, municipios);

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

// "estado" no se escribe aquí a propósito — el estatus se cambia por
// PATCH /tareas/:id (patchAvanceSemaforo, vía cambiarEstadoUtil) o por
// PUT /estado, nunca por este PUT genérico (duplicaría la cascada en un
// tercer sitio). Todas las columnas usan COALESCE: un PUT parcial (p.
// ej. solo { nombre }) no debe borrar las demás — antes fecha_inicio/
// fecha_limite/id_responsable/observaciones se escribían sin COALESCE,
// así que un PUT así las ponía en NULL sin que nadie lo pidiera.
async function actualizarTarea(id, datos) {
  const resultado = await pool.query(`
    UPDATE tareas SET
      nombre = COALESCE($2, nombre),
      prioridad = COALESCE($3, prioridad),
      fecha_inicio = COALESCE($4, fecha_inicio),
      fecha_limite = COALESCE($5, fecha_limite),
      id_responsable = COALESCE($6, id_responsable),
      observaciones = COALESCE($7, observaciones),
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [
    id,
    datos.nombre,
    datos.prioridad,
    datos.fecha_inicio !== undefined ? datos.fecha_inicio : null,
    datos.fecha_limite !== undefined ? datos.fecha_limite : null,
    datos.id_responsable !== undefined ? datos.id_responsable : null,
    datos.observaciones !== undefined ? datos.observaciones : null
  ]);
  return resultado.rows[0] || null;
}

async function eliminarTarea(id) {
  // cobertura_geografica es polimórfica (sin FK real) y no se limpia sola al
  // borrar la tarea; se hace explícito para no dejar filas huérfanas (mismo
  // patrón que eliminarAccion en acciones.queries.js).
  await pool.query(
    "DELETE FROM cobertura_geografica WHERE tipo_entidad = 'tarea' AND id_entidad = $1",
    [id]
  );
  const resultado = await pool.query('DELETE FROM tareas WHERE id = $1 RETURNING *', [id]);
  return resultado.rows[0] || null;
}

// Un solo campo, para edición inline (Vista Lista) — mismo patrón que
// patchCampoEtapa/patchCampoAccion. "fecha_fin" es alias de fecha_limite:
// Vista Lista usa el mismo nombre de columna para los tres niveles (mismo
// concepto, "hasta cuándo"), aunque en tareas la columna real se llama
// fecha_limite. Tareas no tienen campos_extra (esa columna no existe en
// esta tabla), así que a diferencia de etapas/acciones no hay rama para
// "campos_extra.*".
// "estado" NO está en CAMPOS_DIRECTOS a propósito: escribirlo directo sin
// pasar por cambiarEstadoUtil (validaciones-estado.js) se saltaba el
// motivo de bloqueo, la fila en `bloqueos`, la auditoría, estado_override,
// y no recalculaba nada hacia arriba — el estatus se cambia desde el
// selector de Estatus (SelectorEstado → PUT /estado).
async function patchCampoTarea(tareaId, campo, valor) {
  const CAMPOS_DIRECTOS = {
    nombre: 'nombre', descripcion: 'descripcion',
    fecha_inicio: 'fecha_inicio', fecha_fin: 'fecha_limite', prioridad: 'prioridad',
  };
  if (campo === 'estado') {
    throw new Error(`Campo no permitido: ${campo} — se cambia desde el selector de Estatus (motivo de bloqueo, cascada y auditoría), no por edición en línea.`);
  }
  const columna = CAMPOS_DIRECTOS[campo];
  if (!columna) throw new Error(`Campo no permitido: ${campo}`);

  const { rows } = await pool.query(
    `UPDATE tareas SET ${columna} = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [valor, tareaId]
  );
  return rows[0] || null;
}

module.exports = {
  obtenerTareasPorAccion,
  obtenerTareaPorId,
  crearTarea,
  actualizarTarea,
  eliminarTarea,
  patchCampoTarea,
};
