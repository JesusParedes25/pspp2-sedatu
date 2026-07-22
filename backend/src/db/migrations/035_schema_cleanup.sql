-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 035: Schema cleanup
-- IDEMPOTENTE: DROP IF EXISTS, CREATE IF NOT EXISTS, DO $$ guards
--
-- Corrige:
-- 1. nodo_miembros.id_nodo era INTEGER pero etapas/acciones usan UUID (bug crítico)
-- 2. Índices faltantes en columnas de JOIN frecuente
-- 3. Columnas redundantes de indicador en proyectos (supersedidas por tabla indicadores)
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Recrear nodo_miembros con id_nodo UUID ─────────────────
-- El tipo INTEGER original era incompatible con los PK UUID de etapas/acciones.
-- No existían filas válidas dado que toda inserción fallaba con error de tipo.
DROP TABLE IF EXISTS nodo_miembros CASCADE;

CREATE TABLE nodo_miembros (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo_nodo       TEXT NOT NULL CHECK (tipo_nodo IN ('etapa', 'accion')),
  id_nodo         UUID NOT NULL,
  id_usuario      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  rol             TEXT NOT NULL DEFAULT 'colaborador'
                  CHECK (rol IN ('responsable', 'colaborador', 'invitado')),
  id_invitado_por UUID REFERENCES usuarios(id),
  created_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE (tipo_nodo, id_nodo, id_usuario)
);

CREATE INDEX IF NOT EXISTS idx_nodo_miembros_lookup  ON nodo_miembros (tipo_nodo, id_nodo);
CREATE INDEX IF NOT EXISTS idx_nodo_miembros_usuario ON nodo_miembros (id_usuario);

-- ─── 2. Índices faltantes ──────────────────────────────────────
-- Columnas de id_responsable — usadas en JOINs frecuentes para mostrar nombre
CREATE INDEX IF NOT EXISTS idx_etapas_responsable
  ON etapas(id_responsable) WHERE id_responsable IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_acciones_responsable
  ON acciones(id_responsable) WHERE id_responsable IS NOT NULL;

-- id_accion_padre — recorridos de subacciones
CREATE INDEX IF NOT EXISTS idx_acciones_padre
  ON acciones(id_accion_padre) WHERE id_accion_padre IS NOT NULL;

-- id_creador en proyectos — filtros de "mis proyectos"
CREATE INDEX IF NOT EXISTS idx_proyectos_creador
  ON proyectos(id_creador) WHERE id_creador IS NOT NULL;

-- rol de usuario — filtros de permisos
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios(rol);

-- estado de etapas — filtros de semáforo / progreso
CREATE INDEX IF NOT EXISTS idx_etapas_estado ON etapas(estado);

-- Índice compuesto para acciones vencidas/por vencer por responsable
CREATE INDEX IF NOT EXISTS idx_acciones_responsable_fin
  ON acciones(id_responsable, fecha_fin) WHERE id_responsable IS NOT NULL;

-- ─── 3. Eliminar columnas redundantes de indicador en proyectos ─
-- Superadas por la tabla indicadores (migración 005).
-- Usar DROP COLUMN IF EXISTS para idempotencia.
ALTER TABLE proyectos DROP COLUMN IF EXISTS tiene_indicador;
ALTER TABLE proyectos DROP COLUMN IF EXISTS indicador_nombre;
ALTER TABLE proyectos DROP COLUMN IF EXISTS indicador_valor_actual;
ALTER TABLE proyectos DROP COLUMN IF EXISTS indicador_meta;
ALTER TABLE proyectos DROP COLUMN IF EXISTS indicador_unidad;

-- ─── 4. Índice parcial para invitaciones pendientes ────────────
CREATE INDEX IF NOT EXISTS idx_invitaciones_pendientes
  ON proyecto_invitaciones(id_proyecto) WHERE estado = 'pendiente';

-- ─── 5. Asegurar updated_at en etapas (consistencia con acciones) ─
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'etapas' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE etapas ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
  END IF;
END $$;
