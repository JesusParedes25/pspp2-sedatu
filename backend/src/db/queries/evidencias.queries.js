/**
 * ARCHIVO: evidencias.queries.js
 * PROPÓSITO: Queries SQL para la tabla evidencias y la integración con MinIO.
 *
 * MINI-CLASE: MinIO y almacenamiento de archivos
 * ─────────────────────────────────────────────────────────────────
 * MinIO es un servidor de almacenamiento compatible con Amazon S3.
 * Los archivos se guardan en "buckets" (como carpetas raíz). La BD
 * solo guarda la RUTA al archivo en MinIO (ruta_minio), no el archivo
 * en sí. Cuando el usuario descarga, el backend pide el archivo a
 * MinIO y lo transmite como stream al navegador. Esto desacopla el
 * almacenamiento de la BD y permite escalar independientemente.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');
const { idsNodoYDescendientes } = require('../../utils/descendientes-nodo');

// Obtiene evidencias de una acción
async function obtenerEvidenciasPorAccion(accionId) {
  const resultado = await pool.query(`
    SELECT
      ev.*,
      u.nombre_completo AS autor_nombre
    FROM evidencias ev
    LEFT JOIN usuarios u ON u.id = ev.id_autor
    WHERE ev.id_accion = $1
    ORDER BY ev.created_at DESC
  `, [accionId]);

  return resultado.rows;
}

// Documentos de la pestaña "Documentos" de Detalle (Fase 4) — a diferencia
// de obtenerEvidenciasPor{Etapa,Accion} (exacto, usado por el modal
// "Adjuntar documento" para mostrar solo lo propio del nodo), esta agrega
// también los documentos de los descendientes, con "origen" (de qué nodo
// viene cada uno) para que la tabla pueda mostrar de dónde salió un
// registro que no es del nodo seleccionado. Una tarea no tiene fila propia
// en `evidencias` (sus adjuntos viven en `actividad`, tipo_evento='archivo')
// — se incluyen aquí también para que la agregación de una etapa/acción no
// se salte los documentos de sus tareas descendientes.
async function obtenerDocumentosAgregados(tipoNodo, idNodo, incluirHijos = true) {
  const { etapaIds, accionIds, tareaIds } = await idsNodoYDescendientes(tipoNodo, idNodo, incluirHijos);

  const condiciones = [];
  const params = [];
  let idx = 1;
  if (etapaIds.length) { condiciones.push(`ev.id_etapa = ANY($${idx++})`); params.push(etapaIds); }
  if (accionIds.length) { condiciones.push(`(ev.id_accion = ANY($${idx++}) OR ev.id_subaccion = ANY($${idx++}))`); params.push(accionIds, accionIds); }

  const promesaEvidencias = condiciones.length
    ? pool.query(`
        SELECT
          ev.id, ev.nombre_archivo, ev.nombre_original, ev.tipo_archivo, ev.categoria,
          ev.tamano_bytes, ev.notas, ev.url, ev.tipo_medio, ev.titulo, ev.created_at,
          u.nombre_completo AS autor_nombre,
          CASE WHEN ev.id_etapa IS NOT NULL THEN 'etapa' ELSE 'accion' END AS origen_tipo,
          COALESCE(ev.id_etapa, ev.id_accion, ev.id_subaccion) AS origen_id,
          COALESCE(et.nombre, ac.nombre) AS origen_nombre
        FROM evidencias ev
        LEFT JOIN usuarios u ON u.id = ev.id_autor
        LEFT JOIN etapas et ON et.id = ev.id_etapa
        LEFT JOIN acciones ac ON ac.id = COALESCE(ev.id_accion, ev.id_subaccion)
        WHERE ${condiciones.join(' OR ')}
      `, params).then(r => r.rows)
    : Promise.resolve([]);

  const promesaArchivosTarea = tareaIds.length
    ? pool.query(`
        SELECT
          act.id, act.metadata, act.archivo_url, act.archivo_nombre, act.created_at,
          u.nombre_completo AS autor_nombre,
          'tarea' AS origen_tipo, act.id_tarea AS origen_id, t.nombre AS origen_nombre
        FROM actividad act
        LEFT JOIN usuarios u ON u.id = act.id_usuario
        LEFT JOIN tareas t ON t.id = act.id_tarea
        WHERE act.tipo_evento = 'archivo' AND act.id_tarea = ANY($1)
      `, [tareaIds]).then(r => r.rows)
    : Promise.resolve([]);

  const [evidencias, archivosTarea] = await Promise.all([promesaEvidencias, promesaArchivosTarea]);

  const propios = evidencias.map(ev => ({
    id: ev.id,
    titulo: ev.titulo,
    nombre_original: ev.nombre_original,
    nombre_archivo: ev.nombre_archivo,
    categoria: ev.categoria,
    tipo_archivo: ev.tipo_archivo,
    tamano_bytes: ev.tamano_bytes,
    notas: ev.notas,
    url: ev.url,
    tipo_medio: ev.tipo_medio,
    autor_nombre: ev.autor_nombre,
    created_at: ev.created_at,
    origen: (ev.origen_tipo === tipoNodo && ev.origen_id === idNodo)
      ? null
      : { tipo: ev.origen_tipo, id: ev.origen_id, nombre: ev.origen_nombre },
  }));

  const deTareas = archivosTarea.map(a => ({
    id: a.id,
    titulo: a.metadata?.titulo || null,
    nombre_original: a.archivo_nombre,
    nombre_archivo: null,
    categoria: a.metadata?.categoria || 'Otro',
    tipo_archivo: null,
    tamano_bytes: null,
    notas: a.metadata?.notas || null,
    url: a.metadata?.tipo_medio === 'link' ? a.archivo_url : undefined,
    tipo_medio: a.metadata?.tipo_medio || 'archivo',
    autor_nombre: a.autor_nombre,
    created_at: a.created_at,
    origen: (tipoNodo === 'tarea' && a.origen_id === idNodo)
      ? null
      : { tipo: 'tarea', id: a.origen_id, nombre: a.origen_nombre },
  }));

  return [...propios, ...deTareas].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

// Obtiene evidencias de un riesgo
async function obtenerEvidenciasPorRiesgo(riesgoId) {
  const resultado = await pool.query(`
    SELECT
      ev.*,
      u.nombre_completo AS autor_nombre
    FROM evidencias ev
    LEFT JOIN usuarios u ON u.id = ev.id_autor
    WHERE ev.id_riesgo = $1
    ORDER BY ev.created_at DESC
  `, [riesgoId]);

  return resultado.rows;
}

// Obtiene evidencias de una subacción
async function obtenerEvidenciasPorSubaccion(subaccionId) {
  const resultado = await pool.query(`
    SELECT
      ev.*,
      u.nombre_completo AS autor_nombre
    FROM evidencias ev
    LEFT JOIN usuarios u ON u.id = ev.id_autor
    WHERE ev.id_subaccion = $1
    ORDER BY ev.created_at DESC
  `, [subaccionId]);

  return resultado.rows;
}

// Obtiene evidencias de una etapa
async function obtenerEvidenciasPorEtapa(etapaId) {
  const resultado = await pool.query(`
    SELECT
      ev.*,
      u.nombre_completo AS autor_nombre
    FROM evidencias ev
    LEFT JOIN usuarios u ON u.id = ev.id_autor
    WHERE ev.id_etapa = $1
    ORDER BY ev.created_at DESC
  `, [etapaId]);
  return resultado.rows;
}

// Obtiene todas las evidencias de un proyecto — por acción, subacción,
// etapa directa (subida desde la etapa sin pasar por una acción) o riesgo
// (de la etapa/acción o del proyecto mismo). Antes solo cubría acción y
// subacción, así que una evidencia subida directo a una etapa o a un
// riesgo no aparecía aquí aunque sí en el módulo global de Documentos
// (obtenerTodasEvidencias, abajo) — mismo patrón de JOINs, acotado a un
// solo proyecto.
async function obtenerEvidenciasPorProyecto(proyectoId) {
  const resultado = await pool.query(`
    SELECT
      ev.*,
      u.nombre_completo AS autor_nombre,
      COALESCE(acc.nombre, subacc.nombre) AS accion_nombre,
      COALESCE(et_directa.nombre, et_de_accion.nombre, et_de_subaccion.nombre, et_de_riesgo.nombre) AS etapa_nombre,
      r.titulo AS riesgo_titulo
    FROM evidencias ev
    LEFT JOIN usuarios u ON u.id = ev.id_autor
    LEFT JOIN etapas et_directa ON et_directa.id = ev.id_etapa
    LEFT JOIN acciones acc ON acc.id = ev.id_accion
    LEFT JOIN acciones subacc ON subacc.id = ev.id_subaccion
    LEFT JOIN etapas et_de_accion ON et_de_accion.id = acc.id_etapa
    LEFT JOIN etapas et_de_subaccion ON et_de_subaccion.id = subacc.id_etapa
    LEFT JOIN riesgos r ON r.id = ev.id_riesgo
    LEFT JOIN etapas et_de_riesgo ON r.entidad_tipo = 'Etapa' AND et_de_riesgo.id = r.entidad_id
    LEFT JOIN acciones ac_de_riesgo ON r.entidad_tipo IN ('Accion','Subaccion') AND ac_de_riesgo.id = r.entidad_id
    WHERE COALESCE(
      et_directa.id_proyecto,
      acc.id_proyecto,
      subacc.id_proyecto,
      ac_de_riesgo.id_proyecto,
      CASE WHEN r.entidad_tipo = 'Proyecto' THEN r.entidad_id END
    ) = $1
    ORDER BY ev.created_at DESC
  `, [proyectoId]);

  return resultado.rows;
}

// Obtiene una evidencia por ID
async function obtenerEvidenciaPorId(evidenciaId) {
  const resultado = await pool.query(
    'SELECT * FROM evidencias WHERE id = $1',
    [evidenciaId]
  );
  return resultado.rows[0] || null;
}

// Crea un registro de evidencia (archivo MinIO o link externo)
async function crearEvidencia(datos) {
  const resultado = await pool.query(`
    INSERT INTO evidencias (
      nombre_archivo, nombre_original, ruta_minio, tipo_archivo,
      categoria, tamano_bytes, notas, fecha_generacion,
      id_accion, id_riesgo, id_subaccion, id_autor, id_etapa,
      url, tipo_medio, titulo
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    RETURNING *
  `, [
    datos.nombre_archivo || null, datos.nombre_original || null, datos.ruta_minio || null,
    datos.tipo_archivo || null, datos.categoria || 'Otro', datos.tamano_bytes || null,
    datos.notas || null, datos.fecha_generacion || null,
    datos.id_accion || null, datos.id_riesgo || null,
    datos.id_subaccion || null, datos.id_autor, datos.id_etapa || null,
    datos.url || null, datos.tipo_medio || 'archivo', datos.titulo || null
  ]);

  return resultado.rows[0];
}

// Elimina una evidencia (el archivo en MinIO se elimina en el controller)
async function eliminarEvidencia(evidenciaId) {
  const resultado = await pool.query(
    'DELETE FROM evidencias WHERE id = $1 RETURNING *',
    [evidenciaId]
  );
  return resultado.rows[0] || null;
}

// Obtiene todas las evidencias del sistema con datos de proyecto, etapa y autor
/**
 * Lista evidencias de TODOS los proyectos (módulo global).
 * A diferencia de las consultas por accion/etapa, aquí la evidencia puede
 * colgar de exactamente uno de: id_etapa, id_accion, id_subaccion, id_riesgo
 * (constraint chk_evidencia_pertenencia) — hay que resolver el proyecto,
 * etapa y acción "padre" según cuál de esos 4 esté presente.
 *
 * @param {object} filtros - proyecto_id, categoria, programa_id, id_dg, responsable_id, etiqueta
 * @param {string[]|null} proyectoIds - restricción de acceso: null = sin restricción
 *   (superadmin/ejecutivo), array = solo esos proyectos (colaborador o dirección).
 */
