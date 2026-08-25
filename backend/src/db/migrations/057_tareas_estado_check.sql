-- Migración 057: CHECK de estado para tareas — mismo catálogo unificado
-- que ya tienen proyectos/etapas/acciones (ver 011_catalogo_estado_proyectos.sql).
-- tareas.estado (VARCHAR(50) DEFAULT 'Pendiente', migración 025) nunca tuvo
-- una constraint que impidiera guardar un valor fuera de ese catálogo.
-- Idempotente.

UPDATE tareas SET estado = 'Pendiente' WHERE estado NOT IN
  ('Pendiente', 'En_proceso', 'Bloqueada', 'Completada', 'Cancelada') OR estado IS NULL;

ALTER TABLE tareas DROP CONSTRAINT IF EXISTS tareas_estado_check;
ALTER TABLE tareas ADD CONSTRAINT tareas_estado_check
  CHECK (estado IN ('Pendiente', 'En_proceso', 'Bloqueada', 'Completada', 'Cancelada'));
