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
const { derivarEstadoContenedor, calcularSemaforo } = require('./avance-semaforo');

// Recalcula avance, estado, semaforo y fechas de una etapa desde sus acciones directas
async function recalcularEtapa(etapaId, client) {
  const db = client || pool;

  // Todas las acciones directas (no sub-acciones), incluidas las Cancelada
  // — se necesitan completas para derivar el estado (distinguir "sin
  // acciones" de "todas sus acciones se cancelaron"); el promedio de avance
  // sigue excluyendo Cancelada, igual que siempre.
  const resultado = await db.query(`
    SELECT porcentaje_avance, estado, fecha_inicio, fecha_fin
    FROM acciones
    WHERE id_etapa = $1 AND id_accion_padre IS NULL
  `, [etapaId]);

  const acciones = resultado.rows;
  const accionesActivas = acciones.filter(a => a.estado !== 'Cancelada');

  // Metadatos de la etapa para semaforo + estado (para respetar estado_override)
  const { rows: [etapaMeta] } = await db.query(
    'SELECT id_proyecto, id_subproyecto, fecha_limite, prioridad, semaforo_override, estado, estado_override FROM etapas WHERE id = $1',
    [etapaId]
  );

  if (acciones.length === 0) {
    // Sin estado_override, el criterio de siempre; con override, se
    // conserva el estatus que fijó el usuario (una etapa "hoja" con
    // estado_override es un caso raro, pero coherente: nada más se
    // recalcula solo aquí, y este es el único lugar que podría pisarlo).
    const estadoFinal = etapaMeta?.estado_override ? etapaMeta.estado : 'Pendiente';
    if (!etapaMeta?.semaforo_override) {
      const sem = calcularSemaforo(estadoFinal, etapaMeta?.fecha_limite, etapaMeta?.prioridad);
      await db.query(
        `UPDATE etapas SET porcentaje_calculado = 0, estado = $1, semaforo = $2,
         fecha_inicio = NULL, fecha_fin = NULL WHERE id = $3`,
        [estadoFinal, sem, etapaId]
      );
    } else {
      await db.query(
        `UPDATE etapas SET porcentaje_calculado = 0, estado = $1,
         fecha_inicio = NULL, fecha_fin = NULL WHERE id = $2`,
        [estadoFinal, etapaId]
      );
    }
  } else {
    const promedio = accionesActivas.length > 0
      ? Math.round(accionesActivas.reduce((total, a) => total + parseFloat(a.porcentaje_avance || 0), 0) / accionesActivas.length)
      : 0;
    const estadoDerivado = derivarEstadoContenedor(acciones.map(a => a.estado));
    const estadoEtapa = etapaMeta?.estado_override ? etapaMeta.estado : estadoDerivado;

    // Fechas: se agregan desde TODA la profundidad (acciones, subacciones y
    // tareas), no solo las acciones de primer nivel — muchos equipos
    // capturan fecha_inicio/fecha_fin hasta el nivel de tarea y nunca en la
    // acción contenedora; si solo mirábamos acciones directas, la etapa se
    // quedaba sin fechas (y por lo tanto sin barra en el Cronograma) aunque
    // sus tareas sí las tuvieran.
    // "fin" de una acción = fecha_limite (el campo "Vence" que se edita desde
    // la tarjeta) si existe, si no fecha_fin (columna legacy) — mismo criterio
    // que ya usa el resto de la app (semáforo, etc.) para no quedarnos sin
    // fecha cuando el usuario solo capturó "Vence".
    const { rows: [rangoFechas] } = await db.query(`
      SELECT MIN(fi) AS fecha_inicio, MAX(ff) AS fecha_fin FROM (
        SELECT fecha_inicio AS fi, COALESCE(fecha_limite, fecha_fin) AS ff FROM acciones
          WHERE id_etapa = $1 AND estado != 'Cancelada'
        UNION ALL
        SELECT t.fecha_inicio, t.fecha_limite FROM tareas t
          JOIN acciones a ON a.id = t.id_accion
          WHERE a.id_etapa = $1 AND t.estado != 'Cancelada'
      ) todas
    `, [etapaId]);
    const fechaInicio = rangoFechas?.fecha_inicio || null;
    const fechaFin = rangoFechas?.fecha_fin || null;

    if (!etapaMeta?.semaforo_override) {
      // Usa el fechaFin recién agregado desde los hijos (línea arriba), no el
      // valor viejo de etapaMeta — es el mismo que se está por guardar.
      const sem = calcularSemaforo(estadoEtapa, etapaMeta?.fecha_limite, etapaMeta?.prioridad, fechaFin);
      await db.query(`
        UPDATE etapas
        SET porcentaje_calculado = $1, estado = $2, semaforo = $3,
            fecha_inicio = $4, fecha_fin = $5
        WHERE id = $6
      `, [promedio, estadoEtapa, sem, fechaInicio, fechaFin, etapaId]);
    } else {
      await db.query(`
        UPDATE etapas
        SET porcentaje_calculado = $1, estado = $2,
            fecha_inicio = $3, fecha_fin = $4
        WHERE id = $5
      `, [promedio, estadoEtapa, fechaInicio, fechaFin, etapaId]);
    }
  }

  // Cascade a proyecto/subproyecto
  if (etapaMeta?.id_subproyecto) {
    await recalcularSubproyecto(etapaMeta.id_subproyecto, db);
  }
  if (etapaMeta?.id_proyecto) {
    await recalcularProyecto(etapaMeta.id_proyecto, db);
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

// Recalcula el % de avance y el estado de un proyecto desde sus etapas,
// acciones directas y subproyectos — mismo criterio de "todos los hijos,
// incluidos Cancelada" que recalcularEtapa/recalcularAccionContenedor, para
// poder derivar el estado con derivarEstadoContenedor.
async function recalcularProyecto(proyectoId, client) {
  const db = client || pool;

  const etapas = await db.query(`
    SELECT porcentaje_calculado, estado FROM etapas
    WHERE id_proyecto = $1 AND id_subproyecto IS NULL
  `, [proyectoId]);

  // Acciones que cuelgan directamente del proyecto (sin etapa)
  const accionesDirect = await db.query(`
    SELECT porcentaje_avance, estado FROM acciones
    WHERE id_proyecto = $1 AND id_etapa IS NULL
  `, [proyectoId]);

  // Subproyectos también contribuyen al avance y estado del proyecto
  const subproyectos = await db.query(`
    SELECT porcentaje_calculado, estado FROM subproyectos
    WHERE id_proyecto = $1
  `, [proyectoId]);

  const hijosEstado = [
    ...etapas.rows.map(e => e.estado),
    ...accionesDirect.rows.map(a => a.estado),
    ...subproyectos.rows.map(s => s.estado)
  ];

  if (hijosEstado.length === 0) return;

  const activos = [
    ...etapas.rows.filter(e => e.estado !== 'Cancelada').map(e => parseFloat(e.porcentaje_calculado)),
    ...accionesDirect.rows.filter(a => a.estado !== 'Cancelada').map(a => parseFloat(a.porcentaje_avance)),
    ...subproyectos.rows.filter(s => s.estado !== 'Cancelada').map(s => parseFloat(s.porcentaje_calculado))
  ];

  const promedio = activos.length > 0 ? activos.reduce((s, v) => s + v, 0) / activos.length : 0;
  const estadoDerivado = derivarEstadoContenedor(hijosEstado);

  const { rows: [proyMeta] } = await db.query('SELECT estado, estado_override FROM proyectos WHERE id = $1', [proyectoId]);
  const estadoProyecto = proyMeta?.estado_override ? proyMeta.estado : estadoDerivado;

  await db.query(`
    UPDATE proyectos
    SET porcentaje_calculado = $1, estado = $2, updated_at = NOW()
    WHERE id = $3
  `, [promedio.toFixed(2), estadoProyecto, proyectoId]);
}

module.exports = { recalcularEtapa, recalcularSubproyecto, recalcularProyecto };
