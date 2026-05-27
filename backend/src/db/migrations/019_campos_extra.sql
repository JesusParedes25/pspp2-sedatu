-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 019: Campos extra flexibles (JSONB)
--
-- Permite almacenar metadatos de dominio específico sin alterar
-- el schema. Cada dependencia/dirección puede tener sus propios
-- campos (ej: Financiamiento, Escala, Folio, Convenio, VoBo).
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE etapas ADD COLUMN IF NOT EXISTS campos_extra JSONB DEFAULT '{}';
ALTER TABLE acciones ADD COLUMN IF NOT EXISTS campos_extra JSONB DEFAULT '{}';

-- Índice GIN para consultas sobre campos_extra
CREATE INDEX IF NOT EXISTS idx_etapas_campos_extra ON etapas USING GIN (campos_extra);
CREATE INDEX IF NOT EXISTS idx_acciones_campos_extra ON acciones USING GIN (campos_extra);
