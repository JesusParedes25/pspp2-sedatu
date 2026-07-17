-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 021: Catálogos de selector + propiedades universales
--
-- IDEMPOTENTE: seguro de ejecutar múltiples veces.
--   • CREATE TABLE IF NOT EXISTS
--   • INSERT ... ON CONFLICT DO NOTHING
--   • ADD COLUMN IF NOT EXISTS
--   • Sin DROP, sin ALTER de columnas existentes
--
-- Dos tipos de catálogo:
--   EXTENSIBLE (extensible=TRUE) — el usuario puede agregar valores.
--   FIXED      (extensible=FALSE) — solo los valores semilla.
-- ═══════════════════════════════════════════════════════════════

-- ─── 2a. Tabla genérica de catálogos ────────────────────────────

CREATE TABLE IF NOT EXISTS catalogos (
  id          SERIAL PRIMARY KEY,
  tipo        VARCHAR(50)  NOT NULL,
  valor       VARCHAR(200) NOT NULL,
  descripcion VARCHAR(300),
  orden       INTEGER      DEFAULT 0,
  extensible  BOOLEAN      NOT NULL DEFAULT TRUE,
  activo      BOOLEAN      NOT NULL DEFAULT TRUE,
  UNIQUE (tipo, valor)
);

-- ─── 2b. Seed de valores ────────────────────────────────────────

-- tipo = categoria (EXTENSIBLE)
INSERT INTO catalogos (tipo, valor, orden) VALUES
  ('categoria', 'Zona costera / ZOFEMAT',            1),
  ('categoria', 'Cuenca / restauración hidrológica',  2),
  ('categoria', 'Integración OE-OT',                  3),
  ('categoria', 'Instrumento de Ordenamiento Territorial', 4),
  ('categoria', 'Asistencia Técnica',                  5),
  ('categoria', 'Publicación de instrumento de planeación', 6)
ON CONFLICT (tipo, valor) DO NOTHING;

-- tipo = instrumento (EXTENSIBLE)
INSERT INTO catalogos (tipo, valor, orden) VALUES
  ('instrumento', 'PTO',       1),
  ('instrumento', 'PRDUEC',    2),
  ('instrumento', 'POEL / POET', 3),
  ('instrumento', 'POZMVM',    4),
  ('instrumento', 'POZM',      5),
  ('instrumento', 'Programa de restauración', 6),
  ('instrumento', 'Reglamento / instrumento normativo', 7),
  ('instrumento', 'Cartera de proyectos', 8),
  ('instrumento', 'Programa de Ordenamiento Territorial', 9),
  ('instrumento', 'Programa Parcial de Desarrollo Urbano', 10),
  ('instrumento', 'PMDU',      11),
  ('instrumento', 'PM',        12),
  ('instrumento', 'PDUCP',     13),
  ('instrumento', 'PPDU',      14),
  ('instrumento', 'PEOTDU',    15),
  ('instrumento', 'PMOTDU',    16),
  ('instrumento', 'PEOT',      17),
  ('instrumento', 'POTR',      18),
  ('instrumento', 'POTRRSE',   19),
  ('instrumento', 'PSV',       20)
ON CONFLICT (tipo, valor) DO NOTHING;

-- tipo = escala_territorial (EXTENSIBLE)
INSERT INTO catalogos (tipo, valor, orden) VALUES
  ('escala_territorial', 'Nacional',              1),
  ('escala_territorial', 'Regional',              2),
  ('escala_territorial', 'Estatal',               3),
  ('escala_territorial', 'Metropolitana',         4),
  ('escala_territorial', 'Conurbada',             5),
  ('escala_territorial', 'Intermunicipal / Cuenca', 6),
  ('escala_territorial', 'Municipal',             7),
  ('escala_territorial', 'Centro de Población',   8),
  ('escala_territorial', 'Parcial',               9),
  ('escala_territorial', 'Plan Parcial',          10),
  ('escala_territorial', 'Sectorial',             11),
  ('escala_territorial', 'Asentamiento Humano',   12)
ON CONFLICT (tipo, valor) DO NOTHING;

-- tipo = fase (EXTENSIBLE)
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

-- tipo = tipo_item (EXTENSIBLE)
INSERT INTO catalogos (tipo, valor, orden) VALUES
  ('tipo_item', 'Compromiso / entregable',           1),
  ('tipo_item', 'Solicitud de información',           2),
  ('tipo_item', 'Validación / Revisión',              3),
  ('tipo_item', 'Definición / Decisión',              4),
  ('tipo_item', 'Coordinación interinstitucional',    5),
  ('tipo_item', 'Trámite / gestión documental',       6),
  ('tipo_item', 'Otro',                               7)
ON CONFLICT (tipo, valor) DO NOTHING;

