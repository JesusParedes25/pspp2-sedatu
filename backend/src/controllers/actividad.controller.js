/**
 * ARCHIVO: actividad.controller.js
 * PROPÓSITO: Stream de actividad unificado (comentarios, archivos, riesgos
 *            reportados desde las tarjetas expandibles) para cualquier nodo.
 *            Reusa el mismo cliente MinIO que evidencias.controller.js.
 */
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { almacen } = require('../utils/minio');
const { transmitirObjeto } = require('../utils/transmitirObjeto');
const { limpiarArchivoTemporal } = require('../middleware/subidaArchivo.middleware');
const actividadQueries = require('../db/queries/actividad.queries');
const { puedeVerContenidoNodo } = require('../utils/autorizacion');

const TIPOS_NODO = ['etapa', 'accion', 'tarea'];

// GET /actividad/:tipo_nodo/:id_nodo
//
// Este endpoint mezcla avance/estatus (seguimiento, abierto a cualquier
// interno — exigirVisibilidadNodoEnParams en la ruta, sin cambios) con
// comentarios/archivos/riesgos (contenido de trabajo). No se puede
// bloquear entero sin ocultar también los cambios de avance legítimos de
// quien no participa, así que, igual que los seis endpoints agregados de
// proyecto, aquí se redacta en vez de bloquear (paso 14 DGTIC):
// participación resuelta UNA sola vez y pasada como un solo booleano a
// obtenerActividadNodo, que decide qué campo redactar por tipo_evento.
async function obtenerPorNodo(req, res, next) {
  try {
    const { tipo_nodo, id_nodo } = req.params;
    if (!TIPOS_NODO.includes(tipo_nodo)) {
      return res.status(400).json({ error: true, mensaje: 'tipo_nodo inválido' });
    }
    const tieneParticipacion = await puedeVerContenidoNodo({ usuario: req.usuario, tipoNodo: tipo_nodo, idNodo: id_nodo });
    const datos = await actividadQueries.obtenerActividadNodo(tipo_nodo, id_nodo, 1000, tieneParticipacion);
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
      if (metadata.tipo_medio === 'link') {
        // Enlace externo (igual que evidencias de etapa/acción): sin
        // archivo real que subir, solo se guarda la URL — se reutilizan
        // las mismas columnas archivo_url/archivo_nombre para que el
        // frontend (urlArchivo() en ActividadStream) no necesite un caso
        // aparte para saber a dónde apunta.
        if (!metadata.url) return res.status(400).json({ error: true, mensaje: 'Se requiere una URL', codigo: 'URL_REQUERIDA' });
        archivoUrl = metadata.url;
        archivoNombre = metadata.url;
      } else {
        if (!req.file) return res.status(400).json({ error: true, mensaje: 'Se requiere un archivo', codigo: 'ARCHIVO_REQUERIDO' });
        const archivo = req.file;
        const nombreUnico = `${uuidv4()}_${archivo.originalname}`;
        const rutaMinio = `actividad/${tipo_nodo}/${id_nodo}/${nombreUnico}`;
        await almacen.putObject(rutaMinio, fs.createReadStream(archivo.path), archivo.size, { 'Content-Type': archivo.mimetype });
        archivoUrl = rutaMinio;
        archivoNombre = archivo.originalname;
      }
    }

    const entrada = await actividadQueries.crearActividad({
      tipoNodo: tipo_nodo, idNodo: id_nodo, tipoEvento: tipo_evento,
      idUsuario: req.usuario.id, contenido: contenido || null,
      archivoUrl, archivoNombre, metadata,
    });
    res.status(201).json({ datos: entrada, mensaje: 'Actividad registrada' });
  } catch (err) { next(err); } finally {
    await limpiarArchivoTemporal(req);
  }
}

// GET /actividad/:id/ver       : vista previa del adjunto (inline)
// GET /actividad/:id/descargar : descarga del adjunto (attachment)
// La participación ya la validó exigirParticipacionActividadPorId() en
// la ruta (paso 14 DGTIC — contenido de trabajo, no visibilidad).
// Antes solo existía /descargar, siempre como attachment y sin
// Content-Type, así que la vista previa de un PDF adjunto a una tarea
// descargaba el archivo en vez de mostrarlo.
function transmitirAdjunto(disposicion) {
  return async function (req, res, next) {
    try {
      const fila = await actividadQueries.obtenerAdjuntoActividad(req.params.id);
      if (!fila?.archivo_url) return res.status(404).json({ error: true, mensaje: 'Archivo no encontrado', codigo: 'NO_ENCONTRADO' });

      // Liga externa (metadata.tipo_medio = 'link'): archivo_url es la URL,
      // no una clave del almacén.
      if (fila.metadata?.tipo_medio === 'link') return res.redirect(fila.archivo_url);

      return await transmitirObjeto(req, res, next, {
        clave: fila.archivo_url,
        nombre: fila.archivo_nombre || 'archivo',
        disposicion,
      });
    } catch (err) { return next(err); }
  };
}

const ver = transmitirAdjunto('inline');
const descargar = transmitirAdjunto('attachment');

module.exports = { obtenerPorNodo, crear, ver, descargar };
