/**
 * Script to load geographic data into PostGIS tables.
 * Run from the backend directory: node scripts/load_geo_data.js
 * Connects to postgres on localhost:5433 (docker mapped port).
 */
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const shapefile = require('shapefile');

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: process.env.DB_USER || 'pspp_user',
  password: process.env.DB_PASSWORD || 'cambiar_en_produccion',
  database: process.env.DB_NAME || 'pspp_db',
});

const CATALOGOS_DIR = path.resolve(__dirname, '../../catalogos/geograficos');

async function loadEstados() {
  const shpPath = path.join(CATALOGOS_DIR, 'estados', 'estados.shp');
  if (!fs.existsSync(shpPath)) { console.error('estados.shp not found'); return; }

  console.log('Loading estados...');
  const source = await shapefile.open(shpPath, undefined, { encoding: 'utf-8' });
  let count = 0;

  while (true) {
    const { done, value } = await source.read();
    if (done) break;

    const props = value.properties;
    // Try common attribute names for state code and name
    const cve_ent = (props.CVE_ENT || props.ent || props.CVEGEO || props.cve_ent || props.CVE_EDO || '').toString().padStart(2, '0');
    const nombre = props.NOM_ENT || props.entidad || props.NOMGEO || props.nombre || props.NOM_EDO || props.ENTIDAD || `Estado ${cve_ent}`;

    if (!cve_ent || cve_ent === '00') continue;

    const geojson = JSON.stringify(value.geometry);

    try {
      await pool.query(
        `INSERT INTO geo_estados (cve_ent, nombre, geom)
         VALUES ($1, $2, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326)))
         ON CONFLICT (cve_ent) DO UPDATE SET nombre = $2, geom = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326))`,
        [cve_ent, nombre, geojson]
      );
      count++;
    } catch (err) {
      console.error(`  Error inserting estado ${cve_ent}:`, err.message);
    }
  }
  console.log(`  Inserted ${count} estados`);
}

async function loadMunicipios() {
  const shpPath = path.join(CATALOGOS_DIR, 'municipios_mexico', 'mun21gw.shp');
  if (!fs.existsSync(shpPath)) { console.error('mun21gw.shp not found'); return; }

  console.log('Loading municipios...');
  const source = await shapefile.open(shpPath, undefined, { encoding: 'utf-8' });
  let count = 0;

  while (true) {
    const { done, value } = await source.read();
    if (done) break;

    const props = value.properties;
    // Try common attribute names
    const cve_ent = (props.CVE_ENT || props.cve_ent || props.CVEGEO?.substring(0, 2) || '').toString().padStart(2, '0');
    const cve_mun = (props.CVE_MUN || props.cve_mun || props.CVEGEO?.substring(2) || '').toString().padStart(3, '0');
    const cvegeo = cve_ent + cve_mun;
    const nombre = props.NOM_MUN || props.NOMGEO || props.nombre || props.MUNICIPIO || `Municipio ${cvegeo}`;

    if (!cve_ent || cve_ent === '00' || !cve_mun || cve_mun === '000') continue;

    const geojson = JSON.stringify(value.geometry);

    try {
      await pool.query(
        `INSERT INTO geo_municipios (cvegeo, cve_ent, cve_mun, nombre, geom)
         VALUES ($1, $2, $3, $4, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326)))
         ON CONFLICT (cvegeo) DO UPDATE SET nombre = $4, geom = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))`,
        [cvegeo, cve_ent, cve_mun, nombre, geojson]
      );
      count++;
      if (count % 100 === 0) process.stdout.write(`  ${count} municipios...\r`);
    } catch (err) {
      console.error(`  Error inserting municipio ${cvegeo}:`, err.message);
    }
  }
  console.log(`  Inserted ${count} municipios`);
}

async function loadZM() {
  const geojsonPath = path.join(CATALOGOS_DIR, 'zm', 'zm.geojson');
  if (!fs.existsSync(geojsonPath)) { console.error('zm.geojson not found'); return; }

  console.log('Loading zonas metropolitanas...');
  const raw = fs.readFileSync(geojsonPath, 'utf-8');
  const data = JSON.parse(raw);
  let count = 0;

  const features = data.features || data;

  for (const feature of features) {
    const props = feature.properties || {};
    const cve_met = (props.CVE_MET || props.cve_met || props.CVE_ZM || props.cve_zm || props.CVEGEO || '').toString();
    const nombre = props.NOM_MET || props.NOM_ZM || props.nombre || props.NOMGEO || `ZM ${cve_met}`;
    const tipo = props.TIPO || props.tipo || null;

    if (!cve_met) continue;

    const geojson = JSON.stringify(feature.geometry);

    try {
      await pool.query(
        `INSERT INTO geo_zm (cve_met, nombre, tipo, geom)
         VALUES ($1, $2, $3, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)))
         ON CONFLICT (cve_met) DO UPDATE SET nombre = $2, tipo = $3, geom = ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326))`,
        [cve_met, nombre, tipo, geojson]
      );
      count++;
    } catch (err) {
      console.error(`  Error inserting ZM ${cve_met}:`, err.message);
    }
  }
  console.log(`  Inserted ${count} zonas metropolitanas`);
}

async function main() {
  console.log('=== Geographic Data Loader ===');
  try {
    await loadEstados();
    await loadMunicipios();
    await loadZM();
    console.log('=== Done ===');
  } catch (err) {
    console.error('Fatal error:', err);
  } finally {
    await pool.end();
  }
}

main();
