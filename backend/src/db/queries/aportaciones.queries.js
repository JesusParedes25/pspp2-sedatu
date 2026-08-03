/**
 * ARCHIVO: aportaciones.queries.js
 * PROPÓSITO: Consultas SQL para aportaciones de nodos a indicadores.
 */
const pool = require('../pool');

async function listarPorIndicador(indicadorId) {
  const res = await pool.query(`
    SELECT ia.*,
      e.nombre AS etapa_nombre,
      a.nombre AS accion_nombre,
      t.nombre AS tarea_nombre,
      COALESCE(
        CASE WHEN ia.id_etapa IS NOT NULL THEN COALESCE(e.avance_actual, e.porcentaje_calculado) END,
        CASE WHEN ia.id_accion IS NOT NULL THEN COALESCE(a.avance_actual, a.porcentaje_avance) END,
        CASE WHEN ia.id_tarea IS NOT NULL THEN t.avance_actual END,
        0
      )::numeric AS avance_efectivo,
      COALESCE(e.estado, a.estado, t.estado) AS estado_nodo
    FROM indicador_aportaciones ia
    LEFT JOIN etapas e ON e.id = ia.id_etapa
    LEFT JOIN acciones a ON a.id = ia.id_accion
    LEFT JOIN tareas t ON t.id = ia.id_tarea
    WHERE ia.id_indicador = $1
    ORDER BY ia.created_at
  `, [indicadorId]);
  return res.rows;
}

async function listarPorNodo(tipo, nodoId) {
  const col = tipo === 'etapa' ? 'id_etapa' : tipo === 'tarea' ? 'id_tarea' : 'id_accion';
  const res = await pool.query(`
    SELECT ia.*, i.nombre AS indicador_nombre, i.unidad, i.unidad_personalizada, i.etiqueta_unidad, i.tipo AS indicador_tipo
    FROM indicador_aportaciones ia
    JOIN indicadores i ON i.id = ia.id_indicador
    WHERE ia.${col} = $1 AND i.activo = true
    ORDER BY i.nombre
  `, [nodoId]);
  return res.rows;
}

async function crear(datos) {
  const { id_indicador, id_etapa, id_accion, id_tarea, aportacion, modo } = datos;
  const conflictCol = id_etapa ? 'id_etapa' : id_accion ? 'id_accion' : 'id_tarea';
  const res = await pool.query(`
    INSERT INTO indicador_aportaciones (id_indicador, id_etapa, id_accion, id_tarea, aportacion, modo)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (id_indicador, ${conflictCol}) WHERE ${conflictCol} IS NOT NULL
    DO UPDATE SET aportacion = $5, modo = $6
    RETURNING *
  `, [id_indicador, id_etapa || null, id_accion || null, id_tarea || null, aportacion || 0, modo || 'proporcional']);
  return res.rows[0];
}

async function actualizar(id, datos) {
  const campos = [];
  const vals = [];
  let idx = 1;
  if (datos.aportacion !== undefined) { campos.push(`aportacion = $${idx++}`); vals.push(datos.aportacion); }
  if (datos.modo !== undefined) { campos.push(`modo = $${idx++}`); vals.push(datos.modo); }
  if (campos.length === 0) return null;
  vals.push(id);
  const res = await pool.query(
    `UPDATE indicador_aportaciones SET ${campos.join(', ')} WHERE id = $${idx} RETURNING *`,
    vals
  );
  return res.rows[0];
}

async function eliminar(id) {
  const res = await pool.query('DELETE FROM indicador_aportaciones WHERE id = $1 RETURNING id', [id]);
  return res.rows[0];
}

async function eliminarPorNodo(tipo, nodoId) {
  const col = tipo === 'etapa' ? 'id_etapa' : tipo === 'tarea' ? 'id_tarea' : 'id_accion';
  await pool.query(`DELETE FROM indicador_aportaciones WHERE ${col} = $1`, [nodoId]);
}

/**
 * Calcula el valor realizado de un indicador.
 * factor = avance_efectivo/100 si proporcional, 1 si concluido y al_concluir, else 0
 */
async function calcularValorRealizado(indicadorId, client = null) {
  const db = client || pool;
  const res = await db.query(`
    SELECT ia.aportacion, ia.modo, ia.id_etapa, ia.id_accion, ia.id_tarea,
      COALESCE(
        CASE WHEN ia.id_etapa IS NOT NULL THEN COALESCE(e.avance_actual, e.porcentaje_calculado) END,
        CASE WHEN ia.id_accion IS NOT NULL THEN COALESCE(a.avance_actual, a.porcentaje_avance) END,
        CASE WHEN ia.id_tarea IS NOT NULL THEN t.avance_actual END,
        0
      )::numeric AS avance,
      COALESCE(e.estado, a.estado, t.estado, 'Pendiente') AS estado,
      COALESCE(e.fecha_limite, a.fecha_limite, t.fecha_limite) AS fecha_limite,
      a.fecha_fin_real
    FROM indicador_aportaciones ia
    LEFT JOIN etapas e ON e.id = ia.id_etapa
    LEFT JOIN acciones a ON a.id = ia.id_accion
    LEFT JOIN tareas t ON t.id = ia.id_tarea
    WHERE ia.id_indicador = $1
  `, [indicadorId]);

  let total = 0;
  const porAnio = {};

  for (const row of res.rows) {
    const aportacion = parseFloat(row.aportacion) || 0;
    let factor = 0;
    if (row.modo === 'proporcional') {
      factor = (parseFloat(row.avance) || 0) / 100;
    } else {
      // al_concluir
      factor = (row.estado === 'Completada' || row.estado === 'Concluido') ? 1 : 0;
    }
    const realizado = aportacion * factor;
    total += realizado;

    // Atribuir al año de fecha_limite o fecha_fin_real
    const fecha = row.fecha_fin_real || row.fecha_limite;
    const anio = fecha ? new Date(fecha).getFullYear() : null;
    if (anio) {
      porAnio[anio] = (porAnio[anio] || 0) + realizado;
    }
  }

  return { total, porAnio };
}

