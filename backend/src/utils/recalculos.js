/**
 * ARCHIVO: recalculos.js
 * PROPÓSITO: Recalcular en cascada el % de avance cuando cambia una acción.
 *
 * MINI-CLASE: Recálculo en cascada explícito
 * ─────────────────────────────────────────────────────────────────
 * En lugar de hooks automáticos (que son difíciles de depurar),
 * estas funciones se llaman EXPLÍCITAMENTE desde el controller
 * después de actualizar una acción. El flujo es:
 * 1. Controller actualiza porcentaje_avance de la acción
 * 2. Controller llama recalcularEtapa(etapa_id)
 * 3. recalcularEtapa actualiza % y fechas de la etapa y llama
 *    recalcularProyecto(proyecto_id)
 * Así el flujo es 100% transparente y depurable con console.log.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../db/pool');

// Recalcula el % de avance y las fechas de una etapa desde sus acciones
async function recalcularEtapa(etapaId, client) {
  const db = client || pool;

  // Solo acciones no canceladas contribuyen al avance
  const resultado = await db.query(`
    SELECT porcentaje_avance, fecha_inicio, fecha_fin
    FROM acciones
    WHERE id_etapa = $1 AND estado != 'Cancelada'
  `, [etapaId]);

  const acciones = resultado.rows;

  if (acciones.length === 0) {
    await db.query(
      `UPDATE etapas SET porcentaje_calculado = 0,
       fecha_inicio = NULL, fecha_fin = NULL WHERE id = $1`,
      [etapaId]
    );
    return;
  }

  // Promedio de porcentajes de las acciones activas
  const suma = acciones.reduce((total, a) => total + parseFloat(a.porcentaje_avance), 0);
  const promedio = suma / acciones.length;

  // Fecha más temprana entre las acciones
  const fechaInicio = acciones.map(a => a.fecha_inicio).sort()[0];
  // Fecha más tardía entre las acciones
  const fechaFin = acciones.map(a => a.fecha_fin).sort().reverse()[0];

  await db.query(`
    UPDATE etapas
    SET porcentaje_calculado = $1,
        fecha_inicio = $2,
        fecha_fin = $3
    WHERE id = $4
  `, [promedio.toFixed(2), fechaInicio, fechaFin, etapaId]);

  // Después de actualizar la etapa, recalculamos el proyecto padre
  const etapa = await db.query(
    'SELECT id_proyecto, id_subproyecto FROM etapas WHERE id = $1', [etapaId]
  );

  if (etapa.rows[0]?.id_subproyecto) {
    await recalcularSubproyecto(etapa.rows[0].id_subproyecto, db);
  }

  if (etapa.rows[0]?.id_proyecto) {
    await recalcularProyecto(etapa.rows[0].id_proyecto, db);
  }
}

// Recalcula el % de avance de un subproyecto desde sus etapas
async function recalcularSubproyecto(subproyectoId, client) {
  const db = client || pool;

  const etapas = await db.query(`
    SELECT porcentaje_calculado, fecha_inicio, fecha_fin
    FROM etapas
    WHERE id_subproyecto = $1 AND estado != 'Cancelada'
  `, [subproyectoId]);

  if (etapas.rows.length === 0) return;

  const suma = etapas.rows.reduce((total, e) => total + parseFloat(e.porcentaje_calculado), 0);
  const promedio = suma / etapas.rows.length;

  const fechaInicio = etapas.rows.map(e => e.fecha_inicio).filter(Boolean).sort()[0] || null;
  const fechaFin = etapas.rows.map(e => e.fecha_fin).filter(Boolean).sort().reverse()[0] || null;

  await db.query(`
    UPDATE subproyectos
    SET porcentaje_calculado = $1, fecha_inicio = $2, fecha_fin = $3
    WHERE id = $4
  `, [promedio.toFixed(2), fechaInicio, fechaFin, subproyectoId]);
}

// Recalcula el % de avance de un proyecto desde sus etapas y acciones directas
async function recalcularProyecto(proyectoId, client) {
  const db = client || pool;

  const etapas = await db.query(`
    SELECT porcentaje_calculado FROM etapas
    WHERE id_proyecto = $1 AND id_subproyecto IS NULL AND estado != 'Cancelada'
  `, [proyectoId]);

  // Acciones que cuelgan directamente del proyecto (sin etapa)
  const accionesDirect = await db.query(`
    SELECT porcentaje_avance FROM acciones
    WHERE id_proyecto = $1 AND id_etapa IS NULL AND estado != 'Cancelada'
  `, [proyectoId]);

  // Subproyectos también contribuyen al avance del proyecto
  const subproyectos = await db.query(`
    SELECT porcentaje_calculado FROM subproyectos
    WHERE id_proyecto = $1 AND estado != 'Cancelado'
  `, [proyectoId]);

  const todos = [
    ...etapas.rows.map(e => parseFloat(e.porcentaje_calculado)),
    ...accionesDirect.rows.map(a => parseFloat(a.porcentaje_avance)),
    ...subproyectos.rows.map(s => parseFloat(s.porcentaje_calculado))
  ];

  if (todos.length === 0) return;

  const promedio = todos.reduce((s, v) => s + v, 0) / todos.length;

  await db.query(`
    UPDATE proyectos
    SET porcentaje_calculado = $1, updated_at = NOW()
    WHERE id = $2
  `, [promedio.toFixed(2), proyectoId]);
}

module.exports = { recalcularEtapa, recalcularSubproyecto, recalcularProyecto };
