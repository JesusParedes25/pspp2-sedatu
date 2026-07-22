-- Migration 036: Extend nodo_miembros to also accept tareas
-- El CHECK original sólo permitía 'etapa' y 'accion'.
-- Eliminamos y recreamos la restricción para incluir 'tarea'.

ALTER TABLE nodo_miembros
  DROP CONSTRAINT IF EXISTS nodo_miembros_tipo_nodo_check;

ALTER TABLE nodo_miembros
  ADD CONSTRAINT nodo_miembros_tipo_nodo_check
  CHECK (tipo_nodo IN ('etapa', 'accion', 'tarea'));
