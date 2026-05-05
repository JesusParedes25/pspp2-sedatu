/**
 * ARCHIVO: importar.controller.js
 * PROPÓSITO: Endpoints de importación universal.
 *
 * Endpoints:
 *   POST /importar/upload    → Sube archivo, devuelve fileId + headers + sample
 *   POST /importar/preview   → Preview jerárquico sin tocar BD
 *   POST /importar/confirmar → Ejecuta importación transaccional
 */
const crypto = require('crypto');
const parser = require('../services/importar.parser');
const service = require('../services/importar.service');
const matcher = require('../services/importar.matcher');

// ─── Almacén en memoria con TTL ───────────────────────────────

const fileStore = new Map(); // fileId → { buffer, filename, rawData, uploadedAt }
const TTL_MS = 30 * 60 * 1000; // 30 minutos

// Cleanup cada 5 minutos
setInterval(() => {
  const ahora = Date.now();
  for (const [id, entry] of fileStore) {
    if (ahora - entry.uploadedAt > TTL_MS) {
      fileStore.delete(id);
    }
  }
}, 5 * 60 * 1000);

// ─── POST /importar/upload ─────────────────────────────────────

async function upload(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: true,
        mensaje: 'No se recibió archivo. Suba un .csv, .tsv, .txt o .xlsx.',
        codigo: 'ARCHIVO_FALTANTE',
      });
    }

    const { buffer, originalname, size } = req.file;

    // Límite 10 MB
    if (size > 10 * 1024 * 1024) {
      return res.status(413).json({
        error: true,
        mensaje: 'El archivo excede el límite de 10 MB.',
        codigo: 'ARCHIVO_MUY_GRANDE',
      });
    }

    // Parsear archivo
    const { sheetNames, rawData, totalRows } = parser.parsearArchivo(buffer, originalname);

    // Generar ID único
    const fileId = crypto.randomUUID();

    // Guardar en memoria
    fileStore.set(fileId, {
      buffer,
      filename: originalname,
      rawData,
      uploadedAt: Date.now(),
    });

    // Preview de las primeras filas para el wizard
    const vistaPrevia = parser.obtenerVistaPrevia(rawData, 10);

    res.json({
      datos: {
        fileId,
        filename: originalname,
        sheetNames,
        totalRows,
        vistaPrevia,
      },
      mensaje: 'Archivo subido y parseado correctamente.',
    });
  } catch (err) {
    if (err.message.includes('Formato no soportado') || err.message.includes('vacía')) {
      return res.status(400).json({ error: true, mensaje: err.message, codigo: 'FORMATO_INVALIDO' });
    }
    next(err);
  }
}

// ─── POST /importar/preview ────────────────────────────────────

