-- Migración 054: solicitar participar en una etapa, acción o tarea
--
-- La solicitud nació como "quiero entrar al proyecto". Pero invitar ya
-- distinguía dos alcances —todo el proyecto, o una etapa suelta— y pedir
-- entrar no: quien solo aporta a una etapa tenía que pedir acceso al
-- proyecto entero, que es más de lo que necesita y más de lo que a quien
-- decide le gustaría conceder.
--
-- Se agregan tipo_nodo e id_nodo. NULL en los dos = todo el proyecto, que
-- es como quedan las filas que ya existan.
--
-- id_proyecto se conserva SIEMPRE, también en las de nodo: es lo que
-- permite resolver quién decide y a quién avisar sin tener que subir por
-- la jerarquía en cada consulta.

ALTER TABLE solicitudes_participacion ADD COLUMN IF NOT EXISTS tipo_nodo VARCHAR(10);
ALTER TABLE solicitudes_participacion ADD COLUMN IF NOT EXISTS id_nodo UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'solicitudes_tipo_nodo_check') THEN
    ALTER TABLE solicitudes_participacion ADD CONSTRAINT solicitudes_tipo_nodo_check
      CHECK (
        (tipo_nodo IS NULL AND id_nodo IS NULL)
        OR (tipo_nodo IN ('etapa', 'accion', 'tarea') AND id_nodo IS NOT NULL)
      );
  END IF;
END$$;

-- Una sola solicitud viva por persona y destino. Se separa en dos índices
-- parciales en lugar de uno solo sobre (proyecto, usuario, tipo_nodo,
-- id_nodo): en un índice único, dos NULL cuentan como valores distintos,
-- así que ese índice dejaría pasar dos solicitudes pendientes al mismo
-- proyecto de la misma persona, que es justo lo que hay que impedir.
DROP INDEX IF EXISTS idx_solicitud_pendiente_unica;

CREATE UNIQUE INDEX IF NOT EXISTS idx_solicitud_pendiente_proyecto
  ON solicitudes_participacion (id_proyecto, id_usuario)
  WHERE estado = 'pendiente' AND id_nodo IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_solicitud_pendiente_nodo
  ON solicitudes_participacion (id_usuario, tipo_nodo, id_nodo)
  WHERE estado = 'pendiente' AND id_nodo IS NOT NULL;

-- La función 'invitado' (ver sin capturar) solo aplica a nodos y solo para
-- usuarios externos; a nivel proyecto no existe. El CHECK se amplía para
-- que una solicitud de nodo pueda pedirla.
ALTER TABLE solicitudes_participacion DROP CONSTRAINT IF EXISTS solicitudes_participacion_funcion_check;

ALTER TABLE solicitudes_participacion ADD CONSTRAINT solicitudes_participacion_funcion_check
  CHECK (
    funcion IN ('responsable', 'colaborador')
    OR (funcion = 'invitado' AND id_nodo IS NOT NULL)
  );
