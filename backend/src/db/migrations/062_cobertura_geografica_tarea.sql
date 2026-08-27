-- Migración 062: cobertura_geografica admite tipo_entidad = 'tarea'.
-- Esa tabla es el espejo que consumen el dashboard ejecutivo, Panorama del
-- proyecto y la columna "Ubicación" de Vista Lista — hasta ahora solo
-- espejeaba etapas y acciones (y 'proyecto', sin usar). El territorio
-- capturado en una tarea (cve_ent/tarea_municipios) nunca se sincronizaba
-- ahí, así que las tareas siempre aparecían sin ubicación en esas tres
-- pantallas aunque sí tuvieran territorio asignado. Idempotente.

ALTER TABLE cobertura_geografica DROP CONSTRAINT IF EXISTS cobertura_geografica_tipo_entidad_check;
ALTER TABLE cobertura_geografica ADD CONSTRAINT cobertura_geografica_tipo_entidad_check
  CHECK (tipo_entidad IN ('proyecto', 'etapa', 'accion', 'tarea'));
