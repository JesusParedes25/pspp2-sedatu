-- ═══════════════════════════════════════════════════════════════════
-- MIGRACIÓN 008: Evidencias vinculadas a subacciones
-- ═══════════════════════════════════════════════════════════════════
-- Agrega id_subaccion a la tabla evidencias para permitir adjuntar
-- archivos directamente a subacciones (además de acciones y riesgos).
-- Incluye constraint de exclusividad: cada evidencia pertenece a
-- exactamente UNO de los tres: acción, riesgo o subacción.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Agregar columna id_subaccion (referencia a acciones donde id_accion_padre IS NOT NULL)
ALTER TABLE evidencias
  ADD COLUMN IF NOT EXISTS id_subaccion UUID REFERENCES acciones(id) ON DELETE CASCADE;

-- 2. Índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_evidencias_subaccion ON evidencias(id_subaccion) WHERE id_subaccion IS NOT NULL;

-- 3. Eliminar constraint antiguo si existe (solo id_accion + id_riesgo)
ALTER TABLE evidencias DROP CONSTRAINT IF EXISTS chk_evidencia_pertenencia;

-- 4. Constraint de exclusividad: exactamente UNO de los tres debe tener valor
ALTER TABLE evidencias ADD CONSTRAINT chk_evidencia_pertenencia CHECK (
  (CASE WHEN id_accion     IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN id_riesgo     IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN id_subaccion  IS NOT NULL THEN 1 ELSE 0 END) = 1
);
