-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 022: Superadmin + Geo con geometría + Catálogos completos
--
-- IDEMPOTENTE: seguro de ejecutar múltiples veces.
-- NO DESTRUCTIVO: sin DROP de tablas con datos.
-- ═══════════════════════════════════════════════════════════════

-- ─── PARTE C: Agregar rol superadmin ──────────────────────────

-- Quitar el CHECK actual de rol y reemplazar con uno que incluya superadmin
DO $$
BEGIN
  -- Eliminar constraint existente si tiene nombre conocido
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'usuarios_rol_check'
  ) THEN
    ALTER TABLE usuarios DROP CONSTRAINT usuarios_rol_check;
  END IF;
END $$;

ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('superadmin','Ejecutivo','Directivo','Responsable','Operativo'));

-- ─── PARTE B.1: Tablas geográficas con geometría ─────────────

-- geo_estados (se carga desde shapefile)
CREATE TABLE IF NOT EXISTS geo_estados (
  gid        SERIAL PRIMARY KEY,
  cve_ent    VARCHAR(2) UNIQUE NOT NULL,
  nombre     VARCHAR(200) NOT NULL,
  geom       GEOMETRY(MultiPolygon, 4326)
);
CREATE INDEX IF NOT EXISTS idx_geo_estados_geom ON geo_estados USING GIST(geom);

-- geo_municipios (se carga desde shapefile)
CREATE TABLE IF NOT EXISTS geo_municipios (
  gid        SERIAL PRIMARY KEY,
  cvegeo     VARCHAR(5) UNIQUE NOT NULL,
  cve_ent    VARCHAR(2) NOT NULL,
  cve_mun    VARCHAR(3) NOT NULL,
  nombre     VARCHAR(200) NOT NULL,
  geom       GEOMETRY(MultiPolygon, 4326)
);
CREATE INDEX IF NOT EXISTS idx_geo_municipios_geom ON geo_municipios USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_geo_municipios_cve_ent ON geo_municipios(cve_ent);

-- geo_zm (zonas metropolitanas, desde GeoJSON)
CREATE TABLE IF NOT EXISTS geo_zm (
  gid        SERIAL PRIMARY KEY,
  cve_met    VARCHAR(20) UNIQUE NOT NULL,
  nombre     VARCHAR(200) NOT NULL,
  tipo       VARCHAR(50),
  geom       GEOMETRY(MultiPolygon, 4326)
);
CREATE INDEX IF NOT EXISTS idx_geo_zm_geom ON geo_zm USING GIST(geom);

-- Agregar geometría a cat_entidades_federativas si no existe
ALTER TABLE cat_entidades_federativas ADD COLUMN IF NOT EXISTS geom GEOMETRY(MultiPolygon, 4326);

-- Agregar geometría a cat_municipios si no existe
ALTER TABLE cat_municipios ADD COLUMN IF NOT EXISTS geom GEOMETRY(MultiPolygon, 4326);

-- ─── PARTE B.2: Sembrar valores completos en catálogos ────────

-- categoria (EXTENSIBLE) — agregar faltante
INSERT INTO catalogos (tipo, valor, orden) VALUES
  ('categoria', 'Zona costera / ZOFEMAT',            1),
  ('categoria', 'Cuenca / restauración hidrológica',  2),
  ('categoria', 'Integración OE-OT',                  3),
  ('categoria', 'Instrumento de Ordenamiento Territorial', 4),
  ('categoria', 'Asistencia Técnica',                  5),
  ('categoria', 'Publicación de instrumento de planeación', 6),
  ('categoria', 'Punto de órgano de gobierno',         7)
ON CONFLICT (tipo, valor) DO NOTHING;

-- instrumento (EXTENSIBLE) — agregar faltantes
INSERT INTO catalogos (tipo, valor, orden) VALUES
  ('instrumento', 'PTO',       1),
  ('instrumento', 'PMDU',      2),
  ('instrumento', 'POZM',      3),
  ('instrumento', 'POEcMET',   4),
  ('instrumento', 'POEL / POET', 5),
  ('instrumento', 'POZMVM',    6),
  ('instrumento', 'PRDUEC',    7),
  ('instrumento', 'Programa de Restauración', 8),
  ('instrumento', 'Reglamento / Instrumento Normativo', 9),
  ('instrumento', 'Cartera de proyectos', 10),
  ('instrumento', 'Programa de Ordenamiento Territorial', 11),
  ('instrumento', 'Programa Parcial de Desarrollo Urbano', 12),
  ('instrumento', 'PM',        13),
  ('instrumento', 'PDUCP',     14),
  ('instrumento', 'PPDU',      15),
  ('instrumento', 'PEOTDU',    16),
  ('instrumento', 'PMOTDU',    17),
  ('instrumento', 'PEOT',      18),
  ('instrumento', 'POTR',      19),
  ('instrumento', 'POTRRSE',   20),
  ('instrumento', 'PSV',       21)
ON CONFLICT (tipo, valor) DO NOTHING;

