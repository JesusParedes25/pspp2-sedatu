-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 020: Indicadores auto-calculados y publicables
--
-- Agrega:
-- 1. modo_calculo: cómo se calcula valor_actual automáticamente
-- 2. es_publicable: flag para exponer a plataforma externa
-- 3. columnas_schema en proyectos: define columnas del tablero
-- ═══════════════════════════════════════════════════════════════

-- ─── Indicadores: modo de cálculo automático ──────────────────
ALTER TABLE indicadores ADD COLUMN IF NOT EXISTS
  modo_calculo VARCHAR(25) NOT NULL DEFAULT 'manual'
  CHECK (modo_calculo IN ('manual', 'contar_completadas', 'porcentaje_promedio', 'suma_manual'));

-- ─── Indicadores: flag de publicación externa ─────────────────
ALTER TABLE indicadores ADD COLUMN IF NOT EXISTS
  es_publicable BOOLEAN NOT NULL DEFAULT false;

-- ─── Proyectos: esquema de columnas del tablero ───────────────
-- Almacena la definición de columnas extra visibles en el tablero.
-- Ejemplo: [{"key":"no_oficio","label":"No. Oficio","type":"text"},...]
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS
  columnas_schema JSONB NOT NULL DEFAULT '[]';

-- ─── Índice para consulta de indicadores públicos ─────────────
CREATE INDEX IF NOT EXISTS idx_indicadores_publicables
  ON indicadores(es_publicable) WHERE es_publicable = true AND activo = true;
