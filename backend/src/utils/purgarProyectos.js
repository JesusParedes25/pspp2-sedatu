/**
 * ARCHIVO: purgarProyectos.js
 * PROPÓSITO: Purga definitiva de proyectos eliminados hace más de 30 días.
 *            Antes de esto, un superadmin puede restaurarlos desde la
 *            papelera en Administración. Pasados los 30 días, se hace un
 *            DELETE real (las FKs de etapas/acciones/etc. son ON DELETE
 *            CASCADE, así que se limpia todo el árbol del proyecto).
 *            NOTA: los archivos ya subidos a MinIO no se borran aquí — solo
 *            los registros de BD. Es una limpieza de almacenamiento aparte.
 */
const pool = require('../db/pool');

async function purgarProyectosVencidos() {
  try {
    const { rows } = await pool.query(`
      DELETE FROM proyectos
      WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days'
      RETURNING id, nombre
    `);
    if (rows.length > 0) {
      console.log(`🗑  Purga automática: ${rows.length} proyecto(s) eliminado(s) definitivamente (>30 días en papelera):`);
      rows.forEach(r => console.log(`   - ${r.nombre} (${r.id})`));
    }
    return rows;
  } catch (err) {
    console.error('✗ Error en purga automática de proyectos:', err.message);
    return [];
  }
}

// Corre una vez al iniciar y luego cada 24h — suficiente para una ventana de
// 30 días; no hace falta granularidad de minutos.
function iniciarPurgaAutomatica() {
  purgarProyectosVencidos();
  setInterval(purgarProyectosVencidos, 24 * 60 * 60 * 1000);
}

module.exports = { purgarProyectosVencidos, iniciarPurgaAutomatica };