-- escala_territorial (EXTENSIBLE)
INSERT INTO catalogos (tipo, valor, orden) VALUES
  ('escala_territorial', 'Localidad',            0),
  ('escala_territorial', 'Municipal',            1),
  ('escala_territorial', 'Intermunicipal',       2),
  ('escala_territorial', 'Estatal',              3),
  ('escala_territorial', 'Metropolitana',        4),
  ('escala_territorial', 'Conurbada',            5),
  ('escala_territorial', 'Centro de Población',  6),
  ('escala_territorial', 'Parcial',              7),
  ('escala_territorial', 'Plan Parcial',         8),
  ('escala_territorial', 'Sectorial',            9),
  ('escala_territorial', 'Regional',             10),
  ('escala_territorial', 'Asentamiento Humano',  11),
  ('escala_territorial', 'Nacional',             12)
ON CONFLICT (tipo, valor) DO NOTHING;

-- fase (EXTENSIBLE) — agregar faltantes
INSERT INTO catalogos (tipo, valor, orden) VALUES
  ('fase', 'Identificación',              1),
  ('fase', 'Diagnóstico',                 2),
  ('fase', 'Elaboración del documento',   3),
  ('fase', 'Consulta pública',            4),
  ('fase', 'Validación',                  5),
  ('fase', 'Adecuación al instrumento',   6),
  ('fase', 'Aprobación',                  7),
  ('fase', 'Dictamen de congruencia',     8),
  ('fase', 'Publicación',                 9),
  ('fase', 'Inscripción en RPP',          10),
  ('fase', 'Carga en SITU',              11),
  ('fase', 'Implementación / Seguimiento', 12),
  ('fase', 'En pausa',                    13),
  ('fase', 'Revisión de solicitudes',     14),
  ('fase', 'Convenios',                   15),
  ('fase', 'Contratación',               16),
  ('fase', 'Ejecución',                  17),
  ('fase', 'Cierre',                     18),
  ('fase', 'No se abrió partida',        19)
ON CONFLICT (tipo, valor) DO NOTHING;

-- tipo_item (EXTENSIBLE)
INSERT INTO catalogos (tipo, valor, orden) VALUES
  ('tipo_item', 'Compromiso / entregable',           1),
  ('tipo_item', 'Solicitud de información',           2),
  ('tipo_item', 'Validación / Revisión',              3),
  ('tipo_item', 'Definición / Decisión',              4),
  ('tipo_item', 'Coordinación interinstitucional',    5),
  ('tipo_item', 'Trámite / gestión documental',       6),
  ('tipo_item', 'Otro',                               7)
ON CONFLICT (tipo, valor) DO NOTHING;

-- financiamiento (EXTENSIBLE)
INSERT INTO catalogos (tipo, valor, orden) VALUES
  ('financiamiento', 'PUMOT',     1),
  ('financiamiento', 'INFONAVIT', 2),
  ('financiamiento', 'IN HOUSE',  3),
  ('financiamiento', 'BID',       4)
ON CONFLICT (tipo, valor) DO NOTHING;

-- unidad_responsable (EXTENSIBLE) — agregar faltante DGPDI
INSERT INTO catalogos (tipo, valor, orden) VALUES
  ('unidad_responsable', 'DGOTU',  1),
  ('unidad_responsable', 'DGOMR',  2),
  ('unidad_responsable', 'CGDMM',  3),
  ('unidad_responsable', 'UPDI',   4),
  ('unidad_responsable', 'DAOT',   5),
  ('unidad_responsable', 'DGPDI',  6)
ON CONFLICT (tipo, valor) DO NOTHING;

-- instancia (EXTENSIBLE)
INSERT INTO catalogos (tipo, valor, orden) VALUES
  ('instancia', 'SEDATU',    1),
  ('instancia', 'SEMARNAT',  2)
ON CONFLICT (tipo, valor) DO NOTHING;

-- tipo_evidencia (EXTENSIBLE)
INSERT INTO catalogos (tipo, valor, orden) VALUES
  ('tipo_evidencia', 'Documento',        1),
  ('tipo_evidencia', 'Link',             2),
  ('tipo_evidencia', 'Capa geográfica',  3)
ON CONFLICT (tipo, valor) DO NOTHING;

-- prioridad (FIXED)
INSERT INTO catalogos (tipo, valor, orden, extensible) VALUES
  ('prioridad', 'Muy Alta', 1, FALSE),
  ('prioridad', 'Alta',     2, FALSE),
  ('prioridad', 'Media',    3, FALSE),
  ('prioridad', 'Baja',     4, FALSE)
ON CONFLICT (tipo, valor) DO NOTHING;

-- estatus (FIXED)
INSERT INTO catalogos (tipo, valor, orden, extensible) VALUES
  ('estatus', 'No iniciado',          1, FALSE),
  ('estatus', 'En proceso',           2, FALSE),
  ('estatus', 'En espera/Bloqueado',  3, FALSE),
  ('estatus', 'Concluido',            4, FALSE),
  ('estatus', 'No aplica',            5, FALSE)
ON CONFLICT (tipo, valor) DO NOTHING;
