-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 003: Constraints adicionales
-- Restricciones de negocio que no se pueden expresar con CHECK simples.
-- Idempotente: cada constraint se crea solo si no existe.
-- ═══════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- Asegurar que fecha_fin >= fecha_inicio en acciones
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_acciones_fechas') THEN
    ALTER TABLE acciones ADD CONSTRAINT chk_acciones_fechas CHECK (fecha_fin >= fecha_inicio);
  END IF;

  -- Asegurar que fecha_limite >= fecha_inicio en proyectos (si ambas existen)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_proyectos_fechas') THEN
    ALTER TABLE proyectos ADD CONSTRAINT chk_proyectos_fechas
      CHECK (fecha_limite IS NULL OR fecha_inicio IS NULL OR fecha_limite >= fecha_inicio);
  END IF;

  -- Asegurar que porcentaje esté entre 0 y 100 en acciones
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_acciones_porcentaje') THEN
    ALTER TABLE acciones ADD CONSTRAINT chk_acciones_porcentaje
      CHECK (porcentaje_avance >= 0 AND porcentaje_avance <= 100);
  END IF;

  -- Asegurar que porcentaje calculado esté entre 0 y 100 en etapas
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_etapas_porcentaje') THEN
    ALTER TABLE etapas ADD CONSTRAINT chk_etapas_porcentaje
      CHECK (porcentaje_calculado >= 0 AND porcentaje_calculado <= 100);
  END IF;

  -- Asegurar que porcentaje calculado esté entre 0 y 100 en proyectos
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_proyectos_porcentaje') THEN
    ALTER TABLE proyectos ADD CONSTRAINT chk_proyectos_porcentaje
      CHECK (porcentaje_calculado >= 0 AND porcentaje_calculado <= 100);
  END IF;
END $$;