-- tipo = financiamiento (EXTENSIBLE)
INSERT INTO catalogos (tipo, valor, orden) VALUES
  ('financiamiento', 'PUMOT',     1),
  ('financiamiento', 'INFONAVIT', 2),
  ('financiamiento', 'IN HOUSE',  3),
  ('financiamiento', 'BID',       4)
ON CONFLICT (tipo, valor) DO NOTHING;

-- tipo = unidad_responsable (EXTENSIBLE)
INSERT INTO catalogos (tipo, valor, orden) VALUES
  ('unidad_responsable', 'DGOTU',  1),
  ('unidad_responsable', 'DGOMR',  2),
  ('unidad_responsable', 'CGDMM',  3),
  ('unidad_responsable', 'UPDI',   4),
  ('unidad_responsable', 'DAOT',   5)
ON CONFLICT (tipo, valor) DO NOTHING;

-- tipo = instancia (EXTENSIBLE)
INSERT INTO catalogos (tipo, valor, orden) VALUES
  ('instancia', 'SEDATU',    1),
  ('instancia', 'SEMARNAT',  2)
ON CONFLICT (tipo, valor) DO NOTHING;

-- tipo = tipo_evidencia (EXTENSIBLE)
INSERT INTO catalogos (tipo, valor, orden) VALUES
  ('tipo_evidencia', 'Documento',        1),
  ('tipo_evidencia', 'Link',             2),
  ('tipo_evidencia', 'Capa geográfica',  3)
ON CONFLICT (tipo, valor) DO NOTHING;

-- tipo = prioridad (FIXED — extensible=FALSE)
INSERT INTO catalogos (tipo, valor, orden, extensible) VALUES
  ('prioridad', 'Muy Alta', 1, FALSE),
  ('prioridad', 'Alta',     2, FALSE),
  ('prioridad', 'Media',    3, FALSE),
  ('prioridad', 'Baja',     4, FALSE)
ON CONFLICT (tipo, valor) DO NOTHING;

-- tipo = estatus (FIXED — extensible=FALSE)
-- NOTA: Los CHECK constraints de la columna `estado` en las tablas
-- usan valores internos (Pendiente, En_proceso, Bloqueada, Completada, Cancelada).
-- Estos valores de catálogo son etiquetas de UI / importación y NO alteran
-- los CHECK existentes.
INSERT INTO catalogos (tipo, valor, orden, extensible) VALUES
  ('estatus', 'No iniciado',          1, FALSE),
  ('estatus', 'En proceso',           2, FALSE),
  ('estatus', 'En espera/Bloqueado',  3, FALSE),
  ('estatus', 'Concluido',            4, FALSE),
  ('estatus', 'No aplica',            5, FALSE)
ON CONFLICT (tipo, valor) DO NOTHING;

-- ─── 2c. Columnas de propiedades — ADD COLUMN IF NOT EXISTS ─────

-- === proyectos ===
-- fecha_inicio DATE ya existe — SKIP
-- fecha_limite DATE ya existe — SKIP
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS categoria            VARCHAR(200);
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS instrumento          VARCHAR(200);
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS escala_territorial   VARCHAR(100);
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS fase_actual          VARCHAR(150);
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS financiamiento       VARCHAR(100);
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS ejercicio_fiscal     VARCHAR(20);
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS instancia_solicitante TEXT;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS prioridad            VARCHAR(20);
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS observaciones        TEXT;

-- === etapas ===
-- fecha_inicio DATE ya existe — SKIP
-- tipo NO existe en etapas (solo existe tipo_meta) — ADD
ALTER TABLE etapas ADD COLUMN IF NOT EXISTS tipo                    VARCHAR(150);
ALTER TABLE etapas ADD COLUMN IF NOT EXISTS prioridad               VARCHAR(20);
ALTER TABLE etapas ADD COLUMN IF NOT EXISTS fecha_limite            DATE;
ALTER TABLE etapas ADD COLUMN IF NOT EXISTS instancia_responsable   TEXT;
ALTER TABLE etapas ADD COLUMN IF NOT EXISTS enlace_responsable      TEXT;
ALTER TABLE etapas ADD COLUMN IF NOT EXISTS observaciones           TEXT;

-- === acciones ===
-- fecha_inicio DATE ya existe — SKIP
-- tipo VARCHAR(20) ya existe con CHECK ('Accion_programada','Hito') — SKIP
ALTER TABLE acciones ADD COLUMN IF NOT EXISTS prioridad             VARCHAR(20);
ALTER TABLE acciones ADD COLUMN IF NOT EXISTS fecha_limite          DATE;
ALTER TABLE acciones ADD COLUMN IF NOT EXISTS instancia_responsable TEXT;
ALTER TABLE acciones ADD COLUMN IF NOT EXISTS enlace_responsable    TEXT;
ALTER TABLE acciones ADD COLUMN IF NOT EXISTS observaciones         TEXT;
