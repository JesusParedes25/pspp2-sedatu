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
const { derivarEstadoContenedor } = require('../../utils/avance-semaforo');
const municipiosNodoQueries = require('./municipios-nodo.queries');
const { sincronizarCobertura } = require('./cobertura-sync.queries');
const aportacionesQueries = require('./aportaciones.queries');

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
      (SELECT COUNT(*) FROM acciones sub WHERE sub.id_accion_padre = a.id) AS total_subacciones,
      (SELECT COUNT(*) FROM tareas t2 WHERE t2.id_accion = a.id) AS total_tareas,
      (SELECT COALESCE(json_agg(json_build_object('cve_mun', am.cve_mun, 'nombre', gm.nombre) ORDER BY gm.nombre), '[]'::json)
         FROM accion_municipios am JOIN geo_municipios gm ON gm.cvegeo = am.cve_mun
         WHERE am.accion_id = a.id) AS municipios,
      COALESCE(a.fecha_inicio, (SELECT MIN(t.fecha_inicio) FROM tareas t WHERE t.id_accion = a.id AND t.estado != 'Cancelada')) AS fecha_inicio_efectiva,
      COALESCE(a.fecha_limite, a.fecha_fin, (SELECT MAX(t.fecha_limite) FROM tareas t WHERE t.id_accion = a.id AND t.estado != 'Cancelada')) AS fecha_fin_efectiva
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
      COUNT(e.id) AS total_evidencias,
      (SELECT COALESCE(json_agg(json_build_object('cve_mun', am.cve_mun, 'nombre', gm.nombre) ORDER BY gm.nombre), '[]'::json)
         FROM accion_municipios am JOIN geo_municipios gm ON gm.cvegeo = am.cve_mun
         WHERE am.accion_id = a.id) AS municipios,
      COALESCE(a.fecha_inicio, (SELECT MIN(t.fecha_inicio) FROM tareas t WHERE t.id_accion = a.id AND t.estado != 'Cancelada')) AS fecha_inicio_efectiva,
      COALESCE(a.fecha_limite, a.fecha_fin, (SELECT MAX(t.fecha_limite) FROM tareas t WHERE t.id_accion = a.id AND t.estado != 'Cancelada')) AS fecha_fin_efectiva
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
      COUNT(e.id) AS total_evidencias,
      (SELECT COALESCE(json_agg(json_build_object('cve_mun', am.cve_mun, 'nombre', gm.nombre) ORDER BY gm.nombre), '[]'::json)
         FROM accion_municipios am JOIN geo_municipios gm ON gm.cvegeo = am.cve_mun
         WHERE am.accion_id = a.id) AS municipios
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
      da.siglas AS direccion_area_siglas,
      (SELECT COALESCE(json_agg(json_build_object('cve_mun', am.cve_mun, 'nombre', gm.nombre) ORDER BY gm.nombre), '[]'::json)
         FROM accion_municipios am JOIN geo_municipios gm ON gm.cvegeo = am.cve_mun
         WHERE am.accion_id = a.id) AS municipios
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
//
// Escribe en indicador_aportaciones (antes escribía en accion_indicador,
// retirada — ver migración 068). modo 'al_concluir' a propósito: esta
// aportación, capturada al crear la acción, solo cuenta para el indicador
// cuando la acción se completa — no desde que se captura. Antes contaba
// de inmediato aunque la acción se quedara Pendiente para siempre; el
// indicador debe reflejar lo realmente logrado, no una promesa sin
// cumplir.
async function vincularIndicadores(client, accionId, indicadoresAsociados) {
  if (!indicadoresAsociados || indicadoresAsociados.length === 0) return;
  for (const ia of indicadoresAsociados) {
    const aportado = (ia.valor_aportado !== '' && ia.valor_aportado != null)
      ? parseFloat(ia.valor_aportado) : 0;
    if (aportado < 0) throw new Error('El valor aportado no puede ser negativo');
    if (aportado > 0) {
      const res = await client.query(`
        SELECT i.meta_global, COALESCE(SUM(ap.aportacion), 0)::numeric AS total_aportado
        FROM indicadores i
        LEFT JOIN indicador_aportaciones ap ON ap.id_indicador = i.id
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
    await aportacionesQueries.crear(
      { id_indicador: ia.id_indicador, id_accion: accionId, aportacion: aportado, modo: 'al_concluir' },
      client
    );
  }
}

// Crea una nueva acción dentro de una etapa con asociaciones opcionales a indicadores
async function crearAccionEnEtapa(etapaId, datos) {
  const client = await pool.connect();
  const emptyToNull = (v) => (v === '' || v == null) ? null : v;
  try {
    await client.query('BEGIN');

    const etapa = await client.query('SELECT id_proyecto, id_subproyecto, cve_ent, id_zm, estado FROM etapas WHERE id = $1', [etapaId]);
    // Decisión 6: una etapa Completada no recibe actividades nuevas en
    // silencio — el avance ya no se movería (la etapa es hoja de esta
    // acción nueva recién creada) pero el estado manual se quedaría
    // diciendo "Completada" sin que nadie se entere de que ya no lo está.
    if (etapa.rows[0]?.estado === 'Completada') {
      throw new Error('Esta etapa está marcada como Completada. Para agregar actividades, primero cámbiala a En proceso.');
    }
    const proyectoId = etapa.rows[0]?.id_proyecto;
    const subproyectoId = etapa.rows[0]?.id_subproyecto;

    // Heredar territorio (estado / zona metropolitana) de la etapa padre
    // cuando la acción no especifica el suyo propio explícitamente.
    const cveEnt = datos.cve_ent !== undefined ? emptyToNull(datos.cve_ent) : (etapa.rows[0]?.cve_ent || null);
    const idZm   = datos.id_zm   !== undefined ? emptyToNull(datos.id_zm)   : (etapa.rows[0]?.id_zm   || null);

    // Bloque 2.3 (modal de nueva acción): quien captura ve una sola
    // "Fecha límite" — este valor se espeja también a fecha_fin para no
    // romper a quien hoy la lee directo (Cronograma, Agenda, exportaciones).
    // El fallback a datos.fecha_fin es solo por compatibilidad con algún
    // llamador que todavía mande esa clave en vez de fecha_limite (ninguno
    // de los que hoy llaman esta función lo hace).
    const fechaLimite = emptyToNull(datos.fecha_limite) ?? emptyToNull(datos.fecha_fin);
    const resultado = await client.query(`
      INSERT INTO acciones (
        nombre, descripcion, tipo, fecha_inicio, fecha_fin,
        id_etapa, id_proyecto, id_subproyecto, id_dg, id_direccion_area, id_responsable,
        prioridad, fecha_limite, instancia_responsable, enlace_responsable, observaciones,
        cve_ent, id_zm
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *
    `, [
      datos.nombre, emptyToNull(datos.descripcion), datos.tipo || 'Accion_programada',
      emptyToNull(datos.fecha_inicio), fechaLimite,
      etapaId, proyectoId, emptyToNull(subproyectoId),
      emptyToNull(datos.id_dg), emptyToNull(datos.id_direccion_area), emptyToNull(datos.id_responsable),
      emptyToNull(datos.prioridad), fechaLimite,
      emptyToNull(datos.instancia_responsable), emptyToNull(datos.enlace_responsable),
      emptyToNull(datos.observaciones),
      cveEnt, idZm
    ]);

    const accion = resultado.rows[0];
    await vincularIndicadores(client, accion.id, datos.indicadores_asociados);

    // Heredar también los municipios de la etapa (si aplica y no es modo ZM);
    // la acción puede pasar su propia lista de municipios para no heredar.
    let municipios = [];
    if (cveEnt && !idZm) {
      if (Array.isArray(datos.municipios)) {
        municipios = [...new Set(datos.municipios.filter(Boolean))];
      } else {
        const heredados = await municipiosNodoQueries.obtenerMunicipiosEtapa(etapaId, client);
        municipios = heredados.map(m => m.cve_mun);
      }
      if (municipios.length > 0) {
        await municipiosNodoQueries.reemplazarMunicipiosAccion(client, accion.id, municipios);
      }
    }
    // Espejo en cobertura_geografica, igual que hace el PATCH manual.
    await sincronizarCobertura(client, 'accion', accion.id, cveEnt, municipios);

    // Leaf→container transition: clear avance override on parent etapa
    await client.query(
      `UPDATE etapas SET avance_actual = NULL, avance_override = FALSE WHERE id = $1 AND avance_override = TRUE`,
      [etapaId]
    );

    await client.query('COMMIT');
    await recalcularEtapa(etapaId);

    accion.cve_ent = cveEnt;
    accion.id_zm = idZm;
    accion.municipios = municipios.length > 0
      ? (await municipiosNodoQueries.obtenerMunicipiosAccion(accion.id))
      : [];
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

    // Ver mismo comentario en crearAccionEnEtapa: una sola fecha límite
    // capturada, espejada a fecha_fin para no romper a quien hoy la lee.
    const fechaLimite = emptyToNull(datos.fecha_limite) ?? emptyToNull(datos.fecha_fin);
    const resultado = await client.query(`
      INSERT INTO acciones (
        nombre, descripcion, tipo, fecha_inicio, fecha_fin,
        id_proyecto, id_dg, id_direccion_area, id_responsable,
        prioridad, fecha_limite, instancia_responsable, enlace_responsable, observaciones
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      datos.nombre, emptyToNull(datos.descripcion), datos.tipo || 'Accion_programada',
      emptyToNull(datos.fecha_inicio), fechaLimite,
      proyectoId, emptyToNull(datos.id_dg), emptyToNull(datos.id_direccion_area), emptyToNull(datos.id_responsable),
      emptyToNull(datos.prioridad), fechaLimite,
      emptyToNull(datos.instancia_responsable), emptyToNull(datos.enlace_responsable),
      emptyToNull(datos.observaciones)
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

// Columnas de actualizarAccionCampos que solo entran al SET cuando su
// clave está presente en `datos` — a diferencia de las de abajo
// (nombre, fecha_fin_real, tipo), que siguen aceptando COALESCE porque
// nunca conviene limpiarlas a NULL a propósito desde este camino.
const CAMPOS_ACCION_SET_DINAMICO = [
  'descripcion', 'porcentaje_avance', 'fecha_inicio', 'fecha_fin',
  'id_responsable', 'id_dg', 'id_direccion_area',
  'prioridad', 'fecha_limite', 'instancia_responsable', 'enlace_responsable', 'observaciones',
];

// Actualiza campos no-estado de una acción (nombre, descripcion, porcentaje, fechas, responsable, DG, DA, tipo).
// El cambio de estado se maneja en el controller vía validaciones-estado.js.
// Acepta client de transacción para uso atómico.
//
// Las columnas de CAMPOS_ACCION_SET_DINAMICO solo entran al SET cuando su
// clave está presente en `datos` (nunca por COALESCE) — necesario porque
// PropiedadesElemento.jsx manda un payload diff-only (solo lo que cambió),
// y con COALESCE/asignación directa un guardado parcial que omite, p.ej.,
// `instancia_responsable` la borraba en silencio. Mismo patrón que
// catalogo-indicadores.queries.js::actualizar().
async function actualizarAccionCampos(accionId, datos, client) {
  const db = client || pool;

  const sets = [];
  const valores = [];

  if (datos.nombre) { valores.push(datos.nombre); sets.push(`nombre = $${valores.length}`); }
  if (datos.fecha_fin_real) { valores.push(datos.fecha_fin_real); sets.push(`fecha_fin_real = $${valores.length}`); }
  if (datos.tipo) { valores.push(datos.tipo); sets.push(`tipo = $${valores.length}`); }

  for (const campo of CAMPOS_ACCION_SET_DINAMICO) {
    if (datos[campo] === undefined) continue;
    valores.push(datos[campo] === '' ? null : datos[campo]);
    sets.push(`${campo} = $${valores.length}`);
  }

  if (sets.length === 0) {
    const actual = await db.query('SELECT * FROM acciones WHERE id = $1', [accionId]);
    return actual.rows[0] || null;
  }

  valores.push(accionId);
  const resultado = await db.query(`
    UPDATE acciones SET ${sets.join(', ')}, updated_at = NOW()
    WHERE id = $${valores.length}
    RETURNING *
  `, valores);

  return resultado.rows[0] || null;
}

// Elimina una acción
async function eliminarAccion(accionId) {
  // Obtener la etapa/proyecto antes de eliminar para recalcular
  const accion = await pool.query(
    'SELECT id_etapa, id_proyecto FROM acciones WHERE id = $1', [accionId]
  );

  // cobertura_geografica es polimórfica (sin FK real) y no se limpia sola al
  // borrar la acción; se hace explícito para no dejar filas huérfanas.
  // Incluye subacciones (se borran en cascada por id_accion_padre) y
  // tareas — tanto las de esta acción como las de sus subacciones.
  await pool.query(
    `DELETE FROM cobertura_geografica WHERE
       (tipo_entidad = 'accion' AND id_entidad IN (
          SELECT id FROM acciones WHERE id = $1 OR id_accion_padre = $1))
    OR (tipo_entidad = 'tarea' AND id_entidad IN (
          SELECT id FROM tareas WHERE id_accion = $1
             OR id_accion IN (SELECT id FROM acciones WHERE id_accion_padre = $1)))`,
    [accionId]
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

// Obtiene todas las actividades con fecha para la Agenda del usuario,
// aplicando la regla del "dueño más cercano" (docs/modelo-permisos.md,
// sección 16): un nodo aparece en la lista de su dueño más cercano en
// el árbol — subiendo desde el nodo, el primer nivel con ASIGNACIÓN
// DIRECTA (el nodo mismo, o el ancestro más cercano que la tenga)
// decide quién lo ve. "Asignación directa" de un nodo = su columna
// id_responsable (a cualquier persona), o una fila aceptada de
// nodo_miembros de ESE nodo (a cualquier persona) — no solo de quien
// pregunta. Si ningún nivel del árbol de ascendientes tiene asignación
// directa, el dueño de respaldo es quien administra el proyecto
// completo (su creador, o quien tenga proyecto_usuarios.rol IN
// ('responsable','administracion_proyecto') aceptada) — así ningún
// nodo queda sin dueño en ninguna lista, porque todo proyecto tiene
// administrador.
//
// Importante: esto es DISTINTO de funcionEfectiva (utils/funcion-efectiva.js
// — "¿puedo editar esto?"), que sigue heredando hacia abajo sin ninguna
// excepción y no se toca aquí. Esta función resuelve una pregunta
// distinta — "¿aparece esto en MI lista de pendientes?" — un
// administrador que delegó una etapa sigue pudiendo abrirla y editarla
// (funcionEfectivaEnNodo ya lo resuelve así, heredando hacia abajo);
// solo deja de aparecer en SU agenda, porque ya es trabajo de otra
// persona. No filtra por DG a propósito (ver
// paso2-casos-especificos.test.js): es trabajo propio, nunca el bono de
// un director sobre los enlaces de su DG.
async function obtenerAccionesAgenda(usuarioId) {
  // 1) Proyectos relevantes: donde el usuario administra TODO el
  //    proyecto, o donde tiene una asignación directa (a cualquier
  //    profundidad) en algún nodo — unión de ambos, un solo viaje a la
  //    base. acciones.id_proyecto está siempre poblado (migración 065),
  //    así que una subacción a cualquier profundidad entra con un
  //    simple WHERE id_proyecto, sin necesitar recursión.
  const { rows: proyectosRows } = await pool.query(`
    SELECT DISTINCT p.id
    FROM proyectos p
    WHERE p.deleted_at IS NULL AND (
      p.id_creador = $1
      OR EXISTS (
        SELECT 1 FROM proyecto_usuarios pu
        WHERE pu.id_proyecto = p.id AND pu.id_usuario = $1
          AND pu.rol IN ('responsable', 'administracion_proyecto') AND pu.estado = 'aceptada'
      )
      OR EXISTS (
        SELECT 1 FROM etapas e
        WHERE e.id_proyecto = p.id AND (
          e.id_responsable = $1
          OR EXISTS (SELECT 1 FROM nodo_miembros nm WHERE nm.tipo_nodo = 'etapa' AND nm.id_nodo = e.id AND nm.id_usuario = $1 AND nm.estado = 'aceptada')
        )
      )
      OR EXISTS (
        SELECT 1 FROM acciones a
        WHERE a.id_proyecto = p.id AND (
          a.id_responsable = $1
          OR EXISTS (SELECT 1 FROM nodo_miembros nm WHERE nm.tipo_nodo = 'accion' AND nm.id_nodo = a.id AND nm.id_usuario = $1 AND nm.estado = 'aceptada')
        )
      )
      OR EXISTS (
        SELECT 1 FROM tareas t
        JOIN acciones a2 ON a2.id = t.id_accion
        WHERE a2.id_proyecto = p.id AND (
          t.id_responsable = $1
          OR EXISTS (SELECT 1 FROM nodo_miembros nm WHERE nm.tipo_nodo = 'tarea' AND nm.id_nodo = t.id AND nm.id_usuario = $1 AND nm.estado = 'aceptada')
        )
      )
    )
  `, [usuarioId]);
  const proyectoIds = proyectosRows.map(r => r.id);
  if (proyectoIds.length === 0) return { items: [], hayPartesDelegadas: false };

  // 2) El árbol completo (etapas/acciones/tareas) de esos proyectos, en
  //    un puñado de consultas — nunca una por nodo (mismo criterio que
  //    funcionEfectivaPorLotes). Se carga TODO el árbol, con o sin
  //    fecha, porque hace falta para resolver correctamente a quién le
  //    toca cada nodo sin fecha propia (sus hijos sí pueden tenerla).
  const [{ rows: proyectos }, { rows: adminsFilas }, { rows: etapas }, { rows: acciones }, { rows: tareas }] = await Promise.all([
    pool.query('SELECT id, nombre, id_creador FROM proyectos WHERE id = ANY($1)', [proyectoIds]),
    pool.query(
      `SELECT id_proyecto, id_usuario FROM proyecto_usuarios
       WHERE id_proyecto = ANY($1) AND rol IN ('responsable', 'administracion_proyecto') AND estado = 'aceptada'`,
      [proyectoIds]
    ),
    pool.query(
      `SELECT id, nombre, estado, semaforo, semaforo_override, COALESCE(avance_actual, 0) AS avance_actual,
              fecha_inicio, COALESCE(fecha_limite, fecha_fin) AS fecha_fin,
              id_responsable, id_proyecto, prioridad, estatus_cualitativo
       FROM etapas WHERE id_proyecto = ANY($1)`,
      [proyectoIds]
    ),
    pool.query(
      `SELECT id, nombre, estado, semaforo, semaforo_override, COALESCE(avance_actual, 0) AS avance_actual,
              fecha_inicio, COALESCE(fecha_limite, fecha_fin) AS fecha_fin,
              id_responsable, id_accion_padre, id_etapa, id_proyecto, prioridad, estatus_cualitativo
       FROM acciones WHERE id_proyecto = ANY($1)`,
      [proyectoIds]
    ),
    pool.query(
      `SELECT t.id, t.nombre, t.estado, t.semaforo, t.semaforo_override, COALESCE(t.avance_actual, 0) AS avance_actual,
              t.fecha_inicio, t.fecha_limite AS fecha_fin,
              t.id_responsable, t.id_accion, a.id_proyecto
       FROM tareas t JOIN acciones a ON a.id = t.id_accion WHERE a.id_proyecto = ANY($1)`,
      [proyectoIds]
    ),
  ]);

  const idsEtapa = etapas.map(e => e.id);
  const idsAccion = acciones.map(a => a.id);
  const idsTarea = tareas.map(t => t.id);
  const { rows: miembros } = (idsEtapa.length || idsAccion.length || idsTarea.length)
    ? await pool.query(
        `SELECT tipo_nodo, id_nodo, id_usuario, rol FROM nodo_miembros
         WHERE estado = 'aceptada' AND (
           (tipo_nodo = 'etapa'  AND id_nodo = ANY($1::uuid[])) OR
           (tipo_nodo = 'accion' AND id_nodo = ANY($2::uuid[])) OR
           (tipo_nodo = 'tarea'  AND id_nodo = ANY($3::uuid[]))
         )`,
        [idsEtapa, idsAccion, idsTarea]
      )
    : { rows: [] };

  // Nombres de responsables directos, para responsable_nombre — el
  // nombre de quien está escrito en la columna id_responsable de ESE
  // nodo, sin importar quién resuelve verlo (mismo criterio que antes).
  const idsResponsables = [...new Set([
    ...etapas.map(e => e.id_responsable), ...acciones.map(a => a.id_responsable), ...tareas.map(t => t.id_responsable),
  ].filter(Boolean))];
  const { rows: usuariosResp } = idsResponsables.length
    ? await pool.query('SELECT id, nombre_completo FROM usuarios WHERE id = ANY($1)', [idsResponsables])
    : { rows: [] };
  const nombrePorId = new Map(usuariosResp.map(u => [u.id, u.nombre_completo]));

  // Quién administra cada proyecto (creador + proyecto_usuarios
  // responsable/administracion_proyecto aceptada) — el dueño de
  // respaldo de cualquier nodo sin asignación directa en TODO su árbol
  // de ascendientes.
  const adminsPorProyecto = new Map(proyectos.map(p => [p.id, new Set(p.id_creador ? [p.id_creador] : [])]));
  for (const a of adminsFilas) adminsPorProyecto.get(a.id_proyecto)?.add(a.id_usuario);

  const miembroPorNodo = new Map();
  for (const m of miembros) {
    const key = `${m.tipo_nodo}:${m.id_nodo}`;
    if (!miembroPorNodo.has(key)) miembroPorNodo.set(key, new Map());
    miembroPorNodo.get(key).set(m.id_usuario, m.rol);
  }

  // Asignados DIRECTOS de un nodo — a cualquier persona, no solo a
  // quien pregunta: id_responsable de ese nodo (rol 'responsable') más
  // cada fila aceptada de nodo_miembros de ese nodo. Dos personas
  // asignadas al mismo nodo quedan ambas en este mapa, y por lo tanto
  // en las listas de ambas.
  function asignadosPropios(tipo, nodo) {
    const asignados = new Map(miembroPorNodo.get(`${tipo}:${nodo.id}`) || []);
    if (nodo.id_responsable) asignados.set(nodo.id_responsable, 'responsable');
    return asignados;
  }

  function decisionProyecto(idProyecto) {
    const asignados = new Map();
    for (const id of (adminsPorProyecto.get(idProyecto) || [])) asignados.set(id, 'coordinador');
    return { nivel: 'proyecto', asignados };
  }

  const porId = {
    etapa: new Map(etapas.map(e => [e.id, e])),
    accion: new Map(acciones.map(a => [a.id, a])),
    tarea: new Map(tareas.map(t => [t.id, t])),
  };
  const memo = { etapa: new Map(), accion: new Map(), tarea: new Map() };

  function resolverEtapa(id) {
    if (memo.etapa.has(id)) return memo.etapa.get(id);
    const nodo = porId.etapa.get(id);
    const propios = asignadosPropios('etapa', nodo);
    const resultado = propios.size > 0 ? { nivel: 'nodo', asignados: propios } : decisionProyecto(nodo.id_proyecto);
    memo.etapa.set(id, resultado);
    return resultado;
  }

  function resolverAccion(id) {
    if (memo.accion.has(id)) return memo.accion.get(id);
    const nodo = porId.accion.get(id);
    const propios = asignadosPropios('accion', nodo);
    let resultado;
    if (propios.size > 0) resultado = { nivel: 'nodo', asignados: propios };
    else if (nodo.id_accion_padre) resultado = resolverAccion(nodo.id_accion_padre);
    else if (nodo.id_etapa) resultado = resolverEtapa(nodo.id_etapa);
    else resultado = decisionProyecto(nodo.id_proyecto);
    memo.accion.set(id, resultado);
    return resultado;
  }

  function resolverTarea(id) {
    if (memo.tarea.has(id)) return memo.tarea.get(id);
    const nodo = porId.tarea.get(id);
    const propios = asignadosPropios('tarea', nodo);
    const resultado = propios.size > 0 ? { nivel: 'nodo', asignados: propios } : resolverAccion(nodo.id_accion);
    memo.tarea.set(id, resultado);
    return resultado;
  }

  // es_hoja de una acción: sin subacciones propias y sin tareas propias
  // — calculado sobre el árbol COMPLETO ya cargado, no solo sobre lo
  // que le toca a usuarioId (mismo criterio que antes).
  const accionesConHija = new Set(acciones.filter(a => a.id_accion_padre).map(a => a.id_accion_padre));
  const accionesConTarea = new Set(tareas.map(t => t.id_accion));

  const proyectoPorId = new Map(proyectos.map(p => [p.id, p]));

  // Si usuarioId administra el proyecto de este nodo, y el nodo resolvió
  // su decisión en un nivel puntual (no el respaldo del proyecto) del
  // que usuarioId no forma parte, es justo lo que ese administrador
  // delegó — solo importa para nodos que SÍ tienen fecha (los únicos
  // que podrían haber aparecido en la lista).
  let hayPartesDelegadas = false;
  function marcarSiDelegado(idProyecto, decision) {
    if (decision.nivel !== 'nodo' || decision.asignados.has(usuarioId)) return;
    if (adminsPorProyecto.get(idProyecto)?.has(usuarioId)) hayPartesDelegadas = true;
  }

  const items = [];

  for (const e of etapas) {
    if (!e.fecha_fin) continue;
    const decision = resolverEtapa(e.id);
    const rol = decision.asignados.get(usuarioId);
    if (!rol) { marcarSiDelegado(e.id_proyecto, decision); continue; }
    const proyecto = proyectoPorId.get(e.id_proyecto);
    items.push({
      tipo: 'etapa', id: e.id, nombre: e.nombre, estado: e.estado, semaforo: e.semaforo, semaforo_override: e.semaforo_override,
      avance_actual: e.avance_actual, fecha_fin: e.fecha_fin, fecha_inicio: e.fecha_inicio,
      responsable_id: e.id_responsable, responsable_nombre: e.id_responsable ? (nombrePorId.get(e.id_responsable) || null) : null,
      proyecto_id: e.id_proyecto, proyecto_nombre: proyecto?.nombre || null,
      etapa_id: null, etapa_nombre: null, accion_id: null, accion_nombre: null,
      mi_rol: rol, prioridad: e.prioridad, estatus_cualitativo: e.estatus_cualitativo, es_hoja: null,
    });
  }

  for (const a of acciones) {
    if (!a.fecha_fin) continue;
    const decision = resolverAccion(a.id);
    const rol = decision.asignados.get(usuarioId);
    if (!rol) { marcarSiDelegado(a.id_proyecto, decision); continue; }
    const proyecto = proyectoPorId.get(a.id_proyecto);
    // Mismo criterio que antes: la etapa dueña sale de a.id_etapa
    // directamente — NULL para una subacción (solo tiene
    // id_accion_padre), que es como ya se comportaba esta columna.
    const etapaDueña = a.id_etapa ? porId.etapa.get(a.id_etapa) : null;
    items.push({
      tipo: 'accion', id: a.id, nombre: a.nombre, estado: a.estado, semaforo: a.semaforo, semaforo_override: a.semaforo_override,
      avance_actual: a.avance_actual, fecha_fin: a.fecha_fin, fecha_inicio: a.fecha_inicio,
      responsable_id: a.id_responsable, responsable_nombre: a.id_responsable ? (nombrePorId.get(a.id_responsable) || null) : null,
      proyecto_id: a.id_proyecto, proyecto_nombre: proyecto?.nombre || null,
      etapa_id: a.id_etapa || null, etapa_nombre: etapaDueña?.nombre || null,
      accion_id: null, accion_nombre: null,
      mi_rol: rol, prioridad: a.prioridad, estatus_cualitativo: a.estatus_cualitativo,
      es_hoja: !accionesConHija.has(a.id) && !accionesConTarea.has(a.id),
    });
  }

  for (const t of tareas) {
    if (!t.fecha_fin) continue;
    const decision = resolverTarea(t.id);
    const rol = decision.asignados.get(usuarioId);
    if (!rol) { marcarSiDelegado(t.id_proyecto, decision); continue; }
    const accionPadre = porId.accion.get(t.id_accion);
    const etapaDueña = accionPadre?.id_etapa ? porId.etapa.get(accionPadre.id_etapa) : null;
    const proyecto = proyectoPorId.get(t.id_proyecto);
    items.push({
      tipo: 'tarea', id: t.id, nombre: t.nombre, estado: t.estado, semaforo: t.semaforo, semaforo_override: t.semaforo_override,
      avance_actual: t.avance_actual, fecha_fin: t.fecha_fin, fecha_inicio: t.fecha_inicio,
      responsable_id: t.id_responsable, responsable_nombre: t.id_responsable ? (nombrePorId.get(t.id_responsable) || null) : null,
      proyecto_id: t.id_proyecto, proyecto_nombre: proyecto?.nombre || null,
      etapa_id: etapaDueña?.id || null, etapa_nombre: etapaDueña?.nombre || null,
      accion_id: accionPadre?.id || null, accion_nombre: accionPadre?.nombre || null,
      mi_rol: rol, prioridad: t.prioridad, estatus_cualitativo: t.estatus_cualitativo, es_hoja: true,
    });
  }

  // pg devuelve las columnas DATE/TIMESTAMP como objetos Date, no como
  // cadenas — recién se vuelven cadena ISO al serializar la respuesta
  // con res.json() (Date.prototype.toJSON), ya fuera de esta función.
  // Comparar aquí con localeCompare() (pensado para strings) truena en
  // cuanto hay algo que ordenar: Date no tiene ese método. new Date(x)
  // acepta tanto un Date como una cadena ISO por igual, así que esta
  // comparación funciona sin que importe cuál de los dos tenga la fila
  // en este punto. Sin fecha → Infinity, para que quede al final,
  // mismo criterio que el NULLS LAST que usaba el ORDER BY anterior.
  items.sort((x, y) => tiempoDeOrden(x.fecha_fin) - tiempoDeOrden(y.fecha_fin));

  return { items, hayPartesDelegadas };
}

function tiempoDeOrden(fecha) {
  return fecha ? new Date(fecha).getTime() : Infinity;
}

// Crea una subacción dentro de una acción padre
async function crearSubaccion(accionPadreId, datos) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const padre = await client.query(
      'SELECT id_etapa, id_proyecto, id_subproyecto, id_dg, estado, id_accion_padre FROM acciones WHERE id = $1',
      [accionPadreId]
    );
    if (!padre.rows[0]) throw new Error('Acción padre no encontrada');
    const p = padre.rows[0];
    // Decisión 6: no se agregan actividades a una acción ya Completada.
    if (p.estado === 'Completada') {
      const sustantivo = p.id_accion_padre ? 'subacción' : 'acción';
      throw new Error(`Esta ${sustantivo} está marcada como Completada. Para agregar actividades, primero cámbiala a En proceso.`);
    }

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

    // Leaf→container transition: clear avance override on parent accion
    await client.query(
      `UPDATE acciones SET avance_actual = NULL, avance_override = FALSE WHERE id = $1 AND avance_override = TRUE`,
      [accionPadreId]
    );

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
  // Todas las subacciones, incluidas Cancelada — para derivar el estado con
  // el mismo criterio (derivarEstadoContenedor) que etapas/acciones-contenedor
  // en vez del umbral de porcentaje que usaba antes esta función.
  const subs = await db.query(
    `SELECT porcentaje_avance, peso_porcentaje, estado FROM acciones
     WHERE id_accion_padre = $1`,
    [accionPadreId]
  );
  if (subs.rows.length === 0) return;

  const activas = subs.rows.filter(s => s.estado !== 'Cancelada');
  const pesoTotal = activas.reduce((t, s) => t + parseFloat(s.peso_porcentaje || 0), 0);
  let promedio;
  if (activas.length === 0) {
    promedio = 0;
  } else if (pesoTotal > 0) {
    promedio = activas.reduce((t, s) => {
      const pct = parseFloat(s.porcentaje_avance || 0);
      const peso = parseFloat(s.peso_porcentaje || 0);
      return t + (pct * peso / pesoTotal);
    }, 0);
  } else {
    const suma = activas.reduce((t, s) => t + parseFloat(s.porcentaje_avance || 0), 0);
    promedio = suma / activas.length;
  }

  const estadoDerivado = derivarEstadoContenedor(subs.rows.map(s => s.estado));
  const { rows: [padreActual] } = await db.query('SELECT estado, estado_override FROM acciones WHERE id = $1', [accionPadreId]);
  const estadoPadre = padreActual?.estado_override ? padreActual.estado : estadoDerivado;

  await db.query(
    `UPDATE acciones SET porcentaje_avance = $1,
     estado = $2, updated_at = NOW()
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
    // Indicadores afectados por este reemplazo (los que perdían aportación
    // y los que la ganan) — se recalculan al final, ver comentario abajo.
    const previos = await client.query(
      'SELECT DISTINCT id_indicador FROM indicador_aportaciones WHERE id_accion = $1', [accionId]
    );
    const idsAfectados = new Set(previos.rows.map(r => r.id_indicador));
    for (const ia of (indicadoresAsociados || [])) idsAfectados.add(ia.id_indicador);

    // FK id_accion de indicador_aportaciones es ON DELETE CASCADE por
    // acción; aquí se reemplaza el set completo de esta acción, así que
    // se borra explícito antes de recrear (igual que antes con
    // accion_indicador).
    await client.query('DELETE FROM indicador_aportaciones WHERE id_accion = $1', [accionId]);
    await vincularIndicadores(client, accionId, indicadoresAsociados);
    // Recalcular de inmediato: esta acción puede ya estar Completada al
    // momento de editar sus aportaciones — sin esto, el indicador se
    // queda desactualizado hasta el próximo cambio de estado de
    // cualquier otro nodo del proyecto.
    for (const idIndicador of idsAfectados) {
      await aportacionesQueries.recalcularUnIndicador(idIndicador, client);
    }
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
    SELECT ap.id_indicador, ap.aportacion AS valor_aportado,
           i.nombre, i.unidad, i.unidad_personalizada, i.meta_global, i.id_etapa
    FROM indicador_aportaciones ap
    JOIN indicadores i ON i.id = ap.id_indicador
    WHERE ap.id_accion = $1
    ORDER BY i.nombre
  `, [accionId]);
  return res.rows;
}

// Actualiza un solo campo de una acción (para inline editing en DataGrid)
// "estado"/"semaforo" NO están aquí a propósito: escribirlos directo sin
// pasar por cambiarEstadoUtil (validaciones-estado.js) se saltaba el
// motivo de bloqueo, la fila en `bloqueos`, la auditoría, estado_override/
// semaforo_override, y no recalculaba nada hacia arriba — el estatus se
// cambia desde el selector de Estatus (SelectorEstado → PUT /estado).
async function patchCampoAccion(accionId, campo, valor) {
  // porcentaje_avance NO está en CAMPOS_DIRECTOS a propósito: la columna
  // "%" de Vista Lista es de solo lectura (avance efectivo, calculado),
  // nunca hay una celda que dispare este PATCH con ese campo — dejarlo
  // aquí era una vía muerta que el siguiente recálculo revertiría en
  // silencio si algún día se activara sin querer.
  const CAMPOS_DIRECTOS = ['nombre', 'descripcion', 'fecha_inicio', 'fecha_fin', 'prioridad', 'tipo'];
  const CAMPOS_GOBERNADOS = ['estado', 'semaforo'];

  let query, params;
  if (CAMPOS_GOBERNADOS.includes(campo)) {
    throw new Error(`Campo no permitido: ${campo} — se cambia desde el selector de Estatus (motivo de bloqueo, cascada y auditoría), no por edición en línea.`);
  } else if (CAMPOS_DIRECTOS.includes(campo)) {
    query = `UPDATE acciones SET ${campo} = $1, updated_at = NOW() WHERE id = $2 RETURNING *`;
    params = [valor, accionId];
  } else if (campo.startsWith('campos_extra.')) {
    const clave = campo.replace('campos_extra.', '');
    query = `UPDATE acciones SET campos_extra = jsonb_set(COALESCE(campos_extra, '{}'), $1, $2), updated_at = NOW() WHERE id = $3 RETURNING *`;
    params = [`{${clave}}`, JSON.stringify(valor), accionId];
  } else {
    throw new Error(`Campo no permitido: ${campo}`);
  }

  const { rows } = await pool.query(query, params);
  return rows[0] || null;
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
  obtenerIndicadoresAccion,
  patchCampoAccion
};
