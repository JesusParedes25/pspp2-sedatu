-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 037: Regla exclusiva de territorio
--
-- Enforce: un nodo NO puede tener ZM + Estado al mismo tiempo.
-- Si existe conflicto → se conserva cve_ent y se limpia id_zm.
-- IDEMPOTENTE: seguro de ejecutar múltiples veces.
-- ═══════════════════════════════════════════════════════════════

-- ─── Limpieza previa de datos inconsistentes ──────────────────

DO $$
DECLARE
  n_etapas INT;
  n_acciones INT;
BEGIN
  -- Contar conflictos en etapas
  SELECT COUNT(*) INTO n_etapas
  FROM etapas WHERE id_zm IS NOT NULL AND cve_ent IS NOT NULL;

  -- Contar conflictos en acciones
  SELECT COUNT(*) INTO n_acciones
  FROM acciones WHERE id_zm IS NOT NULL AND cve_ent IS NOT NULL;

  RAISE NOTICE 'Nodos con conflicto ZM+Estado: etapas=%, acciones=%', n_etapas, n_acciones;

  -- En conflictos: conservar cve_ent (y cve_mun), limpiar id_zm
  UPDATE etapas SET id_zm = NULL WHERE id_zm IS NOT NULL AND cve_ent IS NOT NULL;
  UPDATE acciones SET id_zm = NULL WHERE id_zm IS NOT NULL AND cve_ent IS NOT NULL;

  RAISE NOTICE 'Limpieza completada. Se conservó cve_ent, se eliminó id_zm en nodos con conflicto.';
END $$;

-- ─── CHECK constraint exclusivo en etapas ─────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'etapas'
      AND constraint_name = 'etapas_territorio_exclusivo'
  ) THEN
    ALTER TABLE etapas
      ADD CONSTRAINT etapas_territorio_exclusivo
      CHECK (
        (id_zm IS NULL) OR (cve_ent IS NULL AND cve_mun IS NULL)
      );
    RAISE NOTICE 'Constraint etapas_territorio_exclusivo agregado.';
  ELSE
    RAISE NOTICE 'Constraint etapas_territorio_exclusivo ya existe.';
  END IF;
END $$;

-- ─── CHECK constraint exclusivo en acciones ───────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'acciones'
      AND constraint_name = 'acciones_territorio_exclusivo'
  ) THEN
    ALTER TABLE acciones
      ADD CONSTRAINT acciones_territorio_exclusivo
      CHECK (
        (id_zm IS NULL) OR (cve_ent IS NULL AND cve_mun IS NULL)
      );
    RAISE NOTICE 'Constraint acciones_territorio_exclusivo agregado.';
  ELSE
    RAISE NOTICE 'Constraint acciones_territorio_exclusivo ya existe.';
  END IF;
END $$;

-- ─── Índices para consultas territoriales ─────────────────────

CREATE INDEX IF NOT EXISTS idx_etapas_cve_ent ON etapas(cve_ent) WHERE cve_ent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_etapas_id_zm   ON etapas(id_zm)   WHERE id_zm   IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_acciones_cve_ent ON acciones(cve_ent) WHERE cve_ent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_acciones_id_zm   ON acciones(id_zm)   WHERE id_zm   IS NOT NULL;
