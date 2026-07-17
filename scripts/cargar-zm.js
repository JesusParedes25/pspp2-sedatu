#!/usr/bin/env node
/**
 * Fallback para cargar zm.geojson a PostGIS cuando ogr2ogr no está disponible.
 * Uso: node scripts/cargar-zm.js catalogos/geograficos/zm/zm.geojson
 */
const fs = require('fs');
const { Pool } = require('pg');

const geojsonPath = process.argv[2];
if (!geojsonPath) { console.error('Uso: node cargar-zm.js <path-to-geojson>'); process.exit(1); }

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'pspp_db',
  user: process.env.DB_USER || 'pspp_user',
  password: process.env.DB_PASSWORD || 'cambiar_en_produccion',
});

async function main() {
  const raw = fs.readFileSync(geojsonPath, 'utf8');
  const gj = JSON.parse(raw);
  const client = await pool.connect();

  try {
    await client.query('DROP TABLE IF EXISTS _tmp_zm');
    await client.query(`
      CREATE TABLE _tmp_zm (
        gid SERIAL PRIMARY KEY,
        cve_met VARCHAR(20),
        nom_met VARCHAR(200),
        tipo_met VARCHAR(50),
        geom GEOMETRY(Geometry, 4326)
      )
    `);

    const batchSize = 50;
    for (let i = 0; i < gj.features.length; i += batchSize) {
      const batch = gj.features.slice(i, i + batchSize);
      const values = [];
      const params = [];
      let paramIdx = 1;

      for (const f of batch) {
        const p = f.properties;
        values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, ST_SetSRID(ST_GeomFromGeoJSON($${paramIdx + 3}), 4326))`);
        params.push(p.CVE_MET || '', p.NOM_MET || '', p.TIPO_MET || '', JSON.stringify(f.geometry));
        paramIdx += 4;
      }

      await client.query(
        `INSERT INTO _tmp_zm (cve_met, nom_met, tipo_met, geom) VALUES ${values.join(',')}`,
        params
      );
    }

    console.log(`  ✓ ${gj.features.length} features cargados en _tmp_zm`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
