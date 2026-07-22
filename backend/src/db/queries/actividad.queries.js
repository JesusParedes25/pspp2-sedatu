/**
 * ARCHIVO: actividad.queries.js
 * PROPÓSITO: Queries para el stream de actividad unificado de un nodo
 *            (etapa/acción/tarea) y sus descendientes.
 */
const pool = require('../pool');

// Resuelve id_proyecto/id_etapa/id_accion/id_tarea a partir de tipo+id de nodo,
// para poder insertar una fila de actividad con la atribución correcta.
async function resolverContextoNodo(tipoNodo, idNodo, client = pool) {
  if (tipoNodo === 'etapa') {
    const { rows } = await client.query('SELECT id_proyecto FROM etapas WHERE id = $1', [idNodo]);
    if (!rows[0]) return null;
    return { id_proyecto: rows[0].id_proyecto, id_etapa: idNodo, id_accion: null, id_tarea: null };
  }
  if (tipoNodo === 'accion') {
    const { rows } = await client.query('SELECT id_proyecto FROM acciones WHERE id = $1', [idNodo]);
    if (!rows[0]) return null;
    return { id_proyecto: rows[0].id_proyecto, id_etapa: null, id_accion: idNodo, id_tarea: null };
  }
  if (tipoNodo === 'tarea') {
    const { rows } = await client.query(
      'SELECT a.id_proyecto FROM tareas t JOIN acciones a ON a.id = t.id_accion WHERE t.id = $1', [idNodo]
    );
    if (!rows[0]) return null;
    return { id_proyecto: rows[0].id_proyecto, id_etapa: null, id_accion: null, id_tarea: idNodo };
  }
  return null;
}

// IDs de los descendientes de un nodo (para agregar su actividad al stream).
async function idsDescendientes(tipoNodo, idNodo) {
  if (tipoNodo === 'tarea') return { etapaIds: [], accionIds: [], tareaIds: [idNodo] };

  if (tipoNodo === 'accion') {
    const { rows: sub } = await pool.query(
      'SELECT id FROM acciones WHERE id_accion_padre = $1', [idNodo]
    );
    const accionIds = [idNodo, ...sub.map(r => r.id)];
    const { rows: tareas } = await pool.query(
      'SELECT id FROM tareas WHERE id_accion = ANY($1)', [accionIds]
    );
    return { etapaIds: [], accionIds, tareaIds: tareas.map(r => r.id) };
  }

  // etapa
  const { rows: acc } = await pool.query('SELECT id FROM acciones WHERE id_etapa = $1', [idNodo]);
  const accionIds = acc.map(r => r.id);
  let subIds = [];
  if (accionIds.length) {
    const { rows: sub } = await pool.query('SELECT id FROM acciones WHERE id_accion_padre = ANY($1)', [accionIds]);
    subIds = sub.map(r => r.id);
  }
  const todasAcciones = [...accionIds, ...subIds];
  let tareaIds = [];
  if (todasAcciones.length) {
    const { rows: tareas } = await pool.query('SELECT id FROM tareas WHERE id_accion = ANY($1)', [todasAcciones]);
    tareaIds = tareas.map(r => r.id);
  }
  return { etapaIds: [idNodo], accionIds: todasAcciones, tareaIds };
}

