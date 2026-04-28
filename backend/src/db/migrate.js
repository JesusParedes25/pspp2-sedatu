/**
 * ARCHIVO: migrate.js
 * PROPÓSITO: Ejecutar las migraciones SQL pendientes contra PostgreSQL.
 *
 * MINI-CLASE: Migraciones con registro de estado
 * ─────────────────────────────────────────────────────────────────
 * Mantiene una tabla `schema_migrations` con los nombres de cada
 * archivo .sql ya aplicado. En cada arranque solo ejecuta los
 * archivos nuevos (los que NO están en esa tabla), en orden
 * alfabético. Esto garantiza:
 *   - Idempotencia: nunca se aplica dos veces la misma migración.
 *   - Seguridad: ALTER TABLE, INSERT, UPDATE no se re-ejecutan.
 *   - Portabilidad: cualquier servidor nuevo queda al día con un
 *     solo `docker compose up`.
 * ─────────────────────────────────────────────────────────────────
 */
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function ejecutarMigraciones() {
  const client = await pool.connect();
  try {
    // Crear tabla de registro si no existe (primera vez en servidor nuevo)
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        nombre TEXT PRIMARY KEY,
        aplicada_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Leer archivos .sql disponibles, ordenados
    const carpeta = path.join(__dirname, 'migrations');
    const archivos = fs.readdirSync(carpeta)
      .filter(f => f.endsWith('.sql'))
      .sort();

    // Consultar cuáles ya fueron aplicadas
    const { rows } = await client.query('SELECT nombre FROM schema_migrations');
    const yaAplicadas = new Set(rows.map(r => r.nombre));

    const pendientes = archivos.filter(f => !yaAplicadas.has(f));

    if (pendientes.length === 0) {
      console.log('═══ Migraciones: nada nuevo que aplicar ═══');
      return;
    }

    console.log(`\n═══ Migraciones pendientes: ${pendientes.length} ═══\n`);

    for (const archivo of pendientes) {
      const sql = fs.readFileSync(path.join(carpeta, archivo), 'utf-8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (nombre) VALUES ($1)',
          [archivo]
        );
        await client.query('COMMIT');
        console.log(`  ✓ ${archivo}`);
      } catch (err) {
        await client.query('ROLLBACK');
        // Si el error es por objeto que ya existe, registrar y continuar
        if (err.message.includes('already exists') || err.code === '42P07' || err.code === '42710') {
          await client.query(
            'INSERT INTO schema_migrations (nombre) VALUES ($1) ON CONFLICT DO NOTHING',
            [archivo]
          );
          console.log(`  ⊘ ${archivo} (ya aplicada, registrando)`);
        } else {
          console.error(`  ✗ ${archivo}: ${err.message}`);
          throw err;
        }
      }
    }

    console.log('\n═══ Migraciones completadas ═══\n');
  } finally {
    client.release();
  }
}

// Si se ejecuta directamente: node src/db/migrate.js
if (require.main === module) {
  ejecutarMigraciones()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { ejecutarMigraciones };
