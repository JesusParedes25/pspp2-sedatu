-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 045: Aportaciones a indicadores desde tareas
--
-- Hasta ahora indicador_aportaciones solo permitía vincular etapas
-- o acciones a un indicador (id_etapa / id_accion). Esta migración
-- agrega id_tarea siguiendo exactamente el mismo patrón, para que
-- una tarea (hija de una acción) también pueda aportar a un
-- indicador del proyecto.
--
-- Cambio 100% aditivo: no se toca ni se pierde ningún dato existente.
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Nueva columna id_tarea ────────────────────────────────
ALTER TABLE indicador_aportaciones
  ADD COLUMN IF NOT EXISTS id_tarea UUID REFERENCES tareas(id) ON DELETE CASCADE;

-- ─── 2. Reemplazar CHECK: ahora exige exactamente UNA de las tres ──
ALTER TABLE indicador_aportaciones DROP CONSTRAINT IF EXISTS chk_aportacion_entidad;
ALTER TABLE indicador_aportaciones ADD CONSTRAINT chk_aportacion_entidad CHECK (
  (CASE WHEN id_etapa IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN id_accion IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN id_tarea  IS NOT NULL THEN 1 ELSE 0 END) = 1
);

-- ─── 3. Único por indicador+tarea (mismo patrón que etapa/accion) ──
CREATE UNIQUE INDEX IF NOT EXISTS idx_aportacion_indicador_tarea
  ON indicador_aportaciones(id_indicador, id_tarea) WHERE id_tarea IS NOT NULL;
