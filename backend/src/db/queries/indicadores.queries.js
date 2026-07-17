/**
 * ARCHIVO: indicadores.queries.js
 * PROPÓSITO: Consultas SQL para el CRUD de indicadores de proyecto,
 *            incluyendo metas anuales y lectura agregada.
 *
 * MINI-CLASE: Indicadores presupuestarios en proyectos SEDATU
 * ─────────────────────────────────────────────────────────────────
 * Un proyecto puede tener N indicadores (avance físico, financiero,
 * monto, cobertura, etc.). Cada indicador tiene una meta global y
 * opcionalmente metas anuales desglosadas por ejercicio fiscal.
 * El campo acumulacion define cómo se agregan valores de acciones:
 * Suma (100+200=300), Ultimo_valor (solo el más reciente), o
 * Promedio. Las metas anuales se insertan/actualizan en lote
 * cuando el usuario configura temporalidad 'Anual'.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');

// Lista indicadores de nivel proyecto (id_etapa IS NULL) con sus metas anuales
async function listarPorProyecto(proyectoId) {
  const indicadores = await pool.query(`
    SELECT * FROM indicadores
    WHERE id_proyecto = $1 AND id_etapa IS NULL AND activo = true
    ORDER BY orden, created_at
  `, [proyectoId]);

  // Cargar metas anuales de todos los indicadores del proyecto
  if (indicadores.rows.length > 0) {
    const ids = indicadores.rows.map(i => i.id);
    const metas = await pool.query(`
      SELECT * FROM indicador_metas_anuales
      WHERE id_indicador = ANY($1)
      ORDER BY anio
    `, [ids]);

    const metasPorIndicador = {};
    for (const m of metas.rows) {
      if (!metasPorIndicador[m.id_indicador]) {
        metasPorIndicador[m.id_indicador] = [];
      }
      metasPorIndicador[m.id_indicador].push(m);
    }

    for (const ind of indicadores.rows) {
      ind.metas_anuales = metasPorIndicador[ind.id] || [];
    }
  }

  return indicadores.rows;
}

// Crea un indicador con sus metas anuales opcionales
// Si datos.id_etapa viene, es un indicador de nivel etapa; si no, es de proyecto.
async function crear(proyectoId, datos, client = null) {
  const db = client || pool;

  // Sanitizar campos numéricos: convertir "" a null
  const metaGlobal = datos.meta_global === '' || datos.meta_global == null ? null : parseFloat(datos.meta_global);
  const anioInicio = datos.anio_inicio === '' || datos.anio_inicio == null ? null : parseInt(datos.anio_inicio);
  const anioFin = datos.anio_fin === '' || datos.anio_fin == null ? null : parseInt(datos.anio_fin);
  const orden = datos.orden === '' || datos.orden == null ? 1 : parseInt(datos.orden);
  const idEtapa = datos.id_etapa || null;

  const resultado = await db.query(`
    INSERT INTO indicadores (
      id_proyecto, id_etapa, nombre, tipo, unidad, unidad_personalizada,
      etiqueta_unidad, meta_global, temporalidad, anio_inicio, anio_fin,
      descripcion, orden
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING *
  `, [
    proyectoId, idEtapa, datos.nombre, datos.tipo, datos.unidad,
    datos.unidad_personalizada || null,
    datos.etiqueta_unidad || datos.unidad_personalizada || null, metaGlobal,
    datos.temporalidad || 'Global',
    anioInicio, anioFin,
    datos.descripcion || null, orden
  ]);

  const indicador = resultado.rows[0];

  // Insertar metas anuales si hay desglose temporal
  if (datos.metas_anuales && datos.metas_anuales.length > 0) {
    for (const ma of datos.metas_anuales) {
      const metaAnual = ma.meta === '' || ma.meta == null ? 0 : parseFloat(ma.meta);
      const anio = ma.anio === '' || ma.anio == null ? null : parseInt(ma.anio);
      if (anio == null) continue;
      await db.query(`
        INSERT INTO indicador_metas_anuales (id_indicador, anio, meta)
        VALUES ($1, $2, $3)
      `, [indicador.id, anio, metaAnual]);
    }
  }

  indicador.metas_anuales = datos.metas_anuales || [];
  return indicador;
}

// Actualiza un indicador y recrea sus metas anuales
async function actualizar(indicadorId, datos) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const metaGlobal = datos.meta_global === '' || datos.meta_global == null ? null : parseFloat(datos.meta_global);
    const resultado = await client.query(`
      UPDATE indicadores SET
        nombre = $1, tipo = $2, unidad = $3,
        unidad_personalizada = $4, etiqueta_unidad = $5,
        meta_global = $6, temporalidad = $7,
        anio_inicio = $8, anio_fin = $9,
        descripcion = $10, updated_at = NOW()
      WHERE id = $11
      RETURNING *
    `, [
      datos.nombre, datos.tipo, datos.unidad,
      datos.unidad_personalizada || null,
      datos.etiqueta_unidad || datos.unidad_personalizada || null,
      metaGlobal, datos.temporalidad || 'Global',
      datos.anio_inicio || null, datos.anio_fin || null,
      datos.descripcion || null, indicadorId
    ]);

    // Recrear metas anuales
    await client.query(
      'DELETE FROM indicador_metas_anuales WHERE id_indicador = $1',
      [indicadorId]
    );

    if (datos.metas_anuales && datos.metas_anuales.length > 0) {
      for (const ma of datos.metas_anuales) {
        await client.query(`
          INSERT INTO indicador_metas_anuales (id_indicador, anio, meta)
          VALUES ($1, $2, $3)
        `, [indicadorId, ma.anio, ma.meta]);
      }
    }

    await client.query('COMMIT');
    return resultado.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Elimina (soft) un indicador
async function eliminar(indicadorId) {
  const resultado = await pool.query(`
    UPDATE indicadores SET activo = false, updated_at = NOW()
    WHERE id = $1 RETURNING id
  `, [indicadorId]);
  return resultado.rows[0] || null;
}

// Lista indicadores de una etapa: propios (id_etapa) + asociados via indicador_etapas
async function listarPorEtapa(etapaId) {
  // 1. Indicadores propios de la etapa
  const propios = await pool.query(`
    SELECT i.*, NULL::numeric AS meta_etapa, NULL::uuid AS id_indicador_ref
    FROM indicadores i
    WHERE i.id_etapa = $1 AND i.activo = true
    ORDER BY i.orden, i.created_at
  `, [etapaId]);

  // 2. Indicadores del proyecto asociados a esta etapa via indicador_etapas
  const asociados = await pool.query(`
    SELECT i.*, ie.meta_etapa, ie.id_indicador AS id_indicador_ref
    FROM indicador_etapas ie
    JOIN indicadores i ON i.id = ie.id_indicador
    WHERE ie.id_etapa = $1 AND i.activo = true
    ORDER BY i.orden, i.created_at
  `, [etapaId]);

  const todos = [...propios.rows, ...asociados.rows];

  if (todos.length > 0) {
    const ids = todos.map(i => i.id);
    const metas = await pool.query(`
      SELECT * FROM indicador_metas_anuales
      WHERE id_indicador = ANY($1) ORDER BY anio
    `, [ids]);

    const metasPorIndicador = {};
    for (const m of metas.rows) {
      if (!metasPorIndicador[m.id_indicador]) metasPorIndicador[m.id_indicador] = [];
      metasPorIndicador[m.id_indicador].push(m);
    }
    for (const ind of todos) {
      ind.metas_anuales = metasPorIndicador[ind.id] || [];
    }
  }

  return todos;
}

// Lista TODOS los indicadores de un proyecto (nivel proyecto + nivel etapa)
async function listarTodosPorProyecto(proyectoId) {
  const indicadores = await pool.query(`
    SELECT i.*, e.nombre AS etapa_nombre
    FROM indicadores i
    LEFT JOIN etapas e ON e.id = i.id_etapa
    WHERE i.id_proyecto = $1 AND i.activo = true
    ORDER BY i.id_etapa NULLS FIRST, i.orden, i.created_at
  `, [proyectoId]);
  return indicadores.rows;
}

// Resumen de aportaciones a un indicador: meta, cuánto ya está comprometido, disponible
async function obtenerResumenAportaciones(indicadorId) {
  const resultado = await pool.query(`
    SELECT
      i.meta_global,
      i.unidad,
      i.unidad_personalizada,
      i.nombre,
      COALESCE(SUM(ai.valor_aportado), 0)::numeric AS total_aportado,
      COUNT(ai.id)::int AS num_acciones
    FROM indicadores i
    LEFT JOIN accion_indicador ai ON ai.id_indicador = i.id
    WHERE i.id = $1
    GROUP BY i.id
  `, [indicadorId]);

  if (!resultado.rows[0]) return null;
  const r = resultado.rows[0];
  const metaGlobal = parseFloat(r.meta_global) || 0;
  const totalAportado = parseFloat(r.total_aportado) || 0;
  return {
    ...r,
    meta_global: metaGlobal,
    total_aportado: totalAportado,
    disponible: Math.max(0, metaGlobal - totalAportado),
  };
}

/**
 * Recalcula valor_actual de un indicador según su modo_calculo.
 * - contar_completadas: cuenta acciones con estado='Completada' vinculadas
 * - porcentaje_promedio: promedio de porcentaje_avance de acciones vinculadas
 * - suma_manual: suma de accion_indicador.valor_aportado (comportamiento legacy)
 *
 * Si id_etapa no es null, solo cuenta acciones de esa etapa.
 */
