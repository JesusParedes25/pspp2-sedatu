-- Migration 028: Fix evidencias table for link support and new categories
-- 1. Add url and tipo_medio columns
-- 2. Make file-related columns nullable (for link-type evidencias)
-- 3. Fix pertenencia check to include id_etapa
-- 4. Update categoria check with new values

-- Add new columns
ALTER TABLE evidencias ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE evidencias ADD COLUMN IF NOT EXISTS tipo_medio VARCHAR(10) DEFAULT 'archivo';

-- Make file columns nullable for link-type evidencias
ALTER TABLE evidencias ALTER COLUMN nombre_archivo DROP NOT NULL;
ALTER TABLE evidencias ALTER COLUMN nombre_original DROP NOT NULL;
ALTER TABLE evidencias ALTER COLUMN ruta_minio DROP NOT NULL;

-- Migrate old category values to new ones
UPDATE evidencias SET categoria = 'Documento' WHERE categoria IN ('Estudios', 'Minutas', 'Oficios', 'Planos', 'Contratos', 'Reportes');
UPDATE evidencias SET categoria = 'Repositorio' WHERE categoria = 'Scripts';
UPDATE evidencias SET categoria = 'Capa geográfica' WHERE categoria = 'Geoespacial';
UPDATE evidencias SET categoria = 'Fotografía' WHERE categoria = 'Fotografias';

-- Drop old constraints and recreate
ALTER TABLE evidencias DROP CONSTRAINT IF EXISTS chk_evidencia_pertenencia;
ALTER TABLE evidencias ADD CONSTRAINT chk_evidencia_pertenencia CHECK (
  (CASE WHEN id_accion IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN id_riesgo IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN id_subaccion IS NOT NULL THEN 1 ELSE 0 END +
   CASE WHEN id_etapa IS NOT NULL THEN 1 ELSE 0 END) = 1
);

ALTER TABLE evidencias DROP CONSTRAINT IF EXISTS evidencias_categoria_check;
ALTER TABLE evidencias ADD CONSTRAINT evidencias_categoria_check CHECK (
  categoria IN ('Documento', 'Fotografía', 'Capa geográfica', 'Paquete de capas geográficas',
                'Video', 'Repositorio', 'Audio', 'Otro')
);

-- Ensure tipo_medio is valid
ALTER TABLE evidencias DROP CONSTRAINT IF EXISTS chk_tipo_medio;
ALTER TABLE evidencias ADD CONSTRAINT chk_tipo_medio CHECK (tipo_medio IN ('archivo', 'link'));