async function obtenerTodasEvidencias(filtros = {}, proyectoIds = null) {
  const condiciones = [];
  const params = [];
  let idx = 1;

  if (proyectoIds !== null) {
    condiciones.push(`p.id = ANY($${idx++})`);
    params.push(proyectoIds);
  }
  if (filtros.proyecto_id) {
    condiciones.push(`p.id = $${idx++}`);
    params.push(filtros.proyecto_id);
  }
  if (filtros.categoria) {
    condiciones.push(`ev.categoria = $${idx++}`);
    params.push(filtros.categoria);
  }
  if (filtros.programa_id) {
    condiciones.push(`p.id_programa = $${idx++}`);
    params.push(filtros.programa_id);
  }
  if (filtros.id_dg) {
    condiciones.push(`p.id_dg_lider = $${idx++}`);
    params.push(filtros.id_dg);
  }
  if (filtros.responsable_id) {
    condiciones.push(`ev.id_autor = $${idx++}`);
    params.push(filtros.responsable_id);
  }
  if (filtros.etiqueta) {
    condiciones.push(`EXISTS (
      SELECT 1 FROM etiquetas et2 WHERE et2.id_proyecto = p.id AND LOWER(et2.nombre) = LOWER($${idx++})
    )`);
    params.push(filtros.etiqueta);
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';

  const resultado = await pool.query(`
    SELECT
      ev.*,
      u.nombre_completo AS autor_nombre,
      COALESCE(acc.nombre, subacc.nombre) AS accion_nombre,
      COALESCE(et_directa.nombre, et_de_accion.nombre, et_de_subaccion.nombre, et_de_riesgo.nombre) AS etapa_nombre,
      r.titulo AS riesgo_titulo,
      p.nombre AS proyecto_nombre,
      p.id AS proyecto_id,
      dg.siglas AS dg_siglas,
      prog.clave AS programa_clave
    FROM evidencias ev
    LEFT JOIN usuarios u ON u.id = ev.id_autor
    LEFT JOIN etapas et_directa ON et_directa.id = ev.id_etapa
    LEFT JOIN acciones acc ON acc.id = ev.id_accion
    LEFT JOIN acciones subacc ON subacc.id = ev.id_subaccion
    LEFT JOIN etapas et_de_accion ON et_de_accion.id = acc.id_etapa
    LEFT JOIN etapas et_de_subaccion ON et_de_subaccion.id = subacc.id_etapa
    LEFT JOIN riesgos r ON r.id = ev.id_riesgo
    LEFT JOIN etapas et_de_riesgo ON r.entidad_tipo = 'Etapa' AND et_de_riesgo.id = r.entidad_id
    LEFT JOIN acciones ac_de_riesgo ON r.entidad_tipo IN ('Accion','Subaccion') AND ac_de_riesgo.id = r.entidad_id
    LEFT JOIN proyectos p ON p.id = COALESCE(
      et_directa.id_proyecto,
      acc.id_proyecto,
      subacc.id_proyecto,
      ac_de_riesgo.id_proyecto,
      CASE WHEN r.entidad_tipo = 'Proyecto' THEN r.entidad_id END
    )
    LEFT JOIN direcciones_generales dg ON dg.id = p.id_dg_lider
    LEFT JOIN programas prog ON prog.id = p.id_programa
    ${where}
    ORDER BY ev.created_at DESC
    LIMIT 200
  `, params);

  return resultado.rows;
}

module.exports = {
  obtenerEvidenciasPorAccion,
  obtenerEvidenciasPorEtapa,
  obtenerEvidenciasPorRiesgo,
  obtenerEvidenciasPorSubaccion,
  obtenerEvidenciasPorProyecto,
  obtenerEvidenciaPorId,
  crearEvidencia,
  eliminarEvidencia,
  obtenerTodasEvidencias,
  obtenerDocumentosAgregados,
};
