-- Migración 025: DROP NOT NULL fecha_inicio/fecha_fin, crear tareas, campos extra, seeds DG/usuarios
-- Idempotente

-- 1. DROP NOT NULL en fecha_inicio y fecha_fin de acciones
ALTER TABLE acciones ALTER COLUMN fecha_inicio DROP NOT NULL;
ALTER TABLE acciones ALTER COLUMN fecha_fin DROP NOT NULL;

-- 2. Agregar columnas de catálogo a etapas y acciones
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='etapas' AND column_name='escala_territorial') THEN
    ALTER TABLE etapas ADD COLUMN escala_territorial VARCHAR(100) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='etapas' AND column_name='instrumento') THEN
    ALTER TABLE etapas ADD COLUMN instrumento VARCHAR(200) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='etapas' AND column_name='cve_ent') THEN
    ALTER TABLE etapas ADD COLUMN cve_ent VARCHAR(5) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='etapas' AND column_name='cve_mun') THEN
    ALTER TABLE etapas ADD COLUMN cve_mun VARCHAR(5) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='etapas' AND column_name='id_zm') THEN
    ALTER TABLE etapas ADD COLUMN id_zm INTEGER NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acciones' AND column_name='escala_territorial') THEN
    ALTER TABLE acciones ADD COLUMN escala_territorial VARCHAR(100) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acciones' AND column_name='instrumento') THEN
    ALTER TABLE acciones ADD COLUMN instrumento VARCHAR(200) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acciones' AND column_name='cve_ent') THEN
    ALTER TABLE acciones ADD COLUMN cve_ent VARCHAR(5) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acciones' AND column_name='cve_mun') THEN
    ALTER TABLE acciones ADD COLUMN cve_mun VARCHAR(5) NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='acciones' AND column_name='id_zm') THEN
    ALTER TABLE acciones ADD COLUMN id_zm INTEGER NULL;
  END IF;
END$$;

-- 3. Crear tabla tareas (hijas de acciones, estructura similar)
CREATE TABLE IF NOT EXISTS tareas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(500) NOT NULL,
  id_accion UUID NOT NULL REFERENCES acciones(id) ON DELETE CASCADE,
  estado VARCHAR(50) DEFAULT 'Pendiente',
  avance_actual SMALLINT NULL CHECK (avance_actual >= 0 AND avance_actual <= 100),
  avance_override BOOLEAN DEFAULT FALSE,
  semaforo VARCHAR(10) NULL CHECK (semaforo IN ('verde','ambar','rojo','gris') OR semaforo IS NULL),
  semaforo_override BOOLEAN DEFAULT FALSE,
  fecha_inicio DATE NULL,
  fecha_limite DATE NULL,
  prioridad VARCHAR(50) DEFAULT 'Media',
  id_responsable UUID NULL REFERENCES usuarios(id),
  observaciones TEXT NULL,
  orden INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Seed DGs como catalogos tipo='unidad_responsable'
INSERT INTO catalogos (tipo, valor, descripcion, orden, extensible, activo) VALUES
  ('unidad_responsable', 'Resoluciones Presidenciales y Expropiaciones', NULL, 1, true, true),
  ('unidad_responsable', 'Terrenos Nacionales', NULL, 2, true, true),
  ('unidad_responsable', 'Inventarios y Modernización Registral y Catastral', NULL, 3, true, true),
  ('unidad_responsable', 'Concertación Agraria y Mediación', NULL, 4, true, true),
  ('unidad_responsable', 'Vinculación del Sector Agrario', NULL, 5, true, true),
  ('unidad_responsable', 'Igualdad de Género en la Propiedad Social', NULL, 6, true, true),
  ('unidad_responsable', 'Infraestructura y Equipamiento', NULL, 7, true, true),
  ('unidad_responsable', 'Obras Comunitarias', NULL, 8, true, true),
  ('unidad_responsable', 'Ordenamiento Metropolitano y Regional', NULL, 9, true, true),
  ('unidad_responsable', 'Gestión Integral de Riesgos de Desastres y Cambio Climático', NULL, 10, true, true),
  ('unidad_responsable', 'Ordenamiento Territorial y Urbano', NULL, 11, true, true),
  ('unidad_responsable', 'Política Territorial y Movilidad', NULL, 12, true, true),
  ('unidad_responsable', 'Política de Vivienda', NULL, 13, true, true),
  ('unidad_responsable', 'Planeación y Desarrollo Institucional', NULL, 14, true, true),
  ('unidad_responsable', 'Programación y Presupuesto', NULL, 15, true, true),
  ('unidad_responsable', 'Capital Humano y Desarrollo Organizacional', NULL, 16, true, true),
  ('unidad_responsable', 'Recursos Materiales y Servicios Generales', NULL, 17, true, true),
  ('unidad_responsable', 'Tecnologías de la Información y Comunicaciones', NULL, 18, true, true),
  ('unidad_responsable', 'Coordinación de Oficinas de Representación', NULL, 19, true, true)
