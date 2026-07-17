-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 029: Aportaciones a indicadores + ajustes schema
--
-- 1. DROP acumulacion de indicadores
-- 2. meta_global → NULLABLE
-- 3. Actualizar CHECK de tipo (quitar 'Monto')
-- 4. Añadir etiqueta_unidad
-- 5. Crear tabla indicador_aportaciones
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Drop acumulacion ──────────────────────────────────────
ALTER TABLE indicadores DROP COLUMN IF EXISTS acumulacion;

-- ─── 2. meta_global nullable ──────────────────────────────────
ALTER TABLE indicadores ALTER COLUMN meta_global DROP NOT NULL;
ALTER TABLE indicadores ALTER COLUMN meta_global DROP DEFAULT;

-- ─── 3. Actualizar CHECK de tipo (quitar Monto, agregar Otros) ──
-- Primero migrar datos existentes con 'Monto' a 'Otro'
UPDATE indicadores SET tipo = 'Otro' WHERE tipo = 'Monto';

ALTER TABLE indicadores DROP CONSTRAINT IF EXISTS indicadores_tipo_check;
ALTER TABLE indicadores ADD CONSTRAINT indicadores_tipo_check CHECK (
  tipo IN ('Avance_fisico','Avance_financiero','Cobertura','Beneficiarios','Gestion','Otro')
);

-- ─── 4. Añadir etiqueta_unidad (label legible) ───────────────
ALTER TABLE indicadores ADD COLUMN IF NOT EXISTS etiqueta_unidad VARCHAR(100);
-- Poblar etiqueta_unidad desde unidad_personalizada si existe
UPDATE indicadores SET etiqueta_unidad = unidad_personalizada
WHERE etiqueta_unidad IS NULL AND unidad_personalizada IS NOT NULL;

-- ─── 5. Crear tabla indicador_aportaciones ────────────────────
CREATE TABLE IF NOT EXISTS indicador_aportaciones (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_indicador UUID NOT NULL REFERENCES indicadores(id) ON DELETE CASCADE,
  id_etapa     UUID REFERENCES etapas(id) ON DELETE CASCADE,
  id_accion    UUID REFERENCES acciones(id) ON DELETE CASCADE,
  aportacion   NUMERIC NOT NULL DEFAULT 0,
  modo         VARCHAR(20) NOT NULL DEFAULT 'proporcional'
               CHECK (modo IN ('proporcional','al_concluir')),
  created_at   TIMESTAMP DEFAULT NOW(),
  CONSTRAINT chk_aportacion_entidad CHECK (
    (CASE WHEN id_etapa IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN id_accion IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

-- Unique per indicador+entidad
CREATE UNIQUE INDEX IF NOT EXISTS idx_aportacion_indicador_etapa
  ON indicador_aportaciones(id_indicador, id_etapa) WHERE id_etapa IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_aportacion_indicador_accion
  ON indicador_aportaciones(id_indicador, id_accion) WHERE id_accion IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_aportaciones_indicador ON indicador_aportaciones(id_indicador);
