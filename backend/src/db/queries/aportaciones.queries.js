/**
 * ARCHIVO: aportaciones.queries.js
 * PROPÓSITO: Consultas SQL para aportaciones de nodos a indicadores.
 */
const pool = require('../pool');

// Trae también de qué proyecto es cada nodo: una aportación puede venir
// de un proyecto distinto al dueño del indicador (el módulo permite
// asociar cualquier etapa/acción/tarea, de uno o varios proyectos) — sin
// esto, la pantalla de detalle del indicador no podría distinguir un
// nodo "de este proyecto" de uno ajeno.
async function listarPorIndicador(indicadorId) {
  const res = await pool.query(`
    SELECT ia.*,
      e.nombre AS etapa_nombre,
      a.nombre AS accion_nombre,
      t.nombre AS tarea_nombre,
      ic.nombre AS categoria_nombre,
      COALESCE(pe.id, pa.id, pta.id) AS nodo_proyecto_id,
      COALESCE(pe.nombre, pa.nombre, pta.nombre) AS nodo_proyecto_nombre,
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
    LEFT JOIN acciones ta ON ta.id = t.id_accion
    LEFT JOIN proyectos pe ON pe.id = e.id_proyecto
    LEFT JOIN proyectos pa ON pa.id = a.id_proyecto
    LEFT JOIN proyectos pta ON pta.id = ta.id_proyecto
    LEFT JOIN indicador_categorias ic ON ic.id = ia.id_categoria
    WHERE ia.id_indicador = $1
    ORDER BY ia.created_at
  `, [indicadorId]);
  return res.rows;
}

async function listarPorNodo(tipo, nodoId) {
  const col = tipo === 'etapa' ? 'id_etapa' : tipo === 'tarea' ? 'id_tarea' : 'id_accion';
  const res = await pool.query(`
    SELECT ia.*, i.nombre AS indicador_nombre, i.unidad, i.unidad_personalizada, i.etiqueta_unidad, i.tipo AS indicador_tipo,
      i.composicion, ic.nombre AS categoria_nombre
    FROM indicador_aportaciones ia
    JOIN indicadores i ON i.id = ia.id_indicador
    LEFT JOIN indicador_categorias ic ON ic.id = ia.id_categoria
    WHERE ia.${col} = $1 AND i.activo = true
    ORDER BY i.nombre
  `, [nodoId]);

  // Un chip editable de categoría necesita la lista completa de
  // categorías del indicador (no solo la elegida) — batch-load igual
  // que cargarCategorias en indicadores.queries.js, para no traer una
  // dependencia circular entre ambos módulos de queries.
  const idsConCategorias = [...new Set(res.rows.filter(r => r.composicion === 'Categorias').map(r => r.id_indicador))];
  if (idsConCategorias.length > 0) {
    const { rows: categorias } = await pool.query(
      'SELECT * FROM indicador_categorias WHERE id_indicador = ANY($1) ORDER BY orden, created_at',
      [idsConCategorias]
    );
    const porIndicador = {};
    for (const c of categorias) {
      if (!porIndicador[c.id_indicador]) porIndicador[c.id_indicador] = [];
      porIndicador[c.id_indicador].push(c);
    }
    for (const row of res.rows) {
      if (row.composicion === 'Categorias') row.categorias = porIndicador[row.id_indicador] || [];
    }
  }

  return res.rows;
}

// Un indicador composicion='Categorias' exige que toda aportación
// diga a cuál categoría pertenece (si no, el rollup por categoría de
// recalcularUnIndicador no tendría dónde atribuirla); un indicador
// composicion='Simple' no admite id_categoria (solo puede llegar por
// un bug de frontend, mismo criterio que validarComposicion en
// indicadores.queries.js). Se valida aquí, no en el controller, para
// que crear/actualizar compartan la misma regla sin duplicarla.
async function validarCategoriaAportacion(idIndicador, idCategoria) {
  const { rows: [ind] } = await pool.query(
    'SELECT composicion FROM indicadores WHERE id = $1', [idIndicador]
  );
  if (!ind) {
    const err = new Error('Indicador no encontrado');
    err.statusCode = 404;
    throw err;
  }
  if (ind.composicion === 'Categorias' && !idCategoria) {
    const err = new Error('Este indicador se compone de categorías: indica cuál aporta');
    err.statusCode = 400;
    err.codigo = 'CATEGORIA_REQUERIDA';
    throw err;
  }
  if (ind.composicion !== 'Categorias' && idCategoria) {
    const err = new Error('Este indicador no se compone de categorías');
    err.statusCode = 400;
    err.codigo = 'CATEGORIA_NO_APLICA';
    throw err;
  }
  if (idCategoria) {
    const { rows: [cat] } = await pool.query(
      'SELECT 1 FROM indicador_categorias WHERE id = $1 AND id_indicador = $2', [idCategoria, idIndicador]
    );
    if (!cat) {
      const err = new Error('La categoría indicada no pertenece a este indicador');
      err.statusCode = 400;
      err.codigo = 'CATEGORIA_INVALIDA';
      throw err;
    }
  }
}

