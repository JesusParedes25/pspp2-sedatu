-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 018: Cobertura geográfica
--
-- Tabla polimórfica que vincula cualquier entidad del sistema
-- (proyecto, etapa, acción) con uno o más estados/municipios.
-- Un registro puede tener solo estado (cobertura estatal) o
-- estado + municipio (cobertura municipal).
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cobertura_geografica (
  id            SERIAL PRIMARY KEY,
  tipo_entidad  VARCHAR(20) NOT NULL CHECK (tipo_entidad IN ('proyecto','etapa','accion')),
  id_entidad    UUID NOT NULL,
  id_estado     INT REFERENCES cat_entidades_federativas(id),
  id_municipio  INT REFERENCES cat_municipios(id),
  created_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(tipo_entidad, id_entidad, id_estado, id_municipio)
);

CREATE INDEX IF NOT EXISTS idx_cobertura_tipo_entidad ON cobertura_geografica(tipo_entidad, id_entidad);
CREATE INDEX IF NOT EXISTS idx_cobertura_estado ON cobertura_geografica(id_estado);
CREATE INDEX IF NOT EXISTS idx_cobertura_municipio ON cobertura_geografica(id_municipio);
