-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 004: Ajuste tabla programas al Reglamento
-- Interior de SEDATU (DOF 17/01/2025) y estructura programática
-- del Ramo 15 (Desarrollo Agrario, Territorial y Urbano).
--
-- Cambios:
-- 1. Ampliar CHECK de tipo para reflejar modalidades SHCP reales
-- 2. Agregar columna unidad_responsable (entidad que opera el Pp)
-- 3. Agregar columna descripcion (descripción corta del programa)
-- 4. Agregar UNIQUE en clave para idempotencia de seeders
-- ═══════════════════════════════════════════════════════════════

-- 1. Eliminar el CHECK viejo sobre programas.tipo
ALTER TABLE programas DROP CONSTRAINT IF EXISTS programas_tipo_check;

-- 2. Agregar CHECK expandido con modalidades presupuestarias SHCP
--    Se conservan los valores viejos (Prioritario_Nacional, Ramo_15, Otro)
--    para no romper datos existentes; los seeders nuevos usan los nuevos.
ALTER TABLE programas ADD CONSTRAINT programas_tipo_check
  CHECK (tipo IN (
    'S_Subsidio',
    'E_Prestacion_Servicios',
    'P_Planeacion',
    'U_Subsidio_Especifico',
    'K_Inversion',
    'G_Regulacion',
    'L_Obligacion',
    'R_Gasto_Federalizado',
    'M_Gasto_Administrativo',
    'Prioritario_Nacional',
    'Ramo_15',
    'Otro'
  ));

-- 3. Agregar columnas nuevas
ALTER TABLE programas ADD COLUMN IF NOT EXISTS unidad_responsable VARCHAR(100);
ALTER TABLE programas ADD COLUMN IF NOT EXISTS descripcion TEXT;

-- 4. Agregar UNIQUE constraint en clave para que ON CONFLICT (clave) funcione
--    en seeders. Se usa DO $$ para manejar idempotencia (si ya existe, no falla).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'programas_clave_unique'
  ) THEN
    ALTER TABLE programas ADD CONSTRAINT programas_clave_unique UNIQUE (clave);
  END IF;
END $$;