// Vincular el mismo nodo dos veces al mismo indicador ya no sobrescribe
// en silencio — antes caía en un ON CONFLICT DO UPDATE sin que nadie
// se enterara de que el monto/modo de la primera vinculación se había
// perdido. Ahora un INSERT simple, y la violación de unicidad
// (Postgres 23505, disparada por los índices únicos parciales de
// id_etapa/id_accion/id_tarea) se relanza como un error 409 tipado
// con la fila existente adjunta — el controller decide si mostrarla
// para pedir confirmación explícita antes de sobreescribir.
async function crear(datos, client = null) {
  const db = client || pool;
  const { id_indicador, id_etapa, id_accion, id_tarea, id_categoria, aportacion, modo } = datos;
  try {
    const res = await db.query(`
      INSERT INTO indicador_aportaciones (id_indicador, id_etapa, id_accion, id_tarea, id_categoria, aportacion, modo)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [id_indicador, id_etapa || null, id_accion || null, id_tarea || null, id_categoria || null, aportacion || 0, modo || 'proporcional']);
    return res.rows[0];
  } catch (pgErr) {
    if (pgErr.code === '23505') {
      const col = id_etapa ? 'id_etapa' : id_accion ? 'id_accion' : 'id_tarea';
      const valorCol = id_etapa || id_accion || id_tarea;
      const { rows: [existente] } = await db.query(
        `SELECT * FROM indicador_aportaciones WHERE id_indicador = $1 AND ${col} = $2`,
        [id_indicador, valorCol]
      );
      const err = new Error('Este nodo ya está vinculado a este indicador');
      err.statusCode = 409;
      err.codigo = 'YA_VINCULADO';
      err.aportacionExistente = existente;
      throw err;
    }
    throw pgErr;
  }
}

async function actualizar(id, datos) {
  const campos = [];
  const vals = [];
  let idx = 1;
  if (datos.aportacion !== undefined) { campos.push(`aportacion = $${idx++}`); vals.push(datos.aportacion); }
  if (datos.modo !== undefined) { campos.push(`modo = $${idx++}`); vals.push(datos.modo); }
  if (datos.id_categoria !== undefined) { campos.push(`id_categoria = $${idx++}`); vals.push(datos.id_categoria); }
  if (campos.length === 0) return null;
  vals.push(id);
  const res = await pool.query(
    `UPDATE indicador_aportaciones SET ${campos.join(', ')} WHERE id = $${idx} RETURNING *`,
    vals
  );
  return res.rows[0];
}

async function obtenerIndicadorDeAportacion(id) {
  const { rows: [row] } = await pool.query(
    'SELECT id_indicador FROM indicador_aportaciones WHERE id = $1', [id]
  );
  return row?.id_indicador || null;
}

async function eliminar(id) {
  const res = await pool.query('DELETE FROM indicador_aportaciones WHERE id = $1 RETURNING id, id_indicador', [id]);
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
    SELECT ia.aportacion, ia.modo, ia.id_etapa, ia.id_accion, ia.id_tarea, ia.id_categoria,
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
  const porCategoria = {};

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

    if (row.id_categoria) {
      porCategoria[row.id_categoria] = (porCategoria[row.id_categoria] || 0) + realizado;
    }
  }

  return { total, porAnio, porCategoria };
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
 * Recalcula valor_actual de UN solo indicador — usada justo después de
 * crear/editar/eliminar una aportación, para que el número no se quede
 * obsoleto hasta el próximo cambio de estado de cualquier nodo del
 * proyecto (que es cuando recalcularAportacionesProyecto vuelve a correr).
 * Caso concreto que esto arregla: vincular un nodo YA completado con
 * modo 'al_concluir' — sin esto, el indicador se queda en 0 hasta que
 * algo más, sin relación, dispare un recálculo del proyecto.
 */
async function recalcularUnIndicador(indicadorId, client = null) {
  const db = client || pool;
  const { total, porCategoria } = await calcularValorRealizado(indicadorId, db);

  const { rows: [ind] } = await db.query(
    'SELECT composicion FROM indicadores WHERE id = $1', [indicadorId]
  );

  if (ind?.composicion === 'Categorias') {
    // Cada categoría con aportaciones de nodo se escribe con lo
    // realizado por esos nodos (0 si dejó de tener aportaciones); el
    // total del indicador es el rollup por SUMA de todas sus
    // categorías (mismo patrón que establecerValorManual), no el
    // `total` de calcularValorRealizado — categorías sin aportación
    // de nodo pueden seguir teniendo un valor capturado a mano que
    // este recálculo no debe tocar ni perder.
    const { rows: categorias } = await db.query(
      'SELECT id FROM indicador_categorias WHERE id_indicador = $1', [indicadorId]
    );
    for (const cat of categorias) {
      if (Object.prototype.hasOwnProperty.call(porCategoria, cat.id)) {
        await db.query(
          'UPDATE indicador_categorias SET valor_actual = $1 WHERE id = $2',
          [porCategoria[cat.id], cat.id]
        );
      }
    }
    const { rows: [suma] } = await db.query(
      'SELECT COALESCE(SUM(valor_actual), 0)::numeric AS total FROM indicador_categorias WHERE id_indicador = $1',
      [indicadorId]
    );
    await db.query(
      'UPDATE indicadores SET valor_actual = $1, updated_at = NOW() WHERE id = $2',
      [suma.total, indicadorId]
    );
    return suma.total;
  }

  await db.query(
    'UPDATE indicadores SET valor_actual = $1, updated_at = NOW() WHERE id = $2',
    [total, indicadorId]
  );
  return total;
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
    await recalcularUnIndicador(row.id_indicador, db);
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
  recalcularUnIndicador,
  recalcularAportacionesProyecto,
  validarCategoriaAportacion,
  obtenerIndicadorDeAportacion,
};
