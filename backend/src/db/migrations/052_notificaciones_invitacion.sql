-- Migración 052: tipos de notificación para el flujo de invitaciones
--
-- notificaciones.tipo tiene un CHECK con la lista cerrada de tipos. Las dos
-- notificaciones nuevas —"te invitaron" y "respondieron tu invitación"— no
-- estaban en esa lista, así que el INSERT fallaba. Como crearNotificacion()
-- traga los errores a propósito (para no tumbar la operación principal por
-- una notificación), el síntoma era silencioso: la invitación se creaba
-- bien y nadie se enteraba.
--
-- Se reemplaza el CHECK conservando todos los valores anteriores.

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
    'Invitacion',            -- te invitaron: hay que aceptar o rechazar
    'RespuestaInvitacion'    -- respondieron la invitación que enviaste
  ));
