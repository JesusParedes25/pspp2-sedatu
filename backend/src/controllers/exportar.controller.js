/**
 * ARCHIVO: exportar.controller.js
 * PROPÓSITO: GET /proyectos/:id/exportar — descarga la estructura
 *            completa del proyecto en Excel (.xlsx) o CSV.
 *
 * Mismo criterio de acceso que /proyectos/:id/arbol: cualquier usuario
 * autenticado puede VER cualquier proyecto (solo la CAPTURA está
 * restringida a quien está invitado — ver autorizacion.js). Exportar es
 * una forma de ver, así que no exige ninguna facultad adicional.
 */
const proyectosQueries = require('../db/queries/proyectos.queries');
const etapasQueries = require('../db/queries/etapas.queries');
const avanceSemaforo = require('../utils/avance-semaforo');
const exportarService = require('../services/exportar.service');

async function exportarProyecto(req, res, next) {
  try {
    const proyectoId = req.params.id;
    const formato = (req.query.formato || 'xlsx').toLowerCase();

    if (!['xlsx', 'csv'].includes(formato)) {
      return res.status(400).json({ error: true, mensaje: 'formato debe ser "xlsx" o "csv"' });
    }

    const proyecto = await proyectosQueries.obtenerProyectoPorId(proyectoId);
    if (!proyecto) {
      return res.status(404).json({ error: true, mensaje: 'Proyecto no encontrado' });
    }

    // Mismo recorrido que arma GET /proyectos/:id/arbol: una consulta por
    // etapa a obtenerSubarbol, que ya trae acciones, subacciones y tareas
    // con avance y semáforo efectivos calculados.
    const etapasBase = await etapasQueries.obtenerEtapasPorProyecto(proyectoId, req.query.id_dg || null);
    const etapas = [];
    for (const etapa of etapasBase) {
      const nodo = await avanceSemaforo.obtenerSubarbol(etapa.id);
      if (nodo) etapas.push(nodo);
    }

    const nombreBase = proyecto.nombre.replace(/[^\w\sÁÉÍÓÚÑáéíóúñ-]/g, '').trim().replace(/\s+/g, '-').slice(0, 80);
    const fecha = new Date().toISOString().slice(0, 10);

    if (formato === 'csv') {
      const csv = exportarService.construirCsv(etapas);
      res.setHeader('Content-Disposition', `attachment; filename="${nombreBase}-${fecha}.csv"`);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      return res.send(csv);
    }

    const buffer = exportarService.construirXlsx(proyecto, etapas);
    res.setHeader('Content-Disposition', `attachment; filename="${nombreBase}-${fecha}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

module.exports = { exportarProyecto };
