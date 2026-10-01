-- Migración 078: `fecha_cierre` en riesgos — la nueva sección "Riesgos"
-- del proyecto (sidebar propio, ruta /proyectos/:id/riesgos) necesita
-- mostrar cuándo se cerró un riesgo, y no existía ninguna columna para
-- eso: `updated_at` no sirve (un riesgo ya cerrado puede editarse después
-- por otra razón, como corregir la descripción, sin que eso signifique
-- que se volvió a cerrar). Se fija en el código (riesgos.queries.js::
-- actualizarRiesgo) al transicionar el estado A 'Cerrado', y se limpia si
-- se reabre — no es un trigger de base de datos, mismo criterio que el
-- resto de esta tabla (toda la lógica de estado vive en la capa de
-- queries, no en la base).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='riesgos' AND column_name='fecha_cierre') THEN
    ALTER TABLE riesgos ADD COLUMN fecha_cierre TIMESTAMP;
  END IF;
END$$;
