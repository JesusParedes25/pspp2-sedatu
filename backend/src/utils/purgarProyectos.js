/**
 * ARCHIVO: purgarProyectos.js
 * PROPÓSITO: Purga definitiva de proyectos eliminados hace más de 30 días.
 *            Antes de esto, un superadmin puede restaurarlos desde la
 *            papelera en Administración. Pasados los 30 días, se hace un
 *            DELETE real (las FKs de etapas/acciones/etc. son ON DELETE
 *            CASCADE, así que se limpia todo el árbol del proyecto).
 *            NOTA: los archivos ya subidos a MinIO no se borran aquí — solo
 *            los registros de BD. Es una limpieza de almacenamiento aparte.
 *
 * Igual que el purgado manual (proyectos.queries.js::purgarProyecto), cada
 * proyecto se audita (operacion DELETE, fotografía completa de la fila)
 * ANTES del DELETE que dispara la cascada — es lo único que sobrevive en
 * cualquiera de las tres bitácoras. idUsuario va como null: es una acción
 * del propio sistema, sin actor humano detrás (ver backend/src/utils/auditoria.js).
 */
const pool = require('../db/pool');
const { registrarAuditoria } = require('./auditoria');

async function purgarProyectosVencidos() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: vencidos } = await client.query(`
      SELECT * FROM proyectos
      WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '30 days'
    `);
    if (vencidos.length === 0) {
      await client.query('COMMIT');
      return [];
    }
    for (const proyecto of vencidos) {
      await registrarAuditoria({
        tabla: 'proyectos', registroId: proyecto.id, campoModificado: 'fila',
        valorAnterior: proyecto, valorNuevo: null,
        operacion: 'DELETE', idUsuario: null, client
      });
    }
    const { rows } = await client.query(
      'DELETE FROM proyectos WHERE id = ANY($1) RETURNING id, nombre',
      [vencidos.map(p => p.id)]
    );
    await client.query('COMMIT');
    console.log(`🗑  Purga automática: ${rows.length} proyecto(s) eliminado(s) definitivamente (>30 días en papelera):`);
    rows.forEach(r => console.log(`   - ${r.nombre} (${r.id})`));
    return rows;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✗ Error en purga automática de proyectos:', err.message);
    return [];
  } finally {
    client.release();
  }
}

// Corre una vez al iniciar y luego cada 24h — suficiente para una ventana de
// 30 días; no hace falta granularidad de minutos.
function iniciarPurgaAutomatica() {
  purgarProyectosVencidos();
  setInterval(purgarProyectosVencidos, 24 * 60 * 60 * 1000);
}

module.exports = { purgarProyectosVencidos, iniciarPurgaAutomatica };
