-- ═══════════════════════════════════════════════════════════════
-- PSPP v2.0 — Migración 039: Stream de actividad unificado
--
-- Tabla `actividad`: registro cronológico de comentarios, archivos,
-- riesgos reportados y cambios de estatus/avance para CUALQUIER nodo
-- (etapa, acción o tarea). Distinta de `actividad_log` (bitácora
-- general de proyecto) — esta es específica de nodo, pensada para
-- el stream unificado bajo las tarjetas expandibles.
-- IDEMPOTENTE: seguro de ejecutar múltiples veces.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS actividad (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_proyecto UUID REFERENCES proyectos(id) ON DELETE CASCADE,
  id_etapa UUID REFERENCES etapas(id) ON DELETE CASCADE,
  id_accion UUID REFERENCES acciones(id) ON DELETE CASCADE,
  id_tarea UUID REFERENCES tareas(id) ON DELETE CASCADE,
  tipo_evento VARCHAR(20) NOT NULL CHECK (tipo_evento IN ('comentario','archivo','riesgo','cambio_estatus','cambio_avance')),
  id_usuario UUID REFERENCES usuarios(id),
  contenido TEXT,
  archivo_url TEXT,
  archivo_nombre TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_actividad_etapa ON actividad(id_etapa) WHERE id_etapa IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_actividad_accion ON actividad(id_accion) WHERE id_accion IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_actividad_tarea ON actividad(id_tarea) WHERE id_tarea IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_actividad_proyecto ON actividad(id_proyecto);
CREATE INDEX IF NOT EXISTS idx_actividad_created ON actividad(created_at DESC);
