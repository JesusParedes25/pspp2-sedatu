-- Migración 010: Agregar columna imagen_url a proyectos
-- Permite almacenar la URL de la imagen de encabezado subida a MinIO
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS imagen_url TEXT;
