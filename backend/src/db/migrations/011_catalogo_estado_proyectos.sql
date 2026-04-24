-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 011: Unificar catálogo de estados de proyectos
--
-- Los proyectos usaban (Programado, En_proceso, Pausado, Concluido,
-- Cancelado). Se migran al catálogo unificado que ya usan etapas,
-- acciones y subacciones: (Pendiente, En_proceso, Bloqueada,
-- Completada, Cancelada).
--
-- Mapeo:
--   Programado → Pendiente
--   Pausado    → Pendiente
--   Concluido  → Completada
--   Cancelado  → Cancelada
--   En_proceso → En_proceso (sin cambio)
-- ═══════════════════════════════════════════════════════════════

-- 1. Migrar datos existentes
UPDATE proyectos SET estado = 'Pendiente'  WHERE estado IN ('Programado', 'Pausado');
UPDATE proyectos SET estado = 'Completada' WHERE estado = 'Concluido';
UPDATE proyectos SET estado = 'Cancelada'  WHERE estado = 'Cancelado';

-- 2. Eliminar constraint antiguo (nombre autogenerado por CHECK inline)
ALTER TABLE proyectos DROP CONSTRAINT IF EXISTS proyectos_estado_check;

-- 3. Recrear con catálogo unificado
ALTER TABLE proyectos ADD CONSTRAINT proyectos_estado_check CHECK (
  estado IN ('Pendiente', 'En_proceso', 'Bloqueada', 'Completada', 'Cancelada')
);

-- 4. Cambiar valor por defecto
ALTER TABLE proyectos ALTER COLUMN estado SET DEFAULT 'Pendiente';

-- También unificar subproyectos (misma estructura que proyectos)
UPDATE subproyectos SET estado = 'Pendiente'  WHERE estado IN ('Programado', 'Pausado');
UPDATE subproyectos SET estado = 'Completada' WHERE estado = 'Concluido';
UPDATE subproyectos SET estado = 'Cancelada'  WHERE estado = 'Cancelado';

ALTER TABLE subproyectos DROP CONSTRAINT IF EXISTS subproyectos_estado_check;
ALTER TABLE subproyectos ADD CONSTRAINT subproyectos_estado_check CHECK (
  estado IN ('Pendiente', 'En_proceso', 'Bloqueada', 'Completada', 'Cancelada')
);
ALTER TABLE subproyectos ALTER COLUMN estado SET DEFAULT 'Pendiente';
