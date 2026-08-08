-- Migración 047: Estatus cualitativo (nota corta de texto libre) en
-- etapas, acciones y tareas — distinto de `estado` (enum rígido) y
-- `semaforo` (color calculado): una frase escrita a mano que responde
-- "¿cómo va esto ahora mismo?", pensada para verse de un vistazo en
-- Tablero y Panorama del proyecto. El histórico de cambios se registra
-- en la tabla `actividad` ya existente (tipo_evento nuevo), no aquí —
-- estas columnas solo guardan el valor ACTUAL, mismo patrón que
-- avance_actual/semaforo (ver migración 024).
-- Idempotente: usa DO $$ con IF NOT EXISTS.

DO $$
BEGIN
  -- Etapas
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='etapas' AND column_name='estatus_cualitativo') THEN
    ALTER TABLE etapas ADD COLUMN estatus_cualitativo TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='etapas' AND column_name='estatus_cualitativo_fecha') THEN
    ALTER TABLE etapas ADD COLUMN estatus_cualitativo_fecha TIMESTAMPTZ NULL;
  END IF;

  -- Acciones
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acciones' AND column_name='estatus_cualitativo') THEN
    ALTER TABLE acciones ADD COLUMN estatus_cualitativo TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acciones' AND column_name='estatus_cualitativo_fecha') THEN
    ALTER TABLE acciones ADD COLUMN estatus_cualitativo_fecha TIMESTAMPTZ NULL;
  END IF;

  -- Tareas
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tareas' AND column_name='estatus_cualitativo') THEN
    ALTER TABLE tareas ADD COLUMN estatus_cualitativo TEXT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tareas' AND column_name='estatus_cualitativo_fecha') THEN
    ALTER TABLE tareas ADD COLUMN estatus_cualitativo_fecha TIMESTAMPTZ NULL;
  END IF;
END$$;

-- Ampliar el CHECK de actividad.tipo_evento (definido en 039_actividad.sql)
-- para aceptar el nuevo tipo de evento 'estatus_cualitativo' (19 caracteres,
-- cabe en el VARCHAR(20) existente).
ALTER TABLE actividad DROP CONSTRAINT IF EXISTS actividad_tipo_evento_check;
ALTER TABLE actividad ADD CONSTRAINT actividad_tipo_evento_check
  CHECK (tipo_evento IN ('comentario','archivo','riesgo','cambio_estatus','cambio_avance','estatus_cualitativo'));
