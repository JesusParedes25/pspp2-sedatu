-- Migración 066: título editable de documento, separado del nombre de archivo
-- Idempotente

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='evidencias' AND column_name='titulo') THEN
    ALTER TABLE evidencias ADD COLUMN titulo VARCHAR(500) NULL;
  END IF;
END$$;
