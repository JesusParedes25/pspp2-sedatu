-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 012: Tabla polimórfica de bloqueos
--
-- Reemplaza el campo acciones.motivo_bloqueo con una tabla
-- dedicada que soporta bloqueos en los 4 niveles jerárquicos:
-- Proyecto, Etapa, Accion, Subaccion.
--
-- Cada entidad puede tener un solo bloqueo activo a la vez
-- (enforced por unique index parcial). El historial se conserva.
-- ═══════════════════════════════════════════════════════════════

-- 1. Crear tabla de bloqueos
CREATE TABLE IF NOT EXISTS bloqueos (
  id                         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entidad_tipo               VARCHAR(20) NOT NULL
                             CHECK (entidad_tipo IN (
                               'Proyecto','Subproyecto','Etapa','Accion','Subaccion'
                             )),
  entidad_id                 UUID NOT NULL,
  motivo                     TEXT NOT NULL,
  fecha_bloqueo              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_desbloqueo           TIMESTAMPTZ,
  nota_resolucion            TEXT,
  id_creador                 UUID NOT NULL REFERENCES usuarios(id),
  id_responsable_desbloqueo  UUID REFERENCES usuarios(id),
  created_at                 TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Constraint parcial: máximo un bloqueo activo por entidad
CREATE UNIQUE INDEX IF NOT EXISTS idx_bloqueo_activo_unico
  ON bloqueos (entidad_tipo, entidad_id)
  WHERE fecha_desbloqueo IS NULL;

-- 3. Índice para consultas por entidad (historial completo)
CREATE INDEX IF NOT EXISTS idx_bloqueos_entidad
  ON bloqueos (entidad_tipo, entidad_id);

-- 4. Migrar datos existentes de acciones.motivo_bloqueo
--    Usa id_responsable de la acción como creador del bloqueo histórico.
--    Solo migra si hay un responsable asignado (NOT NULL requerido).
--    NOT EXISTS evita duplicar registros en re-ejecución.
INSERT INTO bloqueos (entidad_tipo, entidad_id, motivo, id_creador)
SELECT
  CASE WHEN a.id_accion_padre IS NOT NULL THEN 'Subaccion' ELSE 'Accion' END,
  a.id,
  a.motivo_bloqueo,
  a.id_responsable
FROM acciones a
WHERE a.estado = 'Bloqueada'
  AND a.motivo_bloqueo IS NOT NULL
  AND a.id_responsable IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM bloqueos b WHERE b.entidad_id = a.id
  );

-- 5. Marcar columna como deprecada (no se elimina aún por retrocompatibilidad)
COMMENT ON COLUMN acciones.motivo_bloqueo
  IS 'DEPRECADO — usar tabla bloqueos. Eliminar en sprint posterior.';

-- 6. Agregar columna id_evento_origen a auditoria para correlación en cascadas
ALTER TABLE auditoria
  ADD COLUMN IF NOT EXISTS id_evento_origen UUID;

COMMENT ON COLUMN auditoria.id_evento_origen
  IS 'UUID de la auditoría raíz que inició una cascada. NULL si es cambio directo.';
