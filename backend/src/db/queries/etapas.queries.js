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

  // Filtro opcional por DG (para el SelectorDG del frontend) — una etapa
  // entra si esa DG la toca EN CUALQUIER NIVEL: la etapa misma (id_dg,
  // responsable o colaborador de la etapa), o cualquiera de sus acciones
  // (id_dg, responsable, colaborador), o cualquier tarea de esas acciones
  // (responsable). No basta con mirar solo la columna id_dg de la etapa —
  // eso dejaba fuera DGs que solo participan vía una acción o tarea.
  if (idDg) {
    condiciones.push(`(
      e.id_dg = $2
      OR e.id_responsable IN (SELECT id FROM usuarios WHERE id_dg = $2)
      OR EXISTS (SELECT 1 FROM nodo_miembros nm JOIN usuarios un ON un.id = nm.id_usuario
                 WHERE nm.tipo_nodo = 'etapa' AND nm.id_nodo = e.id AND un.id_dg = $2)
      OR EXISTS (
        SELECT 1 FROM acciones a WHERE a.id_etapa = e.id AND (
          a.id_dg = $2
          OR a.id_responsable IN (SELECT id FROM usuarios WHERE id_dg = $2)
          OR EXISTS (SELECT 1 FROM tareas t JOIN usuarios ut ON ut.id = t.id_responsable
                     WHERE t.id_accion = a.id AND ut.id_dg = $2)
          OR EXISTS (SELECT 1 FROM nodo_miembros nm JOIN usuarios un ON un.id = nm.id_usuario
                     WHERE nm.tipo_nodo = 'accion' AND nm.id_nodo = a.id AND un.id_dg = $2)
          OR EXISTS (SELECT 1 FROM nodo_miembros nm JOIN usuarios un ON un.id = nm.id_usuario
                     JOIN tareas t2 ON t2.id = nm.id_nodo
                     WHERE nm.tipo_nodo = 'tarea' AND t2.id_accion = a.id AND un.id_dg = $2)
        )
      )
    )`);
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
      (SELECT COUNT(*) FROM acciones a WHERE a.id_etapa = e.id AND a.estado = 'Completada') AS acciones_completadas,
      (SELECT COALESCE(json_agg(json_build_object('cve_mun', em.cve_mun, 'nombre', gm.nombre) ORDER BY gm.nombre), '[]'::json)
         FROM etapa_municipios em JOIN geo_municipios gm ON gm.cvegeo = em.cve_mun
         WHERE em.etapa_id = e.id) AS municipios
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
      da.siglas AS direccion_area_siglas,
      (SELECT COALESCE(json_agg(json_build_object('cve_mun', em.cve_mun, 'nombre', gm.nombre) ORDER BY gm.nombre), '[]'::json)
         FROM etapa_municipios em JOIN geo_municipios gm ON gm.cvegeo = em.cve_mun
         WHERE em.etapa_id = e.id) AS municipios
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
        id_proyecto, id_subproyecto, id_dg, id_direccion_area, id_responsable,
        tipo, prioridad, fecha_limite, instancia_responsable, enlace_responsable, observaciones
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING *
    `, [
      datos.nombre, emptyToNull(datos.descripcion),
      datos.orden || maxOrden.rows[0].siguiente,
      datos.tipo_meta || 'Sin_meta', emptyToNull(datos.meta_descripcion),
      emptyToNull(datos.meta_valor), emptyToNull(datos.meta_unidad),
      emptyToNull(datos.depende_de),
      proyectoId, emptyToNull(datos.id_subproyecto),
      emptyToNull(datos.id_dg), emptyToNull(datos.id_direccion_area),
      emptyToNull(datos.id_responsable),
      emptyToNull(datos.tipo), emptyToNull(datos.prioridad),
      emptyToNull(datos.fecha_limite), emptyToNull(datos.instancia_responsable),
      emptyToNull(datos.enlace_responsable), emptyToNull(datos.observaciones)
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

// Actualiza una etapa (campos directos + indicadores asociados en transacción).
// Acepta un client externo para participar en una transacción del controller.
async function actualizarEtapa(etapaId, datos, externalClient) {
  const n = (v) => (v === '' || v === undefined) ? null : v;
  const gestionaTransaccion = !externalClient;
  const client = externalClient || await pool.connect();
  try {
    if (gestionaTransaccion) await client.query('BEGIN');

    const resultado = await client.query(`
      UPDATE etapas SET
        nombre                = COALESCE($1, nombre),
        descripcion           = $2,
        id_dg                 = $3,
        id_direccion_area     = $4,
        id_responsable        = $5,
        depende_de            = $6,
        tipo_meta             = COALESCE($7, tipo_meta),
        meta_descripcion      = $8,
        meta_valor            = $9,
        meta_unidad           = $10,
        tipo                  = $12,
        prioridad             = $13,
        fecha_limite          = $14,
        instancia_responsable = $15,
        enlace_responsable    = $16,
        observaciones         = $17,
        updated_at            = NOW()
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
      n(datos.tipo), n(datos.prioridad),
      n(datos.fecha_limite), n(datos.instancia_responsable),
      n(datos.enlace_responsable), n(datos.observaciones),
    ]);

    const etapa = resultado.rows[0];
    if (!etapa) {
      if (gestionaTransaccion) await client.query('ROLLBACK');
      return null;
    }

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

    if (gestionaTransaccion) await client.query('COMMIT');
    return etapa;
  } catch (err) {
    if (gestionaTransaccion) await client.query('ROLLBACK');
    throw err;
  } finally {
    if (gestionaTransaccion) client.release();
  }
}

