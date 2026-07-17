-- Migration 033: nodo_miembros
-- Permite asignar múltiples miembros (responsable/colaborador/invitado)
-- directamente a etapas y acciones, independiente del miembro del proyecto.

CREATE TABLE IF NOT EXISTS nodo_miembros (
  id            SERIAL PRIMARY KEY,
  tipo_nodo     TEXT NOT NULL CHECK (tipo_nodo IN ('etapa', 'accion')),
  id_nodo       INTEGER NOT NULL,
  id_usuario    UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  rol           TEXT NOT NULL DEFAULT 'colaborador'
                  CHECK (rol IN ('responsable', 'colaborador', 'invitado')),
  id_invitado_por UUID REFERENCES usuarios(id),
  created_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE (tipo_nodo, id_nodo, id_usuario)
);

CREATE INDEX IF NOT EXISTS idx_nodo_miembros_lookup
  ON nodo_miembros (tipo_nodo, id_nodo);
