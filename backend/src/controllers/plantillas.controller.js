/**
 * ARCHIVO: plantillas.controller.js
 * PROPÓSITO: CRUD de plantillas de importación + descarga de template.
 *
 * Endpoints:
 *   GET    /plantillas-importacion           → Listar (sistema + DG del usuario)
 *   GET    /plantillas-importacion/:id       → Obtener una
 *   POST   /plantillas-importacion           → Crear
 *   PUT    /plantillas-importacion/:id       → Actualizar
 *   DELETE /plantillas-importacion/:id       → Eliminar
 *   GET    /plantillas-importacion/:id/descargar → Descargar CSV template vacío
 */
const pool = require('../db/pool');
const XLSX = require('xlsx');

// ─── GET /plantillas-importacion ───────────────────────────────

async function listar(req, res, next) {
  try {
    const idDg = req.usuario?.id_dg || null;

    let query = `
      SELECT p.*, u.nombre_completo AS creador_nombre
      FROM plantillas_importacion p
      LEFT JOIN usuarios u ON u.id = p.id_creador
      WHERE p.id_dg IS NULL
    `;
    const params = [];

    if (idDg) {
      query += ' OR p.id_dg = $1';
      params.push(idDg);
    }

    query += ' ORDER BY p.es_predeterminada DESC, p.nombre ASC';

    const { rows } = await pool.query(query, params);
    res.json({ datos: rows, mensaje: 'Plantillas obtenidas.' });
  } catch (err) {
    next(err);
  }
}

// ─── GET /plantillas-importacion/:id ───────────────────────────

async function obtener(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, u.nombre_completo AS creador_nombre
       FROM plantillas_importacion p
       LEFT JOIN usuarios u ON u.id = p.id_creador
       WHERE p.id = $1`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: true, mensaje: 'Plantilla no encontrada.', codigo: 'NO_ENCONTRADA' });
    }

    res.json({ datos: rows[0], mensaje: 'Plantilla obtenida.' });
  } catch (err) {
    next(err);
  }
}

// ─── POST /plantillas-importacion ──────────────────────────────

async function crear(req, res, next) {
  try {
    const { nombre, descripcion, config } = req.body;

    if (!nombre || !config) {
      return res.status(400).json({
        error: true,
        mensaje: 'Se requiere nombre y config.',
        codigo: 'DATOS_INVALIDOS',
      });
    }

    const { rows } = await pool.query(`
      INSERT INTO plantillas_importacion (nombre, descripcion, config, id_dg, id_creador)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      nombre,
      descripcion || null,
      JSON.stringify(config),
      req.usuario?.id_dg || null,
      req.usuario?.id || null,
    ]);

    res.status(201).json({ datos: rows[0], mensaje: 'Plantilla creada.' });
  } catch (err) {
    next(err);
  }
}

// ─── PUT /plantillas-importacion/:id ───────────────────────────

async function actualizar(req, res, next) {
  try {
    const { nombre, descripcion, config } = req.body;

    // Verificar que existe y no es predeterminada del sistema
    const { rows: existente } = await pool.query(
      'SELECT * FROM plantillas_importacion WHERE id = $1',
      [req.params.id]
    );

    if (existente.length === 0) {
      return res.status(404).json({ error: true, mensaje: 'Plantilla no encontrada.', codigo: 'NO_ENCONTRADA' });
    }

    if (existente[0].es_predeterminada) {
      return res.status(403).json({
        error: true,
        mensaje: 'No se pueden modificar plantillas del sistema.',
        codigo: 'PREDETERMINADA',
      });
    }

    const { rows } = await pool.query(`
      UPDATE plantillas_importacion
      SET nombre = COALESCE($1, nombre),
          descripcion = COALESCE($2, descripcion),
          config = COALESCE($3, config),
          updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [
      nombre || null,
      descripcion || null,
      config ? JSON.stringify(config) : null,
      req.params.id,
    ]);

    res.json({ datos: rows[0], mensaje: 'Plantilla actualizada.' });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /plantillas-importacion/:id ────────────────────────

async function eliminar(req, res, next) {
  try {
    const { rows: existente } = await pool.query(
      'SELECT * FROM plantillas_importacion WHERE id = $1',
      [req.params.id]
    );

    if (existente.length === 0) {
      return res.status(404).json({ error: true, mensaje: 'Plantilla no encontrada.', codigo: 'NO_ENCONTRADA' });
    }

    if (existente[0].es_predeterminada) {
      return res.status(403).json({
        error: true,
        mensaje: 'No se pueden eliminar plantillas del sistema.',
        codigo: 'PREDETERMINADA',
      });
    }

    await pool.query('DELETE FROM plantillas_importacion WHERE id = $1', [req.params.id]);
    res.json({ mensaje: 'Plantilla eliminada.' });
  } catch (err) {
    next(err);
  }
}

// ─── GET /plantillas-importacion/:id/descargar ─────────────────

async function descargar(req, res, next) {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM plantillas_importacion WHERE id = $1',
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: true, mensaje: 'Plantilla no encontrada.', codigo: 'NO_ENCONTRADA' });
    }

    const plantilla = rows[0];
    const config = plantilla.config;

    // Generar encabezados del template
    const headers = [];

    // Campos del columnMap
    if (config.columnMap) {
      // Ordenar por índice de columna
      const entries = Object.entries(config.columnMap).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
      for (const [, field] of entries) {
        headers.push(field);
      }
    }

    // Campos de pivotBlocks
    if (config.pivotBlocks) {
      for (const block of config.pivotBlocks) {
        if (block.fieldMap) {
          const entries = Object.entries(block.fieldMap).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
          for (const [, field] of entries) {
            headers.push(`${block.name} - ${field}`);
          }
        }
      }
    }

    // Si la plantilla tiene jerarquía, agregar columna Nivel al inicio
    if (config.hierarchy && config.hierarchy.enabled) {
      headers.unshift('Nivel');
    }

    // Crear workbook con una sola hoja
    const wb = XLSX.utils.book_new();
    const wsData = [headers]; // Solo encabezados, sin datos

    // Agregar super-headers si hay pivots
    if (config.pivotBlocks && config.pivotBlocks.length > 0) {
      const superHeaders = [];
      const numBaseCols = config.columnMap ? Object.keys(config.columnMap).length : 0;
      const offset = config.hierarchy && config.hierarchy.enabled ? 1 : 0;

      for (let i = 0; i < numBaseCols + offset; i++) {
        superHeaders.push('');
      }
      for (const block of config.pivotBlocks) {
        const numCols = block.fieldMap ? Object.keys(block.fieldMap).length : 0;
        for (let i = 0; i < numCols; i++) {
          superHeaders.push(i === 0 ? block.name : '');
        }
      }
      wsData.unshift(superHeaders);
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Template');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const nombreArchivo = `template-${plantilla.nombre.replace(/\s+/g, '-').toLowerCase()}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listar,
  obtener,
  crear,
  actualizar,
  eliminar,
  descargar,
};