// Elimina una etapa y sus dependencias en cascada
async function eliminarEtapa(etapaId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Desconectar etapas que dependen de ésta
    await client.query(
      'UPDATE etapas SET depende_de = NULL WHERE depende_de = $1',
      [etapaId]
    );
    // Eliminar indicador_etapas vinculados
    await client.query(
      'DELETE FROM indicador_etapas WHERE id_etapa = $1',
      [etapaId]
    );
    // Eliminar indicadores propios de la etapa
    await client.query(
      'DELETE FROM indicadores WHERE id_etapa = $1',
      [etapaId]
    );
    // Eliminar evidencias de acciones/subacciones de esta etapa
    await client.query(
      `DELETE FROM evidencias WHERE id_accion IN (SELECT id FROM acciones WHERE id_etapa = $1)`,
      [etapaId]
    );
    // Eliminar cobertura geográfica vinculada — incluye las tareas de las
    // acciones de esta etapa; antes se quedaban huérfanas (la fila de
    // cobertura_geografica sobrevive aunque la tarea se borre en cascada,
    // porque esa tabla es polimórfica y no tiene FK real).
    await client.query(
      `DELETE FROM cobertura_geografica WHERE (tipo_entidad = 'etapa' AND id_entidad = $1)
        OR (tipo_entidad = 'accion' AND id_entidad IN (SELECT id FROM acciones WHERE id_etapa = $1))
        OR (tipo_entidad = 'tarea' AND id_entidad IN (
              SELECT t.id FROM tareas t JOIN acciones a ON a.id = t.id_accion WHERE a.id_etapa = $1))`,
      [etapaId]
    );
    // Eliminar acciones de esta etapa
    await client.query(
      'DELETE FROM acciones WHERE id_etapa = $1',
      [etapaId]
    );
    const resultado = await client.query(
      'DELETE FROM etapas WHERE id = $1 RETURNING id, id_proyecto',
      [etapaId]
    );
    await client.query('COMMIT');
    return resultado.rows[0] || null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Actualiza un solo campo de una etapa (para inline editing en DataGrid)
// "estado"/"semaforo" NO están aquí a propósito: escribirlos directo sin
// pasar por cambiarEstadoUtil (validaciones-estado.js) se saltaba el
// motivo de bloqueo, la fila en `bloqueos`, la auditoría, estado_override/
// semaforo_override, y no recalculaba nada hacia arriba — el estatus se
// cambia desde el selector de Estatus (SelectorEstado → PUT /estado).
async function patchCampoEtapa(etapaId, campo, valor) {
  // fecha_inicio/fecha_fin tampoco están aquí: son columnas derivadas
  // para una etapa (la más temprana/tardía entre sus acciones/tareas) —
  // recalcularEtapa las sobreescribe en cuanto algo debajo cambia, así
  // que capturarlas a mano aquí era otra vía muerta.
  const CAMPOS_DIRECTOS = ['nombre', 'descripcion', 'prioridad'];
  const CAMPOS_GOBERNADOS = ['estado', 'semaforo'];

  let query, params;
  if (CAMPOS_GOBERNADOS.includes(campo)) {
    throw new Error(`Campo no permitido: ${campo} — se cambia desde el selector de Estatus (motivo de bloqueo, cascada y auditoría), no por edición en línea.`);
  } else if (CAMPOS_DIRECTOS.includes(campo)) {
    query = `UPDATE etapas SET ${campo} = $1, updated_at = NOW() WHERE id = $2 RETURNING *`;
    params = [valor, etapaId];
  } else if (campo.startsWith('campos_extra.')) {
    const clave = campo.replace('campos_extra.', '');
    query = `UPDATE etapas SET campos_extra = jsonb_set(COALESCE(campos_extra, '{}'), $1, $2), updated_at = NOW() WHERE id = $3 RETURNING *`;
    params = [`{${clave}}`, JSON.stringify(valor), etapaId];
  } else {
    throw new Error(`Campo no permitido: ${campo}`);
  }

  const { rows } = await pool.query(query, params);
  return rows[0] || null;
}

// Obtiene las claves únicas de campos_extra de todas las etapas de un proyecto
async function obtenerCamposExtraSchema(proyectoId) {
  const { rows } = await pool.query(`
    SELECT DISTINCT jsonb_object_keys(COALESCE(campos_extra, '{}')) AS clave
    FROM etapas
    WHERE id_proyecto = $1 AND campos_extra IS NOT NULL AND campos_extra != '{}'
    UNION
    SELECT DISTINCT jsonb_object_keys(COALESCE(campos_extra, '{}')) AS clave
    FROM acciones
    WHERE id_proyecto = $1 AND campos_extra IS NOT NULL AND campos_extra != '{}'
    ORDER BY clave
  `, [proyectoId]);
  return rows.map(r => r.clave);
}

module.exports = {
  obtenerEtapasPorProyecto,
  obtenerEtapaPorId,
  crearEtapa,
  actualizarEtapa,
  eliminarEtapa,
  patchCampoEtapa,
  obtenerCamposExtraSchema
};
