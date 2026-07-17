-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 030: Multi-user projects
-- Tablas: proyecto_usuarios, proyecto_invitaciones
-- IDEMPOTENTE: usa CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING
-- ═══════════════════════════════════════════════════════════════

-- ─── Tabla: proyecto_usuarios ─────────────────────────────────
-- Registra qué usuarios participan en cada proyecto y con qué rol
CREATE TABLE IF NOT EXISTS proyecto_usuarios (
  id_proyecto  UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  id_usuario   UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  rol          VARCHAR(20) NOT NULL CHECK (rol IN ('responsable','colaborador')),
  invitado_por UUID REFERENCES usuarios(id),
  invitado_en  TIMESTAMP DEFAULT NOW(),
  aceptado_en  TIMESTAMP,
  PRIMARY KEY (id_proyecto, id_usuario)
);

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_proyecto_usuarios_usuario ON proyecto_usuarios(id_usuario);
CREATE INDEX IF NOT EXISTS idx_proyecto_usuarios_proyecto ON proyecto_usuarios(id_proyecto);

-- ─── Tabla: proyecto_invitaciones ─────────────────────────────
-- Invitaciones pendientes para unirse a un proyecto
CREATE TABLE IF NOT EXISTS proyecto_invitaciones (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_proyecto UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  correo      VARCHAR(200) NOT NULL,
  rol         VARCHAR(20) NOT NULL DEFAULT 'colaborador' CHECK (rol IN ('responsable','colaborador')),
  id_usuario  UUID REFERENCES usuarios(id),
  invitado_por UUID REFERENCES usuarios(id),
  estado      VARCHAR(20) NOT NULL DEFAULT 'pendiente'
              CHECK (estado IN ('pendiente','aceptada','rechazada','cancelada')),
  token       VARCHAR(100) NOT NULL UNIQUE,
  created_at  TIMESTAMP DEFAULT NOW(),
  accepted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_proyecto_invitaciones_proyecto ON proyecto_invitaciones(id_proyecto);
CREATE INDEX IF NOT EXISTS idx_proyecto_invitaciones_correo ON proyecto_invitaciones(correo);
CREATE INDEX IF NOT EXISTS idx_proyecto_invitaciones_token ON proyecto_invitaciones(token);

-- ─── Seed: migrate existing id_creador as responsable ─────────
-- Every project creator becomes 'responsable' in proyecto_usuarios
INSERT INTO proyecto_usuarios (id_proyecto, id_usuario, rol, aceptado_en)
SELECT p.id, p.id_creador, 'responsable', NOW()
FROM proyectos p
WHERE p.id_creador IS NOT NULL AND p.deleted_at IS NULL
ON CONFLICT (id_proyecto, id_usuario) DO NOTHING;
