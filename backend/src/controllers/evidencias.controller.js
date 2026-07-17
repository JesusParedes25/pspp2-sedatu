/**
 * ARCHIVO: evidencias.controller.js
 * PROPÓSITO: Manejar subida, listado y descarga de evidencias con MinIO.
 *
 * MINI-CLASE: Subida de archivos con Multer + MinIO
 * ─────────────────────────────────────────────────────────────────
 * El flujo de subida es: (1) Multer recibe el archivo multipart y
 * lo guarda temporalmente en memoria (memoryStorage). (2) El
 * controller toma el buffer y lo sube a MinIO con putObject().
 * (3) Se inserta un registro en la tabla evidencias con la ruta
 * en MinIO. Para la descarga, getObject() devuelve un stream que
 * se pipea directamente al response HTTP sin cargar todo en memoria.
 * ─────────────────────────────────────────────────────────────────
 */
const { Client: MinioClient } = require('minio');
const { v4: uuidv4 } = require('uuid');
const evidenciasQueries = require('../db/queries/evidencias.queries');
const { registrarActividad } = require('../utils/actividad-log');
const pool = require('../db/pool');

// Helper: resolver id_proyecto desde entidad
async function resolverProyectoId(tipo, id) {
  if (tipo === 'etapa') {
    const { rows } = await pool.query('SELECT id_proyecto FROM etapas WHERE id = $1', [id]);
    return rows[0]?.id_proyecto;
  }
  if (tipo === 'accion' || tipo === 'subaccion') {
    const { rows } = await pool.query('SELECT id_proyecto, id_etapa FROM acciones WHERE id = $1', [id]);
    if (rows[0]?.id_proyecto) return rows[0].id_proyecto;
    if (rows[0]?.id_etapa) {
      const { rows: e } = await pool.query('SELECT id_proyecto FROM etapas WHERE id = $1', [rows[0].id_etapa]);
      return e[0]?.id_proyecto;
    }
  }
  if (tipo === 'riesgo') {
    const { rows } = await pool.query('SELECT id_proyecto FROM riesgos WHERE id = $1', [id]);
    return rows[0]?.id_proyecto;
  }
  return null;
}

// Inicializar cliente MinIO
const minioClient = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT || 'minio',
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_USER,
  secretKey: process.env.MINIO_PASSWORD
});

const BUCKET = process.env.MINIO_BUCKET || 'pspp-evidencias';

// Asegurar que el bucket existe al iniciar
async function inicializarBucket() {
  try {
    const existe = await minioClient.bucketExists(BUCKET);
    if (!existe) {
      await minioClient.makeBucket(BUCKET);
      console.log(`✓ Bucket MinIO "${BUCKET}" creado`);
    }
  } catch (err) {
    console.error('✗ Error inicializando bucket MinIO:', err.message);
  }
}
inicializarBucket();

// GET /acciones/:id/evidencias — Listar evidencias de una acción
async function listarPorAccion(req, res, next) {
  try {
    const evidencias = await evidenciasQueries.obtenerEvidenciasPorAccion(req.params.id);
    res.json({ datos: evidencias, mensaje: 'Evidencias obtenidas' });
  } catch (err) {
    next(err);
  }
}

// GET /riesgos/:id/evidencias — Listar evidencias de un riesgo
async function listarPorRiesgo(req, res, next) {
  try {
    const evidencias = await evidenciasQueries.obtenerEvidenciasPorRiesgo(req.params.id);
    res.json({ datos: evidencias, mensaje: 'Evidencias obtenidas' });
  } catch (err) {
    next(err);
  }
}

// GET /etapas/:id/evidencias — Listar evidencias de una etapa
async function listarPorEtapa(req, res, next) {
  try {
    const evidencias = await evidenciasQueries.obtenerEvidenciasPorEtapa(req.params.id);
    res.json({ datos: evidencias, mensaje: 'Evidencias de etapa obtenidas' });
  } catch (err) {
    next(err);
  }
}

