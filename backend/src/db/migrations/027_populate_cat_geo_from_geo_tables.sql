-- Migration 027: Populate cat_entidades_federativas and cat_municipios from geo_* tables
-- Idempotent: ON CONFLICT DO NOTHING

INSERT INTO cat_entidades_federativas (clave, nombre, geom)
SELECT cve_ent, nombre, geom FROM geo_estados
ON CONFLICT (clave) DO NOTHING;

INSERT INTO cat_municipios (clave, clave_mun, nombre, id_entidad, geom)
SELECT gm.cvegeo, gm.cve_mun, gm.nombre, ce.id, gm.geom
FROM geo_municipios gm
JOIN cat_entidades_federativas ce ON ce.clave = gm.cve_ent
ON CONFLICT (clave) DO NOTHING;
