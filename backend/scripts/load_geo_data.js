/**
 * Script to load geographic data into PostGIS tables.
 *
 * Uso local (fuera de Docker): node scripts/load_geo_data.js
 *   → se conecta a localhost:5433 (puerto mapeado por docker-compose.yml).
 *
 * Uso en producción (dentro del contenedor backend, la red de Docker no
 * expone el puerto de postgres al host por seguridad):
 *   docker compose -f docker-compose.prod.yml exec backend node scripts/load_geo_data.js
 *   → usa DB_HOST/DB_PORT del propio contenedor (postgres:5432), ya
 *     definidos en el environment del servicio backend.
 */
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const shapefile = require('shapefile');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5433,
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
  const features = data.features || data;

  // El GeoJSON trae UN registro por municipio (varios municipios comparten
  // el mismo CVE_MET). Hay que cargar todos a una tabla temporal y luego
  // unir (ST_Union) las geometrías por CVE_MET — insertar fila por fila con
  // ON CONFLICT DO UPDATE pisaría cada ZM con el último municipio procesado.
  await pool.query(`
    CREATE TEMP TABLE _tmp_zm_load (
      cve_met VARCHAR(20), nombre VARCHAR(200), tipo VARCHAR(80),
      geom geometry(Geometry, 4326)
    )
  `);

  let count = 0;
  for (const feature of features) {
    const props = feature.properties || {};
    const cve_met = (props.CVE_MET || props.cve_met || props.CVE_ZM || props.cve_zm || props.CVEGEO || '').toString();
    const nombre = props.NOM_MET || props.NOM_ZM || props.nombre || props.NOMGEO || `ZM ${cve_met}`;
    const tipo = props.TIPO_MET || props.TIPO || props.tipo_met || props.tipo || null;

    if (!cve_met) continue;

    const geojson = JSON.stringify(feature.geometry);

    try {
      await pool.query(
        `INSERT INTO _tmp_zm_load (cve_met, nombre, tipo, geom)
         VALUES ($1, $2, $3, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326))`,
        [cve_met, nombre, tipo, geojson]
      );
      count++;
    } catch (err) {
      console.error(`  Error cargando parte de ZM ${cve_met}:`, err.message);
    }
  }

  const { rowCount } = await pool.query(`
    INSERT INTO geo_zm (cve_met, nombre, tipo, geom)
      SELECT cve_met, MAX(nombre), MAX(tipo), ST_Multi(ST_Union(geom))
      FROM _tmp_zm_load
      GROUP BY cve_met
    ON CONFLICT (cve_met) DO UPDATE SET nombre = EXCLUDED.nombre, tipo = EXCLUDED.tipo, geom = EXCLUDED.geom
  `);
  await pool.query('DROP TABLE _tmp_zm_load');

  console.log(`  Cargadas ${count} partes municipales → ${rowCount} zonas metropolitanas unidas`);
  await corregirNombresZM();
}