// POST /etapas/:id/evidencias — Subir evidencia (archivo o link) a una etapa
async function subirParaEtapa(req, res, next) {
  try {
    const { url, categoria, notas } = req.body;
    const tipoMedio = url ? 'link' : 'archivo';

    if (tipoMedio === 'archivo' && !req.file) {
      return res.status(400).json({ error: true, mensaje: 'No se proporcionó archivo ni URL', codigo: 'ARCHIVO_REQUERIDO' });
    }

    let datosEvidencia = {
      categoria: categoria || 'Otro',
      notas: notas || null,
      id_etapa: req.params.id,
      id_autor: req.usuario.id,
      tipo_medio: tipoMedio,
    };

    if (tipoMedio === 'link') {
      datosEvidencia.url = url;
      datosEvidencia.nombre_original = url;
    } else {
      const archivo = req.file;
      const nombreUnico = `${uuidv4()}_${archivo.originalname}`;
      const rutaMinio = `evidencias/etapas/${req.params.id}/${nombreUnico}`;
      await minioClient.putObject(BUCKET, rutaMinio, archivo.buffer, archivo.size, { 'Content-Type': archivo.mimetype });
      datosEvidencia.nombre_archivo = nombreUnico;
      datosEvidencia.nombre_original = archivo.originalname;
      datosEvidencia.ruta_minio = rutaMinio;
      datosEvidencia.tipo_archivo = archivo.mimetype;
      datosEvidencia.tamano_bytes = archivo.size;
    }

    const evidencia = await evidenciasQueries.crearEvidencia(datosEvidencia);
    const pId = await resolverProyectoId('etapa', req.params.id);
    if (pId) await registrarActividad({ id_proyecto: pId, id_usuario: req.usuario.id, tipo: 'evidencia', titulo: `Evidencia subida a etapa`, entidad_tipo: 'etapa', entidad_id: req.params.id });
    res.status(201).json({ datos: evidencia, mensaje: tipoMedio === 'link' ? 'Link registrado exitosamente' : 'Evidencia subida exitosamente' });
  } catch (err) {
    next(err);
  }
}

// GET /subacciones/:id/evidencias — Listar evidencias de una subacción
async function listarPorSubaccion(req, res, next) {
  try {
    const evidencias = await evidenciasQueries.obtenerEvidenciasPorSubaccion(req.params.id);
    res.json({ datos: evidencias, mensaje: 'Evidencias obtenidas' });
  } catch (err) {
    next(err);
  }
}

// POST /subacciones/:id/evidencias — Subir evidencia a una subacción
async function subirParaSubaccion(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: true,
        mensaje: 'No se proporcionó archivo',
        codigo: 'ARCHIVO_REQUERIDO'
      });
    }

    const archivo = req.file;
    const nombreUnico = `${uuidv4()}_${archivo.originalname}`;
    const rutaMinio = `evidencias/subacciones/${req.params.id}/${nombreUnico}`;

    await minioClient.putObject(BUCKET, rutaMinio, archivo.buffer, archivo.size, {
      'Content-Type': archivo.mimetype
    });

    const evidencia = await evidenciasQueries.crearEvidencia({
      nombre_archivo: nombreUnico,
      nombre_original: archivo.originalname,
      ruta_minio: rutaMinio,
      tipo_archivo: archivo.mimetype,
      categoria: req.body.categoria || 'Otro',
      tamano_bytes: archivo.size,
      notas: req.body.notas,
      id_subaccion: req.params.id,
      id_autor: req.usuario.id
    });

    res.status(201).json({ datos: evidencia, mensaje: 'Evidencia subida exitosamente' });
  } catch (err) {
    next(err);
  }
}

// GET /proyectos/:id/evidencias — Listar todas las evidencias del proyecto
async function listarPorProyecto(req, res, next) {
  try {
    const evidencias = await evidenciasQueries.obtenerEvidenciasPorProyecto(req.params.id);
    res.json({ datos: evidencias, mensaje: 'Evidencias del proyecto obtenidas' });
  } catch (err) {
    next(err);
  }
}

// POST /acciones/:id/evidencias — Subir evidencia (archivo o link) a una acción
async function subirParaAccion(req, res, next) {
  try {
    const { url, categoria, notas } = req.body;
    const tipoMedio = url ? 'link' : 'archivo';

    if (tipoMedio === 'archivo' && !req.file) {
      return res.status(400).json({ error: true, mensaje: 'No se proporcionó archivo ni URL', codigo: 'ARCHIVO_REQUERIDO' });
    }

    let datosEvidencia = {
      categoria: categoria || 'Otro',
      notas: notas || null,
      id_accion: req.params.id,
      id_autor: req.usuario.id,
      tipo_medio: tipoMedio,
    };

    if (tipoMedio === 'link') {
      datosEvidencia.url = url;
      datosEvidencia.nombre_original = url;
    } else {
      const archivo = req.file;
      const nombreUnico = `${uuidv4()}_${archivo.originalname}`;
      const rutaMinio = `evidencias/acciones/${req.params.id}/${nombreUnico}`;
      await minioClient.putObject(BUCKET, rutaMinio, archivo.buffer, archivo.size, { 'Content-Type': archivo.mimetype });
      datosEvidencia.nombre_archivo = nombreUnico;
      datosEvidencia.nombre_original = archivo.originalname;
      datosEvidencia.ruta_minio = rutaMinio;
      datosEvidencia.tipo_archivo = archivo.mimetype;
      datosEvidencia.tamano_bytes = archivo.size;
    }

    const evidencia = await evidenciasQueries.crearEvidencia(datosEvidencia);
    const pId = await resolverProyectoId('accion', req.params.id);
    if (pId) await registrarActividad({ id_proyecto: pId, id_usuario: req.usuario.id, tipo: 'evidencia', titulo: `Evidencia subida a acción`, entidad_tipo: 'accion', entidad_id: req.params.id });
    res.status(201).json({ datos: evidencia, mensaje: tipoMedio === 'link' ? 'Link registrado exitosamente' : 'Evidencia subida exitosamente' });
  } catch (err) {
    next(err);
  }
}

