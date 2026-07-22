-- 040_fix_cascade_deletes.sql
-- PROPÓSITO: Corregir foreign keys que no tenían ON DELETE CASCADE, lo cual
-- rompía tanto el borrado normal de proyectos como la purga automática de
-- proyectos eliminados hace más de 30 días (utils/purgarProyectos.js), ya
-- que el DELETE en cascada se detenía al chocar con estas referencias sin
-- CASCADE (ej. "evidencias_id_accion_fkey").

ALTER TABLE evidencias DROP CONSTRAINT IF EXISTS evidencias_id_accion_fkey;
ALTER TABLE evidencias
  ADD CONSTRAINT evidencias_id_accion_fkey
  FOREIGN KEY (id_accion) REFERENCES acciones(id) ON DELETE CASCADE;

ALTER TABLE permisos_dg DROP CONSTRAINT IF EXISTS permisos_dg_id_proyecto_fkey;
ALTER TABLE permisos_dg
  ADD CONSTRAINT permisos_dg_id_proyecto_fkey
  FOREIGN KEY (id_proyecto) REFERENCES proyectos(id) ON DELETE CASCADE;

ALTER TABLE capas_geo DROP CONSTRAINT IF EXISTS capas_geo_id_proyecto_fkey;
ALTER TABLE capas_geo
  ADD CONSTRAINT capas_geo_id_proyecto_fkey
  FOREIGN KEY (id_proyecto) REFERENCES proyectos(id) ON DELETE CASCADE;
