-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 014: Agregar updated_at a etapas
--
-- La tabla etapas no tenía columna updated_at, pero el módulo
-- validaciones-estado.js la usa en UPDATE ... SET updated_at = NOW().
-- Esto causaba error 500 al cambiar estado de etapas.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE etapas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
