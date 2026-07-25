-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 042: Múltiples municipios por etapa/acción/tarea
--
-- Hasta ahora etapas.cve_mun / acciones.cve_mun solo permitían UN
-- municipio (Modo A del selector de territorio). Esta migración agrega
-- tablas puente 1:N para permitir varios municipios por nodo, dentro
-- del mismo estado (cve_ent sigue siendo único por nodo, sin cambios).
--
-- No se elimina la columna cve_mun existente (queda en desuso, se
-- conserva por seguridad/rollback). Los datos existentes se migran a
-- la tabla puente correspondiente.
-- IDEMPOTENTE: seguro de ejecutar múltiples veces.
-- ═══════════════════════════════════════════════════════════════

-- ─── tareas: agregar cve_ent (no existía ningún campo de territorio) ──

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tareas' AND column_name='cve_ent') THEN
    ALTER TABLE tareas ADD COLUMN cve_ent VARCHAR(5) NULL;
  END IF;
END$$;

-- ─── Tablas puente ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS etapa_municipios (
  id         SERIAL PRIMARY KEY,
  etapa_id   UUID NOT NULL REFERENCES etapas(id) ON DELETE CASCADE,
  cve_mun    VARCHAR(5) NOT NULL REFERENCES geo_municipios(cvegeo),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (etapa_id, cve_mun)
);
CREATE INDEX IF NOT EXISTS idx_etapa_municipios_etapa   ON etapa_municipios(etapa_id);
CREATE INDEX IF NOT EXISTS idx_etapa_municipios_cve_mun ON etapa_municipios(cve_mun);

CREATE TABLE IF NOT EXISTS accion_municipios (
  id         SERIAL PRIMARY KEY,
  accion_id  UUID NOT NULL REFERENCES acciones(id) ON DELETE CASCADE,
  cve_mun    VARCHAR(5) NOT NULL REFERENCES geo_municipios(cvegeo),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (accion_id, cve_mun)
);
CREATE INDEX IF NOT EXISTS idx_accion_municipios_accion  ON accion_municipios(accion_id);
CREATE INDEX IF NOT EXISTS idx_accion_municipios_cve_mun ON accion_municipios(cve_mun);

CREATE TABLE IF NOT EXISTS tarea_municipios (
  id         SERIAL PRIMARY KEY,
  tarea_id   UUID NOT NULL REFERENCES tareas(id) ON DELETE CASCADE,
  cve_mun    VARCHAR(5) NOT NULL REFERENCES geo_municipios(cvegeo),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tarea_id, cve_mun)
);
CREATE INDEX IF NOT EXISTS idx_tarea_municipios_tarea   ON tarea_municipios(tarea_id);
CREATE INDEX IF NOT EXISTS idx_tarea_municipios_cve_mun ON tarea_municipios(cve_mun);

-- ─── Migrar datos existentes (single-value → tabla puente) ────
-- Solo migra cve_mun que existan en geo_municipios (por la FK); si algún
-- registro histórico quedó con una clave inválida/obsoleta se omite en
-- vez de romper la migración.

INSERT INTO etapa_municipios (etapa_id, cve_mun)
SELECT e.id, e.cve_mun
FROM etapas e
JOIN geo_municipios gm ON gm.cvegeo = e.cve_mun
WHERE e.cve_mun IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO accion_municipios (accion_id, cve_mun)
SELECT a.id, a.cve_mun
FROM acciones a
JOIN geo_municipios gm ON gm.cvegeo = a.cve_mun
WHERE a.cve_mun IS NOT NULL
ON CONFLICT DO NOTHING;
