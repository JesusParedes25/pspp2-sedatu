/**
 * ARCHIVO: acciones.queries.js
 * PROPÓSITO: Todas las queries SQL de la tabla acciones.
 *
 * MINI-CLASE: SQL parametrizado con pg ($1, $2...)
 * ─────────────────────────────────────────────────────────────────
 * NUNCA concatenar valores en SQL:
 *   `WHERE id = '${id}'`  ← SQL injection, muy peligroso
 * SIEMPRE usar parámetros numerados:
 *   pool.query('WHERE id = $1', [id])
 * pg sustituye $1 con el valor escapado automáticamente.
 * Es el equivalente a prepared statements en otros lenguajes.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');
const { recalcularEtapa, recalcularProyecto } = require('../../utils/recalculos');

// Obtiene acciones de nivel superior de una etapa (sin subacciones)
async function obtenerAccionesPorEtapa(etapaId) {
  const resultado = await pool.query(`
    SELECT
      a.*,
      COALESCE(bl.motivo, a.motivo_bloqueo) AS motivo_bloqueo,
      u.nombre_completo AS responsable_nombre,
      u.cargo AS responsable_cargo,
      dg.siglas AS dg_siglas,
      da.siglas AS direccion_area_siglas,
      COUNT(e.id) AS total_evidencias,
      (SELECT COUNT(*) FROM acciones sub WHERE sub.id_accion_padre = a.id) AS total_subacciones
    FROM acciones a
    LEFT JOIN LATERAL (
      SELECT motivo FROM bloqueos
      WHERE entidad_tipo = 'Accion' AND entidad_id = a.id AND fecha_desbloqueo IS NULL
      ORDER BY created_at DESC LIMIT 1
    ) bl ON true
    LEFT JOIN usuarios u  ON u.id = a.id_responsable
    LEFT JOIN direcciones_generales dg ON dg.id = a.id_dg
    LEFT JOIN direcciones_area da ON da.id = a.id_direccion_area
    LEFT JOIN evidencias e ON e.id_accion = a.id
    WHERE a.id_etapa = $1 AND a.id_accion_padre IS NULL
    GROUP BY a.id, u.nombre_completo, u.cargo, dg.siglas, da.siglas, bl.motivo
    ORDER BY a.fecha_inicio ASC
  `, [etapaId]);

  return resultado.rows;
}

// Obtiene subacciones de una acción padre
async function obtenerSubacciones(accionPadreId) {
  const resultado = await pool.query(`
    SELECT
      a.*,
      COALESCE(bl.motivo, a.motivo_bloqueo) AS motivo_bloqueo,
      u.nombre_completo AS responsable_nombre,
      dg.siglas AS dg_siglas,
      COUNT(e.id) AS total_evidencias
    FROM acciones a
    LEFT JOIN LATERAL (
      SELECT motivo FROM bloqueos
      WHERE entidad_tipo = 'Accion' AND entidad_id = a.id AND fecha_desbloqueo IS NULL
      ORDER BY created_at DESC LIMIT 1
    ) bl ON true
    LEFT JOIN usuarios u ON u.id = a.id_responsable
    LEFT JOIN direcciones_generales dg ON dg.id = a.id_dg
    LEFT JOIN evidencias e ON e.id_accion = a.id
    WHERE a.id_accion_padre = $1
    GROUP BY a.id, u.nombre_completo, dg.siglas, bl.motivo
    ORDER BY a.fecha_inicio ASC
  `, [accionPadreId]);
  return resultado.rows;
}

// Obtiene acciones directas de un proyecto (sin etapa)
async function obtenerAccionesDirectasProyecto(proyectoId) {
  const resultado = await pool.query(`
    SELECT
      a.*,
      COALESCE(bl.motivo, a.motivo_bloqueo) AS motivo_bloqueo,
      u.nombre_completo AS responsable_nombre,
      dg.siglas AS dg_siglas,
      COUNT(e.id) AS total_evidencias
    FROM acciones a
    LEFT JOIN LATERAL (
      SELECT motivo FROM bloqueos
      WHERE entidad_tipo = 'Accion' AND entidad_id = a.id AND fecha_desbloqueo IS NULL
      ORDER BY created_at DESC LIMIT 1
    ) bl ON true
    LEFT JOIN usuarios u ON u.id = a.id_responsable
    LEFT JOIN direcciones_generales dg ON dg.id = a.id_dg
    LEFT JOIN evidencias e ON e.id_accion = a.id
    WHERE a.id_proyecto = $1 AND a.id_etapa IS NULL
    GROUP BY a.id, u.nombre_completo, dg.siglas, bl.motivo
    ORDER BY a.fecha_inicio ASC
  `, [proyectoId]);

  return resultado.rows;
}

// Obtiene una acción por ID
async function obtenerAccionPorId(accionId) {
  const resultado = await pool.query(`
    SELECT
      a.*,
      COALESCE(bl.motivo, a.motivo_bloqueo) AS motivo_bloqueo,
      u.nombre_completo AS responsable_nombre,
      u.cargo AS responsable_cargo,
      dg.siglas AS dg_siglas,
      da.siglas AS direccion_area_siglas
    FROM acciones a
    LEFT JOIN LATERAL (
      SELECT motivo FROM bloqueos
      WHERE entidad_tipo = 'Accion' AND entidad_id = a.id AND fecha_desbloqueo IS NULL
      ORDER BY created_at DESC LIMIT 1
    ) bl ON true
    LEFT JOIN usuarios u ON u.id = a.id_responsable
    LEFT JOIN direcciones_generales dg ON dg.id = a.id_dg
    LEFT JOIN direcciones_area da ON da.id = a.id_direccion_area
    WHERE a.id = $1
  `, [accionId]);

  return resultado.rows[0] || null;
}

// ── Helper: vincular indicadores a una acción con validación de meta ──
// Valida que la suma total no supere meta_global de cada indicador.
// Si valor_aportado es 0 o vacío, la acción queda vinculada sin aportar.
async function vincularIndicadores(client, accionId, indicadoresAsociados) {
  if (!indicadoresAsociados || indicadoresAsociados.length === 0) return;
  for (const ia of indicadoresAsociados) {
    const aportado = (ia.valor_aportado !== '' && ia.valor_aportado != null)
      ? parseFloat(ia.valor_aportado) : 0;
    if (aportado < 0) throw new Error('El valor aportado no puede ser negativo');
    if (aportado > 0) {
      const res = await client.query(`
        SELECT i.meta_global, COALESCE(SUM(ai.valor_aportado), 0)::numeric AS total_aportado
        FROM indicadores i
        LEFT JOIN accion_indicador ai ON ai.id_indicador = i.id
        WHERE i.id = $1
        GROUP BY i.id
      `, [ia.id_indicador]);
      if (res.rows[0]) {
        const meta = parseFloat(res.rows[0].meta_global) || 0;
        const yaAportado = parseFloat(res.rows[0].total_aportado) || 0;
        if (meta > 0 && yaAportado + aportado > meta) {
          throw new Error(
            `La aportación (${aportado}) excede lo disponible del indicador. ` +
            `Meta: ${meta}, ya comprometido: ${yaAportado}, disponible: ${(meta - yaAportado).toFixed(2)}`
          );
        }
      }
    }
    await client.query(
      'INSERT INTO accion_indicador (id_accion, id_indicador, valor_aportado) VALUES ($1, $2, $3)',
      [accionId, ia.id_indicador, aportado]
    );
  }
}

// Crea una nueva acción dentro de una etapa con asociaciones opcionales a indicadores
async function crearAccionEnEtapa(etapaId, datos) {
  const client = await pool.connect();
  const emptyToNull = (v) => (v === '' || v == null) ? null : v;
  try {
    await client.query('BEGIN');

    const etapa = await client.query('SELECT id_proyecto, id_subproyecto FROM etapas WHERE id = $1', [etapaId]);
    const proyectoId = etapa.rows[0]?.id_proyecto;
    const subproyectoId = etapa.rows[0]?.id_subproyecto;

    const resultado = await client.query(`
      INSERT INTO acciones (
        nombre, descripcion, tipo, fecha_inicio, fecha_fin,
        id_etapa, id_proyecto, id_subproyecto, id_dg, id_direccion_area, id_responsable
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      datos.nombre, emptyToNull(datos.descripcion), datos.tipo || 'Accion_programada',
      datos.fecha_inicio, datos.fecha_fin,
      etapaId, proyectoId, emptyToNull(subproyectoId),
      emptyToNull(datos.id_dg), emptyToNull(datos.id_direccion_area), emptyToNull(datos.id_responsable)
    ]);

    const accion = resultado.rows[0];
    await vincularIndicadores(client, accion.id, datos.indicadores_asociados);

    await client.query('COMMIT');
    await recalcularEtapa(etapaId);

    return accion;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Crea una acción directa en un proyecto con asociaciones opcionales a indicadores
async function crearAccionEnProyecto(proyectoId, datos) {
  const client = await pool.connect();
  const emptyToNull = (v) => (v === '' || v == null) ? null : v;
  try {
    await client.query('BEGIN');

    const resultado = await client.query(`
      INSERT INTO acciones (
        nombre, descripcion, tipo, fecha_inicio, fecha_fin,
        id_proyecto, id_dg, id_direccion_area, id_responsable
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      datos.nombre, emptyToNull(datos.descripcion), datos.tipo || 'Accion_programada',
      datos.fecha_inicio, datos.fecha_fin,
      proyectoId, emptyToNull(datos.id_dg), emptyToNull(datos.id_direccion_area), emptyToNull(datos.id_responsable)
    ]);

    const accion = resultado.rows[0];
    await vincularIndicadores(client, accion.id, datos.indicadores_asociados);

    await client.query('COMMIT');
    await recalcularProyecto(proyectoId);

    return accion;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Actualiza campos no-estado de una acción (nombre, descripcion, porcentaje, fechas, responsable, DG, DA, tipo).
// El cambio de estado se maneja en el controller vía validaciones-estado.js.
// Acepta client de transacción para uso atómico.
async function actualizarAccionCampos(accionId, datos, client) {
  const db = client || pool;

  // Si no hay campos que actualizar, retornar la acción actual
  const tienesCampos = datos.nombre || datos.descripcion !== undefined ||
    datos.porcentaje_avance !== undefined || datos.fecha_fin_real ||
    datos.fecha_inicio || datos.fecha_fin ||
    datos.id_responsable !== undefined || datos.id_dg !== undefined ||
    datos.id_direccion_area !== undefined || datos.tipo;
  if (!tienesCampos) {
    const actual = await db.query('SELECT * FROM acciones WHERE id = $1', [accionId]);
    return actual.rows[0] || null;
  }

  const resultado = await db.query(`
    UPDATE acciones SET
      nombre              = COALESCE($1, nombre),
      descripcion         = COALESCE($2, descripcion),
      porcentaje_avance   = COALESCE($3, porcentaje_avance),
      fecha_fin_real      = COALESCE($4, fecha_fin_real),
      fecha_inicio        = COALESCE($5, fecha_inicio),
      fecha_fin           = COALESCE($6, fecha_fin),
      id_responsable      = COALESCE($7, id_responsable),
      id_dg               = COALESCE($8, id_dg),
      id_direccion_area   = COALESCE($9, id_direccion_area),
      tipo                = COALESCE($10, tipo),
      updated_at          = NOW()
    WHERE id = $11
    RETURNING *
  `, [
    datos.nombre || null,
    datos.descripcion !== undefined ? (datos.descripcion || null) : null,
    datos.porcentaje_avance !== undefined ? datos.porcentaje_avance : null,
    datos.fecha_fin_real || null,
    datos.fecha_inicio || null,
    datos.fecha_fin || null,
    datos.id_responsable !== undefined ? (datos.id_responsable || null) : null,
    datos.id_dg !== undefined ? (datos.id_dg || null) : null,
    datos.id_direccion_area !== undefined ? (datos.id_direccion_area || null) : null,
    datos.tipo || null,
    accionId
  ]);

  return resultado.rows[0] || null;
}

// Elimina una acción
async function eliminarAccion(accionId) {
  // Obtener la etapa/proyecto antes de eliminar para recalcular
  const accion = await pool.query(
    'SELECT id_etapa, id_proyecto FROM acciones WHERE id = $1', [accionId]
  );

  const resultado = await pool.query(
    'DELETE FROM acciones WHERE id = $1 RETURNING id', [accionId]
  );

  // Recalcular después de eliminar
  if (accion.rows[0]?.id_etapa) {
    await recalcularEtapa(accion.rows[0].id_etapa);
  } else if (accion.rows[0]?.id_proyecto) {
    await recalcularProyecto(accion.rows[0].id_proyecto);
  }

  return resultado.rows[0] || null;
}

// Obtiene acciones para la Agenda (por rango de fechas y usuario)
async function obtenerAccionesAgenda(usuarioId, desde, hasta) {
  const resultado = await pool.query(`
    SELECT
      a.*,
      p.nombre AS proyecto_nombre,
      p.id AS proyecto_id,
      e.nombre AS etapa_nombre,
      dg.siglas AS dg_siglas
    FROM acciones a
    LEFT JOIN proyectos p ON p.id = a.id_proyecto
    LEFT JOIN etapas e ON e.id = a.id_etapa
    LEFT JOIN direcciones_generales dg ON dg.id = a.id_dg
    WHERE a.id_responsable = $1
      AND a.estado NOT IN ('Completada', 'Cancelada')
      AND a.fecha_fin BETWEEN $2 AND $3
    ORDER BY a.fecha_fin ASC
  `, [usuarioId, desde, hasta]);

  return resultado.rows;
}

// Crea una subacción dentro de una acción padre
async function crearSubaccion(accionPadreId, datos) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const padre = await client.query(
      'SELECT id_etapa, id_proyecto, id_subproyecto, id_dg FROM acciones WHERE id = $1',
      [accionPadreId]
    );
    if (!padre.rows[0]) throw new Error('Acción padre no encontrada');
    const p = padre.rows[0];

    const resultado = await client.query(`
      INSERT INTO acciones (
        nombre, descripcion, tipo, fecha_inicio, fecha_fin,
        id_accion_padre, id_etapa, id_proyecto, id_subproyecto,
        id_dg, id_direccion_area, id_responsable
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [
      datos.nombre, datos.descripcion || null, datos.tipo || 'Accion_programada',
      datos.fecha_inicio, datos.fecha_fin,
      accionPadreId, p.id_etapa, p.id_proyecto, p.id_subproyecto,
      datos.id_dg || p.id_dg || null,
      datos.id_direccion_area || null,
      datos.id_responsable || null
    ]);

    // Vincular indicadores si se proporcionaron (con validación de meta)
    await vincularIndicadores(client, resultado.rows[0].id, datos.indicadores_asociados);

    // Recalcular pesos de subacciones del padre
    await recalcularPesosSubacciones(accionPadreId, client);
    // Recalcular pesos de acciones de la etapa
    if (p.id_etapa) await recalcularPesosEtapa(p.id_etapa, client);

    await client.query('COMMIT');

    if (p.id_etapa) await recalcularEtapa(p.id_etapa);

    return resultado.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Recalcular pesos de acciones de una etapa (100% / N acciones top-level)
async function recalcularPesosEtapa(etapaId, client) {
  const db = client || pool;
  const acciones = await db.query(
    'SELECT id FROM acciones WHERE id_etapa = $1 AND id_accion_padre IS NULL',
    [etapaId]
  );
  const n = acciones.rows.length;
  if (n === 0) return;
  const peso = parseFloat((100 / n).toFixed(4));
  for (const a of acciones.rows) {
    await db.query('UPDATE acciones SET peso_porcentaje = $1 WHERE id = $2', [peso, a.id]);
  }
}

// Recalcular pesos de subacciones de una acción padre
async function recalcularPesosSubacciones(accionPadreId, client) {
  const db = client || pool;
  const subs = await db.query(
    'SELECT id FROM acciones WHERE id_accion_padre = $1',
    [accionPadreId]
  );
  // Obtener peso del padre
  const padre = await db.query('SELECT peso_porcentaje FROM acciones WHERE id = $1', [accionPadreId]);
  const pesoDelPadre = parseFloat(padre.rows[0]?.peso_porcentaje) || 0;
  const n = subs.rows.length;
  if (n === 0) return;
  const pesoPorSub = parseFloat((pesoDelPadre / n).toFixed(4));
  for (const s of subs.rows) {
    await db.query('UPDATE acciones SET peso_porcentaje = $1 WHERE id = $2', [pesoPorSub, s.id]);
  }
}

// Importar estructura completa desde CSV parseado
// filas: [{ nivel, clave_etapa, etapa, clave_accion, accion, fecha_inicio, fecha_fin, responsable, entregable }]
async function importarEstructuraCSV(proyectoId, filas) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const emptyToNull = (v) => (v === '' || v == null) ? null : v;
    // Validar que un valor sea fecha válida (YYYY-MM-DD) o null
    const toDate = (v) => {
      if (!v || v.trim() === '') return null;
      const limpio = v.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(limpio)) {
        throw new Error(`Fecha inválida: "${v}". Formato esperado: YYYY-MM-DD. Revisa que las columnas del CSV estén alineadas (¿algún campo contiene comas?).`);
      }
      return limpio;
    };
    const etapasMap = {};   // clave_etapa -> etapa row
    const accionesMap = {}; // clave_accion (ej A01) -> accion row
    let ordenEtapa = 0;

    // Obtener max orden existente
    const maxOrden = await client.query(
      'SELECT COALESCE(MAX(orden), 0) AS max_orden FROM etapas WHERE id_proyecto = $1',
      [proyectoId]
    );
    ordenEtapa = maxOrden.rows[0].max_orden;

    for (const fila of filas) {
      const nivel = (fila.nivel || '').toUpperCase().trim();

      if (nivel === 'ETAPA') {
        ordenEtapa++;
        const res = await client.query(`
          INSERT INTO etapas (nombre, descripcion, orden, tipo_meta, id_proyecto)
          VALUES ($1, $2, $3, 'Sin_meta', $4)
          RETURNING *
        `, [fila.etapa, emptyToNull(fila.entregable), ordenEtapa, proyectoId]);
        etapasMap[fila.clave_etapa] = res.rows[0];

      } else if (nivel === 'ACCION') {
        const etapa = etapasMap[fila.clave_etapa];
        if (!etapa) continue;
        const res = await client.query(`
          INSERT INTO acciones (
            nombre, descripcion, tipo, fecha_inicio, fecha_fin,
            id_etapa, id_proyecto
          ) VALUES ($1, $2, 'Accion_programada', $3, $4, $5, $6)
          RETURNING *
        `, [
          fila.accion, emptyToNull(fila.entregable),
          toDate(fila.fecha_inicio), toDate(fila.fecha_fin),
          etapa.id, proyectoId
        ]);
        accionesMap[fila.clave_accion] = res.rows[0];

      } else if (nivel === 'SUBACCION') {
        // Extraer clave padre: A01.02 -> A01
        const partes = (fila.clave_accion || '').split('.');
        const clavePadre = partes[0];
        const padre = accionesMap[clavePadre];
        if (!padre) continue;
        const etapa = etapasMap[fila.clave_etapa];
        await client.query(`
          INSERT INTO acciones (
            nombre, descripcion, tipo, fecha_inicio, fecha_fin,
            id_accion_padre, id_etapa, id_proyecto
          ) VALUES ($1, $2, 'Accion_programada', $3, $4, $5, $6, $7)
          RETURNING *
        `, [
          fila.accion, emptyToNull(fila.entregable),
          toDate(fila.fecha_inicio), toDate(fila.fecha_fin),
          padre.id, etapa?.id || null, proyectoId
        ]);
      }
    }

    // Recalcular pesos para todas las etapas creadas
    for (const clave of Object.keys(etapasMap)) {
      const etapa = etapasMap[clave];
      await recalcularPesosEtapa(etapa.id, client);
    }
    // Recalcular pesos de subacciones para cada acción padre
    for (const clave of Object.keys(accionesMap)) {
      const acc = accionesMap[clave];
      await recalcularPesosSubacciones(acc.id, client);
    }

    await client.query('COMMIT');

    return {
      etapas_creadas: Object.keys(etapasMap).length,
      acciones_creadas: Object.keys(accionesMap).length,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Alterna una subacción entre Completada (100%) y Pendiente (0%),
// luego recalcula el % de la acción padre como promedio ponderado.
async function toggleSubaccion(subaccionId) {
  const sub = await pool.query('SELECT * FROM acciones WHERE id = $1', [subaccionId]);
  if (!sub.rows[0]) throw new Error('Subacción no encontrada');
  const s = sub.rows[0];
  if (!s.id_accion_padre) throw new Error('Esta acción no es una subacción');

  const nuevoEstado = s.estado === 'Completada' ? 'Pendiente' : 'Completada';
  const nuevoPct = nuevoEstado === 'Completada' ? 100 : 0;

  await pool.query(
    `UPDATE acciones SET estado = $1, porcentaje_avance = $2, updated_at = NOW() WHERE id = $3`,
    [nuevoEstado, nuevoPct, subaccionId]
  );

  // Recalcular padre como promedio ponderado de subacciones
  await recalcularAccionDesdeSubs(s.id_accion_padre);

  return { id: subaccionId, estado: nuevoEstado, porcentaje_avance: nuevoPct };
}

// Recalcula el % de una acción padre desde sus subacciones (promedio ponderado).
// Acepta client de transacción para uso atómico.
async function recalcularAccionDesdeSubs(accionPadreId, client) {
  const db = client || pool;
  const subs = await db.query(
    `SELECT porcentaje_avance, peso_porcentaje FROM acciones
     WHERE id_accion_padre = $1 AND estado != 'Cancelada'`,
    [accionPadreId]
  );
  if (subs.rows.length === 0) return;

  const pesoTotal = subs.rows.reduce((t, s) => t + parseFloat(s.peso_porcentaje || 0), 0);
  let promedio;
  if (pesoTotal > 0) {
    promedio = subs.rows.reduce((t, s) => {
      const pct = parseFloat(s.porcentaje_avance || 0);
      const peso = parseFloat(s.peso_porcentaje || 0);
      return t + (pct * peso / pesoTotal);
    }, 0);
  } else {
    const suma = subs.rows.reduce((t, s) => t + parseFloat(s.porcentaje_avance || 0), 0);
    promedio = suma / subs.rows.length;
  }

  // Determinar estado del padre según % calculado
  let estadoPadre = null;
  if (promedio >= 100) estadoPadre = 'Completada';
  else if (promedio > 0) estadoPadre = 'En_proceso';

  await db.query(
    `UPDATE acciones SET porcentaje_avance = $1,
     estado = COALESCE($2, estado), updated_at = NOW()
     WHERE id = $3`,
    [promedio.toFixed(2), estadoPadre, accionPadreId]
  );

  // Cascada: etapa → proyecto
  const padre = await db.query(
    'SELECT id_etapa, id_proyecto FROM acciones WHERE id = $1', [accionPadreId]
  );
  if (padre.rows[0]?.id_etapa) {
    await recalcularEtapa(padre.rows[0].id_etapa, db);
  } else if (padre.rows[0]?.id_proyecto) {
    await recalcularProyecto(padre.rows[0].id_proyecto, db);
  }
}

// Reemplaza las aportaciones a indicadores de una acción (o subacción).
// Borra las existentes y las vuelve a crear con validación de meta.
async function actualizarIndicadoresAccion(accionId, indicadoresAsociados) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM accion_indicador WHERE id_accion = $1', [accionId]);
    await vincularIndicadores(client, accionId, indicadoresAsociados);
    await client.query('COMMIT');
    return { ok: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Obtiene los indicadores vinculados a una acción con sus valores
async function obtenerIndicadoresAccion(accionId) {
  const res = await pool.query(`
    SELECT ai.id_indicador, ai.valor_aportado,
           i.nombre, i.unidad, i.unidad_personalizada, i.meta_global, i.id_etapa
    FROM accion_indicador ai
    JOIN indicadores i ON i.id = ai.id_indicador
    WHERE ai.id_accion = $1
    ORDER BY i.nombre
  `, [accionId]);
  return res.rows;
}

module.exports = {
  obtenerAccionesPorEtapa,
  obtenerSubacciones,
  obtenerAccionesDirectasProyecto,
  obtenerAccionPorId,
  crearAccionEnEtapa,
  crearAccionEnProyecto,
  crearSubaccion,
  actualizarAccionCampos,
  eliminarAccion,
  obtenerAccionesAgenda,
  recalcularPesosEtapa,
  importarEstructuraCSV,
  recalcularAccionDesdeSubs,
  actualizarIndicadoresAccion,
  obtenerIndicadoresAccion
};
