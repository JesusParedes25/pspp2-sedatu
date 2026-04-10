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

  // Sanitizar campos numéricos: convertir "" a null o 0
  const metaGlobal = datos.meta_global === '' || datos.meta_global == null ? 0 : parseFloat(datos.meta_global);
  const anioInicio = datos.anio_inicio === '' || datos.anio_inicio == null ? null : parseInt(datos.anio_inicio);
  const anioFin = datos.anio_fin === '' || datos.anio_fin == null ? null : parseInt(datos.anio_fin);
  const orden = datos.orden === '' || datos.orden == null ? 1 : parseInt(datos.orden);
  const idEtapa = datos.id_etapa || null;

  const resultado = await db.query(`
    INSERT INTO indicadores (
      id_proyecto, id_etapa, nombre, tipo, unidad, unidad_personalizada,
      acumulacion, meta_global, temporalidad, anio_inicio, anio_fin,
      descripcion, orden
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING *
  `, [
    proyectoId, idEtapa, datos.nombre, datos.tipo, datos.unidad,
    datos.unidad_personalizada || null,
    datos.acumulacion || 'Suma', metaGlobal,
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

    const resultado = await client.query(`
      UPDATE indicadores SET
        nombre = $1, tipo = $2, unidad = $3,
        unidad_personalizada = $4, acumulacion = $5,
        meta_global = $6, temporalidad = $7,
        anio_inicio = $8, anio_fin = $9,
        descripcion = $10, updated_at = NOW()
      WHERE id = $11
      RETURNING *
    `, [
      datos.nombre, datos.tipo, datos.unidad,
      datos.unidad_personalizada || null,
      datos.acumulacion || 'Suma', datos.meta_global,
      datos.temporalidad || 'Global',
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

// Lista indicadores propios de una etapa (id_etapa = etapaId)
async function listarPorEtapa(etapaId) {
  const indicadores = await pool.query(`
    SELECT * FROM indicadores
    WHERE id_etapa = $1 AND activo = true
    ORDER BY orden, created_at
  `, [etapaId]);

  if (indicadores.rows.length > 0) {
    const ids = indicadores.rows.map(i => i.id);
    const metas = await pool.query(`
      SELECT * FROM indicador_metas_anuales
      WHERE id_indicador = ANY($1)
      ORDER BY anio
    `, [ids]);

    const metasPorIndicador = {};
    for (const m of metas.rows) {
      if (!metasPorIndicador[m.id_indicador]) metasPorIndicador[m.id_indicador] = [];
      metasPorIndicador[m.id_indicador].push(m);
    }
    for (const ind of indicadores.rows) {
      ind.metas_anuales = metasPorIndicador[ind.id] || [];
    }
  }

  return indicadores.rows;
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

module.exports = {
  listarPorProyecto,
  listarPorEtapa,
  listarTodosPorProyecto,
  crear,
  actualizar,
  eliminar
};
