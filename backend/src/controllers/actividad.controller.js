/**
 * ARCHIVO: actividad.controller.js
 * PROPÓSITO: Stream de actividad unificado (comentarios, archivos, riesgos
 *            reportados desde las tarjetas expandibles) para cualquier nodo.
 *            Reusa el mismo cliente MinIO que evidencias.controller.js.
 */
const { v4: uuidv4 } = require('uuid');
const { minioClient, BUCKET } = require('../utils/minio');
const actividadQueries = require('../db/queries/actividad.queries');

const TIPOS_NODO = ['etapa', 'accion', 'tarea'];

// GET /actividad/:tipo_nodo/:id_nodo
async function obtenerPorNodo(req, res, next) {
  try {
    const { tipo_nodo, id_nodo } = req.params;
    if (!TIPOS_NODO.includes(tipo_nodo)) {
      return res.status(400).json({ error: true, mensaje: 'tipo_nodo inválido' });
    }
    const datos = await actividadQueries.obtenerActividadNodo(tipo_nodo, id_nodo);
    res.json({ datos, mensaje: 'Actividad obtenida' });
  } catch (err) { next(err); }
}

// POST /actividad — comentario o archivo (multipart si trae archivo)
// body: { tipo_nodo, id_nodo, tipo_evento, contenido, metadata? }
async function crear(req, res, next) {
  try {
    const { tipo_nodo, id_nodo, tipo_evento, contenido } = req.body;
    let metadata = {};
    if (req.body.metadata) {
      try { metadata = typeof req.body.metadata === 'string' ? JSON.parse(req.body.metadata) : req.body.metadata; } catch { metadata = {}; }
    }

    if (!TIPOS_NODO.includes(tipo_nodo)) {
      return res.status(400).json({ error: true, mensaje: 'tipo_nodo inválido' });
    }
    if (!['comentario', 'archivo', 'riesgo'].includes(tipo_evento)) {
      return res.status(400).json({ error: true, mensaje: 'tipo_evento inválido para este endpoint' });
    }

    let archivoUrl = null, archivoNombre = null;
    if (tipo_evento === 'archivo') {
      if (!req.file) return res.status(400).json({ error: true, mensaje: 'Se requiere un archivo', codigo: 'ARCHIVO_REQUERIDO' });
      const archivo = req.file;
      const nombreUnico = `${uuidv4()}_${archivo.originalname}`;
      const rutaMinio = `actividad/${tipo_nodo}/${id_nodo}/${nombreUnico}`;
      await minioClient.putObject(BUCKET, rutaMinio, archivo.buffer, archivo.size, { 'Content-Type': archivo.mimetype });
      archivoUrl = rutaMinio;
      archivoNombre = archivo.originalname;
    }

    const entrada = await actividadQueries.crearActividad({
      tipoNodo: tipo_nodo, idNodo: id_nodo, tipoEvento: tipo_evento,
      idUsuario: req.usuario.id, contenido: contenido || null,
      archivoUrl, archivoNombre, metadata,
    });
    res.status(201).json({ datos: entrada, mensaje: 'Actividad registrada' });
  } catch (err) { next(err); }
}

// GET /actividad/:id/descargar — stream del archivo adjunto de una entrada
async function descargar(req, res, next) {
  try {
    const actividadQ = require('../db/pool');
    const { rows } = await actividadQ.query('SELECT archivo_url, archivo_nombre FROM actividad WHERE id = $1', [req.params.id]);
    const fila = rows[0];
    if (!fila?.archivo_url) return res.status(404).json({ error: true, mensaje: 'Archivo no encontrado' });
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fila.archivo_nombre || 'archivo')}"`);
    const stream = await minioClient.getObject(BUCKET, fila.archivo_url);
    stream.pipe(res);
  } catch (err) { next(err); }
}

module.exports = { obtenerPorNodo, crear, descargar };
