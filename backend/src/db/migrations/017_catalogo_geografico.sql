-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 017: Catálogo geográfico
--
-- Tablas de catálogo normalizadas para entidades federativas y
-- municipios de México. Se alimentan desde las tablas geo_*
-- cargadas por shp2pgsql (ver scripts/cargar-geo.sh).
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cat_entidades_federativas (
  id     SERIAL PRIMARY KEY,
  clave  VARCHAR(2) UNIQUE NOT NULL,   -- CVE_ENT del INEGI (01-32)
  nombre VARCHAR(100) NOT NULL          -- NOM_ENT normalizado
);

CREATE TABLE IF NOT EXISTS cat_municipios (
  id         SERIAL PRIMARY KEY,
  clave      VARCHAR(5) UNIQUE NOT NULL, -- CVEGEO del INEGI (ej: 01001)
  clave_mun  VARCHAR(3) NOT NULL,        -- CVE_MUN (001-570)
  nombre     VARCHAR(200) NOT NULL,      -- NOM_MUN
  id_entidad INT NOT NULL REFERENCES cat_entidades_federativas(id)
);

CREATE INDEX IF NOT EXISTS idx_cat_municipios_entidad ON cat_municipios(id_entidad);
CREATE INDEX IF NOT EXISTS idx_cat_municipios_nombre ON cat_municipios(LOWER(nombre));
CREATE INDEX IF NOT EXISTS idx_cat_entidades_nombre ON cat_entidades_federativas(LOWER(nombre));
