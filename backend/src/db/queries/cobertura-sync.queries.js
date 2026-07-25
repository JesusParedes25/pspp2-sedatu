/**
 * ARCHIVO: cobertura-sync.queries.js
 * PROPÓSITO: Mantener `cobertura_geografica` (dashboard ejecutivo, Panorama
 *            del proyecto y los chips de "Municipio" en Vista Lista) en
 *            sincronía con el estado/municipios asignados manualmente a una
 *            etapa o acción vía TerritorioSelector. Antes de esto, esa tabla
 *            solo la llenaba el importador de Excel — cualquier proyecto
 *            capturado a mano aparecía sin cobertura en esas tres pantallas.
 *
 *            Usa el catálogo cat_entidades_federativas/cat_municipios (el
 *            que ya consume cobertura_geografica), traduciendo desde
 *            cve_ent/cve_mun por su columna `clave`, que es idéntica desde
 *            que se sincronizaron ambos catálogos (ver migración 027).
 */

// Reemplaza toda la cobertura de una etapa/acción. Si no se encuentra el
// estado o algún municipio en el catálogo cat_* (desincronización), se omite
// esa fila silenciosamente: nunca debe bloquear el guardado del nodo.
async function sincronizarCobertura(client, tipoEntidad, idEntidad, cveEnt, cveMunList) {
  await client.query(
    'DELETE FROM cobertura_geografica WHERE tipo_entidad = $1 AND id_entidad = $2',
    [tipoEntidad, idEntidad]
  );
  if (!cveEnt) return;

  const { rows: [estado] } = await client.query(
    'SELECT id FROM cat_entidades_federativas WHERE clave = $1', [cveEnt]
  );
  if (!estado) return;

  if (!cveMunList || cveMunList.length === 0) {
    await client.query(
      `INSERT INTO cobertura_geografica (tipo_entidad, id_entidad, id_estado, id_municipio)
       VALUES ($1, $2, $3, NULL) ON CONFLICT DO NOTHING`,
      [tipoEntidad, idEntidad, estado.id]
    );
    return;
  }

  for (const cveMun of cveMunList) {
    const { rows: [municipio] } = await client.query(
      'SELECT id FROM cat_municipios WHERE clave = $1', [cveMun]
    );
    if (!municipio) continue;
    await client.query(
      `INSERT INTO cobertura_geografica (tipo_entidad, id_entidad, id_estado, id_municipio)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [tipoEntidad, idEntidad, estado.id, municipio.id]
    );
  }
}

module.exports = { sincronizarCobertura };