// El zm.geojson fuente trae ~24 nombres con codificación de caracteres
// corrupta (p.ej. "Canc n" en vez de "Cancún") — pérdida irrecuperable del
// archivo origen, no un bug de parseo. Se corrigen aquí con los nombres
// correctos verificados, para que cualquier carga (local o producción)
// quede consistente sin depender de una corrección manual por SQL.
const NOMBRES_ZM_CORRECTOS = {
  '01.1.01': 'Aguascalientes', '02.1.01': 'Tijuana', '02.2.02': 'Ensenada',
  '02.2.03': 'Mexicali', '03.2.01': 'La Paz', '03.2.02': 'Los Cabos',
  '04.2.01': 'Campeche', '05.1.01': 'La Laguna', '05.1.02': 'Monclova-Frontera',
  '05.1.03': 'Piedras Negras', '05.1.04': 'Saltillo', '05.3.05': 'Sabinas',
  '06.1.01': 'Colima-Villa de Álvarez', '06.3.02': 'Tecomán', '07.1.01': 'Tapachula',
  '07.1.02': 'Tuxtla Gutiérrez', '08.1.01': 'Chihuahua', '08.1.02': 'Delicias',
  '08.2.03': 'Juárez', '08.3.04': 'Hidalgo del Parral', '09.1.01': 'Ciudad de México',
  '10.2.01': 'Durango', '11.1.01': 'Celaya', '11.1.02': 'León',
  '11.2.03': 'Guanajuato', '11.2.04': 'Irapuato', '11.3.05': 'Moroleón-Uriangato',
  '11.3.06': 'Silao', '12.1.01': 'Chilpancingo', '12.2.02': 'Acapulco',
  '13.1.01': 'Pachuca', '13.1.02': 'Tulancingo', '13.3.03': 'Atitalaquia',
  '14.1.01': 'Guadalajara', '14.1.02': 'Puerto Vallarta', '14.3.03': 'Ocotlán',
  '15.1.01': 'Toluca', '15.3.02': 'Ozumba', '15.3.03': 'Tianguistenco',
  '16.1.01': 'La Piedad-Pénjamo', '16.1.02': 'Morelia', '16.1.03': 'Zamora',
  '16.2.04': 'Uruapan', '16.3.05': 'Lázaro Cárdenas', '16.3.06': 'Sahuayo',
  '17.1.01': 'Cuautla', '17.1.02': 'Cuernavaca', '18.1.01': 'Tepic',
  '19.1.01': 'Monterrey', '20.1.01': 'Oaxaca', '20.3.02': 'Juchitán',
  '20.3.03': 'Salina Cruz', '20.3.04': 'Tehuantepec', '21.1.01': 'Puebla-Tlaxcala',
  '21.1.02': 'San Martín Texmelucan', '21.1.03': 'Tehuacán', '21.3.04': 'Huauchinango',
  '21.3.05': 'Teziutlán', '22.1.01': 'Querétaro', '23.1.01': 'Cancún',
  '23.2.02': 'Chetumal', '23.2.03': 'Playa del Carmen', '24.1.01': 'San Luis Potosí',
  '24.3.02': 'Matehuala', '24.3.03': 'Rioverde', '25.2.01': 'Culiacán',
  '25.2.02': 'Los Mochis', '25.2.03': 'Mazatlán', '26.1.01': 'Guaymas',
  '26.2.02': 'Ciudad Obregón', '26.2.03': 'Hermosillo', '26.2.04': 'Nogales',
  '26.3.05': 'Caborca', '27.1.01': 'Villahermosa', '28.1.01': 'Reynosa',
  '28.1.02': 'Tampico', '28.2.03': 'Ciudad Victoria', '28.2.04': 'Matamoros',
  '28.2.05': 'Nuevo Laredo', '29.1.01': 'Tlaxcala-Apizaco', '29.3.02': 'Huamantla',
  '30.1.01': 'Coatzacoalcos', '30.1.02': 'Córdoba', '30.1.03': 'Minatitlán',
  '30.1.04': 'Orizaba', '30.1.05': 'Poza Rica', '30.1.06': 'Veracruz',
  '30.1.07': 'Xalapa', '30.3.08': 'Acayucan', '31.1.01': 'Mérida',
  '31.3.02': 'Valladolid', '32.1.01': 'Zacatecas-Guadalupe',
};

async function corregirNombresZM() {
  let corregidos = 0;
  for (const [cveMet, nombre] of Object.entries(NOMBRES_ZM_CORRECTOS)) {
    const { rowCount } = await pool.query(
      'UPDATE geo_zm SET nombre = $1 WHERE cve_met = $2 AND nombre IS DISTINCT FROM $1',
      [nombre, cveMet]
    );
    corregidos += rowCount;
  }
  if (corregidos > 0) console.log(`  Corregidos ${corregidos} nombres de ZM con codificación defectuosa`);
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