// POST /riesgos/:id/evidencias — Subir evidencia a un riesgo
async function subirParaRiesgo(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: true,
        mensaje: 'No se proporcionó archivo',
        codigo: 'ARCHIVO_REQUERIDO'
      });
    }

    const archivo = req.file;
    const nombreUnico = `${uuidv4()}_${archivo.originalname}`;
    const rutaMinio = `evidencias/riesgos/${req.params.id}/${nombreUnico}`;

    await minioClient.putObject(BUCKET, rutaMinio, archivo.buffer, archivo.size, {
      'Content-Type': archivo.mimetype
    });

    const evidencia = await evidenciasQueries.crearEvidencia({
      nombre_archivo: nombreUnico,
      nombre_original: archivo.originalname,
      ruta_minio: rutaMinio,
      tipo_archivo: archivo.mimetype,
      categoria: req.body.categoria || 'Otro',
      tamano_bytes: archivo.size,
      notas: req.body.notas,
      id_riesgo: req.params.id,
      id_autor: req.usuario.id
    });

    res.status(201).json({ datos: evidencia, mensaje: 'Evidencia subida exitosamente' });
  } catch (err) {
    next(err);
  }
}

// GET /evidencias/:id/descargar — Descargar archivo desde MinIO o redirigir a link
async function descargar(req, res, next) {
  try {
    const evidencia = await evidenciasQueries.obtenerEvidenciaPorId(req.params.id);

    if (!evidencia) {
      return res.status(404).json({
        error: true,
        mensaje: 'Evidencia no encontrada',
        codigo: 'NO_ENCONTRADO'
      });
    }

    // Si es un link, redirigir
    if (evidencia.tipo_medio === 'link' && evidencia.url) {
      return res.redirect(evidencia.url);
    }

    if (!evidencia.ruta_minio) {
      return res.status(404).json({ error: true, mensaje: 'Archivo no disponible' });
    }

    // Configurar headers de descarga
    res.setHeader('Content-Type', evidencia.tipo_archivo || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${evidencia.nombre_original}"`);

    // Stream directo desde MinIO al response
    const stream = await minioClient.getObject(BUCKET, evidencia.ruta_minio);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

// DELETE /evidencias/:id — Eliminar evidencia (BD + MinIO)
async function eliminar(req, res, next) {
  try {
    const evidencia = await evidenciasQueries.eliminarEvidencia(req.params.id);

    if (!evidencia) {
      return res.status(404).json({
        error: true,
        mensaje: 'Evidencia no encontrada',
        codigo: 'NO_ENCONTRADO'
      });
    }

    // Intentar eliminar de MinIO (si falla, el registro ya se borró de la BD)
    try {
      await minioClient.removeObject(BUCKET, evidencia.ruta_minio);
    } catch (minioErr) {
      console.error('Advertencia: no se pudo eliminar archivo de MinIO:', minioErr.message);
    }

    res.json({ datos: { id: evidencia.id }, mensaje: 'Evidencia eliminada' });
  } catch (err) {
    next(err);
  }
}

// GET /evidencias — Listar todas las evidencias con filtros opcionales
async function listarTodas(req, res, next) {
  try {
    const filtros = {
      proyecto_id: req.query.proyecto_id,
      categoria: req.query.categoria,
      programa_id: req.query.programa_id,
      id_dg: req.query.id_dg,
      responsable_id: req.query.responsable_id,
    };
    const evidencias = await evidenciasQueries.obtenerTodasEvidencias(filtros);
    res.json({ datos: evidencias, mensaje: 'Evidencias obtenidas' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listarPorAccion,
  listarPorEtapa,
  listarPorRiesgo,
  listarPorSubaccion,
  listarPorProyecto,
  subirParaAccion,
  subirParaEtapa,
  subirParaRiesgo,
  subirParaSubaccion,
  descargar,
  eliminar,
  listarTodas
};
