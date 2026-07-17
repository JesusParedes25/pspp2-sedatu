/**
 * SCRIPT: normalizar-avances.js
 * PROPÓSITO: Recorre el árbol completo de todos los proyectos y recalcula
 *            avance, estado y semáforo de todos los nodos contenedores,
 *            limpiando inconsistencias previas (ej. 100% + Pendiente).
 *
 * Ejecución: node src/db/scripts/normalizar-avances.js
 * (dentro del contenedor: docker exec pspp_backend node src/db/scripts/normalizar-avances.js)
 */
const pool = require('../pool');
const { recalcularAccionContenedor } = require('../../utils/avance-semaforo');
const { recalcularEtapa, recalcularProyecto } = require('../../utils/recalculos');

async function normalizar() {
  const client = await pool.connect();
  console.log('\n══════════════════════════════════════════');
  console.log(' NORMALIZACIÓN DE AVANCES Y ESTADOS');
  console.log('══════════════════════════════════════════\n');

  try {
    // ─── 1. Obtener acciones ordenadas de más profunda a más superficial ───
    // (subacciones primero, luego acciones raíz)
    const { rows: accionesOrdenadas } = await client.query(`
      WITH RECURSIVE tree AS (
        SELECT id, 0 AS depth
        FROM acciones
        WHERE id_accion_padre IS NULL
        UNION ALL
        SELECT a.id, t.depth + 1
        FROM acciones a
        JOIN tree t ON a.id_accion_padre = t.id
      )
      SELECT id, MAX(depth) AS depth
      FROM tree
      GROUP BY id
      ORDER BY depth DESC
    `);

    console.log(`→ Recalculando ${accionesOrdenadas.length} acciones (hoja+contenedor)...`);
    let accionesOk = 0;
    for (const row of accionesOrdenadas) {
      try {
        await recalcularAccionContenedor(row.id, client);
        accionesOk++;
      } catch (e) {
        console.warn(`  ✗ accion ${row.id}: ${e.message}`);
      }
    }
    console.log(`  ✓ ${accionesOk}/${accionesOrdenadas.length} acciones recalculadas`);

    // ─── 2. Recalcular todas las etapas ────────────────────────────────────
    const { rows: etapas } = await client.query('SELECT id FROM etapas ORDER BY id');
    console.log(`\n→ Recalculando ${etapas.length} etapas...`);
    let etapasOk = 0;
    for (const e of etapas) {
      try {
        await recalcularEtapa(e.id, client);
        etapasOk++;
      } catch (err) {
        console.warn(`  ✗ etapa ${e.id}: ${err.message}`);
      }
    }
    console.log(`  ✓ ${etapasOk}/${etapas.length} etapas recalculadas`);

    // ─── 3. Recalcular todos los proyectos ─────────────────────────────────
    const { rows: proyectos } = await client.query('SELECT id, nombre FROM proyectos ORDER BY id');
    console.log(`\n→ Recalculando ${proyectos.length} proyectos...`);
    let proyectosOk = 0;
    for (const p of proyectos) {
      try {
        await recalcularProyecto(p.id, client);
        proyectosOk++;
      } catch (err) {
        console.warn(`  ✗ proyecto ${p.id}: ${err.message}`);
      }
    }
    console.log(`  ✓ ${proyectosOk}/${proyectos.length} proyectos recalculados`);

    // ─── 4. Verificación rápida ────────────────────────────────────────────
    const { rows: inconsistentes } = await client.query(`
      SELECT 'accion' AS tipo, id, nombre, estado, porcentaje_avance AS avance
      FROM acciones
      WHERE estado = 'Pendiente' AND porcentaje_avance > 0
        AND (SELECT COUNT(*) FROM tareas WHERE id_accion = acciones.id) > 0
      UNION ALL
      SELECT 'etapa', id, nombre, estado, porcentaje_calculado
      FROM etapas
      WHERE estado = 'Pendiente' AND porcentaje_calculado > 0
      ORDER BY tipo, avance DESC
      LIMIT 20
    `);

    if (inconsistentes.length === 0) {
      console.log('\n✅ Verificación: sin inconsistencias detectadas.');
    } else {
      console.warn(`\n⚠️  Nodos aún inconsistentes (${inconsistentes.length}):`);
      for (const n of inconsistentes) {
        console.warn(`   ${n.tipo.padEnd(7)} | ${n.estado.padEnd(10)} | ${String(n.avance).padStart(5)}% | ${n.nombre?.slice(0, 60)}`);
      }
    }

    console.log('\n══════════════════════════════════════════');
    console.log(' Normalización completada');
    console.log('══════════════════════════════════════════\n');

  } finally {
    client.release();
  }
}

normalizar()
  .then(() => process.exit(0))
  .catch(e => { console.error('\n✗ Error fatal:', e.message); process.exit(1); });
