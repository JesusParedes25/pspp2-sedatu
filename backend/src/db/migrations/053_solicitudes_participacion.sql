-- Migración 053: solicitudes de participación
--
-- La invitación va de arriba hacia abajo: el responsable de un proyecto
-- invita a alguien. Faltaba el camino contrario — que alguien que ve un
-- proyecto y tiene algo que aportar pueda pedir entrar, en vez de tener
-- que buscar por WhatsApp a quién pedírselo.
--
-- Es la contraparte exacta de la invitación:
--   invitación → la propone quien manda, la responde el invitado
--   solicitud  → la propone el interesado, la responde quien manda
--
-- Por eso vive en su propia tabla y no como un estado más de
-- proyecto_usuarios: quien solicita todavía no es participante, y mezclar
-- las dos direcciones en la misma fila haría ambiguo quién le debe
-- respuesta a quién. Al aceptarse, la solicitud SÍ crea la fila de
-- proyecto_usuarios (ya aceptada: quien pidió entrar no necesita que le
-- vuelvan a preguntar si quiere).

CREATE TABLE IF NOT EXISTS solicitudes_participacion (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  id_proyecto     UUID NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  id_usuario      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  -- Qué función pide ejercer. Mismos valores que proyecto_usuarios.rol.
  funcion         VARCHAR(20) NOT NULL DEFAULT 'colaborador',
  -- Por qué quiere entrar. Opcional: obligar a justificarse para pedir
  -- acceso agrega fricción sin agregar información — quien decide ya ve
  -- de qué área viene la persona y cuál es su cargo.
  motivo          TEXT,
  estado          VARCHAR(12) NOT NULL DEFAULT 'pendiente',
  -- Respuesta de quien la resolvió.
  id_resuelta_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  motivo_respuesta TEXT,
  respondida_en   TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW(),

  CONSTRAINT solicitudes_participacion_funcion_check
    CHECK (funcion IN ('responsable', 'colaborador')),
  CONSTRAINT solicitudes_participacion_estado_check
    CHECK (estado IN ('pendiente', 'aceptada', 'rechazada'))
);

-- Una sola solicitud viva por persona y proyecto. Un índice parcial (y no
-- un UNIQUE a secas) porque sí debe poder volver a solicitar si en su
-- momento se la rechazaron: lo que no puede es tener dos pendientes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_solicitud_pendiente_unica
  ON solicitudes_participacion (id_proyecto, id_usuario)
  WHERE estado = 'pendiente';

-- Las dos lecturas frecuentes: "las que tengo que resolver en este
-- proyecto" y "las que yo mandé".
CREATE INDEX IF NOT EXISTS idx_solicitudes_proyecto ON solicitudes_participacion (id_proyecto, estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_usuario ON solicitudes_participacion (id_usuario, estado);

-- Dos tipos de notificación más: la solicitud que llega a quien manda, y
-- la respuesta que vuelve a quien la pidió.
ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;

ALTER TABLE notificaciones ADD CONSTRAINT notificaciones_tipo_check
  CHECK (tipo IN (
    'Vencimiento',
    'Inactividad',
    'Riesgo',
    'Comentario',
    'MencionUsuario',
    'PermisoNuevo',
    'AccionBloqueada',
    'AvanceDG',
    'Invitacion',
    'RespuestaInvitacion',
    'Solicitud',            -- alguien pide participar en tu proyecto
    'RespuestaSolicitud'    -- respondieron la solicitud que enviaste
  ));
