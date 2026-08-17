-- Migración 051: las invitaciones se aceptan o se rechazan
--
-- Hasta ahora, invitar a alguien lo convertía en participante en el acto:
-- se insertaba la fila en proyecto_usuarios / nodo_miembros y listo. La
-- persona se enteraba por una notificación, sin nada que responder.
--
-- Se agrega el estado de la invitación a las dos tablas de participación,
-- con el motivo del rechazo y la fecha de respuesta.
--
-- COMPATIBILIDAD CON LO QUE YA EXISTE (importante):
-- las filas actuales corresponden a gente que YA participa; ponerlas en
-- 'pendiente' las dejaría a todas sin permisos de golpe. Por eso la
-- columna se agrega con DEFAULT 'aceptada' —que rellena lo existente— y
-- acto seguido el default se cambia a 'pendiente' para las nuevas.
-- Idempotente: se puede correr dos veces sin efecto adicional.

-- ─── proyecto_usuarios ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proyecto_usuarios' AND column_name = 'estado'
  ) THEN
    ALTER TABLE proyecto_usuarios ADD COLUMN estado VARCHAR(12) NOT NULL DEFAULT 'aceptada';
    ALTER TABLE proyecto_usuarios ALTER COLUMN estado SET DEFAULT 'pendiente';
  END IF;
END$$;

ALTER TABLE proyecto_usuarios ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;
ALTER TABLE proyecto_usuarios ADD COLUMN IF NOT EXISTS respondido_en TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proyecto_usuarios_estado_check') THEN
    ALTER TABLE proyecto_usuarios ADD CONSTRAINT proyecto_usuarios_estado_check
      CHECK (estado IN ('pendiente', 'aceptada', 'rechazada'));
  END IF;
END$$;

-- ─── nodo_miembros ────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nodo_miembros' AND column_name = 'estado'
  ) THEN
    ALTER TABLE nodo_miembros ADD COLUMN estado VARCHAR(12) NOT NULL DEFAULT 'aceptada';
    ALTER TABLE nodo_miembros ALTER COLUMN estado SET DEFAULT 'pendiente';
  END IF;
END$$;

ALTER TABLE nodo_miembros ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;
ALTER TABLE nodo_miembros ADD COLUMN IF NOT EXISTS respondido_en TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nodo_miembros_estado_check') THEN
    ALTER TABLE nodo_miembros ADD CONSTRAINT nodo_miembros_estado_check
      CHECK (estado IN ('pendiente', 'aceptada', 'rechazada'));
  END IF;
END$$;

-- Consultar "mis invitaciones pendientes" es una lectura por usuario.
CREATE INDEX IF NOT EXISTS idx_proyecto_usuarios_estado ON proyecto_usuarios (id_usuario, estado);
CREATE INDEX IF NOT EXISTS idx_nodo_miembros_estado ON nodo_miembros (id_usuario, estado);

-- La función 'invitado' de un nodo es para personas ajenas a la Secretaría:
-- ven la parte a la que se les invitó, sin capturar en ella. Ya estaba
-- permitida por el código; aquí queda escrita en la tabla.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nodo_miembros_rol_check') THEN
    ALTER TABLE nodo_miembros ADD CONSTRAINT nodo_miembros_rol_check
      CHECK (rol IN ('responsable', 'colaborador', 'invitado'));
  END IF;
END$$;
