-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 007: Subacciones y peso porcentual
--
-- Permite que una acción tenga subacciones (hijas) mediante
-- id_accion_padre. El peso_porcentaje se calcula automáticamente
-- por el backend al importar CSV o al crear acciones, distribuyendo
-- 100% entre las acciones de una etapa y 100% del peso de una
-- acción entre sus subacciones.
-- ═══════════════════════════════════════════════════════════════

-- Columna para jerarquía padre-hijo en acciones
ALTER TABLE acciones
  ADD COLUMN IF NOT EXISTS id_accion_padre UUID REFERENCES acciones(id) ON DELETE CASCADE;

-- Peso porcentual dentro de su grupo (etapa o acción padre)
ALTER TABLE acciones
  ADD COLUMN IF NOT EXISTS peso_porcentaje DECIMAL(7,4) DEFAULT 0;

-- Índice para buscar subacciones de una acción padre
CREATE INDEX IF NOT EXISTS idx_acciones_padre ON acciones(id_accion_padre)
  WHERE id_accion_padre IS NOT NULL;
