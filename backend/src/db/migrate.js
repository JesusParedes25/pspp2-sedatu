/**
 * ARCHIVO: migrate.js
 * PROPÓSITO: Ejecutar las migraciones SQL en orden contra PostgreSQL.
 *
 * MINI-CLASE: Migraciones de base de datos
 * ─────────────────────────────────────────────────────────────────
 * Las migraciones son archivos SQL numerados que se ejecutan en orden
 * para crear o modificar la estructura de la BD. Al ejecutarlas en
 * secuencia (001, 002, 003...) garantizamos que las tablas se crean
 * antes de los índices y constraints que dependen de ellas. Este
 * script lee cada archivo .sql y lo ejecuta contra PostgreSQL.
 * ─────────────────────────────────────────────────────────────────
 */
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function ejecutarMigraciones() {
  const carpetaMigraciones = path.join(__dirname, 'migrations');

  // Leer archivos .sql ordenados por nombre
  const archivos = fs.readdirSync(carpetaMigraciones)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`\n═══ Ejecutando ${archivos.length} migración(es) ═══\n`);

  for (const archivo of archivos) {
    const rutaCompleta = path.join(carpetaMigraciones, archivo);
    const sql = fs.readFileSync(rutaCompleta, 'utf-8');

    try {
      await pool.query(sql);
      console.log(`  ✓ ${archivo}`);
    } catch (err) {
      // Si el error es que ya existe, lo ignoramos (idempotente)
      if (err.message.includes('already exists')) {
        console.log(`  ⊘ ${archivo} (ya existe, saltando)`);
      } else {
        console.error(`  ✗ ${archivo}: ${err.message}`);
        throw err;
      }
    }
  }

  console.log('\n═══ Migraciones completadas ═══\n');
}

// Si se ejecuta directamente: node migrate.js
if (require.main === module) {
  ejecutarMigraciones()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { ejecutarMigraciones };
