-- ============================================================
-- Migración 031: actividad_log, configuracion_sistema,
--                tokens_activacion, soporte áreas externas
-- ============================================================

-- 1. Tabla de log de actividad (auditoría informal)
CREATE TABLE IF NOT EXISTS actividad_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_proyecto     UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  id_usuario      UUID REFERENCES usuarios(id),
  tipo            VARCHAR(30) NOT NULL,
  titulo          VARCHAR(300) NOT NULL,
  descripcion     TEXT,
  entidad_tipo    VARCHAR(50),
  entidad_id      UUID,
  metadata        JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_actividad_log_proyecto
  ON actividad_log(id_proyecto, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_actividad_log_usuario
  ON actividad_log(id_usuario);

COMMENT ON TABLE actividad_log
  IS 'Log de actividad de proyectos. Cada fila representa un evento (cambio de estado, avance, evidencia, comentario, miembro, etc.)';

-- 2. Configuración del sistema (EmailJS, etc.)
CREATE TABLE IF NOT EXISTS configuracion_sistema (
  clave       VARCHAR(100) PRIMARY KEY,
  valor       TEXT,
  descripcion VARCHAR(300),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_by  UUID REFERENCES usuarios(id)
);

-- Sembrar claves de EmailJS con valores vacíos
INSERT INTO configuracion_sistema (clave, descripcion) VALUES
  ('emailjs_service_id',  'ID del servicio en EmailJS'),
  ('emailjs_template_id', 'ID del template de bienvenida en EmailJS'),
  ('emailjs_public_key',  'Llave pública de EmailJS'),
  ('emailjs_enabled',     'Habilitar envío de correos (true/false)')
ON CONFLICT (clave) DO NOTHING;

-- 3. Tokens de activación de cuenta
CREATE TABLE IF NOT EXISTS tokens_activacion (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_usuario  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token       VARCHAR(128) NOT NULL UNIQUE,
  expira_en   TIMESTAMPTZ NOT NULL,
  usado       BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tokens_activacion_token
  ON tokens_activacion(token) WHERE usado = FALSE;

-- 4. Soporte para áreas externas en direcciones_generales
ALTER TABLE direcciones_generales
  ADD COLUMN IF NOT EXISTS es_externa BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS secretaria_externa VARCHAR(300);

COMMENT ON COLUMN direcciones_generales.es_externa
  IS 'TRUE si es una DG de otra secretaría (externa a SEDATU).';
COMMENT ON COLUMN direcciones_generales.secretaria_externa
  IS 'Nombre de la secretaría externa (ej. SEMARNAT). Solo aplica si es_externa = TRUE.';