// Stream UNIFICADO: combina el modelo histórico (comentarios, evidencias,
// riesgos — las tablas que ya existían y donde vivían estos datos ANTES del
// refactor de tarjetas) con la tabla nueva `actividad` (que solo cubre
// cambio_estatus/cambio_avance, y comentario/archivo/riesgo para tareas,
// que nunca tuvieron soporte en el modelo viejo). Sin este merge, el stream
// nuevo se veía "vacío" aunque el nodo ya tuviera historial real.
async function obtenerActividadNodo(tipoNodo, idNodo, limite = 50) {
  const { etapaIds, accionIds, tareaIds } = await idsDescendientes(tipoNodo, idNodo);

  const condicionesAct = [];
  const paramsAct = [];
  let idx = 1;
  if (etapaIds.length) { condicionesAct.push(`id_etapa = ANY($${idx++})`); paramsAct.push(etapaIds); }
  if (accionIds.length) { condicionesAct.push(`id_accion = ANY($${idx++})`); paramsAct.push(accionIds); }
  if (tareaIds.length) { condicionesAct.push(`id_tarea = ANY($${idx++})`); paramsAct.push(tareaIds); }

  const promesas = [];

  // 1. Tabla nueva `actividad`
  promesas.push(
    condicionesAct.length
      ? pool.query(`
          SELECT ac.id, ac.tipo_evento, ac.contenido, ac.archivo_url, ac.archivo_nombre,
                 ac.metadata, ac.created_at, u.nombre_completo AS autor_nombre
          FROM actividad ac
          LEFT JOIN usuarios u ON u.id = ac.id_usuario
          WHERE ${condicionesAct.join(' OR ')}
        `, paramsAct).then(r => r.rows)
      : Promise.resolve([])
  );

  // 2. Comentarios (modelo viejo): entidad_tipo usa 'Etapa'/'Accion'/'Subaccion'
  // — accionIds ya incluye subacciones, así que basta filtrar por ambos tipos.
  const entidadesComentarios = [];
  const paramsCom = [];
  if (etapaIds.length) { paramsCom.push(etapaIds); entidadesComentarios.push(`(entidad_tipo = 'Etapa' AND entidad_id = ANY($${paramsCom.length}))`); }
  if (accionIds.length) { paramsCom.push(accionIds); entidadesComentarios.push(`(entidad_tipo IN ('Accion','Subaccion') AND entidad_id = ANY($${paramsCom.length}))`); }
  promesas.push(
    entidadesComentarios.length
      ? pool.query(`
          SELECT c.id, 'comentario'::text AS tipo_evento, c.contenido,
                 NULL::text AS archivo_url, NULL::text AS archivo_nombre,
                 '{}'::jsonb AS metadata, c.created_at, u.nombre_completo AS autor_nombre
          FROM comentarios c
          LEFT JOIN usuarios u ON u.id = c.id_autor
          WHERE ${entidadesComentarios.join(' OR ')}
        `, paramsCom).then(r => r.rows)
      : Promise.resolve([])
  );

  // 3. Evidencias (modelo viejo): sí tiene columnas dedicadas id_etapa/id_accion/id_subaccion
  const condicionesEv = [];
  const paramsEv = [];
  let idxEv = 1;
  if (etapaIds.length) { condicionesEv.push(`ev.id_etapa = ANY($${idxEv++})`); paramsEv.push(etapaIds); }
  if (accionIds.length) { condicionesEv.push(`(ev.id_accion = ANY($${idxEv++}) OR ev.id_subaccion = ANY($${idxEv++}))`); paramsEv.push(accionIds, accionIds); }
  promesas.push(
    condicionesEv.length
      ? pool.query(`
          SELECT ev.id, 'archivo'::text AS tipo_evento,
                 COALESCE(ev.notas, ev.nombre_original) AS contenido,
                 CASE WHEN ev.tipo_medio = 'link' THEN ev.url ELSE ev.ruta_minio END AS archivo_url,
                 COALESCE(ev.nombre_original, ev.url) AS archivo_nombre,
                 jsonb_build_object('categoria', ev.categoria, 'evidencia_id', ev.id, 'tipo_medio', ev.tipo_medio) AS metadata,
                 ev.created_at, u.nombre_completo AS autor_nombre
          FROM evidencias ev
          LEFT JOIN usuarios u ON u.id = ev.id_autor
          WHERE ${condicionesEv.join(' OR ')}
        `, paramsEv).then(r => r.rows)
      : Promise.resolve([])
  );

  // 4. Riesgos (modelo viejo)
  const entidadesRiesgos = [];
  const paramsRi = [];
  if (etapaIds.length) { paramsRi.push(etapaIds); entidadesRiesgos.push(`(entidad_tipo = 'Etapa' AND entidad_id = ANY($${paramsRi.length}))`); }
  if (accionIds.length) { paramsRi.push(accionIds); entidadesRiesgos.push(`(entidad_tipo IN ('Accion','Subaccion') AND entidad_id = ANY($${paramsRi.length}))`); }
  promesas.push(
    entidadesRiesgos.length
      ? pool.query(`
          SELECT r.id, 'riesgo'::text AS tipo_evento,
                 COALESCE(r.descripcion, r.titulo) AS contenido,
                 NULL::text AS archivo_url, NULL::text AS archivo_nombre,
                 jsonb_build_object('nivel', r.nivel, 'estado', r.estado, 'riesgo_id', r.id) AS metadata,
                 r.created_at, u.nombre_completo AS autor_nombre
          FROM riesgos r
          LEFT JOIN usuarios u ON u.id = r.id_reportador
          WHERE ${entidadesRiesgos.join(' OR ')}
        `, paramsRi).then(r => r.rows)
      : Promise.resolve([])
  );

  const [nuevos, comentarios, evidencias, riesgos] = await Promise.all(promesas);
  return [...nuevos, ...comentarios, ...evidencias, ...riesgos]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limite);
}

async function crearActividad({ tipoNodo, idNodo, tipoEvento, idUsuario, contenido, archivoUrl, archivoNombre, metadata }, client = pool) {
  const ctx = await resolverContextoNodo(tipoNodo, idNodo, client);
  if (!ctx) throw new Error('Nodo no encontrado para registrar actividad');
  const { rows } = await client.query(`
    INSERT INTO actividad (id_proyecto, id_etapa, id_accion, id_tarea, tipo_evento, id_usuario, contenido, archivo_url, archivo_nombre, metadata)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *
  `, [ctx.id_proyecto, ctx.id_etapa, ctx.id_accion, ctx.id_tarea, tipoEvento, idUsuario || null, contenido || null, archivoUrl || null, archivoNombre || null, metadata || {}]);
  return rows[0];
}

module.exports = { resolverContextoNodo, obtenerActividadNodo, crearActividad };
