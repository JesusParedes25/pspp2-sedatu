-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 072: aportación de un nodo a una categoría
--
-- Un indicador composicion='Categorias' (migración 071) hoy no tiene
-- forma de que un nodo (etapa/acción/tarea) aporte a UNA categoría
-- específica — indicador_aportaciones no sabía de categorías, así que
-- toda aportación quedaba "suelta" sin reflejarse en ninguna fila de
-- indicador_categorias. id_categoria es un atributo más de la fila de
-- aportación, no una nueva dimensión de unicidad: el criterio de "un
-- nodo aporta una sola vez a un indicador dado" (idx_aportacion_
-- indicador_etapa/accion/tarea, migraciones 029/045) no cambia.
--
-- Cambio 100% aditivo: no se toca ni se pierde ningún dato existente.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE indicador_aportaciones
  ADD COLUMN IF NOT EXISTS id_categoria UUID
    REFERENCES indicador_categorias(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_aportacion_categoria
  ON indicador_aportaciones(id_categoria) WHERE id_categoria IS NOT NULL;