async function recalcularIndicador(indicadorId, client = null) {
  const db = client || pool;
  const ind = await db.query(
    'SELECT id, modo_calculo, id_proyecto, id_etapa FROM indicadores WHERE id = $1',
    [indicadorId]
  );
  if (!ind.rows[0]) return null;
  const { modo_calculo, id_proyecto, id_etapa } = ind.rows[0];

  let valor = 0;
  if (modo_calculo === 'contar_completadas') {
    const filtroEtapa = id_etapa ? 'AND a.id_etapa = $2' : '';
    const params = id_etapa ? [id_proyecto, id_etapa] : [id_proyecto];
    const res = await db.query(`
      SELECT COUNT(*)::int AS total
      FROM acciones a
      WHERE a.id_proyecto = $1 AND a.estado = 'Completada'
        AND a.id_accion_padre IS NULL ${filtroEtapa}
    `, params);
    valor = res.rows[0].total;
  } else if (modo_calculo === 'porcentaje_promedio') {
    const filtroEtapa = id_etapa ? 'AND a.id_etapa = $2' : '';
    const params = id_etapa ? [id_proyecto, id_etapa] : [id_proyecto];
    const res = await db.query(`
      SELECT COALESCE(AVG(a.porcentaje_avance), 0)::numeric AS promedio
      FROM acciones a
      WHERE a.id_proyecto = $1 AND a.id_accion_padre IS NULL
        AND a.estado != 'Cancelada' ${filtroEtapa}
    `, params);
    valor = parseFloat(res.rows[0].promedio) || 0;
  } else {
    // suma_manual — legacy behavior
    const res = await db.query(`
      SELECT COALESCE(SUM(ai.valor_aportado), 0)::numeric AS total
      FROM accion_indicador ai WHERE ai.id_indicador = $1
    `, [indicadorId]);
    valor = parseFloat(res.rows[0].total) || 0;
  }

  await db.query(
    'UPDATE indicadores SET valor_actual = $1, updated_at = NOW() WHERE id = $2',
    [valor, indicadorId]
  );
  return valor;
}

