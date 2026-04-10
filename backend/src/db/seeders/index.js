/**
 * ARCHIVO: index.js (seeders)
 * PROPÓSITO: Orquesta la ejecución de migraciones y seeders en orden.
 *
 * MINI-CLASE: Seeders y el orden de ejecución
 * ─────────────────────────────────────────────────────────────────
 * Los seeders insertan datos iniciales en la BD. Deben ejecutarse
 * en orden porque hay dependencias: las DGs deben existir antes de
 * los usuarios (que referencian una DG), y los usuarios antes de
 * los proyectos (que referencian un creador). El flag --base permite
 * cargar solo la estructura organizacional sin proyectos de ejemplo.
 * ─────────────────────────────────────────────────────────────────
 */
const { ejecutarMigraciones } = require('../migrate');
const seedDGs = require('./01_dgs');
const seedUsuarios = require('./02_usuarios');
const seedProgramas = require('./03_programas');
const seedProyectosEjemplo = require('./04_proyectos_ejemplo');

async function ejecutarSeeders() {
  const soloBase = process.argv.includes('--base');

  console.log('\n═══ Ejecutando seeders ═══\n');

  // Paso 1: Estructura organizacional de SEDATU
  console.log('─── Seed 1: Direcciones Generales ───');
  await seedDGs();

  // Paso 2: Usuarios de demostración
  console.log('─── Seed 2: Usuarios ───');
  await seedUsuarios();

  // Paso 3: Programas presupuestarios
  console.log('─── Seed 3: Programas ───');
  await seedProgramas();

  if (!soloBase) {
    // Paso 4: Proyectos de ejemplo completos
    console.log('─── Seed 4: Proyectos de ejemplo ───');
    await seedProyectosEjemplo();
  } else {
    console.log('─── Seed 4: Omitido (modo --base) ───');
  }

  console.log('\n═══ Seeders completados ═══');
  console.log('  Usuario de prueba: jesus.paredes@sedatu.gob.mx / demo2026\n');
}

// Si se ejecuta directamente: node src/db/seeders/index.js
if (require.main === module) {
  (async () => {
    try {
      await ejecutarMigraciones();
      await ejecutarSeeders();
      process.exit(0);
    } catch (err) {
      console.error('\n✗ Error durante la inicialización:', err.message);
      console.error(err.stack);
      process.exit(1);
    }
  })();
}

module.exports = ejecutarSeeders;
