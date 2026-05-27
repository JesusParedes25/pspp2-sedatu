-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 016: Semaforización universal
--
-- Agrega columna semaforo a etapas y acciones para indicar
-- visualmente el estado de avance con un código de color.
-- Valores posibles: verde, amarillo, naranja, rojo, gris, azul, negro
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE etapas ADD COLUMN IF NOT EXISTS semaforo VARCHAR(20) DEFAULT NULL;
ALTER TABLE acciones ADD COLUMN IF NOT EXISTS semaforo VARCHAR(20) DEFAULT NULL;

-- Constraint para valores válidos
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_etapas_semaforo') THEN
    ALTER TABLE etapas ADD CONSTRAINT chk_etapas_semaforo
      CHECK (semaforo IS NULL OR semaforo IN ('verde','amarillo','naranja','rojo','gris','azul','negro'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_acciones_semaforo') THEN
    ALTER TABLE acciones ADD CONSTRAINT chk_acciones_semaforo
      CHECK (semaforo IS NULL OR semaforo IN ('verde','amarillo','naranja','rojo','gris','azul','negro'));
  END IF;
END $$;