/**
 * Detecta double-counting: si un nodo y su ancestro/descendiente contribuyen al mismo indicador.
 */
async function detectarDobleConteo(indicadorId) {
  const warnings = [];
  const aportaciones = await pool.query(`
    SELECT ia.id_etapa, ia.id_accion, ia.id_tarea FROM indicador_aportaciones ia WHERE ia.id_indicador = $1
  `, [indicadorId]);

  const etapaIds = aportaciones.rows.filter(r => r.id_etapa).map(r => r.id_etapa);
  const accionIds = aportaciones.rows.filter(r => r.id_accion).map(r => r.id_accion);
  const tareaIds = aportaciones.rows.filter(r => r.id_tarea).map(r => r.id_tarea);

  if (etapaIds.length > 0 && accionIds.length > 0) {
    // Check if any accion belongs to any etapa that also contributes
    const overlap = await pool.query(`
      SELECT a.id AS id_accion, a.nombre AS accion_nombre, e.id AS id_etapa, e.nombre AS etapa_nombre
      FROM acciones a
      JOIN etapas e ON e.id = a.id_etapa
      WHERE a.id = ANY($1) AND e.id = ANY($2)
    `, [accionIds, etapaIds]);

    for (const row of overlap.rows) {
      warnings.push({
        tipo: 'doble_conteo',
        mensaje: `La acción "${row.accion_nombre}" y su etapa "${row.etapa_nombre}" ambas aportan a este indicador.`,
        id_etapa: row.id_etapa,
        id_accion: row.id_accion
      });
    }
  }

  if (accionIds.length > 0 && tareaIds.length > 0) {
    // Check if any tarea belongs to any accion that also contributes
    const overlap = await pool.query(`
      SELECT t.id AS id_tarea, t.nombre AS tarea_nombre, a.id AS id_accion, a.nombre AS accion_nombre
      FROM tareas t
      JOIN acciones a ON a.id = t.id_accion
      WHERE t.id = ANY($1) AND a.id = ANY($2)
    `, [tareaIds, accionIds]);

    for (const row of overlap.rows) {
      warnings.push({
        tipo: 'doble_conteo',
        mensaje: `La tarea "${row.tarea_nombre}" y su acción "${row.accion_nombre}" ambas aportan a este indicador.`,
        id_accion: row.id_accion,
        id_tarea: row.id_tarea
      });
    }
  }

  if (etapaIds.length > 0 && tareaIds.length > 0) {
    // Check if any tarea belongs (via su acción) a alguna etapa que también aporta
    const overlap = await pool.query(`
      SELECT t.id AS id_tarea, t.nombre AS tarea_nombre, e.id AS id_etapa, e.nombre AS etapa_nombre
      FROM tareas t
      JOIN acciones a ON a.id = t.id_accion
      JOIN etapas e ON e.id = a.id_etapa
      WHERE t.id = ANY($1) AND e.id = ANY($2)
    `, [tareaIds, etapaIds]);

    for (const row of overlap.rows) {
      warnings.push({
        tipo: 'doble_conteo',
        mensaje: `La tarea "${row.tarea_nombre}" y su etapa "${row.etapa_nombre}" ambas aportan a este indicador.`,
        id_etapa: row.id_etapa,
        id_tarea: row.id_tarea
      });
    }
  }

  return warnings;
}

/**
 * Recalculates valor_actual for ALL indicators of a project that have aportaciones.
 * Called after estado/avance changes to keep indicator values in sync.
 */
async function recalcularAportacionesProyecto(proyectoId, client = null) {
  const db = client || pool;
  const res = await db.query(`
    SELECT DISTINCT ia.id_indicador
    FROM indicador_aportaciones ia
    JOIN indicadores i ON i.id = ia.id_indicador
    WHERE i.id_proyecto = $1 AND i.activo = true
  `, [proyectoId]);

  for (const row of res.rows) {
    const { total } = await calcularValorRealizado(row.id_indicador, db);
    await db.query(
      'UPDATE indicadores SET valor_actual = $1, updated_at = NOW() WHERE id = $2',
      [total, row.id_indicador]
    );
  }
}

module.exports = {
  listarPorIndicador,
  listarPorNodo,
  crear,
  actualizar,
  eliminar,
  eliminarPorNodo,
  calcularValorRealizado,
  detectarDobleConteo,
  recalcularAportacionesProyecto
};
