/**
 * ARCHIVO: alertasVencimiento.js
 * PROPÓSITO: Detectar acciones próximas a vencer y generar notificaciones.
 *
 * MINI-CLASE: Alertas programadas (cron-like)
 * ─────────────────────────────────────────────────────────────────
 * En lugar de usar un cron externo, este módulo expone una función
 * que se puede llamar periódicamente (por ejemplo cada hora desde
 * un setInterval en server.js). Busca acciones cuya fecha_fin está
 * dentro de los próximos 3 días hábiles y que aún no están
 * completadas ni canceladas. Para cada una, genera una notificación
 * de tipo "Vencimiento" para el responsable asignado.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../db/pool');
const { notificarVencimiento } = require('./notificaciones');

// Revisa acciones que vencen en los próximos N días y notifica a responsables
async function revisarVencimientos(diasAnticipacion = 3) {
  try {
    // Buscar acciones no terminadas que vencen pronto
    const resultado = await pool.query(`
      SELECT a.id, a.nombre, a.fecha_fin, a.id_responsable, a.id_etapa, a.id_proyecto
      FROM acciones a
      WHERE a.estado NOT IN ('Completada', 'Cancelada')
        AND a.fecha_fin BETWEEN CURRENT_DATE AND CURRENT_DATE + $1 * INTERVAL '1 day'
        AND a.id_responsable IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM notificaciones n
          WHERE n.entidad_id = a.id
            AND n.tipo = 'Vencimiento'
            AND n.created_at > CURRENT_DATE - INTERVAL '1 day'
        )
    `, [diasAnticipacion]);

    console.log(`✓ Revisión de vencimientos: ${resultado.rows.length} acción(es) próximas a vencer`);

    for (const accion of resultado.rows) {
      await notificarVencimiento(accion);
    }

    return resultado.rows.length;
  } catch (err) {
    console.error('✗ Error en revisión de vencimientos:', err.message);
    return 0;
  }
}

// Revisa acciones sin actividad por más de N días
async function revisarInactividad(diasInactividad = 7) {
  try {
    const resultado = await pool.query(`
      SELECT a.id, a.nombre, a.id_responsable, a.updated_at
      FROM acciones a
      WHERE a.estado = 'En_proceso'
        AND a.updated_at < CURRENT_DATE - $1 * INTERVAL '1 day'
        AND a.id_responsable IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM notificaciones n
          WHERE n.entidad_id = a.id
            AND n.tipo = 'Inactividad'
            AND n.created_at > CURRENT_DATE - INTERVAL '3 day'
        )
    `, [diasInactividad]);

    for (const accion of resultado.rows) {
      await pool.query(`
        INSERT INTO notificaciones (tipo, mensaje, entidad_tipo, entidad_id, id_usuario)
        VALUES ('Inactividad', $1, 'Accion', $2, $3)
      `, [
        `La acción "${accion.nombre}" lleva más de ${diasInactividad} días sin actividad`,
        accion.id,
        accion.id_responsable
      ]);
    }

    return resultado.rows.length;
  } catch (err) {
    console.error('✗ Error en revisión de inactividad:', err.message);
    return 0;
  }
}

module.exports = { revisarVencimientos, revisarInactividad };
