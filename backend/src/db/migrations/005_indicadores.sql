-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 005: Sistema de indicadores múltiples
--
-- Reemplaza el modelo de indicador único embebido en proyectos
-- por un sistema relacional de N indicadores por proyecto, con
-- soporte para:
-- • Tipos: avance físico, financiero, monto, cobertura, etc.
-- • Unidades: porcentaje, moneda MXN, número personalizable
-- • Temporalidad: meta global o desglose anual por ejercicio
-- • Acumulación: suma, último valor, promedio
-- • Cascada futura: indicador→etapas y acción→indicador
-- ═══════════════════════════════════════════════════════════════

-- ─── Tabla principal de indicadores ──────────────────────────
CREATE TABLE IF NOT EXISTS indicadores (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_proyecto          UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,

  -- Clasificación
  nombre               VARCHAR(300) NOT NULL,
  tipo                 VARCHAR(30) NOT NULL
                       CHECK (tipo IN (
                         'Avance_fisico','Avance_financiero',
                         'Monto','Cobertura','Beneficiarios',
                         'Gestion','Otro'
                       )),
  unidad               VARCHAR(20) NOT NULL
                       CHECK (unidad IN ('Porcentaje','Moneda_MXN','Numero')),
  unidad_personalizada VARCHAR(100),

  -- Método de acumulación (cómo se agregan valores de sub-componentes)
  acumulacion          VARCHAR(20) NOT NULL DEFAULT 'Suma'
                       CHECK (acumulacion IN ('Suma','Ultimo_valor','Promedio')),

  -- Meta y avance
  meta_global          DECIMAL(15,2) NOT NULL,
  valor_actual         DECIMAL(15,2) DEFAULT 0,

  -- Temporalidad
  temporalidad         VARCHAR(10) NOT NULL DEFAULT 'Global'
                       CHECK (temporalidad IN ('Global','Anual')),
  anio_inicio          INT,
  anio_fin             INT,

  -- Metadata
  descripcion          TEXT,
  orden                INT DEFAULT 1,
  activo               BOOLEAN DEFAULT true,
  created_at           TIMESTAMP DEFAULT NOW(),
  updated_at           TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_indicadores_proyecto ON indicadores(id_proyecto);

-- ─── Metas anuales (desglose por ejercicio fiscal) ──────────
CREATE TABLE IF NOT EXISTS indicador_metas_anuales (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_indicador  UUID NOT NULL REFERENCES indicadores(id) ON DELETE CASCADE,
  anio          INT NOT NULL,
  meta          DECIMAL(15,2) NOT NULL,
  valor_actual  DECIMAL(15,2) DEFAULT 0,
  created_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(id_indicador, anio)
);

-- ─── Cascada: meta por etapa (cuánto aporta cada etapa) ─────
-- Se llenará cuando el usuario distribuya la meta entre etapas.
CREATE TABLE IF NOT EXISTS indicador_etapas (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_indicador  UUID NOT NULL REFERENCES indicadores(id) ON DELETE CASCADE,
  id_etapa      UUID NOT NULL REFERENCES etapas(id) ON DELETE CASCADE,
  meta_etapa    DECIMAL(15,2) NOT NULL DEFAULT 0,
  valor_actual  DECIMAL(15,2) DEFAULT 0,
  created_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(id_indicador, id_etapa)
);

-- ─── Cascada: aporte por acción ─────────────────────────────
-- Cuando una acción reporta avance, puede indicar cuánto aportó
-- a uno o más indicadores del proyecto.
CREATE TABLE IF NOT EXISTS accion_indicador (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_accion       UUID NOT NULL REFERENCES acciones(id) ON DELETE CASCADE,
  id_indicador    UUID NOT NULL REFERENCES indicadores(id) ON DELETE CASCADE,
  valor_aportado  DECIMAL(15,2) NOT NULL DEFAULT 0,
  anio            INT,
  nota            TEXT,
  created_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(id_accion, id_indicador)
);

-- ─── Migrar datos existentes del indicador inline ───────────
-- Copia los proyectos que tenían indicador embebido a la nueva tabla.
INSERT INTO indicadores (id_proyecto, nombre, tipo, unidad, unidad_personalizada,
                         acumulacion, meta_global, valor_actual, temporalidad, orden)
SELECT id, indicador_nombre, 'Avance_fisico', 'Numero', indicador_unidad,
       'Suma', COALESCE(indicador_meta, 0), COALESCE(indicador_valor_actual, 0),
       'Global', 1
FROM proyectos
WHERE tiene_indicador = true
  AND indicador_nombre IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM indicadores i WHERE i.id_proyecto = proyectos.id
  );
