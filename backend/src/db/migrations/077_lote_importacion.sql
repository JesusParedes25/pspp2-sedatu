-- Migración 077: trazabilidad de lotes de importación
-- Permite identificar y deshacer en bloque una importación completa
-- (reportado en junta con usuarios reales: sin esto, un error de mapeo
-- obligaba a borrar nodo por nodo a mano).
-- Idempotente: usa DO $$ con IF NOT EXISTS.
-- Default NULL en las tres tablas: los datos ya existentes (capturados
-- a mano o importados antes de esta migración) no quedan marcados como
-- parte de ningún lote, y "eliminar lote" nunca los toca.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='etapas' AND column_name='lote_importacion_id') THEN
    ALTER TABLE etapas ADD COLUMN lote_importacion_id UUID NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='etapas' AND column_name='importado_en') THEN
    ALTER TABLE etapas ADD COLUMN importado_en TIMESTAMPTZ NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='etapas' AND column_name='importado_por') THEN
    ALTER TABLE etapas ADD COLUMN importado_por UUID NULL REFERENCES usuarios(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='etapas' AND column_name='archivo_origen') THEN
    ALTER TABLE etapas ADD COLUMN archivo_origen VARCHAR(500) NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acciones' AND column_name='lote_importacion_id') THEN
    ALTER TABLE acciones ADD COLUMN lote_importacion_id UUID NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acciones' AND column_name='importado_en') THEN
    ALTER TABLE acciones ADD COLUMN importado_en TIMESTAMPTZ NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acciones' AND column_name='importado_por') THEN
    ALTER TABLE acciones ADD COLUMN importado_por UUID NULL REFERENCES usuarios(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acciones' AND column_name='archivo_origen') THEN
    ALTER TABLE acciones ADD COLUMN archivo_origen VARCHAR(500) NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tareas' AND column_name='lote_importacion_id') THEN
    ALTER TABLE tareas ADD COLUMN lote_importacion_id UUID NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tareas' AND column_name='importado_en') THEN
    ALTER TABLE tareas ADD COLUMN importado_en TIMESTAMPTZ NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tareas' AND column_name='importado_por') THEN
    ALTER TABLE tareas ADD COLUMN importado_por UUID NULL REFERENCES usuarios(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tareas' AND column_name='archivo_origen') THEN
    ALTER TABLE tareas ADD COLUMN archivo_origen VARCHAR(500) NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_etapas_lote_importacion   ON etapas(lote_importacion_id)   WHERE lote_importacion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_acciones_lote_importacion  ON acciones(lote_importacion_id) WHERE lote_importacion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tareas_lote_importacion    ON tareas(lote_importacion_id)   WHERE lote_importacion_id IS NOT NULL;
