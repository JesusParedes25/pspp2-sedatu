-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 006: Indicadores a nivel etapa
--
-- Permite que una etapa tenga sus propios indicadores además de
-- vincularse a indicadores del proyecto. Un indicador con
-- id_etapa = NULL es de nivel proyecto; con id_etapa = UUID es
-- específico de esa etapa. Ambos viven en la misma tabla para
-- simplificar consultas y permitir que acciones se vinculen a
-- cualquier indicador (proyecto o etapa) vía accion_indicador.
-- ═══════════════════════════════════════════════════════════════

-- Agregar columna opcional id_etapa a indicadores
ALTER TABLE indicadores
  ADD COLUMN IF NOT EXISTS id_etapa UUID REFERENCES etapas(id) ON DELETE CASCADE;

-- Índice para buscar indicadores de una etapa
CREATE INDEX IF NOT EXISTS idx_indicadores_etapa ON indicadores(id_etapa)
  WHERE id_etapa IS NOT NULL;