ON CONFLICT DO NOTHING;

-- 5. Seed escalas territoriales
INSERT INTO catalogos (tipo, valor, descripcion, orden, extensible, activo) VALUES
  ('escala_territorial', 'Nacional', NULL, 1, true, true),
  ('escala_territorial', 'Regional', NULL, 2, true, true),
  ('escala_territorial', 'Estatal', NULL, 3, true, true),
  ('escala_territorial', 'Metropolitana', NULL, 4, true, true),
  ('escala_territorial', 'Municipal', NULL, 5, true, true),
  ('escala_territorial', 'Urbana', NULL, 6, true, true),
  ('escala_territorial', 'Localidad', NULL, 7, true, true)
ON CONFLICT DO NOTHING;

-- 6. Seed usuarios ficticios para selector de responsable
INSERT INTO usuarios (id, nombre_completo, correo, password_hash, cargo, rol, activo, id_dg) VALUES
  ('a0000001-0000-0000-0000-000000000001', 'Ana García López', 'ana.garcia@sedatu.gob.mx', '$2b$10$dummyhash000000000000000000000000000000000000000', 'Directora de Área', 'Directivo', true, (SELECT id FROM direcciones_generales LIMIT 1 OFFSET 0)),
  ('a0000001-0000-0000-0000-000000000002', 'Carlos Hernández Ruiz', 'carlos.hernandez@sedatu.gob.mx', '$2b$10$dummyhash000000000000000000000000000000000000000', 'Subdirector', 'Operativo', true, (SELECT id FROM direcciones_generales LIMIT 1 OFFSET 1)),
  ('a0000001-0000-0000-0000-000000000003', 'María Fernanda Torres', 'maria.torres@sedatu.gob.mx', '$2b$10$dummyhash000000000000000000000000000000000000000', 'Jefa de Departamento', 'Operativo', true, (SELECT id FROM direcciones_generales LIMIT 1 OFFSET 2)),
  ('a0000001-0000-0000-0000-000000000004', 'Roberto Sánchez Medina', 'roberto.sanchez@sedatu.gob.mx', '$2b$10$dummyhash000000000000000000000000000000000000000', 'Director General', 'Ejecutivo', true, (SELECT id FROM direcciones_generales LIMIT 1 OFFSET 3)),
  ('a0000001-0000-0000-0000-000000000005', 'Patricia Olvera Díaz', 'patricia.olvera@sedatu.gob.mx', '$2b$10$dummyhash000000000000000000000000000000000000000', 'Subdirectora', 'Operativo', true, (SELECT id FROM direcciones_generales LIMIT 1 OFFSET 4)),
  ('a0000001-0000-0000-0000-000000000006', 'Miguel Ángel Reyes', 'miguel.reyes@sedatu.gob.mx', '$2b$10$dummyhash000000000000000000000000000000000000000', 'Director de Área', 'Directivo', true, (SELECT id FROM direcciones_generales LIMIT 1 OFFSET 5)),
  ('a0000001-0000-0000-0000-000000000007', 'Laura Jiménez Vega', 'laura.jimenez@sedatu.gob.mx', '$2b$10$dummyhash000000000000000000000000000000000000000', 'Enlace', 'Operativo', true, (SELECT id FROM direcciones_generales LIMIT 1 OFFSET 6)),
  ('a0000001-0000-0000-0000-000000000008', 'Fernando Castillo Mora', 'fernando.castillo@sedatu.gob.mx', '$2b$10$dummyhash000000000000000000000000000000000000000', 'Jefe de Departamento', 'Operativo', true, (SELECT id FROM direcciones_generales LIMIT 1 OFFSET 7))
ON CONFLICT (id) DO NOTHING;

-- 7. Add id_etapa to evidencias if not exists (to support etapa-level attachments)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='evidencias' AND column_name='id_etapa') THEN
    ALTER TABLE evidencias ADD COLUMN id_etapa UUID NULL REFERENCES etapas(id) ON DELETE CASCADE;
  END IF;
END$$;
