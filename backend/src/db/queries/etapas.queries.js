/**
 * ARCHIVO: etapas.queries.js
 * PROPÓSITO: Todas las queries SQL de la tabla etapas.
 *
 * MINI-CLASE: Etapas y su relación con proyectos
 * ─────────────────────────────────────────────────────────────────
 * Una etapa agrupa acciones dentro de un proyecto. Sus fechas y
 * porcentaje se CALCULAN automáticamente desde sus acciones hijas
 * (nunca se editan directamente). Cada etapa puede depender de otra
 * (depende_de) para modelar flujos secuenciales como:
 * DAOT procesa → RAN cruza → DGPV evalúa.
 * El campo "orden" determina la posición visual en la UI.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');
const indicadoresQueries = require('./indicadores.queries');

// Obtiene todas las etapas de un proyecto con datos del responsable y conteos
async function obtenerEtapasPorProyecto(proyectoId, idDg) {
  const condiciones = ['e.id_proyecto = $1'];
  const parametros = [proyectoId];

  // Filtro opcional por DG (para el SelectorDG del frontend)
  if (idDg) {
    condiciones.push('e.id_dg = $2');
    parametros.push(idDg);
  }

  const resultado = await pool.query(`
    SELECT
      e.*,
      u.nombre_completo AS responsable_nombre,
      u.cargo AS responsable_cargo,
      dg.siglas AS dg_siglas,
      da.siglas AS direccion_area_siglas,
      dep.nombre AS depende_de_nombre,
      (SELECT COUNT(*) FROM acciones a WHERE a.id_etapa = e.id) AS total_acciones,
      (SELECT COUNT(*) FROM acciones a WHERE a.id_etapa = e.id AND a.estado = 'Completada') AS acciones_completadas
    FROM etapas e
    LEFT JOIN usuarios u ON u.id = e.id_responsable
    LEFT JOIN direcciones_generales dg ON dg.id = e.id_dg
    LEFT JOIN direcciones_area da ON da.id = e.id_direccion_area
    LEFT JOIN etapas dep ON dep.id = e.depende_de
    WHERE ${condiciones.join(' AND ')}
    ORDER BY e.orden ASC, e.created_at ASC
  `, parametros);

  return resultado.rows;
}

// Obtiene una etapa por ID
async function obtenerEtapaPorId(etapaId) {
  const resultado = await pool.query(`
    SELECT
      e.*,
      u.nombre_completo AS responsable_nombre,
      dg.siglas AS dg_siglas,
      da.siglas AS direccion_area_siglas
    FROM etapas e
    LEFT JOIN usuarios u ON u.id = e.id_responsable
    LEFT JOIN direcciones_generales dg ON dg.id = e.id_dg
    LEFT JOIN direcciones_area da ON da.id = e.id_direccion_area
    WHERE e.id = $1
  `, [etapaId]);

  return resultado.rows[0] || null;
}

// Crea una nueva etapa con asociaciones opcionales a indicadores
async function crearEtapa(proyectoId, datos) {
  const client = await pool.connect();
  const emptyToNull = (v) => (v === '' || v == null) ? null : v;
  try {
    await client.query('BEGIN');

    const maxOrden = await client.query(
      'SELECT COALESCE(MAX(orden), 0) + 1 AS siguiente FROM etapas WHERE id_proyecto = $1',
      [proyectoId]
    );

    const resultado = await client.query(`
      INSERT INTO etapas (
        nombre, descripcion, orden, tipo_meta, meta_descripcion,
        meta_valor, meta_unidad, depende_de,
        id_proyecto, id_subproyecto, id_dg, id_direccion_area, id_responsable
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `, [
      datos.nombre, emptyToNull(datos.descripcion),
      datos.orden || maxOrden.rows[0].siguiente,
      datos.tipo_meta || 'Sin_meta', emptyToNull(datos.meta_descripcion),
      emptyToNull(datos.meta_valor), emptyToNull(datos.meta_unidad),
      emptyToNull(datos.depende_de),
      proyectoId, emptyToNull(datos.id_subproyecto),
      emptyToNull(datos.id_dg), emptyToNull(datos.id_direccion_area),
      emptyToNull(datos.id_responsable)
    ]);

    const etapa = resultado.rows[0];

    // 1. Vincular indicadores del proyecto existentes (distribución de meta)
    if (datos.indicadores_asociados && datos.indicadores_asociados.length > 0) {
      for (const ia of datos.indicadores_asociados) {
        const metaEtapa = ia.meta_etapa === '' || ia.meta_etapa == null ? 0 : parseFloat(ia.meta_etapa);
        await client.query(
          'INSERT INTO indicador_etapas (id_indicador, id_etapa, meta_etapa) VALUES ($1, $2, $3)',
          [ia.id_indicador, etapa.id, metaEtapa]
        );
      }
    }

    // 2. Crear indicadores propios de la etapa (nuevos, no del proyecto)
    if (datos.indicadores_nuevos && datos.indicadores_nuevos.length > 0) {
      for (let i = 0; i < datos.indicadores_nuevos.length; i++) {
        await indicadoresQueries.crear(
          proyectoId,
          { ...datos.indicadores_nuevos[i], id_etapa: etapa.id, orden: i + 1 },
          client
        );
      }
    }

    await client.query('COMMIT');
    return etapa;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Actualiza una etapa (campos directos + indicadores asociados en transacción)
async function actualizarEtapa(etapaId, datos) {
  const n = (v) => (v === '' || v === undefined) ? null : v;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const resultado = await client.query(`
      UPDATE etapas SET
        nombre            = COALESCE($1, nombre),
        descripcion       = $2,
        id_dg             = $3,
        id_direccion_area = $4,
        id_responsable    = $5,
        depende_de        = $6,
        tipo_meta         = COALESCE($7, tipo_meta),
        meta_descripcion  = $8,
        meta_valor        = $9,
        meta_unidad       = $10
      WHERE id = $11
      RETURNING *
    `, [
      datos.nombre,
      n(datos.descripcion),
      n(datos.id_dg),
      n(datos.id_direccion_area),
      n(datos.id_responsable),
      n(datos.depende_de),
      datos.tipo_meta || null,
      n(datos.meta_descripcion),
      n(datos.meta_valor),
      n(datos.meta_unidad),
      etapaId,
    ]);

    const etapa = resultado.rows[0];
    if (!etapa) { await client.query('ROLLBACK'); return null; }

    // Sincronizar indicadores asociados (meta_etapa por indicador)
    if (Array.isArray(datos.indicadores_asociados)) {
      await client.query('DELETE FROM indicador_etapas WHERE id_etapa = $1', [etapaId]);
      for (const ia of datos.indicadores_asociados) {
        const metaEtapa = ia.meta_etapa === '' || ia.meta_etapa == null ? 0 : parseFloat(ia.meta_etapa);
        await client.query(
          'INSERT INTO indicador_etapas (id_indicador, id_etapa, meta_etapa) VALUES ($1, $2, $3)',
          [ia.id_indicador, etapaId, metaEtapa]
        );
      }
    }

    await client.query('COMMIT');
    return etapa;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Elimina una etapa y sus acciones en cascada (por FK ON DELETE CASCADE)
async function eliminarEtapa(etapaId) {
  const resultado = await pool.query(
    'DELETE FROM etapas WHERE id = $1 RETURNING id, id_proyecto',
    [etapaId]
  );
  return resultado.rows[0] || null;
}

module.exports = {
  obtenerEtapasPorProyecto,
  obtenerEtapaPorId,
  crearEtapa,
  actualizarEtapa,
  eliminarEtapa
};
