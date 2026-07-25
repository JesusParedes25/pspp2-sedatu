/**
 * ARCHIVO: municipios-nodo.queries.js
 * PROPÓSITO: Lectura/escritura de la relación N:N municipios↔nodo
 *            (etapa_municipios / accion_municipios / tarea_municipios).
 *            Reemplaza al viejo esquema de un solo cve_mun por nodo.
 */
const pool = require('../pool');

async function obtenerMunicipiosEtapa(etapaId, db) {
  const { rows } = await (db || pool).query(
    `SELECT em.cve_mun, gm.nombre FROM etapa_municipios em
     JOIN geo_municipios gm ON gm.cvegeo = em.cve_mun
     WHERE em.etapa_id = $1 ORDER BY gm.nombre`,
    [etapaId]
  );
  return rows;
}

async function reemplazarMunicipiosEtapa(client, etapaId, cveMunList) {
  await client.query('DELETE FROM etapa_municipios WHERE etapa_id = $1', [etapaId]);
  for (const cveMun of cveMunList) {
    await client.query(
      'INSERT INTO etapa_municipios (etapa_id, cve_mun) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [etapaId, cveMun]
    );
  }
}

async function obtenerMunicipiosAccion(accionId, db) {
  const { rows } = await (db || pool).query(
    `SELECT am.cve_mun, gm.nombre FROM accion_municipios am
     JOIN geo_municipios gm ON gm.cvegeo = am.cve_mun
     WHERE am.accion_id = $1 ORDER BY gm.nombre`,
    [accionId]
  );
  return rows;
}

async function reemplazarMunicipiosAccion(client, accionId, cveMunList) {
  await client.query('DELETE FROM accion_municipios WHERE accion_id = $1', [accionId]);
  for (const cveMun of cveMunList) {
    await client.query(
      'INSERT INTO accion_municipios (accion_id, cve_mun) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [accionId, cveMun]
    );
  }
}

async function obtenerMunicipiosTarea(tareaId, db) {
  const { rows } = await (db || pool).query(
    `SELECT tm.cve_mun, gm.nombre FROM tarea_municipios tm
     JOIN geo_municipios gm ON gm.cvegeo = tm.cve_mun
     WHERE tm.tarea_id = $1 ORDER BY gm.nombre`,
    [tareaId]
  );
  return rows;
}

async function reemplazarMunicipiosTarea(client, tareaId, cveMunList) {
  await client.query('DELETE FROM tarea_municipios WHERE tarea_id = $1', [tareaId]);
  for (const cveMun of cveMunList) {
    await client.query(
      'INSERT INTO tarea_municipios (tarea_id, cve_mun) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [tareaId, cveMun]
    );
  }
}

module.exports = {
  obtenerMunicipiosEtapa,
  reemplazarMunicipiosEtapa,
  obtenerMunicipiosAccion,
  reemplazarMunicipiosAccion,
  obtenerMunicipiosTarea,
  reemplazarMunicipiosTarea,
};