async function preview(req, res, next) {
  try {
    const { fileId, config, proyectoId, sheetIndex } = req.body;

    if (!fileId || !config || !proyectoId) {
      return res.status(400).json({
        error: true,
        mensaje: 'Se requiere fileId, config y proyectoId.',
        codigo: 'DATOS_INVALIDOS',
      });
    }

    const entry = fileStore.get(fileId);
    if (!entry) {
      return res.status(404).json({
        error: true,
        mensaje: 'Archivo no encontrado o expirado. Vuelva a subirlo.',
        codigo: 'ARCHIVO_EXPIRADO',
      });
    }

    // Si se cambió de hoja, re-parsear
    let rawData = entry.rawData;
    if (sheetIndex !== undefined && sheetIndex !== 0) {
      const result = parser.parsearArchivo(entry.buffer, entry.filename, { sheetIndex });
      rawData = result.rawData;
    }

    // Extraer headers y datos según config
    const { headers, superHeaders, sampleRows, totalDataRows } = parser.extraerConConfig(rawData, config);
    const dataRows = parser.obtenerFilasDatos(rawData, config);

    // Generar preview
    const resultado = await service.generarPreview(dataRows, config, headers, proyectoId);

    res.json({
      datos: {
        ...resultado,
        headers,
        superHeaders,
        totalDataRows,
      },
      mensaje: 'Preview generado correctamente.',
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /importar/confirmar ──────────────────────────────────

async function confirmar(req, res, next) {
  try {
    const { fileId, config, proyectoId, skipDuplicados, sheetIndex } = req.body;

    if (!fileId || !config || !proyectoId) {
      return res.status(400).json({
        error: true,
        mensaje: 'Se requiere fileId, config y proyectoId.',
        codigo: 'DATOS_INVALIDOS',
      });
    }

    // Verificar permisos sobre el proyecto
    const pool = require('../db/pool');
    const { rows } = await pool.query('SELECT id FROM proyectos WHERE id = $1', [proyectoId]);
    if (rows.length === 0) {
      return res.status(404).json({
        error: true,
        mensaje: 'Proyecto no encontrado.',
        codigo: 'PROYECTO_NO_ENCONTRADO',
      });
    }

    const entry = fileStore.get(fileId);
    if (!entry) {
      return res.status(404).json({
        error: true,
        mensaje: 'Archivo no encontrado o expirado. Vuelva a subirlo.',
        codigo: 'ARCHIVO_EXPIRADO',
      });
    }

    // Si se cambió de hoja, re-parsear
    let rawData = entry.rawData;
    if (sheetIndex !== undefined && sheetIndex !== 0) {
      const result = parser.parsearArchivo(entry.buffer, entry.filename, { sheetIndex });
      rawData = result.rawData;
    }

    const { headers } = parser.extraerConConfig(rawData, config);
    const dataRows = parser.obtenerFilasDatos(rawData, config);

    const resultado = await service.ejecutarImportacion(
      dataRows, config, headers, proyectoId, skipDuplicados !== false
    );

    // Limpiar archivo de memoria tras importación exitosa
    fileStore.delete(fileId);

    res.status(201).json({
      datos: resultado,
      mensaje: 'Importación completada exitosamente.',
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /importar/sugerir ────────────────────────────────────

async function sugerir(req, res, next) {
  try {
    const { headers } = req.body;

    if (!headers || !Array.isArray(headers)) {
      return res.status(400).json({
        error: true,
        mensaje: 'Se requiere un array "headers".',
        codigo: 'DATOS_INVALIDOS',
      });
    }

    const idDg = req.usuario?.id_dg || null;
    const sugerencia = await matcher.sugerirPlantilla(headers, idDg);

    res.json({
      datos: sugerencia, // null si no hay match
      mensaje: sugerencia
        ? `Plantilla sugerida: "${sugerencia.plantilla.nombre}" (${sugerencia.score}% coincidencia).`
        : 'No se encontró plantilla que coincida.',
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /importar/extraer-headers ────────────────────────────

async function extraerHeaders(req, res, next) {
  try {
    const { fileId, headerRow, superHeaderRow, dataStartRow, sheetIndex } = req.body;

    if (!fileId) {
      return res.status(400).json({
        error: true,
        mensaje: 'Se requiere fileId.',
        codigo: 'DATOS_INVALIDOS',
      });
    }

    const entry = fileStore.get(fileId);
    if (!entry) {
      return res.status(404).json({
        error: true,
        mensaje: 'Archivo no encontrado o expirado.',
        codigo: 'ARCHIVO_EXPIRADO',
      });
    }

    let rawData = entry.rawData;
    if (sheetIndex !== undefined && sheetIndex !== 0) {
      const result = parser.parsearArchivo(entry.buffer, entry.filename, { sheetIndex });
      rawData = result.rawData;
    }

    const config = {
      headerRow: headerRow || 1,
      superHeaderRow: superHeaderRow || null,
      dataStartRow: dataStartRow || 2,
    };

    const { headers, superHeaders, sampleRows, totalDataRows } = parser.extraerConConfig(rawData, config);

    res.json({
      datos: {
        headers,
        superHeaders,
        sampleRows,
        totalDataRows,
      },
      mensaje: 'Headers extraídos correctamente.',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  upload,
  preview,
  confirmar,
  sugerir,
  extraerHeaders,
};