/**
 * Recalcula TODOS los indicadores auto-calculados de un proyecto.
 * Se invoca cuando cambia el estado de una acción.
 */
async function recalcularIndicadoresProyecto(proyectoId, client = null) {
  const db = client || pool;
  const res = await db.query(
    `SELECT id FROM indicadores
     WHERE id_proyecto = $1 AND activo = true AND modo_calculo != 'suma_manual'`,
    [proyectoId]
  );
  for (const row of res.rows) {
    await recalcularIndicador(row.id, db);
  }
}

/**
 * Lista indicadores publicables para la plataforma externa.
 * Opcionalmente filtra por id_dg.
 */
async function listarPublicables(filtros = {}) {
  let where = "i.es_publicable = true AND i.activo = true";
  const params = [];
  if (filtros.id_dg) {
    params.push(filtros.id_dg);
    where += ` AND p.id_dg_lider = $${params.length}`;
  }
  const res = await pool.query(`
    SELECT
      i.id,
      i.nombre,
      i.tipo,
      i.unidad,
      i.unidad_personalizada,
      i.meta_global,
      i.valor_actual,
      i.modo_calculo,
      i.temporalidad,
      i.updated_at,
      p.id AS proyecto_id,
      p.nombre AS proyecto_nombre,
      dg.siglas AS dg_siglas,
      dg.nombre AS dg_nombre
    FROM indicadores i
    JOIN proyectos p ON p.id = i.id_proyecto
    LEFT JOIN direcciones_generales dg ON dg.id = p.id_dg_lider
    WHERE ${where}
    ORDER BY dg.siglas, p.nombre, i.nombre
  `, params);

  return res.rows.map(r => {
    const meta = parseFloat(r.meta_global) || 0;
    const valor = parseFloat(r.valor_actual) || 0;
    const pct = meta > 0 ? Math.min(100, (valor / meta) * 100) : 0;
    const unidadLabel = r.unidad === 'Porcentaje' ? '%'
      : r.unidad === 'Moneda_MXN' ? '$MXN'
      : r.unidad_personalizada || '#';
    return {
      id: r.id,
      proyecto_id: r.proyecto_id,
      proyecto: r.proyecto_nombre,
      dg: r.dg_siglas,
      dg_nombre: r.dg_nombre,
      indicador: r.nombre,
      tipo: r.tipo,
      meta: meta,
      valor_actual: valor,
      porcentaje: parseFloat(pct.toFixed(2)),
      unidad: unidadLabel,
      modo_calculo: r.modo_calculo,
      ultima_actualizacion: r.updated_at,
    };
  });
}

module.exports = {
  listarPorProyecto,
  listarPorEtapa,
  listarTodosPorProyecto,
  crear,
  actualizar,
  eliminar,
  obtenerResumenAportaciones,
  recalcularIndicador,
  recalcularIndicadoresProyecto,
  listarPublicables
};
