/**
 * ARCHIVO: evidencias.controller.js
 * PROPÓSITO: Manejar subida, listado y descarga de evidencias con MinIO.
 *
 * NOTA TÉCNICA: Subida de archivos con Multer + MinIO
 * ─────────────────────────────────────────────────────────────────
 * El flujo de subida es: (1) Multer recibe el archivo multipart y lo
 * escribe conforme llega a un temporal en disco (diskStorage, ver
 * middleware/subidaArchivo.middleware.js). (2) El controller abre un
 * stream de lectura de ese temporal y lo sube a MinIO con putObject().
 * (3) Se inserta un registro en la tabla evidencias con la ruta en
 * MinIO. (4) El temporal se borra siempre, haya salido bien o mal (ver
 * middleware/subidaArchivo.middleware.js: la limpieza va atada al cierre
 * de la respuesta, el finally de cada función es una segunda red). Para
 * la descarga y la vista previa, utils/transmitirObjeto.js transmite el
 * objeto por flujo desde el backend, con soporte de Range.
 * ─────────────────────────────────────────────────────────────────
 */
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const evidenciasQueries = require('../db/queries/evidencias.queries');
const { registrarActividad } = require('../utils/actividad-log');
const { alcanceProyectosUsuarioONull } = require('../utils/alcanceProyectos');
const { limpiarArchivoTemporal } = require('../middleware/subidaArchivo.middleware');
const pool = require('../db/pool');

// Resuelve a qué proyectos tiene acceso el usuario para el módulo global de
// evidencias: superadmin/ejecutivo ven todo; el resto, solo los proyectos
// donde colabora o es responsable (proyecto_usuarios).
//
// Punto de consolidación (Fase 1 del modelo de permisos,
// docs/modelo-permisos.md sección 6.3): antes esta función tenía su propia
// rama para 'direccion' (todos los proyectos de su DG líder, sin necesitar
// ser miembro), distinta de lo que ya hacían Tablero/Inicio y Territorio
// para el mismo rol — esa era justo la inconsistencia documentada, no una
// regla a propósito. Ahora es un alias de utils/alcanceProyectos.js, igual
// que los otros dos: 'direccion' pierde aquí el acceso automático a toda
// su DG y queda igual que el resto (solo donde participa) hasta que la
// Fase 2 decida las reglas finales de alcance por perfil.
async function resolverProyectoIdsAcceso(usuario) {
  return alcanceProyectosUsuarioONull(usuario);
}

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

