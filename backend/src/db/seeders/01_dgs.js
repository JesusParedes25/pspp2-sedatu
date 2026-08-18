/**
 * ARCHIVO: 01_dgs.js
 * PROPÓSITO: Insertar la estructura organizacional de SEDATU conforme
 *            al Reglamento Interior (DOF 17/01/2025), Art. 2.
 *
 * MINI-CLASE: Jerarquía organizacional de SEDATU
 * ─────────────────────────────────────────────────────────────────
 * SEDATU se organiza en niveles jerárquicos (Art. 2 del RI):
 *
 * Secretaría (Titular)
 * ├── SOTUV (Subsecretaría) → 7 DGs: DGOTU, DGOMR, DGPTM, DGPV,
 * │                            DGGIRDCC, DGIE, DGOC
 * ├── SOAIP (Subsecretaría) → 6 DGs: DGRPE, DGTN, DGIMRC, DGICAM,
 * │                            DGVSA, DGIGPS
 * ├── UAF (Unidad, NO Subsecretaría) → 4 DGs: DGPP, DGCHDO, DGRMS, DGTIC
 * ├── UAJ (Unidad, NO Subsecretaría) → sin DGs subordinadas
 * ├── DGPDI (adscrita al titular)
 * └── DGCOR (adscrita al titular)
 *
 * ON CONFLICT con DO UPDATE garantiza idempotencia y permite
 * corregir adscripciones si se re-ejecuta el seed.
 *
 * DÓNDE VIVE LA LISTA: en `00_estructura.js`, que es quien la asegura en
 * TODOS los entornos —producción incluida— insertando únicamente lo que
 * falte, sin tocar lo ya capturado. Este seeder solo agrega el matiz de
 * desarrollo: reescribe nombre y adscripción de cada área para dejar la
 * base idéntica a la lista, algo que en una base real sería destructivo.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');
const {
  SUBSECRETARIAS, UNIDADES_RESPONSABLES, DIRECCIONES_GENERALES, DIRECCIONES_AREA,
} = require('./00_estructura');

async function seedDGs() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ─── Subsecretarías (solo 2 reales) ──────────────────────────
    const subsecretarias = SUBSECRETARIAS;

    const subsIds = {};
    for (const sub of subsecretarias) {
      const resultado = await client.query(`
        INSERT INTO subsecretarias (nombre, siglas)
        VALUES ($1, $2)
        ON CONFLICT (siglas) DO UPDATE SET nombre = EXCLUDED.nombre
        RETURNING id
      `, [sub.nombre, sub.siglas]);
      subsIds[sub.siglas] = resultado.rows[0].id;
    }

    // Renombrar la antigua SDA si existe (cambio de nombre oficial)
    await client.query(`
      UPDATE subsecretarias SET nombre = 'Subsecretaría de Ordenamiento Agrario e Inventarios de la Propiedad'
      WHERE siglas = 'SDA'
    `);
    const sdaExistente = await client.query("SELECT id FROM subsecretarias WHERE siglas = 'SDA'");
    if (sdaExistente.rows.length > 0) {
      subsIds['SDA'] = sdaExistente.rows[0].id;
    }

    // ─── Unidades Responsables ─────────────────────────────────
    // UR_SOTUV y UR_SOAIP bajo sus subsecretarías;
    // UAF y UAJ son Unidades autónomas (sin subsecretaría padre).
    const unidadesResponsables = UNIDADES_RESPONSABLES;

    const urIds = {};
    for (const ur of unidadesResponsables) {
      const idSub = ur.sub ? (subsIds[ur.sub] || null) : null;
      const resultado = await client.query(`
        INSERT INTO unidades_responsables (nombre, siglas, id_subsecretaria)
        VALUES ($1, $2, $3)
        ON CONFLICT (siglas) DO UPDATE SET
          nombre = EXCLUDED.nombre,
          id_subsecretaria = EXCLUDED.id_subsecretaria
        RETURNING id
      `, [ur.nombre, ur.siglas, idSub]);
      urIds[ur.siglas] = resultado.rows[0].id;
    }

    // Migrar la antigua UR_SDA → UR_SOAIP si existe
    const urSdaExistente = await client.query("SELECT id FROM unidades_responsables WHERE siglas = 'UR_SDA'");
    if (urSdaExistente.rows.length > 0) {
      urIds['UR_SDA'] = urSdaExistente.rows[0].id;
      await client.query(`
        UPDATE unidades_responsables SET nombre = 'Subsecretaría de Ordenamiento Agrario e Inventarios',
          id_subsecretaria = $1
        WHERE siglas = 'UR_SDA'
      `, [subsIds['SOAIP'] || subsIds['SDA'] || null]);
    }

    // ─── Direcciones Generales ───────────────────────────────────
    // Conforme al Art. 2 del Reglamento Interior (DOF 17/01/2025)
    const direccionesGenerales = DIRECCIONES_GENERALES;

    const dgIds = {};
    for (const dg of direccionesGenerales) {
      // Resolver UR: buscar en urIds nuevo, o si hay UR_SDA legada usarla para SOAIP
      let idUr = null;
      if (dg.ur) {
        idUr = urIds[dg.ur] || null;
        // Fallback: si UR_SOAIP no existe pero UR_SDA sí (seed viejo)
        if (!idUr && dg.ur === 'UR_SOAIP' && urIds['UR_SDA']) {
          idUr = urIds['UR_SDA'];
        }
      }
      const resultado = await client.query(`
        INSERT INTO direcciones_generales (nombre, siglas, id_unidad_responsable)
        VALUES ($1, $2, $3)
        ON CONFLICT (siglas) DO UPDATE SET
          nombre = EXCLUDED.nombre,
          id_unidad_responsable = EXCLUDED.id_unidad_responsable
        RETURNING id
      `, [dg.nombre, dg.siglas, idUr]);
      dgIds[dg.siglas] = resultado.rows[0].id;
    }

    // ─── Direcciones de Área ───────────────────────────────────
    const direccionesArea = DIRECCIONES_AREA;

    const daIds = {};
    for (const da of direccionesArea) {
      const resultado = await client.query(`
        INSERT INTO direcciones_area (nombre, siglas, id_dg)
        VALUES ($1, $2, $3)
        ON CONFLICT (siglas) DO UPDATE SET
          nombre = EXCLUDED.nombre,
          id_dg = EXCLUDED.id_dg
        RETURNING id
      `, [da.nombre, da.siglas, dgIds[da.dg]]);
      daIds[da.siglas] = resultado.rows[0].id;
    }

    await client.query('COMMIT');

    console.log('  ✓ Subsecretarías:', Object.keys(subsIds).length);
    console.log('  ✓ Unidades Responsables:', Object.keys(urIds).length);
    console.log('  ✓ Direcciones Generales:', Object.keys(dgIds).length);
    console.log('  ✓ Direcciones de Área:', Object.keys(daIds).length);

    return { subsIds, urIds, dgIds, daIds };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = seedDGs;
