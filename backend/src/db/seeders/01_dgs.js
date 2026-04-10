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
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../pool');

async function seedDGs() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ─── Subsecretarías (solo 2 reales) ──────────────────────────
    const subsecretarias = [
      { nombre: 'Subsecretaría de Ordenamiento Territorial, Urbano y Vivienda', siglas: 'SOTUV' },
      { nombre: 'Subsecretaría de Ordenamiento Agrario e Inventarios de la Propiedad', siglas: 'SOAIP' },
    ];

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
    const unidadesResponsables = [
      { nombre: 'Subsecretaría de OT, Urbano y Vivienda', siglas: 'UR_SOTUV', sub: 'SOTUV' },
      { nombre: 'Subsecretaría de Ordenamiento Agrario e Inventarios', siglas: 'UR_SOAIP', sub: 'SOAIP' },
      { nombre: 'Unidad de Administración y Finanzas', siglas: 'UAF', sub: null },
      { nombre: 'Unidad de Asuntos Jurídicos', siglas: 'UAJ', sub: null },
    ];

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
    const direccionesGenerales = [
      // === SOTUV (7 DGs) ===
      { nombre: 'Dirección General de Ordenamiento Territorial y Urbano', siglas: 'DGOTU', ur: 'UR_SOTUV' },
      { nombre: 'Dirección General de Ordenamiento Metropolitano y Regional', siglas: 'DGOMR', ur: 'UR_SOTUV' },
      { nombre: 'Dirección General de Política Territorial y Movilidad', siglas: 'DGPTM', ur: 'UR_SOTUV' },
      { nombre: 'Dirección General de Política de Vivienda', siglas: 'DGPV', ur: 'UR_SOTUV' },
      { nombre: 'Dirección General de Gestión Integral de Riesgos de Desastres y Cambio Climático', siglas: 'DGGIRDCC', ur: 'UR_SOTUV' },
      { nombre: 'Dirección General de Infraestructura y Equipamiento', siglas: 'DGIE', ur: 'UR_SOTUV' },
      { nombre: 'Dirección General de Obras Comunitarias', siglas: 'DGOC', ur: 'UR_SOTUV' },
      // === SOAIP / SDA (6 DGs) ===
      { nombre: 'Dirección General de Resoluciones Presidenciales y Expropiaciones', siglas: 'DGRPE', ur: 'UR_SOAIP' },
      { nombre: 'Dirección General de Terrenos Nacionales', siglas: 'DGTN', ur: 'UR_SOAIP' },
      { nombre: 'Dirección General de Inventarios y Modernización Registral y Catastral', siglas: 'DGIMRC', ur: 'UR_SOAIP' },
      { nombre: 'Dirección General de Concertación Agraria y Mediación', siglas: 'DGICAM', ur: 'UR_SOAIP' },
      { nombre: 'Dirección General de Vinculación del Sector Agrario', siglas: 'DGVSA', ur: 'UR_SOAIP' },
      { nombre: 'Dirección General de Igualdad de Género en la Propiedad Social', siglas: 'DGIGPS', ur: 'UR_SOAIP' },
      // === UAF (4 DGs) ===
      { nombre: 'Dirección General de Programación y Presupuesto', siglas: 'DGPP', ur: 'UAF' },
      { nombre: 'Dirección General de Capital Humano y Desarrollo Organizacional', siglas: 'DGCHDO', ur: 'UAF' },
      { nombre: 'Dirección General de Recursos Materiales y Servicios Generales', siglas: 'DGRMS', ur: 'UAF' },
      { nombre: 'Dirección General de Tecnologías de la Información y Comunicaciones', siglas: 'DGTIC', ur: 'UAF' },
      // === Adscritas al titular (sin UR padre) ===
      { nombre: 'Dirección General de Planeación y Desarrollo Institucional', siglas: 'DGPDI', ur: null },
      { nombre: 'Dirección General de Coordinación de Oficinas de Representación', siglas: 'DGCOR', ur: null },
    ];

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
    const direccionesArea = [
      // DGOTU
      { nombre: 'Dirección de Análisis en Ordenamiento Territorial', siglas: 'DAOT', dg: 'DGOTU' },
      { nombre: 'Dirección de Instrumentos de Planeación Urbana', siglas: 'DIPU', dg: 'DGOTU' },
      { nombre: 'Dirección de Normatividad Urbana', siglas: 'DNU', dg: 'DGOTU' },
      // DGOMR
      { nombre: 'Dirección de Planeación Metropolitana', siglas: 'DPM', dg: 'DGOMR' },
      { nombre: 'Dirección de Desarrollo Regional', siglas: 'DDR', dg: 'DGOMR' },
      // DGPV
      { nombre: 'Dirección de Análisis de Vivienda', siglas: 'DAV', dg: 'DGPV' },
      { nombre: 'Dirección de Política Habitacional', siglas: 'DPH', dg: 'DGPV' },
      // DGPTM
      { nombre: 'Dirección de Movilidad Sustentable', siglas: 'DMS', dg: 'DGPTM' },
      // DGGIRDCC
      { nombre: 'Dirección de Gestión de Riesgos', siglas: 'DGR', dg: 'DGGIRDCC' },
      // DGTIC
      { nombre: 'Dirección de Sistemas de Información', siglas: 'DSI', dg: 'DGTIC' },
      { nombre: 'Dirección de Infraestructura Tecnológica', siglas: 'DIT', dg: 'DGTIC' },
    ];

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
