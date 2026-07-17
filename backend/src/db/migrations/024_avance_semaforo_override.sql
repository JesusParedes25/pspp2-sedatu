-- Migración 024: Avance actual y semáforo con override
-- Idempotente: usa DO $$ con IF NOT EXISTS

DO $$
BEGIN
  -- Etapas: avance_actual
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='etapas' AND column_name='avance_actual') THEN
    ALTER TABLE etapas ADD COLUMN avance_actual SMALLINT NULL;
  END IF;
  -- Etapas: avance_override
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='etapas' AND column_name='avance_override') THEN
    ALTER TABLE etapas ADD COLUMN avance_override BOOLEAN DEFAULT FALSE;
  END IF;
  -- Etapas: semaforo_override
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='etapas' AND column_name='semaforo_override') THEN
    ALTER TABLE etapas ADD COLUMN semaforo_override BOOLEAN DEFAULT FALSE;
  END IF;

  -- Acciones: avance_actual
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acciones' AND column_name='avance_actual') THEN
    ALTER TABLE acciones ADD COLUMN avance_actual SMALLINT NULL;
  END IF;
  -- Acciones: avance_override
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acciones' AND column_name='avance_override') THEN
    ALTER TABLE acciones ADD COLUMN avance_override BOOLEAN DEFAULT FALSE;
  END IF;
  -- Acciones: semaforo_override
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acciones' AND column_name='semaforo_override') THEN
    ALTER TABLE acciones ADD COLUMN semaforo_override BOOLEAN DEFAULT FALSE;
  END IF;
END$$;

-- Primero eliminar las constraints viejas que permiten valores obsoletos
ALTER TABLE etapas DROP CONSTRAINT IF EXISTS chk_etapas_semaforo;
ALTER TABLE acciones DROP CONSTRAINT IF EXISTS chk_acciones_semaforo;
ALTER TABLE etapas DROP CONSTRAINT IF EXISTS etapas_semaforo_check;
ALTER TABLE acciones DROP CONSTRAINT IF EXISTS acciones_semaforo_check;

-- Normalizar valores de semáforo existentes
UPDATE etapas SET semaforo = 'ambar' WHERE semaforo IN ('naranja','amarillo','amber');
UPDATE etapas SET semaforo = 'rojo' WHERE semaforo IN ('roja','red');
UPDATE etapas SET semaforo = NULL WHERE semaforo IS NOT NULL AND semaforo NOT IN ('verde','ambar','rojo','gris');

UPDATE acciones SET semaforo = 'ambar' WHERE semaforo IN ('naranja','amarillo','amber');
UPDATE acciones SET semaforo = 'rojo' WHERE semaforo IN ('roja','red');
UPDATE acciones SET semaforo = NULL WHERE semaforo IS NOT NULL AND semaforo NOT IN ('verde','ambar','rojo','gris');

-- Agregar nuevas constraints con valores normalizados
ALTER TABLE etapas ADD CONSTRAINT etapas_semaforo_check
  CHECK (semaforo IN ('verde','ambar','rojo','gris') OR semaforo IS NULL);
ALTER TABLE acciones ADD CONSTRAINT acciones_semaforo_check
  CHECK (semaforo IN ('verde','ambar','rojo','gris') OR semaforo IS NULL);

-- CHECK para avance_actual 0..100
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'etapas_avance_actual_check') THEN
    ALTER TABLE etapas ADD CONSTRAINT etapas_avance_actual_check
      CHECK (avance_actual >= 0 AND avance_actual <= 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acciones_avance_actual_check') THEN
    ALTER TABLE acciones ADD CONSTRAINT acciones_avance_actual_check
      CHECK (avance_actual >= 0 AND avance_actual <= 100);
  END IF;
END$$;
