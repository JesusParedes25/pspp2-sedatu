-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 048: Carteras de proyectos
--
-- Una cartera agrupa proyectos relacionados para verlos en conjunto.
-- NO es una carpeta: no mueve proyectos, no hereda permisos, no se
-- anida. Un proyecto puede pertenecer a varias carteras, pero solo
-- una es su cartera "principal" (para no contarlo dos veces en los
-- agregados) — de ahí el índice único parcial sobre es_principal.
--
-- Migración puramente aditiva: ningún proyecto existente cambia,
-- "sin cartera" sigue siendo un estado válido y permanente.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS carteras (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre         VARCHAR(300) NOT NULL,
  descripcion    TEXT,
  id_dg_lider    UUID REFERENCES direcciones_generales(id),
  id_responsable UUID REFERENCES usuarios(id),
  fecha_inicio   DATE,
  fecha_fin      DATE,
  id_creador     UUID REFERENCES usuarios(id),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cartera_proyecto (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cartera_id   UUID NOT NULL REFERENCES carteras(id) ON DELETE CASCADE,
  proyecto_id  UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  es_principal BOOLEAN NOT NULL DEFAULT false,
  agregado_por UUID REFERENCES usuarios(id),
  agregado_en  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (cartera_id, proyecto_id)
);

-- Un proyecto no puede tener dos carteras "principal" a la vez
CREATE UNIQUE INDEX IF NOT EXISTS idx_cartera_proyecto_una_principal
  ON cartera_proyecto (proyecto_id) WHERE es_principal = true;

CREATE INDEX IF NOT EXISTS idx_cartera_proyecto_cartera ON cartera_proyecto(cartera_id);
CREATE INDEX IF NOT EXISTS idx_cartera_proyecto_proyecto ON cartera_proyecto(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_carteras_dg_lider ON carteras(id_dg_lider);