// Acceso al almacén (ver utils/minio.js): `almacen` aplica MINIO_PREFIX a
// toda clave; `minioClient` crudo solo se usa aquí para el bucket mismo.
const { minioClient, BUCKET, almacen } = require('../utils/minio');
const { transmitirObjeto } = require('../utils/transmitirObjeto');

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
    const { url, categoria, notas, titulo } = req.body;
    const tipoMedio = url ? 'link' : 'archivo';

    if (tipoMedio === 'archivo' && !req.file) {
      return res.status(400).json({ error: true, mensaje: 'No se proporcionó archivo ni URL', codigo: 'ARCHIVO_REQUERIDO' });
    }

    let datosEvidencia = {
      categoria: categoria || 'Otro',
      notas: notas || null,
      titulo: titulo || null,
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
      await almacen.putObject(rutaMinio, fs.createReadStream(archivo.path), archivo.size, { 'Content-Type': archivo.mimetype });
      datosEvidencia.nombre_archivo = nombreUnico;
      datosEvidencia.nombre_original = archivo.originalname;
      datosEvidencia.ruta_minio = rutaMinio;
      datosEvidencia.tipo_archivo = archivo.mimetype;
      datosEvidencia.tamano_bytes = archivo.size;
    }

    const evidencia = await evidenciasQueries.crearEvidencia(datosEvidencia);
    const pId = await resolverProyectoId('etapa', req.params.id);
    if (pId) await registrarActividad({ id_proyecto: pId, id_usuario: req.usuario.id, tipo: 'evidencia', titulo: `Documento subido a etapa`, entidad_tipo: 'etapa', entidad_id: req.params.id });
    res.status(201).json({ datos: evidencia, mensaje: tipoMedio === 'link' ? 'Link registrado exitosamente' : 'Evidencia subida exitosamente' });
  } catch (err) {
    next(err);
  } finally {
    await limpiarArchivoTemporal(req);
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

    await almacen.putObject(rutaMinio, fs.createReadStream(archivo.path), archivo.size, {
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
  } finally {
    await limpiarArchivoTemporal(req);
  }
}

// GET /etapas/:id/documentos, /acciones/:id/documentos, /tareas/:id/documentos
// — pestaña "Documentos" de Detalle (Fase 4): agrega los documentos del
// nodo y de sus descendientes (?incluirHijos=false para solo el propio).
async function obtenerDocumentosAgregados(req, res, next) {
  try {
    const tipo = req.originalUrl.includes('/etapas/') ? 'etapa'
      : req.originalUrl.includes('/tareas/') ? 'tarea'
      : 'accion';
    const incluirHijos = req.query.incluirHijos !== 'false' && req.query.incluirHijos !== '0';
    const datos = await evidenciasQueries.obtenerDocumentosAgregados(tipo, req.params.id, incluirHijos);
    res.json({ datos, mensaje: 'Documentos obtenidos' });
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
    const { url, categoria, notas, titulo } = req.body;
    const tipoMedio = url ? 'link' : 'archivo';

    if (tipoMedio === 'archivo' && !req.file) {
      return res.status(400).json({ error: true, mensaje: 'No se proporcionó archivo ni URL', codigo: 'ARCHIVO_REQUERIDO' });
    }

    let datosEvidencia = {
      categoria: categoria || 'Otro',
      notas: notas || null,
      titulo: titulo || null,
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
      await almacen.putObject(rutaMinio, fs.createReadStream(archivo.path), archivo.size, { 'Content-Type': archivo.mimetype });
      datosEvidencia.nombre_archivo = nombreUnico;
      datosEvidencia.nombre_original = archivo.originalname;
      datosEvidencia.ruta_minio = rutaMinio;
      datosEvidencia.tipo_archivo = archivo.mimetype;
      datosEvidencia.tamano_bytes = archivo.size;
    }

    const evidencia = await evidenciasQueries.crearEvidencia(datosEvidencia);
    const pId = await resolverProyectoId('accion', req.params.id);
    if (pId) await registrarActividad({ id_proyecto: pId, id_usuario: req.usuario.id, tipo: 'evidencia', titulo: `Documento subido a acción`, entidad_tipo: 'accion', entidad_id: req.params.id });
    res.status(201).json({ datos: evidencia, mensaje: tipoMedio === 'link' ? 'Link registrado exitosamente' : 'Evidencia subida exitosamente' });
  } catch (err) {
    next(err);
  } finally {
    await limpiarArchivoTemporal(req);
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

    await almacen.putObject(rutaMinio, fs.createReadStream(archivo.path), archivo.size, {
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
  } finally {
    await limpiarArchivoTemporal(req);
  }
}

// GET /evidencias/:id/ver       : previsualizar (Content-Disposition: inline)
// GET /evidencias/:id/descargar : descargar   (Content-Disposition: attachment)
//
// La visibilidad ya la validó exigirVisibilidadEvidencia() en la ruta,
// antes de llegar aquí y antes de tocar el almacén. La clave del objeto
// sale del registro de la BD, nunca del cliente. Toda la parte de
// transporte (Range, 404 del almacén, cierre anticipado, flujo sin cargar
// en memoria) vive en utils/transmitirObjeto.js.
function transmitirEvidencia(disposicion) {
  return async function (req, res, next) {
    try {
      const evidencia = await evidenciasQueries.obtenerEvidenciaPorId(req.params.id);

      if (!evidencia) {
        return res.status(404).json({
          error: true,
          mensaje: 'Evidencia no encontrada',
          codigo: 'NO_ENCONTRADO'
        });
      }

      // Una liga externa no vive en el almacén: se manda al navegador a ella.
      if (evidencia.tipo_medio === 'link' && evidencia.url) {
        return res.redirect(evidencia.url);
      }

      return await transmitirObjeto(req, res, next, {
        clave: evidencia.ruta_minio,
        nombre: evidencia.nombre_original || evidencia.nombre_archivo || 'archivo',
        tipo: evidencia.tipo_archivo,
        disposicion,
      });
    } catch (err) {
      return next(err);
    }
  };
}

const ver = transmitirEvidencia('inline');
const descargar = transmitirEvidencia('attachment');

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

    // Intentar eliminar de MinIO (si falla, el registro ya se borró de la BD).
    // Una liga externa no tiene objeto que borrar.
    if (evidencia.ruta_minio) {
      try {
        await almacen.removeObject(evidencia.ruta_minio);
      } catch (minioErr) {
        console.error('Advertencia: no se pudo eliminar archivo de MinIO:', minioErr.message);
      }
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
      etiqueta: req.query.etiqueta,
    };
    const proyectoIds = await resolverProyectoIdsAcceso(req.usuario);
    const evidencias = await evidenciasQueries.obtenerTodasEvidencias(filtros, proyectoIds);
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
  ver,
  descargar,
  eliminar,
  listarTodas,
  obtenerDocumentosAgregados,
};
